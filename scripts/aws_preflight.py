"""AGENTS.md Step 1 checks with boto3 (no AWS CLI needed): identity, Bedrock text + embedding call, budget, quota."""
import json
import os
import sys

sys.path[:0] = ["packages/core"]
from et_core.config import settings  # noqa: E402  (loads .env)

ok = True


def check(name, fn, required=True):
    global ok
    try:
        print(f"✓ {name}: {fn()}")
    except Exception as e:  # report every failure, keep going
        ok = ok and not required
        print(f"{'✗' if required else '!'} {name}: {type(e).__name__}: {str(e)[:200]}{'' if required else '  (warning: app falls back to deterministic engines)'}")


import boto3  # noqa: E402

session = boto3.Session(profile_name=os.environ.get("AWS_PROFILE") or None, region_name=settings.region)
check("identity", lambda: session.client("sts").get_caller_identity()["Account"])
def account_matches():
    a = session.client("sts").get_caller_identity()["Account"]
    if a != os.environ.get("AWS_ACCOUNT_ID"):
        raise ValueError(f"profile account {a} != AWS_ACCOUNT_ID in .env")
    return a


check("account matches .env", account_matches)
check("bedrock text", lambda: session.client("bedrock-runtime").converse(modelId=settings.bedrock_fast_model, messages=[{"role": "user", "content": [{"text": "Reply with OK"}]}], inferenceConfig={"maxTokens": 5})["output"]["message"]["content"][0]["text"], required=False)
check("bedrock embed", lambda: len(json.loads(session.client("bedrock-runtime").invoke_model(modelId=settings.bedrock_embed_model, body=json.dumps({"inputText": "NTPC"}))["body"].read())["embedding"]), required=False)
check("budgets", lambda: [b["BudgetName"] for b in session.client("budgets").describe_budgets(AccountId=session.client("sts").get_caller_identity()["Account"]).get("Budgets", [])] or "none — create the $50 budget (Step 1.A)")
check("sagemaker g5 quota", lambda: next((q["Value"] for q in session.client("service-quotas").list_service_quotas(ServiceCode="sagemaker", MaxResults=100)["Quotas"] if "ml.g5.xlarge for endpoint usage" in q["QuotaName"]), "not listed in first page"))
sys.exit(0 if ok else 1)
