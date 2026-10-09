"""Read-only inspection. Never tears down resources or changes billing."""
import datetime, os, shutil, subprocess, sys
if not shutil.which("aws"):
    sys.exit("AWS CLI missing; cost inspection unavailable.")
profile = os.getenv("AWS_PROFILE", "energy-truth")
region = os.getenv("AWS_REGION", "us-east-1")
today = datetime.datetime.now(datetime.timezone.utc).date()
end = today + datetime.timedelta(days=1)
checks = [
    ("SageMaker endpoints", ["sagemaker", "list-endpoints"]),
    ("OpenSearch Serverless collections", ["opensearchserverless", "list-collections"]),
    ("ECS clusters (inspect active tasks before cost approval)", ["ecs", "list-clusters"]),
    ("NAT gateways", ["ec2", "describe-nat-gateways", "--filter", "Name=state,Values=available,pending"]),
    ("Month-to-date project costs", ["ce", "get-cost-and-usage", "--time-period", f"Start={today.replace(day=1)},End={end}", "--granularity", "MONTHLY", "--metrics", "UnblendedCost", "--filter", '{"Tags":{"Key":"Project","Values":["energy-truth"]}}'])
]
failed = False
for label, arguments in checks:
    print(label, flush=True)
    result = subprocess.run(["aws", *arguments, "--profile", profile, "--region", region, "--output", "json"], check=False)
    failed |= result.returncode != 0
sys.exit(int(failed))
