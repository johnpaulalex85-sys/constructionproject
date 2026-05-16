from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from utils.db import get_db
from utils.helpers import serialize
from bson import ObjectId
import datetime

accounting_bp = Blueprint("accounting", __name__)

def get_user_site_id():
    claims = get_jwt()
    if claims.get("role") == "supervisor":
        return get_jwt_identity()
    return None

def init_site_account(db, site_id):
    account = db.site_accounts.find_one({"site_id": str(site_id)})
    if not account:
        new_account = {
            "site_id": str(site_id),
            "current_balance": 0.0,
            "total_credit": 0.0,
            "total_debit": 0.0,
            "updated_at": datetime.datetime.utcnow()
        }
        db.site_accounts.insert_one(new_account)
        return new_account
    return account

# --- SHARED / INFO ---

@accounting_bp.route("/accounting/balance", methods=["GET"])
@accounting_bp.route("/accounting/balance/<site_id>", methods=["GET"])
@jwt_required()
def get_balance(site_id=None):
    db = get_db()
    claims = get_jwt()
    role = claims.get("role")
    
    if role == "supervisor":
        site_id = get_jwt_identity()
    elif not site_id:
        return jsonify({"msg": "Admin must provide site_id"}), 400
        
    account = init_site_account(db, site_id)
    return jsonify(serialize(account)), 200

# --- ADMIN: SITES DASHBOARD ---
@accounting_bp.route("/accounting/sites", methods=["GET"])
@jwt_required()
def get_sites_accounting():
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"msg": "Admin access required"}), 403
        
    db = get_db()
    sites = list(db.sites.find())
    
    result = []
    for site in sites:
        account = init_site_account(db, site["_id"])
        
        # Get pending requests count
        pending_count = db.amount_requests.count_documents({
            "site_id": str(site["_id"]), 
            "status": "pending"
        })
        
        entry = serialize(site)
        entry["account"] = serialize(account)
        entry["pending_requests"] = pending_count
        result.append(entry)
        
    return jsonify(result), 200

# --- LEDGER / TRANSACTIONS ---

@accounting_bp.route("/accounting/transactions", methods=["GET"])
@accounting_bp.route("/accounting/transactions/<site_id>", methods=["GET"])
@jwt_required()
def get_transactions(site_id=None):
    db = get_db()
    claims = get_jwt()
    role = claims.get("role")
    
    if role == "supervisor":
        site_id = get_jwt_identity()
    elif not site_id:
        return jsonify({"msg": "Admin must provide site_id"}), 400
        
    tx_type = request.args.get("type") # optional filter
    query = {"site_id": str(site_id)}
    if tx_type:
        query["type"] = tx_type
        
    transactions = list(db.account_transactions.find(query).sort("created_at", -1))
    return jsonify(serialize(transactions)), 200

@accounting_bp.route("/accounting/ledger", methods=["GET"])
@accounting_bp.route("/accounting/ledger/<site_id>", methods=["GET"])
@jwt_required()
def get_ledger(site_id=None):
    db = get_db()
    claims = get_jwt()
    role = claims.get("role")
    
    if role == "supervisor":
        site_id = get_jwt_identity()
    elif not site_id:
        return jsonify({"msg": "Admin must provide site_id"}), 400
        
    transactions = list(db.account_transactions.find({"site_id": str(site_id)}).sort("created_at", 1))
    
    running_balance = 0.0
    ledger = []
    for tx in transactions:
        if tx["type"] == "credit":
            running_balance += tx["amount"]
        else:
            running_balance -= tx["amount"]
            
        entry = serialize(tx)
        entry["running_balance"] = running_balance
        ledger.append(entry)
        
    ledger.reverse()
    return jsonify(ledger), 200

# --- ADMIN: POST CREDITS ---

@accounting_bp.route("/accounting/credits", methods=["POST"])
@jwt_required()
def add_credit():
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"msg": "Only admins can add credits"}), 403
        
    data = request.get_json()
    site_id = data.get("site_id")
    amount = data.get("amount")
    description = data.get("description", "")
    
    if not site_id or not amount:
        return jsonify({"msg": "Site ID and Amount are required"}), 400
        
    amount = float(amount)
    if amount <= 0:
        return jsonify({"msg": "Amount must be positive"}), 400
        
    db = get_db()
    
    init_site_account(db, site_id)
    db.site_accounts.update_one(
        {"site_id": str(site_id)},
        {
            "$inc": {"current_balance": amount, "total_credit": amount},
            "$set": {"updated_at": datetime.datetime.utcnow()}
        }
    )
    
    tx = {
        "site_id": str(site_id),
        "type": "credit",
        "amount": amount,
        "category": "Credit",
        "description": description,
        "created_by": "admin",
        "created_at": datetime.datetime.utcnow()
    }
    db.account_transactions.insert_one(tx)
    
    return jsonify(serialize(tx)), 201

import os
from werkzeug.utils import secure_filename

# --- SUPERVISOR: POST DEBITS ---

