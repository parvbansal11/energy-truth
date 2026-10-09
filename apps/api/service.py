"""Shared HTTP contract. No estimates are served before verified ingestion."""
import os
DEFAULT_COMPANIES = {"NTPC": "NTPC", "TATASTEEL": "Tata Steel", "ULTRACEMCO": "UltraTech Cement", "JSWSTEEL": "JSW Steel", "ADANIPOWER": "Adani Power"}

def route(method: str, path: str) -> tuple[int, dict]:
    if method != "GET":
        return 405, {"error": "method_not_allowed"}
    if path == "/health":
        return 200, {"status": "ok", "service": "energy-truth-api", "phase": "P0", "data_ready": False}
    symbols = [s.strip() for s in os.getenv("DEMO_COMPANIES", ",".join(DEFAULT_COMPANIES)).split(",") if s.strip()]
    if path == "/companies":
        return 200, {"companies": [{"symbol": s, "name": DEFAULT_COMPANIES.get(s, s), "readiness": "not_ingested"} for s in symbols]}
    parts = path.strip("/").split("/")
    if len(parts) == 3 and parts[0] == "companies" and parts[2] == "scorecard" and parts[1] in symbols:
        return 200, {"symbol": parts[1], "status": "not_ingested", "estimates": [], "evidence": [], "message": "Source connectors and disclosure extraction have not run. No emissions comparison is available yet."}
    return 404, {"error": "not_found"}
