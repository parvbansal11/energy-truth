"""Upload curated tables + raw evidence cache to S3 and mirror rows to DynamoDB (after `make deploy`)."""
import json
import sys
from pathlib import Path

sys.path[:0] = ["packages/core"]
from et_core.config import settings  # noqa: E402
from et_core.store import Store  # noqa: E402

if not settings.s3_curated_bucket:
    sys.exit("S3_CURATED_BUCKET not set — run `make deploy` (writes outputs to .env) first.")
import boto3  # noqa: E402

s3 = boto3.client("s3", region_name=settings.region)
n = 0
for p in sorted(settings.curated_dir.glob("*.json")):
    s3.upload_file(str(p), settings.s3_curated_bucket, f"curated/{p.name}", ExtraArgs={"ContentType": "application/json"})
    n += 1
for p in sorted(settings.raw_dir.rglob("*")):
    if p.is_file() and "legacy" not in p.parts:
        s3.upload_file(str(p), settings.s3_raw_bucket, str(p.relative_to(settings.raw_dir)))
        n += 1
st = Store()
rows = {t: st.read(f) for t, f in [("Company", "companies"), ("Asset", "assets"), ("Ownership", "ownership"), ("Estimate", "estimates"), ("Alert", "alerts")]}
st.put_rows("Company", [{**c, "CIN": c.get("cin") or c["symbol"]} for c in rows["Company"]], "CIN", "symbol")
st.put_rows("Asset", rows["Asset"], "asset_id", "company")
st.put_rows("Ownership", rows["Ownership"], "company", "asset_id")
st.put_rows("Estimate", rows["Estimate"], "company", "estimate_id")
st.put_rows("Alert", rows["Alert"], "company", "alert_id")
st.put_rows("Disclosure", [{**d, "FY": f"FY#{d['fy']}#BRSR"} for d in st.read("disclosures")], "company", "FY")
print(f"uploaded {n} files; DynamoDB rows mirrored")
