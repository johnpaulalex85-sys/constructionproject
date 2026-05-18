from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from utils.db import get_db
from utils.helpers import serialize
from bson import ObjectId

material_bp = Blueprint("materials", __name__)


@material_bp.route("/materials", methods=["GET"])
@jwt_required()
def get_materials():
    db = get_db()
    materials = list(db.materials.find())
    result = []
    for m in materials:
        mat = serialize(m)
        # Compute allocated_quantity across all allocations for this material
        allocs = list(db.allocations.find({"material_id": str(m["_id"])}))
        mat["allocated_quantity"] = sum(a.get("allocated_quantity", 0) for a in allocs)
        # Compute total_used across all usage_logs for this material
        pipeline = [
            {"$match": {"material_id": str(m["_id"])}},
            {"$group": {"_id": None, "total": {"$sum": "$used_quantity"}}}
        ]
        agg = list(db.usage_logs.aggregate(pipeline))
        mat["total_used"] = agg[0]["total"] if agg else 0
        result.append(mat)
    return jsonify(result), 200


@material_bp.route("/materials", methods=["POST"])
@jwt_required()
def create_material():
    data = request.get_json()
    if not data.get("name") or not data.get("unit"):
        return jsonify({"error": "name and unit are required"}), 400

    db = get_db()
    if db.materials.find_one({"name": {"$regex": f"^{data['name']}$", "$options": "i"}}):
        return jsonify({"error": "Material with this name already exists"}), 409

    material = {
        "name": data["name"].strip(),
        "unit": data["unit"].strip(),
        "cost_per_unit": float(data.get("cost_per_unit", 0))
    }
    result = db.materials.insert_one(material)
    material["_id"] = result.inserted_id
    return jsonify(serialize(material)), 201


@material_bp.route("/materials/<material_id>", methods=["PUT"])
@jwt_required()
def update_material(material_id):
    data = request.get_json()
    db = get_db()
    update_fields = {}

    if data.get("name"):
        update_fields["name"] = data["name"].strip()
    if data.get("unit"):
        update_fields["unit"] = data["unit"].strip()
    if "cost_per_unit" in data:
        update_fields["cost_per_unit"] = float(data["cost_per_unit"])

    if not update_fields:
        return jsonify({"error": "No valid fields to update"}), 400

    result = db.materials.update_one({"_id": ObjectId(material_id)}, {"$set": update_fields})
    if result.matched_count == 0:
        return jsonify({"error": "Material not found"}), 404

    material = db.materials.find_one({"_id": ObjectId(material_id)})
    return jsonify(serialize(material)), 200


@material_bp.route("/materials/<material_id>", methods=["DELETE"])
@jwt_required()
def delete_material(material_id):
    db = get_db()
    result = db.materials.delete_one({"_id": ObjectId(material_id)})
    if result.deleted_count == 0:
        return jsonify({"error": "Material not found"}), 404
    # Cascade: remove allocations and usage logs for this material
    db.allocations.delete_many({"material_id": material_id})
    db.usage_logs.delete_many({"material_id": material_id})
    return jsonify({"message": "Material deleted"}), 200
