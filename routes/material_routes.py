from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from utils.db import get_db
from utils.helpers import serialize
from bson import ObjectId
import datetime

material_bp = Blueprint("materials", __name__)


def calculate_material_health(total_qty, available_qty, recent_usage_7d, recent_addition_7d):
    """
    Dynamically calculates a stock health status for the warehouse.
    Returns status ('good', 'warning', 'critical'), label, score, and ratios.
    """
    ratio = (available_qty / total_qty) if total_qty > 0 else 0.0
    
    # Calculate health score (0-100)
    score = ratio * 100.0
    
    # Penalize if usage is high compared to available quantity
    if recent_usage_7d > 0:
        usage_ratio = recent_usage_7d / max(0.001, available_qty)
        if usage_ratio > 0.8:
            score -= 20.0
        elif usage_ratio > 0.4:
            score -= 10.0
            
    # Boost if recent replenishment has happened
    if recent_addition_7d > 0:
        score += 15.0
        
    score = max(0.0, min(100.0, score))
    
    # Determine base status and label
    if available_qty == 0:
        status = "critical"
        label = "Out of Stock"
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
    if status == "critical" and recent_addition_7d > 0:
        status = "warning"
        label = "Critical (Replenished)"
    elif status == "good" and recent_usage_7d > available_qty * 0.5:
        status = "warning"
        label = "Healthy (High Usage)"
        
    return {
        "status": status,
        "label": label,
        "score": round(score, 1),
        "ratio": round(ratio, 2),
        "recent_usage_7d": recent_usage_7d,
        "recent_addition_7d": recent_addition_7d
    }


@material_bp.route("/materials", methods=["GET"])
@jwt_required()
def get_materials():
    db = get_db()
    materials = list(db.materials.find())
    result = []
    
    # Calculate 7 days ago timestamp for recent usage and replenishment
    seven_days_ago = datetime.datetime.utcnow() - datetime.timedelta(days=7)
    
    for m in materials:
        mat = serialize(m)
        material_id_str = str(m["_id"])
        
        # Load total_quantity
        mat["total_quantity"] = float(m.get("total_quantity", 0.0))
        
        # Compute allocated_quantity across all allocations for this material
        allocs = list(db.allocations.find({"material_id": material_id_str}))
        mat["allocated_quantity"] = sum(a.get("allocated_quantity", 0.0) for a in allocs)
        
        # Compute available_quantity in warehouse (unallocated)
        mat["available_quantity"] = max(0.0, mat["total_quantity"] - mat["allocated_quantity"])
        
        # Compute total_used across all usage_logs for this material
        pipeline = [
            {"$match": {"material_id": material_id_str}},
            {"$group": {"_id": None, "total": {"$sum": "$used_quantity"}}}
        ]
        agg = list(db.usage_logs.aggregate(pipeline))
        mat["total_used"] = agg[0]["total"] if agg else 0.0
        
        # Compute recent usage (last 7 days)
        usage_pipeline = [
            {"$match": {
                "material_id": material_id_str,
                "date": {"$gte": seven_days_ago}
            }},
            {"$group": {"_id": None, "total": {"$sum": "$used_quantity"}}}
        ]
        usage_agg = list(db.usage_logs.aggregate(usage_pipeline))
        recent_usage_7d = usage_agg[0]["total"] if usage_agg else 0.0
        
        # Compute recent replenishment (last 7 days additions)
        repl_pipeline = [
            {"$match": {
                "material_id": material_id_str,
                "date": {"$gte": seven_days_ago},
                "$or": [
                    {"action_type": "addition"},
                    {"quantity_added": {"$gt": 0}}
                ]
            }},
            {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$quantity_affected", "$quantity_added"]}}}}
        ]
        repl_agg = list(db.material_history.aggregate(repl_pipeline))
        recent_repl_7d = repl_agg[0]["total"] if repl_agg else 0.0
        
        # Compute dynamic health status
        mat["health"] = calculate_material_health(
            mat["total_quantity"],
            mat["available_quantity"],
            recent_usage_7d,
            recent_repl_7d
        )
        
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
        "cost_per_unit": float(data.get("cost_per_unit", 0)),
        "total_quantity": float(data.get("total_quantity", 0.0))
    }
    result = db.materials.insert_one(material)
    material["_id"] = result.inserted_id

    # Retrieve admin username
    claims = get_jwt()
    username = claims.get("username", "admin")

    # Log initial material quantity as "creation"
    db.material_history.insert_one({
        "material_id": str(material["_id"]),
        "action_type": "creation",
        "quantity_affected": material["total_quantity"],
        "quantity_added": material["total_quantity"],  # compatibility
        "username": username,
        "note": "Initial material creation",
        "date": datetime.datetime.utcnow()
    })

    return jsonify(serialize(material)), 201