@accounting_bp.route("/accounting/debits", methods=["POST"])
@jwt_required()
def add_debit():
    site_id = get_user_site_id()
    if not site_id:
        return jsonify({"msg": "Only supervisors can add debits"}), 403
        
    # Support both JSON and Multipart Form Data
    if request.is_json:
        data = request.get_json()
    else:
        data = request.form
        
    amount = data.get("amount")
    category = data.get("category", "Misc")
    description = data.get("description", "")
    
    if not amount:
        return jsonify({"msg": "Amount is required"}), 400
        
    amount = float(amount)
    if amount <= 0:
        return jsonify({"msg": "Amount must be positive"}), 400
        
    # Handle receipt upload
    receipt_url = None
    if "receipt" in request.files:
        file = request.files["receipt"]
        if file.filename != "":
            filename = secure_filename(f"{datetime.datetime.utcnow().timestamp()}_{file.filename}")
            upload_folder = os.path.join(request.root_path, "static", "uploads", "receipts")
            os.makedirs(upload_folder, exist_ok=True)
            file_path = os.path.join(upload_folder, filename)
            file.save(file_path)
            receipt_url = f"/static/uploads/receipts/{filename}"
            
    db = get_db()
    
    init_site_account(db, site_id)
    db.site_accounts.update_one(
        {"site_id": str(site_id)},
        {
            "$inc": {"current_balance": -amount, "total_debit": amount},
            "$set": {"updated_at": datetime.datetime.utcnow()}
        }
    )
    
    tx = {
        "site_id": str(site_id),
        "type": "debit",
        "amount": amount,
        "category": category,
        "description": description,
        "receipt_url": receipt_url,
        "created_by": "supervisor",
        "created_at": datetime.datetime.utcnow()
    }
    db.account_transactions.insert_one(tx)
    
    return jsonify(serialize(tx)), 201


# --- AMOUNT REQUESTS ---

@accounting_bp.route("/accounting/requests", methods=["GET"])
@accounting_bp.route("/accounting/requests/<site_id>", methods=["GET"])
@jwt_required()
def get_amount_requests(site_id=None):
    db = get_db()
    claims = get_jwt()
    role = claims.get("role")
    
    query = {}
    if role == "supervisor":
        query["site_id"] = get_jwt_identity()
    elif site_id:
        query["site_id"] = str(site_id)
        
    status = request.args.get("status")
    if status:
        query["status"] = status
        
    requests = list(db.amount_requests.find(query).sort("created_at", -1))
    
    if role == "admin":
        for req in requests:
            site = db.sites.find_one({"_id": ObjectId(req["site_id"])})
            req["site_name"] = site["name"] if site else "Unknown"
            
    return jsonify(serialize(requests)), 200

@accounting_bp.route("/accounting/requests", methods=["POST"])
@jwt_required()
def create_amount_request():
    site_id = get_user_site_id()
    if not site_id:
        return jsonify({"msg": "Only supervisors can request funds"}), 403
        
    data = request.get_json()
    amount = data.get("amount")
    description = data.get("description", "")
    
    if not amount:
        return jsonify({"msg": "Amount is required"}), 400
        
    db = get_db()
    req = {
        "site_id": str(site_id),
        "requested_amount": float(amount),
        "description": description,
        "status": "pending",
        "created_at": datetime.datetime.utcnow()
    }
    db.amount_requests.insert_one(req)
    
    return jsonify(serialize(req)), 201

@accounting_bp.route("/accounting/requests/<request_id>/approve", methods=["PUT"])
@jwt_required()
def approve_request(request_id):
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"msg": "Only admins can approve requests"}), 403
        
    db = get_db()
    req = db.amount_requests.find_one({"_id": ObjectId(request_id)})
    if not req:
        return jsonify({"msg": "Request not found"}), 404
        
    if req["status"] != "pending":
        return jsonify({"msg": f"Request already {req['status']}"}), 400
        
    site_id = req["site_id"]
    amount = req["requested_amount"]
    
    db.amount_requests.update_one(
        {"_id": ObjectId(request_id)},
        {
            "$set": {
                "status": "approved",
                "approved_by": "admin",
                "approved_at": datetime.datetime.utcnow()
            }
        }
    )
    
    init_site_account(db, site_id)
    db.site_accounts.update_one(
        {"site_id": str(site_id)},
        {
            "$inc": {"current_balance": amount, "total_credit": amount},
            "$set": {"updated_at": datetime.datetime.utcnow()}
        }
    )
    
    tx = {
        "site_id": str(site_id),
        "type": "credit",
        "amount": amount,
        "category": "Credit",
        "description": f"Approved request: {req.get('description', '')}",
        "created_by": "system",
        "created_at": datetime.datetime.utcnow()
    }
    db.account_transactions.insert_one(tx)
    
    return jsonify({"msg": "Request approved and account credited"}), 200

@accounting_bp.route("/accounting/requests/<request_id>/reject", methods=["PUT"])
@jwt_required()
def reject_request(request_id):
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"msg": "Only admins can reject requests"}), 403
        
    db = get_db()
    result = db.amount_requests.update_one(
        {"_id": ObjectId(request_id), "status": "pending"},
        {
            "$set": {
                "status": "rejected",
                "rejected_at": datetime.datetime.utcnow()
            }
        }
    )
    
    if result.matched_count == 0:
        return jsonify({"msg": "Request not found or already processed"}), 404
        
    return jsonify({"msg": "Request rejected"}), 200
