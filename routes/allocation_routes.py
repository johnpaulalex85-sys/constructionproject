from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from utils.db import get_db
from utils.helpers import serialize
from bson import ObjectId
import datetime

allocation_bp = Blueprint("allocations", __name__)


def _get_used_quantity(db, site_id, material_id):
    """Sum all usage logs for this site+material."""
    pipeline = [
        {"$match": {"site_id": site_id, "material_id": material_id}},
        {"$group": {"_id": None, "total": {"$sum": "$used_quantity"}}}
    ]
    result = list(db.usage_logs.aggregate(pipeline))
    return result[0]["total"] if result else 0.0


def calculate_allocation_health(allocated_qty, remaining_qty, recent_usage_7d, recent_replenish_7d):
    """
    Dynamically calculates stock health status for a site allocation.
    Returns status ('good', 'warning', 'critical'), label, score, and ratios.
    """
    ratio = (remaining_qty / allocated_qty) if allocated_qty > 0 else 0.0
    
    # Calculate health score (0-100)
    score = ratio * 100.0
    
    # Penalize if usage is high compared to remaining quantity
    if recent_usage_7d > 0:
        usage_ratio = recent_usage_7d / max(0.001, remaining_qty)
        if usage_ratio > 0.8:
            score -= 20.0
        elif usage_ratio > 0.4:
            score -= 10.0
            
    # Boost if recent replenishment has happened
    if recent_replenish_7d > 0:
        score += 15.0
        
    score = max(0.0, min(100.0, score))
    
    # Determine base status and label
    if remaining_qty == 0:
        status = "critical"
        label = "Depleted"
    elif ratio < 0.20:
        status = "critical"
        label = "Critical Stock"
    elif ratio < 0.50:
        status = "warning"
        label = "Low Stock"
    else:
        status = "good"
        label = "Healthy"
        
    # Contextual adjustments
    if status == "critical" and recent_replenish_7d > 0:
        status = "warning"
        label = "Critical (Replenished)"
    elif status == "good" and recent_usage_7d > remaining_qty * 0.5:
        status = "warning"
        label = "Healthy (High Usage)"
        
    return {
        "status": status,
        "label": label,
        "score": round(score, 1),
        "ratio": round(ratio, 2),
        "recent_usage_7d": recent_usage_7d,
        "recent_replenish_7d": recent_replenish_7d
    }


