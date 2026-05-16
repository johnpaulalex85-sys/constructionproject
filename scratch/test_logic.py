import os
import sys
import json
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.db import get_db

def test_dashboard_logic():
    db = get_db()
    
    # 1. Total Fund Requested vs Approved
    all_requests = list(db.fund_requests.find())
    total_requested = sum(r.get("amount", 0) for r in all_requests)
    total_approved = sum(r.get("amount", 0) for r in all_requests if r.get("status") == "approved")
    
    # 2. Total Spending (Vouchers)
    all_vouchers = list(db.vouchers.find())
    total_spending = sum(v.get("amount", 0) for v in all_vouchers)
    
    # 3. Site-wise Summary
    sites = list(db.sites.find())
    site_summary = []
    for site in sites:
        s_id = str(site["_id"])
        s_requests = [r for r in all_requests if str(r["site_id"]) == s_id and r["status"] == "approved"]
        s_vouchers = [v for v in all_vouchers if str(v["site_id"]) == s_id]
        
        total_funds = sum(r["amount"] for r in s_requests)
        total_spent = sum(v["amount"] for v in s_vouchers)
        
        site_summary.append({
            "site_id": s_id,
            "site_name": site["name"],
            "funds_received": total_funds,
            "spent": total_spent,
            "balance": total_funds - total_spent
        })
        
    print(json.dumps({
        "total_approved": total_approved,
        "total_spending": total_spending,
        "site_summary": site_summary
    }, indent=2))

if __name__ == "__main__":
    test_dashboard_logic()
