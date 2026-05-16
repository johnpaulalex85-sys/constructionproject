from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required
from utils.db import get_db
from bson import ObjectId
import datetime

dashboard_bp = Blueprint("dashboard", __name__)

LOW_STOCK_THRESHOLD = 0.2  # 20% remaining is considered low

@dashboard_bp.route("/dashboard/stats", methods=["GET"])
@jwt_required()
def get_stats():
    db = get_db()

    total_sites = db.sites.count_documents({})
    active_sites = db.sites.count_documents({"is_active": True})
    total_materials = db.materials.count_documents({})
    pending_requests = db.material_requests.count_documents({"status": "pending"})

    # Compute low stock alerts
    allocations = list(db.allocations.find())
    low_stock_count = 0
    for alloc in allocations:
        pipeline = [
            {"$match": {"site_id": alloc["site_id"], "material_id": alloc["material_id"]}},
            {"$group": {"_id": None, "total": {"$sum": "$used_quantity"}}}
        ]
        result = list(db.usage_logs.aggregate(pipeline))
        used = result[0]["total"] if result else 0
        if alloc["allocated_quantity"] > 0:
            remaining_pct = (alloc["allocated_quantity"] - used) / alloc["allocated_quantity"]
            if remaining_pct <= LOW_STOCK_THRESHOLD:
                low_stock_count += 1

    # Recent activity (last 10 usage logs)
    recent_logs = list(db.usage_logs.find().sort("date", -1).limit(10))
    recent_activity = []
    for log in recent_logs:
        site = db.sites.find_one({"_id": ObjectId(log["site_id"])}) if ObjectId.is_valid(log.get("site_id", "")) else None
        mat = db.materials.find_one({"_id": ObjectId(log["material_id"])}) if ObjectId.is_valid(log.get("material_id", "")) else None
        recent_activity.append({
            "site": site["name"] if site else "Unknown",
            "material": mat["name"] if mat else "Unknown",
            "used_quantity": log["used_quantity"],
            "unit": mat["unit"] if mat else "",
            "date": log["date"].isoformat() if isinstance(log["date"], datetime.datetime) else str(log["date"])
        })

    # Recent Daily Logs (last 5)
    recent_daily = list(db.site_daily_logs.find().sort("date", -1).limit(5))
    daily_logs_summary = []
    for l in recent_daily:
        site = db.sites.find_one({"_id": ObjectId(l["site_id"])})
        daily_logs_summary.append({
            "site": site["name"] if site else "Unknown",
            "description": l["work_description"],
            "date": l["date"].isoformat() if isinstance(l["date"], datetime.datetime) else str(l["date"])
        })

    return jsonify({
        "total_sites": total_sites,
        "active_sites": active_sites,
        "total_materials": total_materials,
        "pending_requests": pending_requests,
        "low_stock_alerts": low_stock_count,
        "recent_activity": recent_activity,
        "recent_daily_logs": daily_logs_summary
    }), 200


@dashboard_bp.route("/dashboard/usage-trend", methods=["GET"])
@jwt_required()
def usage_trend():
    db = get_db()
    # Last 30 days, grouped by date
    thirty_days_ago = datetime.datetime.utcnow() - datetime.timedelta(days=30)
    pipeline = [
        {"$match": {"date": {"$gte": thirty_days_ago}}},
        {"$group": {
            "_id": {
                "year": {"$year": "$date"},
                "month": {"$month": "$date"},
                "day": {"$dayOfMonth": "$date"}
            },
            "total_used": {"$sum": "$used_quantity"}
        }},
        {"$sort": {"_id": 1}}
    ]
    results = list(db.usage_logs.aggregate(pipeline))
    trend = []
    for r in results:
        d = r["_id"]
        trend.append({
            "date": f"{d['year']}-{d['month']:02d}-{d['day']:02d}",
            "total_used": r["total_used"]
        })
    return jsonify(trend), 200


@dashboard_bp.route("/dashboard/site-comparison", methods=["GET"])
@jwt_required()
def site_comparison():
    db = get_db()
    pipeline = [
        {"$group": {
            "_id": "$site_id",
            "total_used": {"$sum": "$used_quantity"}
        }}
    ]
    results = list(db.usage_logs.aggregate(pipeline))
    comparison = []
    for r in results:
        site = db.sites.find_one({"_id": ObjectId(r["_id"])}) if ObjectId.is_valid(r.get("_id", "")) else None
        comparison.append({
            "site": site["name"] if site else "Unknown",
            "total_used": r["total_used"]
        })
    comparison.sort(key=lambda x: x["total_used"], reverse=True)
    return jsonify(comparison), 200
