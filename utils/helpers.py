from bson import ObjectId
import datetime

def serialize(doc):
    """Recursively convert MongoDB document to JSON-serializable dict."""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [serialize(d) for d in doc]
    if isinstance(doc, dict):
        result = {}
        for k, v in doc.items():
            if isinstance(v, ObjectId):
                result[k] = str(v)
            elif isinstance(v, datetime.datetime):
                result[k] = v.isoformat()
            elif isinstance(v, bytes):
                result[k] = v.decode('utf-8', errors='replace')
            elif isinstance(v, dict):
                result[k] = serialize(v)
            elif isinstance(v, list):
                result[k] = serialize(v)
            else:
                result[k] = v
        return result
    if isinstance(doc, bytes):
        return doc.decode('utf-8', errors='replace')
    return doc
