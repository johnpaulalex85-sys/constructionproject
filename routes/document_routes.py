from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_db
from utils.helpers import serialize
from bson import ObjectId
import datetime
import os
from werkzeug.utils import secure_filename
from flask import current_app

document_bp = Blueprint("documents", __name__)

ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'docx', 'xlsx', 'xls', 'dwg', 'dxf'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_file_type(filename):
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'unknown'
    type_map = {'pdf': 'PDF', 'png': 'Image', 'jpg': 'Image', 'jpeg': 'Image',
                'docx': 'Word', 'xlsx': 'Excel', 'xls': 'Excel', 'dwg': 'CAD', 'dxf': 'CAD'}
    return type_map.get(ext, ext.upper())

# ── Stats ──────────────────────────────────────────────────────────────────────
@document_bp.route("/documents/stats", methods=["GET"])
@jwt_required()
def get_doc_stats():
    db = get_db()
    docs = list(db.documents.find())
    now = datetime.datetime.utcnow()
    week_ago = now - datetime.timedelta(days=7)
    expiring_soon = []
    for d in docs:
        exp = d.get("expiry_date")
        if exp:
            try:
                exp_dt = datetime.datetime.fromisoformat(str(exp))
                if now < exp_dt < now + datetime.timedelta(days=30):
                    expiring_soon.append(d)
            except Exception:
                pass
    return jsonify({
        "total_documents": len(docs),
        "pending_approvals": len([d for d in docs if d.get("status") == "Review"]),
        "recently_uploaded": len([d for d in docs if d.get("created_at") and d["created_at"] >= week_ago]),
        "expiring_certifications": len(expiring_soon),
        "approved": len([d for d in docs if d.get("status") == "Approved"])
    }), 200

# ── List / Search ──────────────────────────────────────────────────────────────
@document_bp.route("/documents", methods=["GET"])
@jwt_required()
def get_documents():
    db = get_db()
    query = {}
    if request.args.get("site"):
        query["site"] = request.args.get("site")
    if request.args.get("category"):
        query["category"] = request.args.get("category")
    if request.args.get("status"):
        query["status"] = request.args.get("status")
    if request.args.get("search"):
        search = request.args.get("search")
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"tags": {"$regex": search, "$options": "i"}},
            {"uploaded_by": {"$regex": search, "$options": "i"}}
        ]
    docs = list(db.documents.find(query).sort("created_at", -1))
    return jsonify(serialize(docs)), 200

# ── Upload ─────────────────────────────────────────────────────────────────────
@document_bp.route("/documents/upload", methods=["POST"])
@jwt_required()
def upload_document():
    db = get_db()
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "File type not allowed"}), 400

    filename = secure_filename(file.filename)
    docs_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], '..', 'documents')
    os.makedirs(docs_folder, exist_ok=True)
    file_path = os.path.join(docs_folder, filename)
    file.save(file_path)

    title = request.form.get("title") or filename
    category = request.form.get("category", "Uncategorized")
    site = request.form.get("site", "")
    project = request.form.get("project", "")
    tags = request.form.get("tags", "")
    revision = request.form.get("revision", "1")
    expiry_date = request.form.get("expiry_date", None)
    uploaded_by = get_jwt_identity()

    # Check if a document with same title exists (version control)
    existing = db.documents.find_one({"title": title, "category": category})
    if existing:
        # Archive old version
        old_version = {
            "doc_id": str(existing["_id"]),
            "revision": existing.get("revision", "1"),
            "filename": existing.get("filename"),
            "file_url": existing.get("file_url"),
            "uploaded_by": existing.get("uploaded_by"),
            "archived_at": datetime.datetime.utcnow()
        }
        db.document_versions.insert_one(old_version)
        # Update existing
        update = {
            "filename": filename,
            "file_url": f"/static/uploads/documents/{filename}",
            "file_type": get_file_type(filename),
            "revision": revision,
            "uploaded_by": uploaded_by,
            "updated_at": datetime.datetime.utcnow(),
            "status": "Review"
        }
        if expiry_date:
            update["expiry_date"] = expiry_date
        if tags:
            update["tags"] = tags
        db.documents.update_one({"_id": existing["_id"]}, {"$set": update})
        doc = db.documents.find_one({"_id": existing["_id"]})
        # Log activity
        db.document_activity.insert_one({"doc_id": str(existing["_id"]), "action": "version_upload", "user": uploaded_by, "timestamp": datetime.datetime.utcnow(), "detail": f"Revision {revision} uploaded"})
        return jsonify(serialize(doc)), 200

    doc_data = {
        "title": title,
        "filename": filename,
        "category": category,
        "site": site,
        "project": project,
        "tags": tags,
        "revision": revision,
        "file_url": f"/static/uploads/documents/{filename}",
        "file_type": get_file_type(filename),
        "uploaded_by": uploaded_by,
        "status": "Draft",
        "expiry_date": expiry_date,
        "created_at": datetime.datetime.utcnow()
    }
    result = db.documents.insert_one(doc_data)
    doc_data["_id"] = result.inserted_id
    # Log activity
    db.document_activity.insert_one({"doc_id": str(result.inserted_id), "action": "upload", "user": uploaded_by, "timestamp": datetime.datetime.utcnow(), "detail": "Document uploaded"})
    return jsonify(serialize(doc_data)), 201

