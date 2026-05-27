"""
Utility script to clear all demo/default documents from the database.
Run once: python clear_documents.py
"""
import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/construction_db")
client = MongoClient(MONGO_URI)
db = client.get_default_database()

doc_count = db.documents.count_documents({})
activity_count = db.document_activity.count_documents({})
version_count = db.document_versions.count_documents({})

print(f"Found {doc_count} document(s), {activity_count} activity log(s), {version_count} version(s).")

if doc_count == 0 and activity_count == 0:
    print("Nothing to clear.")
else:
    db.documents.delete_many({})
    db.document_activity.delete_many({})
    db.document_versions.delete_many({})
    print(f"✅ Cleared {doc_count} document(s), {activity_count} activity log(s), {version_count} version(s).")

print("Done. The documents section is now empty and ready for real uploads.")
