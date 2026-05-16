from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from utils.db import get_db
from utils.helpers import serialize
from bson import ObjectId
import datetime

usage_bp = Blueprint("usage", __name__)

@usage_bp.route("/usage/<site_id>", methods=["GET"])
@jwt_required()
def get_usage(site_id):
    db = get_db()
    logs = list(db.usage_logs.find({"site_id": site_id}).sort("date", -1))

    enriched = []
    for log in logs:
        mat = db.materials.find_one({"_id": ObjectId(log["material_id"])})
        entry = serialize(log)
        entry["material_name"] = mat["name"] if mat else "Unknown"
        entry["material_unit"] = mat["unit"] if mat else ""
        enriched.append(entry)

    return jsonify(enriched), 200


@usage_bp.route("/usage", methods=["POST"])
@jwt_required()
def log_usage():
    data = request.get_json()
    required = ["site_id", "material_id", "used_quantity"]
    if not all(data.get(f) is not None for f in required):
        return jsonify({"error": "site_id, material_id, and used_quantity are required"}), 400

    db = get_db()
    used_qty = float(data["used_quantity"])
    if used_qty <= 0:
        return jsonify({"error": "used_quantity must be positive"}), 400

    # Check allocation exists
    alloc = db.allocations.find_one({
        "site_id": data["site_id"],
        "material_id": data["material_id"]
    })
    if not alloc:
        return jsonify({"error": "No allocation found for this site and material"}), 404

    # Check remaining stock
    pipeline = [
        {"$match": {"site_id": data["site_id"], "material_id": data["material_id"]}},
        {"$group": {"_id": None, "total": {"$sum": "$used_quantity"}}}
    ]
    result = list(db.usage_logs.aggregate(pipeline))
    total_used = result[0]["total"] if result else 0
    remaining = alloc["allocated_quantity"] - total_used

    if used_qty > remaining:
        return jsonify({
            "error": f"Usage ({used_qty}) exceeds remaining stock ({remaining})"
        }), 400

    log = {
        "site_id": data["site_id"],
        "material_id": data["material_id"],
        "used_quantity": used_qty,
        "date": datetime.datetime.utcnow()
    }
    result = db.usage_logs.insert_one(log)
    log["_id"] = result.inserted_id
    return jsonify(serialize(log)), 201
