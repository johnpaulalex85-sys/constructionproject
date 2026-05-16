import os
import datetime
import json
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from werkzeug.utils import secure_filename
from bson import ObjectId
from utils.db import get_db
from utils.helpers import serialize

daily_reports_bp = Blueprint("daily_reports", __name__)

def get_site_id():
    claims = get_jwt()
    if claims.get("role") != "supervisor":
        return None
    return get_jwt_identity()

# --- SUPERVISOR: POST /daily-reports ---
@daily_reports_bp.route("/daily-reports", methods=["POST"])
@jwt_required()
def create_daily_report():
    site_id = get_site_id()
    if not site_id:
        return jsonify({"msg": "Only supervisors can submit daily reports"}), 403

    # Parse form data (supporting multipart/form-data for photos)
    data = request.form
    
    report_date_str = data.get("report_date")
    report_date = datetime.datetime.fromisoformat(report_date_str) if report_date_str else datetime.datetime.utcnow()
    
    labor_details = {}
    if "labor_details" in data:
        try:
            labor_details = json.loads(data["labor_details"])
        except:
            pass

    materials_used = []
    if "materials_used" in data:
        try:
            materials_used = json.loads(data["materials_used"])
        except:
            pass

    equipment_used = []
    if "equipment_used" in data:
        try:
            equipment_used = json.loads(data["equipment_used"])
        except:
            pass

    # Handle multiple photos upload
    photo_urls = []
    if "photos" in request.files:
        files = request.files.getlist("photos")
        upload_folder = os.path.join(request.root_path, "static", "uploads", "daily_reports")
        os.makedirs(upload_folder, exist_ok=True)
        for file in files:
            if file.filename != "":
                filename = secure_filename(f"{datetime.datetime.utcnow().timestamp()}_{file.filename}")
                file_path = os.path.join(upload_folder, filename)
                file.save(file_path)
                photo_urls.append(f"/static/uploads/daily_reports/{filename}")

    db = get_db()
    supervisor = db.users.find_one({"_id": ObjectId(site_id)}) # site_id is supervisor_id actually...
    
    # Wait, the identity of supervisor is their site_id. But schema requires supervisor_id and site_id.
    # In supervisor_routes.py: identity is site_id. Supervisor username is saved in sites.
    site = db.sites.find_one({"_id": ObjectId(site_id)})
    supervisor_username = site["supervisor_username"] if site else "Unknown"

    report = {
        "site_id": site_id,
        "supervisor_username": supervisor_username,
        "report_date": report_date,
        "work_progress": data.get("work_progress", ""),
        "labor_count": int(data.get("labor_count", 0)),
        "labor_details": labor_details,
        "materials_used": materials_used,
        "equipment_used": equipment_used,
        "issues": data.get("issues", ""),
        "weather": data.get("weather", ""),
        "tomorrow_plan": data.get("tomorrow_plan", ""),
        "photos": photo_urls,
        "created_at": datetime.datetime.utcnow()
    }
    
    result = db.daily_reports.insert_one(report)
    report["_id"] = result.inserted_id
    
    return jsonify(serialize(report)), 201

# --- SUPERVISOR: GET /daily-reports/my-site ---
@daily_reports_bp.route("/daily-reports/my-site", methods=["GET"])
@jwt_required()
def get_my_daily_reports():
    site_id = get_site_id()
    if not site_id:
        return jsonify({"msg": "Unauthorized"}), 403

    db = get_db()
    reports = list(db.daily_reports.find({"site_id": site_id}).sort("report_date", -1))
    return jsonify(serialize(reports)), 200

# --- ADMIN: GET /daily-reports ---
@daily_reports_bp.route("/daily-reports", methods=["GET"])
@jwt_required()
def get_all_daily_reports():
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"msg": "Unauthorized"}), 403

    site_filter = request.args.get("site_id")
    date_filter = request.args.get("date") # format YYYY-MM-DD
    
    query = {}
    if site_filter:
        query["site_id"] = site_filter
    if date_filter:
        try:
            start = datetime.datetime.strptime(date_filter, "%Y-%m-%d")
            end = start + datetime.timedelta(days=1)
            query["report_date"] = {"$gte": start, "$lt": end}
        except:
            pass
            
    db = get_db()
    reports = list(db.daily_reports.find(query).sort("report_date", -1))
    
    enriched = []
    for rep in reports:
        site = db.sites.find_one({"_id": ObjectId(rep["site_id"])})
        entry = serialize(rep)
        entry["site_name"] = site["name"] if site else "Unknown"
        enriched.append(entry)
        
    return jsonify(enriched), 200

# --- ADMIN: GET /daily-reports/<id> ---
@daily_reports_bp.route("/daily-reports/<report_id>", methods=["GET"])
@jwt_required()
def get_daily_report_detail(report_id):
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"msg": "Unauthorized"}), 403

    db = get_db()
    report = db.daily_reports.find_one({"_id": ObjectId(report_id)})
    if not report:
        return jsonify({"msg": "Report not found"}), 404
        
    site = db.sites.find_one({"_id": ObjectId(report["site_id"])})
    entry = serialize(report)
    entry["site_name"] = site["name"] if site else "Unknown"
        
    return jsonify(entry), 200
