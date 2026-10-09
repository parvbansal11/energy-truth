"""Idle-billable resource check (AGENTS.md §2.5): SageMaker endpoints, OpenSearch Serverless collections,
NAT gateways, ECS tasks, plus month-to-date spend for Project=energy-truth."""
import datetime as dt
import os
import sys

sys.path[:0] = ["packages/core"]
from et_core.config import settings  # noqa: E402
import boto3  # noqa: E402

s = boto3.Session(profile_name=os.environ.get("AWS_PROFILE") or None, region_name=settings.region)
def safe(f):
    try:
        return f()
    except Exception as e:
        return f"error: {type(e).__name__}"
print("SageMaker endpoints  :", safe(lambda: [(e["EndpointName"], e["EndpointStatus"]) for e in s.client("sagemaker").list_endpoints()["Endpoints"]]) or "none")
print("OpenSearch collections:", safe(lambda: [c["name"] for c in s.client("opensearchserverless").list_collections()["collectionSummaries"]]) or "none")
print("NAT gateways          :", safe(lambda: [n["NatGatewayId"] for n in s.client("ec2").describe_nat_gateways(Filters=[{"Name": "state", "Values": ["available"]}])["NatGateways"]]) or "none")
print("ECS running tasks     :", safe(lambda: sum(len(s.client("ecs").list_tasks(cluster=c)["taskArns"]) for c in s.client("ecs").list_clusters()["clusterArns"])))
start = dt.date.today().replace(day=1).isoformat()
end = (dt.date.today() + dt.timedelta(days=1)).isoformat()
print("Month-to-date (tagged):", safe(lambda: s.client("ce").get_cost_and_usage(TimePeriod={"Start": start, "End": end}, Granularity="MONTHLY", Metrics=["UnblendedCost"],
      Filter={"Tags": {"Key": "Project", "Values": ["energy-truth"]}})["ResultsByTime"][0]["Total"]["UnblendedCost"]))
print("Month-to-date (all)   :", safe(lambda: s.client("ce").get_cost_and_usage(TimePeriod={"Start": start, "End": end}, Granularity="MONTHLY", Metrics=["UnblendedCost"])["ResultsByTime"][0]["Total"]["UnblendedCost"]))
