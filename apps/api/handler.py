"""AWS Lambda entry points.

  handler     - HTTP API (API Gateway HTTP API -> FastAPI via Mangum)
  ws_handler  - API Gateway WebSocket: $connect / $disconnect / audit. Streams LangGraph events back with
                postToConnection. HITL on AWS: a "resume" message re-runs the deterministic graph with the analyst's
                decision supplied up-front (no cross-invocation checkpoint needed; DECISIONS.md).
  schedule    - EventBridge rule target: re-evaluate alerts and publish to SNS."""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
for p in ["packages/core", "packages/connectors", "packages/fusion", "packages/chronos", "packages/agents"]:
    for base in (ROOT, ROOT.parents[1]):
        if (base / p).exists() and str(base / p) not in sys.path:
            sys.path.insert(0, str(base / p))

os.environ.setdefault("AGENT_STEP_DELAY", "0.15")

from mangum import Mangum  # noqa: E402

try:
    from .app import app  # noqa: E402
except ImportError:
    from app import app  # type: ignore  # noqa: E402

handler = Mangum(app, lifespan="off")


def ws_handler(event, context):
    import boto3

    rc = event["requestContext"]
    route, cid = rc.get("routeKey"), rc["connectionId"]
    if route in ("$connect", "$disconnect"):
        return {"statusCode": 200}
    endpoint = f"https://{rc['domainName']}/{rc['stage']}"
    gw = boto3.client("apigatewaymanagementapi", endpoint_url=endpoint)
    msg = json.loads(event.get("body") or "{}")

    from et_agents.graph import stream_audit

    if msg.get("action") == "resume":
        gen = stream_audit(msg.get("company", ""), run_id=msg.get("run_id"), hitl_decision={"decision": msg.get("decision", "accept"), "by": "analyst"})
    else:
        gen = stream_audit(msg.get("company", "NTPC"), auto_approve=bool(msg.get("auto_approve")))

    async def pump():
        async for ev in gen:
            gw.post_to_connection(ConnectionId=cid, Data=json.dumps(ev, default=str).encode())

    asyncio.run(pump())
    return {"statusCode": 200}


def schedule(event, context):
    from et_agents.alerts import evaluate

    r = evaluate(publish=True)
    return {"alerts": len(r["alerts"]), "published": r["published"]}
