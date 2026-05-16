from pymongo import MongoClient
import os
from dotenv import load_dotenv
import certifi

load_dotenv()

_client = None

def get_db():
    global _client
    if _client is None:
        uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/construction_db")
        if "mongodb+srv" in uri:
            _client = MongoClient(uri, tlsCAFile=certifi.where())
        else:
            _client = MongoClient(uri)
    return _client.get_default_database()
