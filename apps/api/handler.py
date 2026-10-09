import json
try:
    from .service import route
except ImportError:
    from service import route

def handler(event, context):
    request = event.get("requestContext", {}).get("http", {})
    status, body = route(request.get("method", "GET"), event.get("rawPath", "/"))
    return {"statusCode": status, "headers": {"content-type": "application/json", "cache-control": "no-store"}, "body": json.dumps(body)}
