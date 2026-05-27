from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_db
from utils.helpers import serialize
from bson import ObjectId
import datetime

equipment_bp = Blueprint("equipment", __name__)

# ── Stats Dashboard ────────────────────────────────────────────────────────────
@equipment_bp.route("/equipment/stats", methods=["GET"])
@jwt_required()
def get_eq_stats():
    db = get_db()
    equipments = list(db.equipment.find())
    fuel = list(db.equipment_fuel.find())
    maint = list(db.equipment_maintenance.find())
    # Total fuel cost this month
    now = datetime.datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    monthly_fuel = sum([float(f.get("cost", 0)) for f in fuel if f.get("created_at") and f["created_at"] >= month_start])
    # Idle = Active but no fuel logged in 3 days
    active_ids = [str(e["_id"]) for e in equipments if e.get("status") == "Active"]
    recent_threshold = now - datetime.timedelta(days=3)
    active_fuel_ids = set(f.get("equipment_id") for f in fuel if f.get("created_at") and f["created_at"] >= recent_threshold)
    idle_count = len([eid for eid in active_ids if eid not in active_fuel_ids])
    return jsonify({
        "total_equipment": len(equipments),
        "active_equipment": len([e for e in equipments if e.get("status") == "Active"]),
        "idle_equipment": idle_count,
        "under_maintenance": len([e for e in equipments if e.get("status") == "Maintenance"]),
        "breakdowns": len([e for e in equipments if e.get("status") == "Breakdown"]),
        "total_fuel_cost": sum([float(f.get("cost", 0)) for f in fuel]),
        "monthly_fuel_cost": monthly_fuel,
        "total_maintenance_cost": sum([float(m.get("cost", 0)) for m in maint])
    }), 200

# ── Equipment CRUD ─────────────────────────────────────────────────────────────
@equipment_bp.route("/equipment", methods=["GET"])
@jwt_required()
def get_equipment():
    db = get_db()
    query = {}
    if request.args.get("site"):
        query["site"] = request.args.get("site")
    if request.args.get("status"):
        query["status"] = request.args.get("status")
    eq = list(db.equipment.find(query).sort("created_at", -1))
    return jsonify(serialize(eq)), 200

@equipment_bp.route("/equipment", methods=["POST"])
@jwt_required()
def add_equipment():
    data = request.get_json()
    db = get_db()
    required = ["name", "serial_id"]
    if not all(data.get(f) for f in required):
        return jsonify({"error": "name and serial_id are required"}), 400
    if db.equipment.find_one({"serial_id": data["serial_id"]}):
        return jsonify({"error": "Equipment ID already exists"}), 409
    data["created_at"] = datetime.datetime.utcnow()
    data["status"] = data.get("status", "Active")
    data["operating_hours"] = 0
    result = db.equipment.insert_one(data)
    data["_id"] = result.inserted_id
    return jsonify(serialize(data)), 201

@equipment_bp.route("/equipment/<eq_id>", methods=["PUT"])
@jwt_required()
def update_equipment(eq_id):
    data = request.get_json()
    db = get_db()
    allowed = ["name", "status", "site", "operator", "type", "purchase_date", "notes"]
    update = {k: v for k, v in data.items() if k in allowed}
    update["updated_at"] = datetime.datetime.utcnow()
    result = db.equipment.update_one({"_id": ObjectId(eq_id)}, {"$set": update})
    if result.matched_count == 0:
        return jsonify({"error": "Not found"}), 404
    eq = db.equipment.find_one({"_id": ObjectId(eq_id)})
    return jsonify(serialize(eq)), 200

@equipment_bp.route("/equipment/<eq_id>", methods=["DELETE"])
@jwt_required()
def delete_equipment(eq_id):
    db = get_db()
    result = db.equipment.delete_one({"_id": ObjectId(eq_id)})
    if result.deleted_count == 0:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"message": "Equipment deleted"}), 200

# ── Usage Logging (Supervisor logs operating hours) ────────────────────────────
@equipment_bp.route("/equipment/<eq_id>/usage", methods=["POST"])
@jwt_required()
def log_usage(eq_id):
    data = request.get_json()
    db = get_db()
    hours = float(data.get("hours", 0))
    log = {
        "equipment_id": eq_id,
        "equipment_name": data.get("equipment_name", ""),
        "hours": hours,
        "task": data.get("task", ""),
        "operator": data.get("operator", get_jwt_identity()),
        "site": data.get("site", ""),
        "notes": data.get("notes", ""),
        "logged_by": get_jwt_identity(),
        "created_at": datetime.datetime.utcnow()
    }
    result = db.equipment_usage.insert_one(log)
    # Update total operating hours on equipment
    db.equipment.update_one({"_id": ObjectId(eq_id)}, {"$inc": {"operating_hours": hours}})
    log["_id"] = result.inserted_id
    return jsonify(serialize(log)), 201

