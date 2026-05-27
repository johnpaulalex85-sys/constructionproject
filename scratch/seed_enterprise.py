import os
import sys
import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.db import get_db

def seed_enterprise_data():
    db = get_db()
    
    print("Checking existing documents...")
    docs_count = db.documents.count_documents({})
    if docs_count == 0:
        print("Seeding initial documents...")
        sample_docs = [
            {
                "title": "Architectural Blueprint - Ground Floor",
                "filename": "blueprint_gf_v2.pdf",
                "category": "Blueprints",
                "site": "chittarikkal",
                "project": "Metro Plaza",
                "tags": "structural, approved, phase1",
                "revision": "2",
                "file_url": "/static/uploads/documents/blueprint_gf_v2.pdf",
                "file_type": "PDF",
                "uploaded_by": "admin",
                "status": "Approved",
                "expiry_date": None,
                "created_at": datetime.datetime.utcnow() - datetime.timedelta(days=2)
            },
            {
                "title": "Safety Protocol Checklist & PPE Compliance",
                "filename": "safety_protocol_2026.docx",
                "category": "Safety Docs",
                "site": "chittarikkal2",
                "project": "Riverside Complex",
                "tags": "safety, mandatory, ppe",
                "revision": "1",
                "file_url": "/static/uploads/documents/safety_protocol_2026.docx",
                "file_type": "Word",
                "uploaded_by": "admin",
                "status": "Approved",
                "expiry_date": (datetime.datetime.utcnow() + datetime.timedelta(days=180)).isoformat(),
                "created_at": datetime.datetime.utcnow() - datetime.timedelta(days=5)
            },
            {
                "title": "Heavy Crane Rental Contract - Apex Equipment",
                "filename": "crane_rental_contract.pdf",
                "category": "Contracts",
                "site": "chittarikkal",
                "project": "Metro Plaza",
                "tags": "vendor, legal, apex",
                "revision": "1",
                "file_url": "/static/uploads/documents/crane_rental_contract.pdf",
                "file_type": "PDF",
                "uploaded_by": "admin",
                "status": "Review",
                "expiry_date": (datetime.datetime.utcnow() + datetime.timedelta(days=15)).isoformat(),
                "created_at": datetime.datetime.utcnow() - datetime.timedelta(days=1)
            },
            {
                "title": "QA/QC Foundation Inspection Report",
                "filename": "inspection_report_f1.pdf",
                "category": "Inspection Docs",
                "site": "chittarikkal3",
                "project": "Hilltop Villas",
                "tags": "qaqc, foundation, urgent",
                "revision": "1",
                "file_url": "/static/uploads/documents/inspection_report_f1.pdf",
                "file_type": "PDF",
                "uploaded_by": "admin",
                "status": "Review",
                "expiry_date": None,
                "created_at": datetime.datetime.utcnow() - datetime.timedelta(hours=10)
            }
        ]
        db.documents.insert_many(sample_docs)
        print(f"Inserted {len(sample_docs)} sample documents.")
    else:
        print(f"Documents already exist ({docs_count}).")

    print("\nChecking existing equipment...")
    eq_count = db.equipment.count_documents({})
    if eq_count == 0:
        print("Seeding initial equipment & machinery...")
        sample_eq = [
            {
                "name": "Caterpillar Excavator 320D",
                "serial_id": "EX-204",
                "type": "Heavy Machinery",
                "manufacturer": "Caterpillar",
                "site": "chittarikkal",
                "operator": "John Doe",
                "status": "Active",
                "operating_hours": 142.5,
                "next_service_date": (datetime.datetime.utcnow() + datetime.timedelta(days=25)).isoformat(),
                "created_at": datetime.datetime.utcnow() - datetime.timedelta(days=60)
            },
            {
                "name": "JCB Backhoe Loader 3DX",
                "serial_id": "BL-108",
                "type": "Heavy Machinery",
                "manufacturer": "JCB",
                "site": "chittarikkal2",
                "operator": "Mike Smith",
                "status": "Maintenance",
                "operating_hours": 310.0,
                "next_service_date": (datetime.datetime.utcnow() - datetime.timedelta(days=2)).isoformat(), # overdue
                "created_at": datetime.datetime.utcnow() - datetime.timedelta(days=120)
            },
            {
                "name": "Tata Prima Heavy Dump Truck",
                "serial_id": "DT-502",
                "type": "Light Vehicle",
                "manufacturer": "Tata Motors",
                "site": "chittarikkal",
                "operator": "Rajesh Kumar",
                "status": "Active",
                "operating_hours": 85.0,
                "next_service_date": (datetime.datetime.utcnow() + datetime.timedelta(days=40)).isoformat(),
                "created_at": datetime.datetime.utcnow() - datetime.timedelta(days=30)
            },
            {
                "name": "Atlas Copco Portable Air Compressor",
                "serial_id": "AC-045",
                "type": "Power Tools",
                "manufacturer": "Atlas Copco",
                "site": "chittarikkal3",
                "operator": "Unassigned",
                "status": "Breakdown",
                "operating_hours": 512.0,
                "next_service_date": (datetime.datetime.utcnow() + datetime.timedelta(days=10)).isoformat(),
                "created_at": datetime.datetime.utcnow() - datetime.timedelta(days=200)
            },
            {
                "name": "Liebherr Tower Crane LTM",
                "serial_id": "TC-901",
                "type": "Lifting Equipment",
                "manufacturer": "Liebherr",
                "site": "chittarikkal",
                "operator": "Suresh Pillai",
                "status": "Active", # Idle simulation
                "operating_hours": 420.0,
                "next_service_date": (datetime.datetime.utcnow() + datetime.timedelta(days=15)).isoformat(),
                "created_at": datetime.datetime.utcnow() - datetime.timedelta(days=150)
            }
        ]
        db.equipment.insert_many(sample_eq)
        print(f"Inserted {len(sample_eq)} sample equipment.")

        # Seed some fuel logs
        print("Seeding fuel logs...")
        sample_fuel = [
            {
                "equipment_id": str(db.equipment.find_one({"serial_id": "EX-204"})["_id"]),
                "equipment_name": "Caterpillar Excavator 320D",
                "liters": 80.0,
                "price_per_liter": 95.0,
                "cost": 7600.0,
                "site": "chittarikkal",
                "date": (datetime.datetime.utcnow() - datetime.timedelta(days=1)).strftime("%Y-%m-%d"),
                "logged_by": "admin",
                "created_at": datetime.datetime.utcnow() - datetime.timedelta(days=1)
            },
            {
                "equipment_id": str(db.equipment.find_one({"serial_id": "DT-502"})["_id"]),
                "equipment_name": "Tata Prima Heavy Dump Truck",
                "liters": 120.0,
                "price_per_liter": 95.0,
                "cost": 11400.0,
                "site": "chittarikkal",
                "date": (datetime.datetime.utcnow() - datetime.timedelta(days=2)).strftime("%Y-%m-%d"),
                "logged_by": "admin",
                "created_at": datetime.datetime.utcnow() - datetime.timedelta(days=2)
            }
        ]
        db.equipment_fuel.insert_many(sample_fuel)

        # Seed maintenance log
        print("Seeding maintenance logs...")
        sample_maint = [
            {
                "equipment_id": str(db.equipment.find_one({"serial_id": "BL-108"})["_id"]),
                "equipment_name": "JCB Backhoe Loader 3DX",
                "type": "Routine Service",
                "cost": 15000.0,
                "status": "In Progress",
                "service_date": (datetime.datetime.utcnow() - datetime.timedelta(days=1)).strftime("%Y-%m-%d"),
                "next_service_date": (datetime.datetime.utcnow() + datetime.timedelta(days=90)).strftime("%Y-%m-%d"),
                "description": "Replacing hydraulic fluid, engine oil, and worn out bucket teeth.",
                "logged_by": "admin",
                "created_at": datetime.datetime.utcnow() - datetime.timedelta(days=1)
            }
        ]
        db.equipment_maintenance.insert_many(sample_maint)

        # Seed breakdown log
        print("Seeding breakdown logs...")
        sample_bd = [
            {
                "equipment_id": str(db.equipment.find_one({"serial_id": "AC-045"})["_id"]),
                "equipment_name": "Atlas Copco Portable Air Compressor",
                "issue": "Pressure valve blown and engine overheating after 10 mins of operation.",
                "severity": "High",
                "reported_by": "admin",
                "status": "Open",
                "created_at": datetime.datetime.utcnow() - datetime.timedelta(days=3)
            }
        ]
        db.equipment_breakdowns.insert_many(sample_bd)
        print("Sample enterprise logs seeded successfully.")
    else:
        print(f"Equipment already exist ({eq_count}).")

if __name__ == "__main__":
    seed_enterprise_data()