# ── Approval Workflow ──────────────────────────────────────────────────────────
@document_bp.route("/documents/<doc_id>/status", methods=["PATCH"])
@jwt_required()
def update_doc_status(doc_id):
    db = get_db()
    data = request.get_json()
    new_status = data.get("status")
    comment = data.get("comment", "")
    user = get_jwt_identity()
    if new_status not in ["Draft", "Review", "Approved", "Rejected"]:
        return jsonify({"error": "Invalid status"}), 400
    result = db.documents.update_one(
        {"_id": ObjectId(doc_id)},
        {"$set": {"status": new_status, "approved_by": user, "status_comment": comment, "status_updated_at": datetime.datetime.utcnow()}}
    )
    if result.matched_count == 0:
        return jsonify({"error": "Document not found"}), 404
    db.document_activity.insert_one({"doc_id": doc_id, "action": new_status.lower(), "user": user, "timestamp": datetime.datetime.utcnow(), "detail": comment or f"Status changed to {new_status}"})
    return jsonify({"message": f"Status updated to {new_status}"}), 200

# ── Version History ────────────────────────────────────────────────────────────
@document_bp.route("/documents/<doc_id>/versions", methods=["GET"])
@jwt_required()
def get_doc_versions(doc_id):
    db = get_db()
    versions = list(db.document_versions.find({"doc_id": doc_id}).sort("archived_at", -1))
    return jsonify(serialize(versions)), 200

# ── Activity Logs ──────────────────────────────────────────────────────────────
@document_bp.route("/documents/activity", methods=["GET"])
@jwt_required()
def get_activity():
    db = get_db()
    logs = list(db.document_activity.find().sort("timestamp", -1).limit(50))
    return jsonify(serialize(logs)), 200

# ── Delete ─────────────────────────────────────────────────────────────────────
@document_bp.route("/documents/<doc_id>", methods=["DELETE"])
@jwt_required()
def delete_document(doc_id):
    db = get_db()
    result = db.documents.delete_one({"_id": ObjectId(doc_id)})
    if result.deleted_count == 0:
        return jsonify({"error": "Document not found"}), 404
    return jsonify({"message": "Document deleted"}), 200

# ── Categories ─────────────────────────────────────────────────────────────────
@document_bp.route("/documents/categories", methods=["GET"])
@jwt_required()
def get_categories():
    return jsonify(["Blueprints", "Contracts", "Safety Docs", "Reports", "Invoices",
                    "Inspection Docs", "Certifications", "Site Drawings", "Purchase Docs"]), 200
