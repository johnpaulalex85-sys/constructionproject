from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import get_db
from utils.helpers import serialize
from bson import ObjectId
import datetime

procurement_bp = Blueprint("procurement", __name__)

@procurement_bp.route("/procurement/stats", methods=["GET"])
@jwt_required()
def get_proc_stats():
    db = get_db()
    pos = list(db.purchase_orders.find())
    return jsonify({
        "total_pos": len(pos),
        "pending_approvals": len([p for p in pos if p.get("status") == "Pending"]),
        "monthly_cost": sum([float(p.get("total_amount", 0)) for p in pos]),
        "delayed_deliveries": len([p for p in pos if p.get("status") == "Delayed"])
    }), 200

@procurement_bp.route("/procurement/orders", methods=["GET"])
@jwt_required()
def get_orders():
    db = get_db()
    orders = list(db.purchase_orders.find())
    return jsonify(serialize(orders)), 200

@procurement_bp.route("/procurement/orders", methods=["POST"])
@jwt_required()
def create_order():
    data = request.get_json()
    db = get_db()
    data["created_at"] = datetime.datetime.utcnow()
    data["status"] = data.get("status", "Pending")
    result = db.purchase_orders.insert_one(data)
    data["_id"] = result.inserted_id
    return jsonify(serialize(data)), 201

@procurement_bp.route("/procurement/requests", methods=["GET"])
@jwt_required()
def get_requests():
    db = get_db()
    reqs = list(db.purchase_requests.find())
    return jsonify(serialize(reqs)), 200

@procurement_bp.route("/procurement/suppliers", methods=["GET"])
@jwt_required()
def get_suppliers():
    db = get_db()
    suppliers = list(db.suppliers.find())
    return jsonify(serialize(suppliers)), 200

@procurement_bp.route("/procurement/suppliers", methods=["POST"])
@jwt_required()
def add_supplier():
    data = request.get_json()
    db = get_db()
    data["created_at"] = datetime.datetime.utcnow()
    result = db.suppliers.insert_one(data)
    data["_id"] = result.inserted_id
    return jsonify(serialize(data)), 201
