from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from utils.db import get_db
from utils.helpers import serialize
from bson import ObjectId

allocation_bp = Blueprint("allocations", __name__)

def _compute_remaining(db, site_id, material_id, allocated_qty):
    """Compute used quantity from usage logs."""
    pipeline = [
        {"$match": {"site_id": site_id, "material_id": material_id}},
        {"$group": {"_id": None, "total": {"$sum": "$used_quantity"}}}
    ]
    result = list(db.usage_logs.aggregate(pipeline))
    used = result[0]["total"] if result else 0
    return allocated_qty - used, used


@allocation_bp.route("/allocations/<site_id>", methods=["GET"])
@jwt_required()
def get_allocations(site_id):
    db = get_db()
    allocations = list(db.allocations.find({"site_id": site_id}))

    enriched = []
    for alloc in allocations:
        mat = db.materials.find_one({"_id": ObjectId(alloc["material_id"])})
        remaining, used = _compute_remaining(
            db, site_id, alloc["material_id"], alloc["allocated_quantity"]
        )
        entry = serialize(alloc)
        entry["material_name"] = mat["name"] if mat else "Unknown"
        entry["material_unit"] = mat["unit"] if mat else ""
        entry["used_quantity"] = used
        entry["remaining_quantity"] = remaining
        enriched.append(entry)

    return jsonify(enriched), 200


@allocation_bp.route("/allocations", methods=["POST"])
@jwt_required()
def create_allocation():
    data = request.get_json()
    required = ["site_id", "material_id", "allocated_quantity"]
    if not all(data.get(f) for f in required):
        return jsonify({"error": "site_id, material_id, and allocated_quantity are required"}), 400

    db = get_db()

    # Check if allocation already exists for this site+material
    existing = db.allocations.find_one({
        "site_id": data["site_id"],
        "material_id": data["material_id"]
    })
    if existing:
        return jsonify({"error": "Allocation already exists for this site+material. Use PUT to update."}), 409

    alloc = {
        "site_id": data["site_id"],
        "material_id": data["material_id"],
        "allocated_quantity": float(data["allocated_quantity"])
    }
    result = db.allocations.insert_one(alloc)
    alloc["_id"] = result.inserted_id
    return jsonify(serialize(alloc)), 201


@allocation_bp.route("/allocations/<allocation_id>", methods=["PUT"])
@jwt_required()
def update_allocation(allocation_id):
    data = request.get_json()
    db = get_db()

    alloc = db.allocations.find_one({"_id": ObjectId(allocation_id)})
    if not alloc:
        return jsonify({"error": "Allocation not found"}), 404

    new_qty = float(data.get("allocated_quantity", alloc["allocated_quantity"]))

    # Ensure new allocated quantity is not less than already used
    pipeline = [
        {"$match": {"site_id": alloc["site_id"], "material_id": alloc["material_id"]}},
        {"$group": {"_id": None, "total": {"$sum": "$used_quantity"}}}
    ]
    result = list(db.usage_logs.aggregate(pipeline))
    used = result[0]["total"] if result else 0

    if new_qty < used:
        return jsonify({
            "error": f"Cannot set allocated quantity below already used amount ({used})"
        }), 400

    db.allocations.update_one(
        {"_id": ObjectId(allocation_id)},
        {"$set": {"allocated_quantity": new_qty}}
    )
    updated = db.allocations.find_one({"_id": ObjectId(allocation_id)})
    return jsonify(serialize(updated)), 200


@allocation_bp.route("/allocations/<allocation_id>", methods=["DELETE"])
@jwt_required()
def delete_allocation(allocation_id):
    db = get_db()
    result = db.allocations.delete_one({"_id": ObjectId(allocation_id)})
    if result.deleted_count == 0:
        return jsonify({"error": "Allocation not found"}), 404
    return jsonify({"message": "Allocation removed"}), 200
