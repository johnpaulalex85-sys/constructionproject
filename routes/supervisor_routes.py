from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from utils.db import get_db
from utils.helpers import serialize
from bson import ObjectId
import datetime, os, uuid, base64
from werkzeug.utils import secure_filename

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "heic"}

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

supervisor_bp = Blueprint("supervisor", __name__)

def get_site_id():
    # For a supervisor, the identity is their site_id
    # We verify the role to be sure
    claims = get_jwt()
    if claims.get("role") != "supervisor":
        return None
    return get_jwt_identity()

@supervisor_bp.route("/supervisor/dashboard", methods=["GET"])
@jwt_required()
def get_supervisor_dashboard():
    site_id = get_site_id()
    if not site_id:
        return jsonify({"msg": "Unauthorized"}), 403
    
    db = get_db()
    site = db.sites.find_one({"_id": ObjectId(site_id)})
    if not site:
        return jsonify({"msg": "Site not found"}), 404
        
    allocations = list(db.allocations.find({"site_id": site_id}))
    enriched_allocations = []
    for alloc in allocations:
        mat = db.materials.find_one({"_id": ObjectId(alloc["material_id"])})
        if not mat: continue
        
        # Calculate used quantity
        pipeline = [
            {"$match": {"site_id": site_id, "material_id": alloc["material_id"]}},
            {"$group": {"_id": None, "total": {"$sum": "$used_quantity"}}}
        ]
        result = list(db.usage_logs.aggregate(pipeline))
        used = result[0]["total"] if result else 0
        
        enriched_allocations.append({
            "material_id": str(alloc["material_id"]),
            "material_name": mat["name"],
            "unit": mat["unit"],
            "allocated_quantity": alloc["allocated_quantity"],
            "total_used": used,
            "remaining_quantity": alloc["allocated_quantity"] - used
        })
        
    return jsonify({
        "site_name": site["name"],
        "allocations": enriched_allocations
    }), 200

@supervisor_bp.route("/supervisor/materials", methods=["GET"])
@jwt_required()
def get_supervisor_materials():
    site_id = get_site_id()
    if not site_id:
        return jsonify({"msg": "Unauthorized"}), 403
    
    db = get_db()
    # Find all allocations for this site
    allocations = list(db.allocations.find({"site_id": site_id}))
    
    enriched = []
    for alloc in allocations:
        mat = db.materials.find_one({"_id": ObjectId(alloc["material_id"])})
        if not mat: continue
        
        # Calculate remaining quantity
        pipeline = [
            {"$match": {"site_id": site_id, "material_id": alloc["material_id"]}},
            {"$group": {"_id": None, "total": {"$sum": "$used_quantity"}}}
        ]
        result = list(db.usage_logs.aggregate(pipeline))
        used = result[0]["total"] if result else 0
        
        enriched.append({
            "material_id": str(alloc["material_id"]),
            "material_name": mat["name"],
            "unit": mat["unit"],
            "allocated_quantity": alloc["allocated_quantity"],
            "remaining_quantity": alloc["allocated_quantity"] - used
        })
    
    return jsonify(enriched), 200

@supervisor_bp.route("/supervisor/requests", methods=["GET"])
@jwt_required()
def get_supervisor_requests():
    site_id = get_site_id()
    if not site_id:
        return jsonify({"msg": "Unauthorized"}), 403
    
    db = get_db()
    reqs = list(db.material_requests.find({"site_id": site_id}).sort("created_at", -1))
    
    enriched = []
    for req in reqs:
        mat = db.materials.find_one({"_id": ObjectId(req["material_id"])})
        entry = serialize(req)
        entry["material_name"] = mat["name"] if mat else "Unknown"
        entry["unit"] = mat["unit"] if mat else ""
        enriched.append(entry)
        
    return jsonify(enriched), 200

@supervisor_bp.route("/supervisor/requests", methods=["POST"])
@jwt_required()
def create_supervisor_request():
    site_id = get_site_id()
    if not site_id:
        return jsonify({"msg": "Unauthorized"}), 403
    
    data = request.get_json()
    if not data.get("material_id") or not data.get("quantity"):
        return jsonify({"msg": "material_id and quantity are required"}), 400
        
    db = get_db()
    req = {
        "site_id": site_id,
        "material_id": data["material_id"],
        "requested_quantity": float(data["quantity"]),
        "note": data.get("note", ""),
        "status": "pending",
        "created_at": datetime.datetime.utcnow()
    }
    result = db.material_requests.insert_one(req)
    req["_id"] = result.inserted_id
    return jsonify(serialize(req)), 201

