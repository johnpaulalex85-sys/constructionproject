from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from utils.db import get_db
from utils.helpers import serialize
from bson import ObjectId
import datetime

attendance_bp = Blueprint("attendance", __name__)

def get_role_and_site():
    claims = get_jwt()
    role = claims.get("role")
    site_id = get_jwt_identity() if role == "supervisor" else None
    return role, site_id

@attendance_bp.route("/workers", methods=["GET"])
@jwt_required()
def get_workers():
    role, site_id = get_role_and_site()
    db = get_db()
    query = {}
    
    if role == "supervisor":
        query["site_id"] = site_id
    elif request.args.get("site_id"):
        query["site_id"] = request.args.get("site_id")
        
    if request.args.get("search"):
        query["name"] = {"$regex": request.args.get("search"), "$options": "i"}

    workers = list(db.workers.find(query))
    
    enriched = []
    for w in workers:
        site = db.sites.find_one({"_id": ObjectId(w["site_id"])})
        entry = serialize(w)
        entry["site_name"] = site["name"] if site else "Unknown"
        enriched.append(entry)
        
    return jsonify(enriched), 200

@attendance_bp.route("/workers", methods=["POST"])
@jwt_required()
def add_worker():
    role, site_id = get_role_and_site()
    data = request.get_json()
    
    if not data.get("name") or not data.get("role"):
        return jsonify({"msg": "Name and role are required"}), 400
        
    target_site_id = data.get("site_id")
    if role == "supervisor":
        target_site_id = site_id
    elif not target_site_id:
        return jsonify({"msg": "site_id is required for admin"}), 400

    db = get_db()
    worker = {
        "name": data["name"],
        "role": data["role"],
        "site_id": target_site_id,
        "created_at": datetime.datetime.utcnow()
    }
    result = db.workers.insert_one(worker)
    worker["_id"] = result.inserted_id
    return jsonify(serialize(worker)), 201

@attendance_bp.route("/attendance", methods=["GET"])
@jwt_required()
def get_attendance():
    role, site_id = get_role_and_site()
    db = get_db()
    query = {}
    
    if role == "supervisor":
        query["site_id"] = site_id
    elif request.args.get("site_id"):
        query["site_id"] = request.args.get("site_id")
        
    if request.args.get("date"):
        query["date"] = request.args.get("date")
        
    if request.args.get("worker_id"):
        query["worker_id"] = request.args.get("worker_id")

    records = list(db.attendance.find(query).sort("date", -1))
    
    enriched = []
    for r in records:
        worker = db.workers.find_one({"_id": ObjectId(r["worker_id"])})
        site = db.sites.find_one({"_id": ObjectId(r["site_id"])})
        entry = serialize(r)
        entry["worker_name"] = worker["name"] if worker else "Unknown"
        entry["worker_role"] = worker["role"] if worker else "Unknown"
        entry["site_name"] = site["name"] if site else "Unknown"
        enriched.append(entry)
        
    return jsonify(enriched), 200

@attendance_bp.route("/attendance", methods=["POST"])
@jwt_required()
def mark_attendance():
    role, site_id = get_role_and_site()
    data = request.get_json()
    
    if not data.get("worker_id") or not data.get("status") or not data.get("date"):
        return jsonify({"msg": "worker_id, status, and date are required"}), 400
        
    db = get_db()
    worker = db.workers.find_one({"_id": ObjectId(data["worker_id"])})
    if not worker:
        return jsonify({"msg": "Worker not found"}), 404
        
    target_site_id = worker["site_id"]
    if role == "supervisor" and target_site_id != site_id:
        return jsonify({"msg": "Unauthorized to mark attendance for this worker"}), 403

    existing = db.attendance.find_one({
        "worker_id": data["worker_id"],
        "date": data["date"]
    })
    
    attendance_data = {
        "worker_id": data["worker_id"],
        "site_id": target_site_id,
        "date": data["date"],
        "status": data["status"], # present, absent, half-day
        "check_in": data.get("check_in"),
        "check_out": data.get("check_out"),
        "updated_at": datetime.datetime.utcnow()
    }
    
    if existing:
        db.attendance.update_one({"_id": existing["_id"]}, {"$set": attendance_data})
        attendance_data["_id"] = existing["_id"]
    else:
        attendance_data["created_at"] = datetime.datetime.utcnow()
        result = db.attendance.insert_one(attendance_data)
        attendance_data["_id"] = result.inserted_id
        
    return jsonify(serialize(attendance_data)), 200

@attendance_bp.route("/attendance/summary", methods=["GET"])
@jwt_required()
def attendance_summary():
    role, site_id = get_role_and_site()
    db = get_db()
    
    date_str = request.args.get("date", datetime.datetime.utcnow().strftime("%Y-%m-%d"))
    
    worker_query = {}
    att_query = {"date": date_str}
    
    if role == "supervisor":
        worker_query["site_id"] = site_id
        att_query["site_id"] = site_id
    elif request.args.get("site_id"):
        worker_query["site_id"] = request.args.get("site_id")
        att_query["site_id"] = request.args.get("site_id")
        
    total_workers = db.workers.count_documents(worker_query)
    attendance = list(db.attendance.find(att_query))
    
    present = sum(1 for a in attendance if a["status"] == "present")
    absent = sum(1 for a in attendance if a["status"] == "absent")
    half_day = sum(1 for a in attendance if a["status"] == "half-day")
    
    marked_count = present + absent + half_day
    not_marked = total_workers - marked_count
    
    attendance_percentage = 0
    if total_workers > 0:
        attendance_percentage = round(((present + (half_day * 0.5)) / total_workers) * 100, 2)
        
    return jsonify({
        "total_workers": total_workers,
        "present": present,
        "absent": absent,
        "half_day": half_day,
        "not_marked": not_marked,
        "attendance_percentage": attendance_percentage,
        "date": date_str
    }), 200
