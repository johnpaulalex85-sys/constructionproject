from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from utils.db import get_db
from utils.helpers import serialize
import bcrypt
import datetime
import os

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/auth/login", methods=["POST"])
@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data or not data.get("username") or not data.get("password"):
        return jsonify({"error": "Username and password required", "msg": "Username and password required"}), 400

    admin_user = os.getenv("ADMIN_USERNAME", "admin")
    admin_pass = os.getenv("ADMIN_PASSWORD", "Admin@1234")

    if data["username"] == admin_user and data["password"].strip() == admin_pass.strip():
        role = "admin"
        user_id = "admin_env"
        username = admin_user
        token = create_access_token(
            identity=user_id,
            additional_claims={"username": username, "role": role}
        )
        return jsonify({
            "token": token,
            "access_token": token,
            "role": role,
            "user": {
                "id": user_id,
                "username": username,
                "role": role
            }
        }), 200

    try:
        db = get_db()
        
        # Try finding in users (Admin) or sites (Supervisor)
        user = db.users.find_one({"username": data["username"]})
        is_admin = True
        
        if not user:
            user = db.sites.find_one({"supervisor_username": data["username"]})
            if not user:
                return jsonify({"error": "Invalid credentials", "msg": "Invalid credentials"}), 401
            is_admin = False
            pw_hash = user["supervisor_password_hash"]
            role = "supervisor"
            user_id = str(user["_id"])
            username = user["supervisor_username"]
        else:
            pw_hash = user["password_hash"]
            role = user["role"]
            user_id = str(user["_id"])
            username = user["username"]

        # Ensure hash is plain bytes
        if isinstance(pw_hash, str):
            pw_hash = pw_hash.encode("utf-8")
        elif not isinstance(pw_hash, bytes):
            pw_hash = bytes(pw_hash)
            
        if not bcrypt.checkpw(data["password"].encode("utf-8"), pw_hash):
            return jsonify({"error": "Invalid credentials", "msg": "Invalid credentials"}), 401

        token = create_access_token(
            identity=user_id,
            additional_claims={"username": username, "role": role}
        )
        
        # Return both formats to support web and mobile
        return jsonify({
            "token": token,
            "access_token": token, # For mobile
            "role": role,          # For mobile
            "user": {
                "id": user_id,
                "username": username,
                "role": role
            }
        }), 200
    except Exception as e:
        return jsonify({"error": "Database connection error or invalid hash", "msg": str(e)}), 500


@auth_bp.route("/register-admin", methods=["POST"])
def register_admin():
    """One-time admin registration endpoint (disable in production after first use)."""
    data = request.get_json()
    if not data or not data.get("username") or not data.get("password"):
        return jsonify({"error": "Username and password required"}), 400

    db = get_db()
    if db.users.find_one({"username": data["username"]}):
        return jsonify({"error": "Username already exists"}), 409

    hashed = bcrypt.hashpw(data["password"].encode("utf-8"), bcrypt.gensalt())
    user = {
        "username": data["username"],
        "password_hash": hashed,
        "role": "admin",
        "created_at": datetime.datetime.utcnow()
    }
    result = db.users.insert_one(user)
    return jsonify({"message": "Admin created", "id": str(result.inserted_id)}), 201
