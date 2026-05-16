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
    return jsonify(serialize(materials)), 200


@material_bp.route("/materials", methods=["POST"])
@jwt_required()
def create_material():
    data = request.get_json()
    if not data.get("name") or not data.get("unit"):
        return jsonify({"error": "name and unit are required"}), 400

    db = get_db()
    material = {
        "name": data["name"],
        "unit": data["unit"],
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
        update_fields["name"] = data["name"]
    if data.get("unit"):
        update_fields["unit"] = data["unit"]
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
    return jsonify({"message": "Material deleted"}), 200