@equipment_bp.route("/equipment/usage", methods=["GET"])
@jwt_required()
def get_usage():
    db = get_db()
    usage = list(db.equipment_usage.find().sort("created_at", -1).limit(100))
    return jsonify(serialize(usage)), 200

# ── Maintenance ────────────────────────────────────────────────────────────────
@equipment_bp.route("/equipment/maintenance", methods=["GET"])
@jwt_required()
def get_maintenance():
    db = get_db()
    maint = list(db.equipment_maintenance.find().sort("created_at", -1))
    return jsonify(serialize(maint)), 200

@equipment_bp.route("/equipment/maintenance", methods=["POST"])
@jwt_required()
def add_maintenance():
    data = request.get_json()
    db = get_db()
    data["created_at"] = datetime.datetime.utcnow()
    data["logged_by"] = get_jwt_identity()
    data["status"] = data.get("status", "Completed")
    result = db.equipment_maintenance.insert_one(data)
    # Update equipment status if maintenance started
    if data.get("equipment_id") and data.get("maint_status") == "In Progress":
        db.equipment.update_one({"_id": ObjectId(data["equipment_id"])}, {"$set": {"status": "Maintenance"}})
    data["_id"] = result.inserted_id
    return jsonify(serialize(data)), 201

@equipment_bp.route("/equipment/maintenance/<maint_id>", methods=["PATCH"])
@jwt_required()
def update_maintenance_status(maint_id):
    data = request.get_json()
    db = get_db()
    db.equipment_maintenance.update_one({"_id": ObjectId(maint_id)}, {"$set": {"status": data.get("status"), "completed_at": datetime.datetime.utcnow()}})
    return jsonify({"message": "Updated"}), 200

# ── Breakdown Reporting ────────────────────────────────────────────────────────
@equipment_bp.route("/equipment/<eq_id>/breakdown", methods=["POST"])
@jwt_required()
def report_breakdown(eq_id):
    data = request.get_json()
    db = get_db()
    report = {
        "equipment_id": eq_id,
        "equipment_name": data.get("equipment_name", ""),
        "issue": data.get("issue", ""),
        "severity": data.get("severity", "Medium"),
        "reported_by": get_jwt_identity(),
        "status": "Open",
        "created_at": datetime.datetime.utcnow()
    }
    result = db.equipment_breakdowns.insert_one(report)
    db.equipment.update_one({"_id": ObjectId(eq_id)}, {"$set": {"status": "Breakdown"}})
    report["_id"] = result.inserted_id
    return jsonify(serialize(report)), 201

@equipment_bp.route("/equipment/breakdowns", methods=["GET"])
@jwt_required()
def get_breakdowns():
    db = get_db()
    breakdowns = list(db.equipment_breakdowns.find().sort("created_at", -1))
    return jsonify(serialize(breakdowns)), 200

# ── Fuel Tracking ──────────────────────────────────────────────────────────────
@equipment_bp.route("/equipment/fuel", methods=["GET"])
@jwt_required()
def get_fuel():
    db = get_db()
    fuel = list(db.equipment_fuel.find().sort("created_at", -1))
    return jsonify(serialize(fuel)), 200

@equipment_bp.route("/equipment/fuel", methods=["POST"])
@jwt_required()
def add_fuel():
    data = request.get_json()
    db = get_db()
    data["created_at"] = datetime.datetime.utcnow()
    data["logged_by"] = get_jwt_identity()
    result = db.equipment_fuel.insert_one(data)
    data["_id"] = result.inserted_id
    return jsonify(serialize(data)), 201

# ── Allocation ─────────────────────────────────────────────────────────────────
@equipment_bp.route("/equipment/<eq_id>/allocate", methods=["POST"])
@jwt_required()
def allocate_equipment(eq_id):
    data = request.get_json()
    db = get_db()
    update = {
        "site": data.get("site"),
        "operator": data.get("operator"),
        "status": "Active",
        "allocated_from": data.get("from_date"),
        "allocated_to": data.get("to_date"),
        "updated_at": datetime.datetime.utcnow()
    }
    db.equipment.update_one({"_id": ObjectId(eq_id)}, {"$set": update})
    return jsonify({"message": "Equipment allocated"}), 200
