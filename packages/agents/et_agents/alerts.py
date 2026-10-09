"""Alerts Inbox evaluation (plan §4 item 8, §8.3). EventBridge schedules POST /alerts/run; alerts with z > 2 or a
forecast band breach are published to SNS (email) when ALERTS_TOPIC_ARN is configured."""
from __future__ import annotations

import json

from et_core.config import settings
from et_core.evidence import now_iso
from et_core.store import store


def evaluate(publish: bool = False) -> dict:
    alerts = store.read("alerts", []) or []
    # new grid-intensity spike: latest month > forecast q90 of the previous run is not available offline; use
    # latest month vs trailing 12-month max as a transparent rule.
    g = store.read("grid", {}) or {}
    if g.get("series"):
        s = [v for v in g["series"]["India"] if v is not None]
        if len(s) > 13 and s[-1] > max(s[-13:-1]):
            alerts.append({"alert_id": f"alert:GRID:INTENSITY_SPIKE:{g['months'][-1]}", "company": "GRID", "type": "INTENSITY_SPIKE", "severity": "medium", "ts": now_iso(),
                           "title": f"India grid intensity {s[-1]:.3f} tCO2/MWh in {g['months'][-1]} is a 12-month high", "detail": g["method"], "evidence_ids": g["evidence_ids"]})
    alerts = list({a["alert_id"]: a for a in alerts}.values())
    store.write("alerts", alerts)
    sent = 0
    if publish and settings.sns_topic_arn:
        import boto3

        sns = boto3.client("sns", region_name=settings.region)
        for a in alerts:
            if a["severity"] == "high":
                sns.publish(TopicArn=settings.sns_topic_arn, Subject=a["title"][:99], Message=json.dumps(a, indent=1))
                sent += 1
    return {"alerts": alerts, "published": sent, "sns_configured": bool(settings.sns_topic_arn)}
