from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from utils.db import get_db
from utils.helpers import serialize
from bson import ObjectId
import datetime

request_bp = Blueprint("requests", __name__)

@request_bp.route("/requests", methods=["GET"])
@jwt_required()
def get_requests():
    db = get_db()
    status_filter = request.args.get("status")
    query = {}
    if status_filter:
        query["status"] = status_filter

    reqs = list(db.material_requests.find(query).sort("created_at", -1))

    enriched = []
    for req in reqs:
        site = db.sites.find_one({"_id": ObjectId(req["site_id"])}) if ObjectId.is_valid(req.get("site_id", "")) else None
        mat = db.materials.find_one({"_id": ObjectId(req["material_id"])}) if ObjectId.is_valid(req.get("material_id", "")) else None
        entry = serialize(req)
        entry["site_name"] = site["name"] if site else "Unknown"
        entry["material_name"] = mat["name"] if mat else "Unknown"
        entry["material_unit"] = mat["unit"] if mat else ""
        enriched.append(entry)

    return jsonify(enriched), 200


@request_bp.route("/requests/<request_id>", methods=["PUT"])
@jwt_required()
def update_request(request_id):
    data = request.get_json()
    status = data.get("status")
    if status not in ("approved", "rejected"):
        return jsonify({"error": "status must be 'approved' or 'rejected'"}), 400

    db = get_db()
    req = db.material_requests.find_one({"_id": ObjectId(request_id)})
    if not req:
        return jsonify({"error": "Request not found"}), 404

    if req["status"] != "pending":
        return jsonify({"error": "Only pending requests can be updated"}), 400

    # If approving, auto-create/update allocation
    if status == "approved":
        existing_alloc = db.allocations.find_one({
            "site_id": req["site_id"],
            "material_id": req["material_id"]
        })
        if existing_alloc:
            db.allocations.update_one(
                {"_id": existing_alloc["_id"]},
                {"$inc": {"allocated_quantity": req["requested_quantity"]}}
            )
        else:
            db.allocations.insert_one({
                "site_id": req["site_id"],
                "material_id": req["material_id"],
                "allocated_quantity": req["requested_quantity"]
            })

    db.material_requests.update_one(
        {"_id": ObjectId(request_id)},
        {"$set": {"status": status, "updated_at": datetime.datetime.utcnow()}}
    )
    updated = db.material_requests.find_one({"_id": ObjectId(request_id)})
    return jsonify(serialize(updated)), 200
