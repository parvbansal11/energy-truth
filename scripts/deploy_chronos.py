"""Deploy SageMaker JumpStart Chronos-2 (pytorch-forecasting-chronos-2) — STOP POINT (AGENTS.md §2.2).

Real-time endpoints bill per hour while idle. This script refuses to run without --approved, deploys with an
inference component whose instance count can scale to zero, and prints CHRONOS_ENDPOINT_NAME for .env.
Delete with `make teardown-ml`. Requires `pip install sagemaker`."""
import argparse
import os
import sys

ap = argparse.ArgumentParser()
ap.add_argument("--approved", action="store_true", help="human approval for an hourly-billed endpoint")
ap.add_argument("--instance", default=os.environ.get("CHRONOS_INSTANCE_TYPE", "ml.g5.xlarge"))
ap.add_argument("--role", default=os.environ.get("CHRONOS_ROLE_ARN"))
ap.add_argument("--serverless", action="store_true", help="serverless inference (6 GB) — no idle cost, cold starts")
a = ap.parse_args()
if not a.approved:
    sys.exit("Refusing: SageMaker endpoints bill hourly. Re-run with --approved after the human signs off (AGENTS.md §2.2).")
from sagemaker.jumpstart.model import JumpStartModel  # noqa: E402

model = JumpStartModel(model_id=os.environ.get("CHRONOS_JUMPSTART_MODEL_ID", "pytorch-forecasting-chronos-2"), role=a.role)
name = "energy-truth-chronos2"
if a.serverless:
    from sagemaker.serverless import ServerlessInferenceConfig

    pred = model.deploy(endpoint_name=name, serverless_inference_config=ServerlessInferenceConfig(memory_size_in_mb=6144, max_concurrency=2), tags=[{"Key": "Project", "Value": "energy-truth"}])
else:
    pred = model.deploy(endpoint_name=name, initial_instance_count=1, instance_type=a.instance, managed_instance_scaling={"MinInstanceCount": 0, "MaxInstanceCount": 1, "Status": "ENABLED"},
                        tags=[{"Key": "Project", "Value": "energy-truth"}])
print(f"CHRONOS_ENDPOINT_NAME={pred.endpoint_name}")