@allocation_bp.route("/allocations/<site_id>", methods=["GET"])
@jwt_required()
def get_allocations(site_id):
    db = get_db()
    allocations = list(db.allocations.find({"site_id": site_id}))

    enriched = []
    seven_days_ago = datetime.datetime.utcnow() - datetime.timedelta(days=7)

    for alloc in allocations:
        mat = db.materials.find_one({"_id": ObjectId(alloc["material_id"])})
        used = _get_used_quantity(db, site_id, alloc["material_id"])
        allocated_qty = float(alloc.get("allocated_quantity", 0.0))
        remaining = max(0.0, allocated_qty - used)

        entry = serialize(alloc)
        entry["material_name"] = mat["name"] if mat else "Unknown"
        entry["material_unit"] = mat["unit"] if mat else ""
        entry["cost_per_unit"] = mat.get("cost_per_unit", 0) if mat else 0
        entry["used_quantity"] = used
        entry["remaining_quantity"] = remaining
        
        # Calculate recent usage (last 7 days) at this site
        usage_pipeline = [
            {"$match": {
                "site_id": site_id,
                "material_id": alloc["material_id"],
                "date": {"$gte": seven_days_ago}
            }},
            {"$group": {"_id": None, "total": {"$sum": "$used_quantity"}}}
        ]
        usage_agg = list(db.usage_logs.aggregate(usage_pipeline))
        recent_usage_7d = usage_agg[0]["total"] if usage_agg else 0.0
        
        # Calculate recent replenishment (last 7 days increases/transfer-ins)
        repl_pipeline = [
            {"$match": {
                "allocation_id": str(alloc["_id"]),
                "date": {"$gte": seven_days_ago},
                "$or": [
                    {"action_type": {"$in": ["increase", "creation", "transfer_in"]}},
                    {"quantity_added": {"$gt": 0}}
                ]
            }},
            {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$quantity_affected", "$quantity_added"]}}}}
        ]
        repl_agg = list(db.allocation_history.aggregate(repl_pipeline))
        recent_repl_7d = repl_agg[0]["total"] if repl_agg else 0.0

        # Compute health status
        entry["health"] = calculate_allocation_health(
            allocated_qty,
            remaining,
            recent_usage_7d,
            recent_repl_7d
        )
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

    # Validate material exists
    mat = db.materials.find_one({"_id": ObjectId(data["material_id"])})
    if not mat:
        return jsonify({"error": "Material not found"}), 404

    # Validate against available warehouse quantity
    allocs = list(db.allocations.find({"material_id": data["material_id"]}))
    allocated_sum = sum(a.get("allocated_quantity", 0.0) for a in allocs)
    total_qty = float(mat.get("total_quantity", 0.0))
    available_qty = total_qty - allocated_sum
    requested_qty = float(data["allocated_quantity"])

    if requested_qty > available_qty:
        return jsonify({
            "error": f"Insufficient stock in warehouse. Available for allocation: {available_qty} {mat['unit']} (Total stock: {total_qty}, Allocated: {allocated_sum})"
        }), 400

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
        "allocated_quantity": requested_qty
    }
    result = db.allocations.insert_one(alloc)
    alloc["_id"] = result.inserted_id

    # Retrieve admin username
    claims = get_jwt()
    username = claims.get("username", "admin")

    # Log initial allocation to allocation_history with creation action type
    db.allocation_history.insert_one({
        "allocation_id": str(alloc["_id"]),
        "action_type": "creation",
        "quantity_affected": requested_qty,
        "quantity_added": requested_qty,  # compatibility
        "username": username,
        "note": "Initial allocation",
        "date": datetime.datetime.utcnow()
    })

    return jsonify(serialize(alloc)), 201


@allocation_bp.route("/allocations/<allocation_id>", methods=["PUT"])
@jwt_required()
def update_allocation(allocation_id):
    data = request.get_json()
    
    if "allocated_quantity" in data:
        return jsonify({"error": "Direct allocated quantity editing is disabled. Use Add Allocation, Reduce Allocation, or Transfer instead."}), 400

    db = get_db()
    alloc = db.allocations.find_one({"_id": ObjectId(allocation_id)})
    if not alloc:
        return jsonify({"error": "Allocation not found"}), 404

    # Keep standard field updates (e.g. site_id, material_id if needed, though they shouldn't change)
    update_fields = {}
    if data.get("site_id"):
        update_fields["site_id"] = data["site_id"]
    if data.get("material_id"):
        update_fields["material_id"] = data["material_id"]

    if not update_fields:
        return jsonify({"error": "No valid fields to update"}), 400

    db.allocations.update_one({"_id": ObjectId(allocation_id)}, {"$set": update_fields})
    updated = db.allocations.find_one({"_id": ObjectId(allocation_id)})
    return jsonify(serialize(updated)), 200


