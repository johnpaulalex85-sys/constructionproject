"""
Seed script to create an initial admin user.
Run once: python seed.py
"""
import os
import sys
import bcrypt
import datetime
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/construction_db")
client = MongoClient(MONGO_URI)
db = client.get_default_database()

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@1234")

existing = db.users.find_one({"username": ADMIN_USERNAME})
if existing:
    print(f"Admin user '{ADMIN_USERNAME}' already exists.")
    sys.exit(0)

hashed = bcrypt.hashpw(ADMIN_PASSWORD.encode("utf-8"), bcrypt.gensalt())
db.users.insert_one({
    "username": ADMIN_USERNAME,
    "password_hash": hashed,
    "role": "admin",
    "created_at": datetime.datetime.utcnow()
})
print(f"✅ Admin user created: {ADMIN_USERNAME} / {ADMIN_PASSWORD}")
print("⚠️  Change this password immediately after first login!")
