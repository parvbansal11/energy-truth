"""Delete hourly-billed ML resources: the Chronos SageMaker endpoint (+config, model). Data is untouched."""
import os
import sys

sys.path[:0] = ["packages/core"]
from et_core.config import settings  # noqa: E402
import boto3  # noqa: E402

if "--yes" not in sys.argv:
    sys.exit("Deletes the SageMaker Chronos endpoint. Re-run with --yes after human approval (AGENTS.md §2.2).")
sm = boto3.Session(profile_name=os.environ.get("AWS_PROFILE") or None, region_name=settings.region).client("sagemaker")
for e in sm.list_endpoints(NameContains="energy-truth")["Endpoints"]:
    cfg = sm.describe_endpoint(EndpointName=e["EndpointName"])["EndpointConfigName"]
    sm.delete_endpoint(EndpointName=e["EndpointName"])
    sm.delete_endpoint_config(EndpointConfigName=cfg)
    print("deleted", e["EndpointName"])