@allocation_bp.route("/allocations/<allocation_id>/add", methods=["POST"])
@jwt_required()
def add_allocation_quantity(allocation_id):
    data = request.get_json()
    qty_added = float(data.get("quantity_added", 0))
    note = data.get("note", "").strip()
    if qty_added <= 0:
        return jsonify({"error": "Quantity to add must be greater than zero"}), 400

    db = get_db()
    alloc = db.allocations.find_one({"_id": ObjectId(allocation_id)})
    if not alloc:
        return jsonify({"error": "Allocation not found"}), 404

    mat = db.materials.find_one({"_id": ObjectId(alloc["material_id"])})
    if not mat:
        return jsonify({"error": "Material not found"}), 404

    # Calculate available stock
    allocs = list(db.allocations.find({"material_id": alloc["material_id"]}))
    allocated_sum = sum(a.get("allocated_quantity", 0.0) for a in allocs)
    total_qty = float(mat.get("total_quantity", 0.0))
    available_qty = total_qty - allocated_sum

    if qty_added > available_qty:
        return jsonify({
            "error": f"Insufficient stock in warehouse. Available: {available_qty} {mat['unit']}"
        }), 400

    new_qty = alloc["allocated_quantity"] + qty_added
    db.allocations.update_one(
        {"_id": ObjectId(allocation_id)},
        {"$set": {"allocated_quantity": new_qty}}
    )

    claims = get_jwt()
    username = claims.get("username", "admin")

    # Log to allocation_history with increase action type
    db.allocation_history.insert_one({
        "allocation_id": allocation_id,
        "action_type": "increase",
        "quantity_affected": qty_added,
        "quantity_added": qty_added,  # compatibility
        "username": username,
        "note": note or "Added allocation quantity",
        "date": datetime.datetime.utcnow()
    })

    return jsonify({"message": "Allocation stock added successfully", "allocated_quantity": new_qty}), 200


@allocation_bp.route("/allocations/<allocation_id>/reduce", methods=["POST"])
@jwt_required()
def reduce_allocation_quantity(allocation_id):
    data = request.get_json()
    qty_reduced = float(data.get("quantity_reduced", 0))
    note = data.get("note", "").strip()
    if qty_reduced <= 0:
        return jsonify({"error": "Quantity to reduce must be greater than zero"}), 400

    db = get_db()
    alloc = db.allocations.find_one({"_id": ObjectId(allocation_id)})
    if not alloc:
        return jsonify({"error": "Allocation not found"}), 404

    # Calculate remaining quantity
    used = _get_used_quantity(db, alloc["site_id"], alloc["material_id"])
    allocated_qty = float(alloc.get("allocated_quantity", 0.0))
    remaining_qty = max(0.0, allocated_qty - used)

    if qty_reduced > remaining_qty:
        return jsonify({
            "error": f"Cannot reduce allocation by {qty_reduced} units. Only {remaining_qty} units are remaining at the site (Allocated: {allocated_qty}, Used: {used})."
        }), 400

    new_qty = allocated_qty - qty_reduced
    db.allocations.update_one(
        {"_id": ObjectId(allocation_id)},
        {"$set": {"allocated_quantity": new_qty}}
    )

    claims = get_jwt()
    username = claims.get("username", "admin")

    # Log to allocation_history with reduction action type
    db.allocation_history.insert_one({
        "allocation_id": allocation_id,
        "action_type": "reduction",
        "quantity_affected": qty_reduced,
        "quantity_added": -qty_reduced,  # compatibility
        "username": username,
        "note": note or "Reduced allocation quantity",
        "date": datetime.datetime.utcnow()
    })

    return jsonify({"message": "Allocation reduced successfully", "allocated_quantity": new_qty}), 200


