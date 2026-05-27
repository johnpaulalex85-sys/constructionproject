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


# ── GLOBAL FINANCIAL OVERVIEW ──────────────────────────────────────────────────
@accounting_bp.route("/accounting/overview", methods=["GET"])
@jwt_required()
def get_accounting_overview():
    """Aggregate financial summary across all sites, materials and equipment."""
    claims = get_jwt()
    if claims.get("role") != "admin":
        return jsonify({"msg": "Admin access required"}), 403

    db = get_db()

    # ── Cash (site accounts) ───────────────────────────────────────────────────
    accounts = list(db.site_accounts.find())
    total_cash_credit  = sum(float(a.get("total_credit", 0))  for a in accounts)
    total_cash_debit   = sum(float(a.get("total_debit", 0))   for a in accounts)
    total_cash_balance = sum(float(a.get("current_balance", 0)) for a in accounts)

    # ── Materials ──────────────────────────────────────────────────────────────
    materials = list(db.materials.find())
    total_material_value     = 0.0  # cost_per_unit × total_quantity
    total_material_allocated = 0.0  # cost_per_unit × allocated_quantity
    total_material_used_cost = 0.0  # cost_per_unit × used_quantity
    total_material_remaining = 0.0  # cost_per_unit × remaining_quantity

    for m in materials:
        cpu   = float(m.get("cost_per_unit", 0))
        total = float(m.get("total_quantity", 0))
        mid   = str(m["_id"])

        allocs   = list(db.allocations.find({"material_id": mid}))
        alloc_qty = sum(float(a.get("allocated_quantity", 0)) for a in allocs)

        agg = list(db.usage_logs.aggregate([
            {"$match": {"material_id": mid}},
            {"$group": {"_id": None, "total": {"$sum": "$used_quantity"}}}
        ]))
        used_qty      = agg[0]["total"] if agg else 0.0
        remaining_qty = max(0.0, total - alloc_qty)

        total_material_value     += cpu * total
        total_material_allocated += cpu * alloc_qty
        total_material_used_cost += cpu * used_qty
        total_material_remaining += cpu * remaining_qty

    # ── Equipment ─────────────────────────────────────────────────────────────
    fuel_agg = list(db.equipment_fuel.aggregate([
        {"$group": {"_id": None, "total_cost": {"$sum": {"$toDouble": "$cost"}}, "total_liters": {"$sum": {"$toDouble": "$liters"}}}}
    ]))
    total_fuel_cost   = fuel_agg[0]["total_cost"]   if fuel_agg else 0.0
    total_fuel_liters = fuel_agg[0]["total_liters"] if fuel_agg else 0.0

    maint_agg = list(db.equipment_maintenance.aggregate([
        {"$group": {"_id": None, "total_cost": {"$sum": {"$toDouble": "$cost"}}}}
    ]))
    total_maint_cost = maint_agg[0]["total_cost"] if maint_agg else 0.0

    # ── Monthly fuel (this calendar month) ────────────────────────────────────
    now = datetime.datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    monthly_fuel_agg = list(db.equipment_fuel.aggregate([
        {"$match": {"created_at": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": {"$toDouble": "$cost"}}}}
    ]))
    monthly_fuel_cost = monthly_fuel_agg[0]["total"] if monthly_fuel_agg else 0.0

    # ── Per-site summary rows ──────────────────────────────────────────────────
    sites = list(db.sites.find())
    site_rows = []
    for site in sites:
        sid        = str(site["_id"])
        site_name  = site.get("name", "Unknown")
        acct       = db.site_accounts.find_one({"site_id": sid}) or {}
        cash_bal   = float(acct.get("current_balance", 0))

        # material cost for this site via allocations
        site_allocs = list(db.allocations.find({"site_id": sid}))
        site_mat_cost = 0.0
        for alloc in site_allocs:
            mat = db.materials.find_one({"_id": ObjectId(alloc["material_id"])}) if alloc.get("material_id") else None
            if mat:
                site_mat_cost += float(mat.get("cost_per_unit", 0)) * float(alloc.get("allocated_quantity", 0))

        # equipment costs for this site
        fuel_site_agg = list(db.equipment_fuel.aggregate([
            {"$match": {"site": site_name}},
            {"$group": {"_id": None, "total": {"$sum": {"$toDouble": "$cost"}}}}
        ]))
        site_fuel_cost = fuel_site_agg[0]["total"] if fuel_site_agg else 0.0

        maint_site_agg = list(db.equipment_maintenance.aggregate([
            {"$match": {"site": site_name}},
            {"$group": {"_id": None, "total": {"$sum": {"$toDouble": "$cost"}}}}
        ]))
        site_maint_cost = maint_site_agg[0]["total"] if maint_site_agg else 0.0

        site_rows.append({
            "site_id":   sid,
            "site_name": site_name,
            "cash_balance":       cash_bal,
            "material_cost":      round(site_mat_cost, 2),
            "equipment_fuel":     round(site_fuel_cost, 2),
            "equipment_maint":    round(site_maint_cost, 2),
            "total_spend":        round(site_mat_cost + site_fuel_cost + site_maint_cost, 2),
        })

    return jsonify({
        "cash": {
            "total_credit":  round(total_cash_credit,  2),
            "total_debit":   round(total_cash_debit,   2),
            "total_balance": round(total_cash_balance, 2),
        },
        "materials": {
            "total_value":     round(total_material_value,     2),
            "allocated_value": round(total_material_allocated, 2),
            "used_cost":       round(total_material_used_cost, 2),
            "remaining_value": round(total_material_remaining, 2),
        },
        "equipment": {
            "total_fuel_cost":  round(total_fuel_cost,   2),
            "total_fuel_liters": round(total_fuel_liters, 2),
            "total_maint_cost": round(total_maint_cost,  2),
            "monthly_fuel_cost": round(monthly_fuel_cost, 2),
        },
        "sites": site_rows,
    }), 200


# ── PER-SITE FINANCIAL SUMMARY ─────────────────────────────────────────────────
@accounting_bp.route("/accounting/site-summary/<site_id>", methods=["GET"])
@jwt_required()
def get_site_financial_summary(site_id):
    """Full cost breakdown for a single site."""
    db = get_db()
    site = db.sites.find_one({"_id": ObjectId(site_id)})
    if not site:
        return jsonify({"msg": "Site not found"}), 404

    site_name = site.get("name", "")
    acct = init_site_account(db, site_id)

    # Material cost breakdown for this site
    allocs = list(db.allocations.find({"site_id": str(site_id)}))
    mat_rows = []
    for alloc in allocs:
        mat = db.materials.find_one({"_id": ObjectId(alloc["material_id"])}) if alloc.get("material_id") else None
        if not mat:
            continue
        cpu           = float(mat.get("cost_per_unit", 0))
        alloc_qty     = float(alloc.get("allocated_quantity", 0))
        remaining_qty = float(alloc.get("remaining_quantity", 0))
        used_qty      = max(0.0, alloc_qty - remaining_qty)
        mat_rows.append({
            "material_name": mat.get("name", ""),
            "unit":          mat.get("unit", ""),
            "cost_per_unit": cpu,
            "allocated_qty": alloc_qty,
            "used_qty":      used_qty,
            "remaining_qty": remaining_qty,
            "allocated_cost": round(cpu * alloc_qty, 2),
            "used_cost":      round(cpu * used_qty, 2),
            "remaining_cost": round(cpu * remaining_qty, 2),
        })

    # Equipment fuel for this site
    fuel_logs  = serialize(list(db.equipment_fuel.find({"site": site_name}).sort("created_at", -1).limit(50)))
    maint_logs = serialize(list(db.equipment_maintenance.find({"site": site_name}).sort("created_at", -1).limit(50)))

    fuel_total  = sum(float(f.get("cost", 0))  for f in fuel_logs)
    maint_total = sum(float(m.get("cost", 0))  for m in maint_logs)

    return jsonify({
        "site_id":   str(site_id),
        "site_name": site_name,
        "cash": serialize(acct),
        "materials": {
            "rows": mat_rows,
            "total_allocated_cost": round(sum(r["allocated_cost"] for r in mat_rows), 2),
            "total_used_cost":      round(sum(r["used_cost"]      for r in mat_rows), 2),
            "total_remaining_cost": round(sum(r["remaining_cost"] for r in mat_rows), 2),
        },
        "equipment": {
            "fuel_logs":    fuel_logs,
            "maint_logs":   maint_logs,
            "fuel_total":   round(fuel_total,  2),
            "maint_total":  round(maint_total, 2),
        },
    }), 200

