from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from utils.db import get_db
from utils.helpers import serialize
from bson import ObjectId
import bcrypt
import datetime

site_bp = Blueprint("sites", __name__)

@site_bp.route("/sites", methods=["GET"])
@jwt_required()
def get_sites():
    db = get_db()
    sites = list(db.sites.find())
    return jsonify(serialize(sites)), 200


@site_bp.route("/sites", methods=["POST"])
@jwt_required()
def create_site():
    data = request.get_json()
    required = ["name", "supervisor_username", "supervisor_password"]
    if not all(data.get(f) for f in required):
        return jsonify({"error": "name, supervisor_username, and supervisor_password are required"}), 400

    db = get_db()
    if db.sites.find_one({"name": data["name"]}):
        return jsonify({"error": "Site name already exists"}), 409

    hashed = bcrypt.hashpw(data["supervisor_password"].encode("utf-8"), bcrypt.gensalt())
    site = {
        "name": data["name"],
        "is_active": True,
        "supervisor_username": data["supervisor_username"],
        "supervisor_password_hash": hashed,
        "created_at": datetime.datetime.utcnow()
    }
    result = db.sites.insert_one(site)
    site["_id"] = result.inserted_id
    return jsonify(serialize(site)), 201


@site_bp.route("/sites/<site_id>", methods=["PUT"])
@jwt_required()
def update_site(site_id):
    data = request.get_json()
    db = get_db()
    update_fields = {}

    if data.get("name"):
        update_fields["name"] = data["name"]
    if data.get("supervisor_username"):
        update_fields["supervisor_username"] = data["supervisor_username"]
    if data.get("supervisor_password"):
        update_fields["supervisor_password_hash"] = bcrypt.hashpw(
            data["supervisor_password"].encode("utf-8"), bcrypt.gensalt()
        )

    if not update_fields:
        return jsonify({"error": "No valid fields to update"}), 400

    result = db.sites.update_one({"_id": ObjectId(site_id)}, {"$set": update_fields})
    if result.matched_count == 0:
        return jsonify({"error": "Site not found"}), 404

    site = db.sites.find_one({"_id": ObjectId(site_id)})
    return jsonify(serialize(site)), 200


@site_bp.route("/sites/<site_id>", methods=["DELETE"])
@jwt_required()
def delete_site(site_id):
    db = get_db()
    result = db.sites.delete_one({"_id": ObjectId(site_id)})
    if result.deleted_count == 0:
        return jsonify({"error": "Site not found"}), 404
    # Cascade delete related data
    db.allocations.delete_many({"site_id": site_id})
    db.usage_logs.delete_many({"site_id": site_id})
    db.material_requests.delete_many({"site_id": site_id})
    return jsonify({"message": "Site deleted"}), 200


@site_bp.route("/sites/<site_id>/status", methods=["PATCH"])
@jwt_required()
def toggle_site_status(site_id):
    db = get_db()
    site = db.sites.find_one({"_id": ObjectId(site_id)})
    if not site:
        return jsonify({"error": "Site not found"}), 404

    new_status = not site.get("is_active", True)
    db.sites.update_one({"_id": ObjectId(site_id)}, {"$set": {"is_active": new_status}})
    return jsonify({"is_active": new_status}), 200
