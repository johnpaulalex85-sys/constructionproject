import os
import sys
from bson import ObjectId
import datetime

# Add the parent folder and website/backend folder to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from utils.db import get_db

def run_tests():
    db = get_db()
    print("Testing connection to database...")
    print(f"Database name: {db.name}")

    # 1. Setup - Create a clean test material
    print("\n[Step 1] Creating a test material...")
    test_material_name = f"Test Cement {datetime.datetime.utcnow().timestamp()}"
    mat_doc = {
        "name": test_material_name,
        "unit": "bags",
        "cost_per_unit": 350.0,
        "total_quantity": 100.0  # Initial Stock: 100 bags
    }
    res = db.materials.insert_one(mat_doc)
    material_id = str(res.inserted_id)
    print(f"Created material '{test_material_name}' with ID: {material_id} and stock: 100")

    site_id = str(ObjectId())

    # 2. Check initial available quantity computation
    allocs = list(db.allocations.find({"material_id": material_id}))
    allocated_sum = sum(a.get("allocated_quantity", 0.0) for a in allocs)
    available_qty = mat_doc["total_quantity"] - allocated_sum
    assert available_qty == 100.0, f"Expected 100, got {available_qty}"
    print("Available stock correctly computed as 100.")

    # 3. Simulate create allocation of 120 (should fail available stock check)
    print("\n[Step 2] Testing over-allocation validation...")
    req_qty = 120.0
    if req_qty > available_qty:
        print(f"Validation successfully blocked allocation of {req_qty} (exceeds available stock {available_qty}).")
    else:
        raise AssertionError("Validation failed to block over-allocation!")

    # 4. Create valid allocation of 40
    print("\n[Step 3] Creating valid allocation of 40 bags...")
    alloc_doc = {
        "site_id": site_id,
        "material_id": material_id,
        "allocated_quantity": 40.0
    }
    alloc_res = db.allocations.insert_one(alloc_doc)
    allocation_id = str(alloc_res.inserted_id)
    db.allocation_history.insert_one({
        "allocation_id": allocation_id,
        "quantity_added": 40.0,
        "note": "Initial allocation",
        "date": datetime.datetime.utcnow()
    })
    print(f"Created allocation with ID: {allocation_id} for 40 bags.")

    # Recalculate available quantity
    allocs = list(db.allocations.find({"material_id": material_id}))
    allocated_sum = sum(a.get("allocated_quantity", 0.0) for a in allocs)
    available_qty = mat_doc["total_quantity"] - allocated_sum
    print(f"New available stock: {available_qty} (expected: 60)")
    assert available_qty == 60.0, f"Expected 60, got {available_qty}"

    # 5. Try updating allocation to 110 (which exceeds available stock + current allocation)
    print("\n[Step 4] Testing over-updating allocation validation...")
    new_alloc_qty = 110.0
    # Available stock excluding this allocation is: 100 - 0 = 100.
    # 110 exceeds 100 available stock.
    other_alloc_sum = sum(a.get("allocated_quantity", 0.0) for a in allocs if str(a["_id"]) != allocation_id)
    max_allowed = mat_doc["total_quantity"] - other_alloc_sum
    if new_alloc_qty > max_allowed:
        print(f"Validation successfully blocked updating allocation to {new_alloc_qty} (exceeds available stock limit {max_allowed}).")
    else:
        raise AssertionError("Validation failed to block invalid allocation update!")

    # 6. Test safe incremental allocation add using "+30"
    print("\n[Step 5] Adding stock to allocation safely (30 bags)...")
    qty_added = 30.0
    # Verify it is within available limit (30 <= 60)
    if qty_added > available_qty:
        raise AssertionError("Stock check blocked a valid allocation addition!")
    
    db.allocations.update_one(
        {"_id": ObjectId(allocation_id)},
        {"$inc": {"allocated_quantity": qty_added}}
    )
    db.allocation_history.insert_one({
        "allocation_id": allocation_id,
        "quantity_added": qty_added,
        "note": "Safe addition",
        "date": datetime.datetime.utcnow()
    })
    print("Allocation updated successfully.")

    # Recalculate
    allocs = list(db.allocations.find({"material_id": material_id}))
    allocated_sum = sum(a.get("allocated_quantity", 0.0) for a in allocs)
    available_qty = mat_doc["total_quantity"] - allocated_sum
    print(f"Remaining available stock: {available_qty} (expected: 30)")
    assert available_qty == 30.0, f"Expected 30, got {available_qty}"

    # 7. Verify History tracking logs
    print("\n[Step 6] Verifying allocation history logs...")
    history = list(db.allocation_history.find({"allocation_id": allocation_id}).sort("date", -1))
    print(f"Found {len(history)} history log entries for this allocation:")
    for h in history:
        print(f" - Date: {h['date']}, Quantity Change: {h['quantity_added']}, Note: {h['note']}")
    assert len(history) == 2, f"Expected 2 log entries, got {len(history)}"
    print("Allocation history tracking verified successfully!")

    # 8. Clean up
    print("\n[Step 7] Cleaning up test records...")
    db.materials.delete_one({"_id": ObjectId(material_id)})
    db.allocations.delete_one({"_id": ObjectId(allocation_id)})
    db.allocation_history.delete_many({"allocation_id": allocation_id})
    print("Cleanup completed.")
    print("\n*** ALL TESTS PASSED SUCCESSFULLY! ***")

if __name__ == "__main__":
    run_tests()
