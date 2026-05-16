import os
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.db import get_db

def check_types():
    db = get_db()
    req = db.fund_requests.find_one()
    if req:
        print(f"Fund Request site_id type: {type(req['site_id'])}")
    
    voucher = db.vouchers.find_one()
    if voucher:
        print(f"Voucher site_id type: {type(voucher['site_id'])}")

if __name__ == "__main__":
    check_types()
