import os
import sys

# Add the parent directory (backend) to the sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.db import get_db
from bson import ObjectId

def check_accounting_data():
    db = get_db()
    
    print("--- Sites ---")
    sites = list(db.sites.find())
    for s in sites:
        print(f"ID: {s['_id']}, Name: {s['name']}")
        
    print("\n--- Fund Requests ---")
    reqs = list(db.fund_requests.find())
    print(f"Total Requests: {len(reqs)}")
    for r in reqs:
        print(f"Site: {r['site_id']}, Amount: {r['amount']}, Status: {r['status']}")
        
    print("\n--- Vouchers ---")
    vouchers = list(db.vouchers.find())
    print(f"Total Vouchers: {len(vouchers)}")
    for v in vouchers:
        print(f"Site: {v['site_id']}, Amount: {v['amount']}, Category: {v['category']}")

if __name__ == "__main__":
    check_accounting_data()