@material_bp.route("/materials/<material_id>", methods=["PUT"])
@jwt_required()
def update_material(material_id):
    data = request.get_json()
    db = get_db()
    update_fields = {}

    if "total_quantity" in data:
        return jsonify({"error": "Direct stock editing is disabled. Use Add Stock or Remove Stock instead."}), 400

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


@material_bp.route("/materials/<material_id>/add-stock", methods=["POST"])
@jwt_required()
def add_material_stock(material_id):
    data = request.get_json()
    qty_added = float(data.get("quantity_added", 0))
    note = data.get("note", "").strip()
    if qty_added <= 0:
        return jsonify({"error": "Quantity to add must be greater than zero"}), 400

    db = get_db()
    material = db.materials.find_one({"_id": ObjectId(material_id)})
    if not material:
        return jsonify({"error": "Material not found"}), 404

    new_total = float(material.get("total_quantity", 0.0)) + qty_added
    db.materials.update_one(
        {"_id": ObjectId(material_id)},
        {"$set": {"total_quantity": new_total}}
    )

    claims = get_jwt()
    username = claims.get("username", "admin")

    # Log to material_history with enriched schema
    history_entry = {
        "material_id": material_id,
        "action_type": "addition",
        "quantity_affected": qty_added,
        "quantity_added": qty_added,  # compatibility
        "username": username,
        "note": note or "Stock addition",
        "date": datetime.datetime.utcnow()
    }
    db.material_history.insert_one(history_entry)

    return jsonify({"message": "Stock added successfully", "total_quantity": new_total}), 200


@material_bp.route("/materials/<material_id>/remove-stock", methods=["POST"])
@jwt_required()
def remove_material_stock(material_id):
    data = request.get_json()
    qty_removed = float(data.get("quantity_removed", 0))
    note = data.get("note", "").strip()
    if qty_removed <= 0:
        return jsonify({"error": "Quantity to remove must be greater than zero"}), 400

    db = get_db()
    material = db.materials.find_one({"_id": ObjectId(material_id)})
    if not material:
        return jsonify({"error": "Material not found"}), 404

    # Calculate allocated quantity
    allocs = list(db.allocations.find({"material_id": material_id}))
    allocated_qty = sum(a.get("allocated_quantity", 0.0) for a in allocs)
    total_qty = float(material.get("total_quantity", 0.0))
    available_qty = max(0.0, total_qty - allocated_qty)

    # Check if quantity to remove is greater than available quantity
    if qty_removed > available_qty:
        return jsonify({
            "error": f"Cannot remove {qty_removed} units. Only {available_qty} units are available in the warehouse (Allocated: {allocated_qty}, Total: {total_qty})."
        }), 400

    new_total = total_qty - qty_removed
    db.materials.update_one(
        {"_id": ObjectId(material_id)},
        {"$set": {"total_quantity": new_total}}
    )

    claims = get_jwt()
    username = claims.get("username", "admin")

    # Log to material_history with removal action type
    history_entry = {
        "material_id": material_id,
        "action_type": "removal",
        "quantity_affected": qty_removed,
        "quantity_added": -qty_removed,  # compatibility
        "username": username,
        "note": note or "Stock removal",
        "date": datetime.datetime.utcnow()
    }
    db.material_history.insert_one(history_entry)

    return jsonify({"message": "Stock removed successfully", "total_quantity": new_total}), 200


@material_bp.route("/materials/<material_id>/history", methods=["GET"])
@jwt_required()
def get_material_history(material_id):
    db = get_db()
    history = list(db.material_history.find({"material_id": material_id}).sort("date", -1))
    return jsonify(serialize(history)), 200


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
    db.material_history.delete_many({"material_id": material_id})
    return jsonify({"message": "Material deleted"}), 200