@supervisor_bp.route("/supervisor/usage", methods=["POST"])
@jwt_required()
def log_supervisor_usage():
    site_id = get_site_id()
    if not site_id:
        return jsonify({"msg": "Unauthorized"}), 403

    # Support both JSON and multipart/form-data
    if request.content_type and "multipart/form-data" in request.content_type:
        material_id  = request.form.get("material_id")
        used_quantity = request.form.get("used_quantity")
        notes        = request.form.get("notes", "")
    else:
        data         = request.get_json() or {}
        material_id  = data.get("material_id")
        used_quantity = data.get("used_quantity")
        notes        = data.get("notes", "")

    if not material_id or not used_quantity:
        return jsonify({"msg": "material_id and used_quantity are required"}), 400

    db = get_db()
    alloc = db.allocations.find_one({"site_id": site_id, "material_id": material_id})
    if not alloc:
        return jsonify({"msg": "No allocation found for this material"}), 404

    pipeline = [
        {"$match": {"site_id": site_id, "material_id": material_id}},
        {"$group": {"_id": None, "total": {"$sum": "$used_quantity"}}}
    ]
    result = list(db.usage_logs.aggregate(pipeline))
    used = result[0]["total"] if result else 0
    remaining = alloc["allocated_quantity"] - used

    requested_usage = float(used_quantity)
    if requested_usage > remaining:
        return jsonify({"msg": f"Insufficient stock. Remaining: {remaining}"}), 400

    # ── Handle optional receipt photo ────────────────────────────────────────
    receipt_url = None
    file = request.files.get("receipt")
    if file and file.filename and allowed_file(file.filename):
        ext      = file.filename.rsplit(".", 1)[1].lower()
        file_bytes = file.read()
        base64_encoded = base64.b64encode(file_bytes).decode("utf-8")
        receipt_url = f"data:image/{ext};base64,{base64_encoded}"

    log = {
        "site_id":        site_id,
        "material_id":    material_id,
        "used_quantity":  requested_usage,
        "notes":          notes,
        "receipt_url":    receipt_url,
        "date":           datetime.datetime.utcnow()
    }
    result = db.usage_logs.insert_one(log)
    log["_id"] = result.inserted_id
    return jsonify(serialize(log)), 201

@supervisor_bp.route("/supervisor/usage-logs", methods=["GET"])
@jwt_required()
def get_supervisor_usage_logs():
    site_id = get_site_id()
    if not site_id:
        return jsonify({"msg": "Unauthorized"}), 403
        
    db = get_db()
    logs = list(db.usage_logs.find({"site_id": site_id}).sort("date", -1))
    
    enriched = []
    for log in logs:
        mat = db.materials.find_one({"_id": ObjectId(log["material_id"])})
        entry = serialize(log)
        entry["material_name"] = mat["name"] if mat else "Unknown"
        entry["unit"] = mat["unit"] if mat else ""
        entry["created_at"] = entry.get("date")
        entry["receipt_url"] = log.get("receipt_url")  # propagate photo URL
        enriched.append(entry)
        
    return jsonify(enriched), 200

@supervisor_bp.route("/supervisor/daily-log", methods=["POST"])
@jwt_required()
def create_daily_log():
    site_id = get_site_id()
    if not site_id:
        return jsonify({"msg": "Unauthorized"}), 403
        
    data = request.get_json()
    db = get_db()
    log = {
        "site_id": site_id,
        "workers_count": data.get("workers_count"),
        "work_description": data.get("work_description"),
        "issues": data.get("issues", ""),
        "date": datetime.datetime.utcnow()
    }
    result = db.site_daily_logs.insert_one(log)
    log["_id"] = result.inserted_id
    return jsonify(serialize(log)), 201

@supervisor_bp.route("/supervisor/daily-logs", methods=["GET"])
@jwt_required()
def get_daily_logs():
    site_id = get_site_id()
    if not site_id:
        return jsonify({"msg": "Unauthorized"}), 403
        
    db = get_db()
    logs = list(db.site_daily_logs.find({"site_id": site_id}).sort("date", -1))
    return jsonify(serialize(logs)), 200
@supervisor_bp.route("/admin/daily-logs", methods=["GET"])
@jwt_required()
def get_admin_daily_logs():
    # Only allow admins
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"msg": "Unauthorized"}), 403
        
    db = get_db()
    logs = list(db.site_daily_logs.find().sort("date", -1))
    
    enriched = []
    for log in logs:
        site = db.sites.find_one({"_id": ObjectId(log["site_id"])})
        entry = serialize(log)
        entry["site_name"] = site["name"] if site else "Unknown"
        enriched.append(entry)
        
    return jsonify(enriched), 200