@allocation_bp.route("/allocations/<allocation_id>/transfer", methods=["POST"])
@jwt_required()
def transfer_allocation(allocation_id):
    data = request.get_json()
    qty_transferred = float(data.get("quantity_transferred", 0))
    target_site_id = data.get("target_site_id")
    note = data.get("note", "").strip()

    if qty_transferred <= 0:
        return jsonify({"error": "Quantity to transfer must be greater than zero"}), 400
    if not target_site_id:
        return jsonify({"error": "target_site_id is required"}), 400

    db = get_db()
    
    # 1. Fetch source allocation
    src_alloc = db.allocations.find_one({"_id": ObjectId(allocation_id)})
    if not src_alloc:
        return jsonify({"error": "Source allocation not found"}), 404

    if src_alloc["site_id"] == target_site_id:
        return jsonify({"error": "Source and target sites must be different"}), 400

    # 2. Fetch target site name for notes/history logs
    src_site = db.sites.find_one({"_id": ObjectId(src_alloc["site_id"])})
    tgt_site = db.sites.find_one({"_id": ObjectId(target_site_id)})
    if not tgt_site:
        return jsonify({"error": "Target site not found"}), 404

    src_site_name = src_site["name"] if src_site else "Unknown Site"
    tgt_site_name = tgt_site["name"] if tgt_site else "Unknown Site"

    # 3. Validate source remaining quantity
    src_used = _get_used_quantity(db, src_alloc["site_id"], src_alloc["material_id"])
    src_allocated = float(src_alloc.get("allocated_quantity", 0.0))
    src_remaining = max(0.0, src_allocated - src_used)

    if qty_transferred > src_remaining:
        return jsonify({
            "error": f"Insufficient remaining quantity at source site. Remaining: {src_remaining} (Attempted transfer: {qty_transferred})"
        }), 400

    # 4. Fetch or create target allocation
    tgt_alloc = db.allocations.find_one({
        "site_id": target_site_id,
        "material_id": src_alloc["material_id"]
    })

    claims = get_jwt()
    username = claims.get("username", "admin")

    # 5. Execute DB updates (deduct source, add/insert target)
    new_src_qty = src_allocated - qty_transferred
    db.allocations.update_one(
        {"_id": src_alloc["_id"]},
        {"$set": {"allocated_quantity": new_src_qty}}
    )

    if tgt_alloc:
        new_tgt_qty = float(tgt_alloc.get("allocated_quantity", 0.0)) + qty_transferred
        db.allocations.update_one(
            {"_id": tgt_alloc["_id"]},
            {"$set": {"allocated_quantity": new_tgt_qty}}
        )
        tgt_alloc_id = str(tgt_alloc["_id"])
        tgt_action_type = "increase"
    else:
        new_tgt = {
            "site_id": target_site_id,
            "material_id": src_alloc["material_id"],
            "allocated_quantity": qty_transferred
        }
        res_tgt = db.allocations.insert_one(new_tgt)
        tgt_alloc_id = str(res_tgt.inserted_id)
        tgt_action_type = "creation"

    # 6. Log history for BOTH source and target
    # Source: transfer_out
    db.allocation_history.insert_one({
        "allocation_id": allocation_id,
        "action_type": "transfer_out",
        "quantity_affected": qty_transferred,
        "quantity_added": -qty_transferred,  # compatibility
        "username": username,
        "note": note or f"Transferred to {tgt_site_name}",
        "target_site_id": target_site_id,
        "target_site_name": tgt_site_name,
        "date": datetime.datetime.utcnow()
    })

    # Target: transfer_in
    db.allocation_history.insert_one({
        "allocation_id": tgt_alloc_id,
        "action_type": "transfer_in",
        "quantity_affected": qty_transferred,
        "quantity_added": qty_transferred,  # compatibility
        "username": username,
        "note": note or f"Transferred from {src_site_name}",
        "source_site_id": src_alloc["site_id"],
        "source_site_name": src_site_name,
        "date": datetime.datetime.utcnow()
    })

    return jsonify({
        "message": f"Successfully transferred {qty_transferred} from {src_site_name} to {tgt_site_name}",
        "source_allocated_quantity": new_src_qty
    }), 200


@allocation_bp.route("/allocations/<allocation_id>/history", methods=["GET"])
@jwt_required()
def get_allocation_history(allocation_id):
    db = get_db()
    history = list(db.allocation_history.find({"allocation_id": allocation_id}).sort("date", -1))
    return jsonify(serialize(history)), 200


@allocation_bp.route("/allocations/<allocation_id>", methods=["DELETE"])
@jwt_required()
def delete_allocation(allocation_id):
    db = get_db()
    result = db.allocations.delete_one({"_id": ObjectId(allocation_id)})
    if result.deleted_count == 0:
        return jsonify({"error": "Allocation not found"}), 404
    db.allocation_history.delete_many({"allocation_id": allocation_id})
    return jsonify({"message": "Allocation removed"}), 200
