from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from utils.db import get_db
from utils.helpers import serialize
from bson import ObjectId
import bcrypt
import datetime

supervisor_management_bp = Blueprint("supervisor_management", __name__)

def is_admin():
    claims = get_jwt()
    return claims.get("role") == "admin"

@supervisor_management_bp.route("/admin/supervisors", methods=["GET"])
@jwt_required()
def get_supervisors():
    if not is_admin():
        return jsonify({"msg": "Unauthorized"}), 403
        
    db = get_db()
    # Find all users with role 'supervisor'
    supervisors = list(db.users.find({"role": "supervisor"}))
    
    # Also fetch supervisors that might only exist in the sites collection for backward compatibility
    # and map them if they don't have a user account yet (optional, but good for robust display)
    existing_site_supervisors = list(db.sites.find({"supervisor_username": {"$exists": True}}))
    
    # We will just return the ones in db.users for the management page,
    # or migrate the site ones on the fly for display if we wanted.
    # For now, let's just return the ones from db.users.
    
    return jsonify(serialize(supervisors)), 200

@supervisor_management_bp.route("/admin/supervisors", methods=["POST"])
@jwt_required()
def create_supervisor():
    if not is_admin():
        return jsonify({"msg": "Unauthorized"}), 403
        
    data = request.get_json()
    if not data or not data.get("username") or not data.get("password") or not data.get("name"):
        return jsonify({"error": "Name, username, and password are required"}), 400

    db = get_db()
    
    # Check if username exists in users or sites
    if db.users.find_one({"username": data["username"]}) or db.sites.find_one({"supervisor_username": data["username"]}):
        return jsonify({"error": "Username already exists"}), 409

    hashed = bcrypt.hashpw(data["password"].encode("utf-8"), bcrypt.gensalt())
    
    supervisor = {
        "name": data["name"],
        "username": data["username"],
        "password_hash": hashed,
        "role": "supervisor",
        "created_at": datetime.datetime.utcnow()
    }
    
    result = db.users.insert_one(supervisor)
    supervisor["_id"] = result.inserted_id
    
    # Don't return the hash
    supervisor.pop("password_hash", None)
    
    return jsonify(serialize(supervisor)), 201

@supervisor_management_bp.route("/admin/supervisors/<supervisor_id>", methods=["PUT"])
@jwt_required()
def update_supervisor(supervisor_id):
    if not is_admin():
        return jsonify({"msg": "Unauthorized"}), 403
        
    data = request.get_json()
    db = get_db()
    
    update_fields = {}
    if data.get("name"):
        update_fields["name"] = data["name"]
    if data.get("username"):
        # Check if new username is taken
        existing = db.users.find_one({"username": data["username"]})
        if existing and str(existing["_id"]) != supervisor_id:
             return jsonify({"error": "Username already exists"}), 409
        update_fields["username"] = data["username"]
    
    if data.get("password"):
        update_fields["password_hash"] = bcrypt.hashpw(data["password"].encode("utf-8"), bcrypt.gensalt())

    if not update_fields:
        return jsonify({"error": "No fields to update"}), 400

    result = db.users.update_one({"_id": ObjectId(supervisor_id), "role": "supervisor"}, {"$set": update_fields})
    if result.matched_count == 0:
        return jsonify({"error": "Supervisor not found"}), 404

    return jsonify({"message": "Supervisor updated successfully"}), 200

@supervisor_management_bp.route("/admin/supervisors/<supervisor_id>", methods=["DELETE"])
@jwt_required()
def delete_supervisor(supervisor_id):
    if not is_admin():
        return jsonify({"msg": "Unauthorized"}), 403
        
    db = get_db()
    
    # Check if assigned to any site
    site = db.sites.find_one({"supervisor_id": supervisor_id})
    if site:
        return jsonify({"error": f"Cannot delete. Supervisor is assigned to site: {site['name']}"}), 400
        
    result = db.users.delete_one({"_id": ObjectId(supervisor_id), "role": "supervisor"})
    if result.deleted_count == 0:
        return jsonify({"error": "Supervisor not found"}), 404

    return jsonify({"message": "Supervisor deleted"}), 200
