"""Read-only identity preflight; does not validate budgets or model invocation."""
import os, shutil, subprocess, sys
if not shutil.which("aws"):
    sys.exit("AWS CLI missing. Install/configure it before deployment.")
required = ["AWS_ACCOUNT_ID", "CDK_DEFAULT_ACCOUNT", "BEDROCK_TEXT_MODEL_ID", "BEDROCK_FAST_MODEL_ID", "BEDROCK_EMBED_MODEL_ID"]
missing = [key for key in required if not os.getenv(key)]
if missing:
    sys.exit("Missing environment keys: " + ", ".join(missing) + ". Export .env before running.")
result = subprocess.run(["aws", "sts", "get-caller-identity", "--profile", os.getenv("AWS_PROFILE", "energy-truth"), "--query", "Account", "--output", "text"], capture_output=True, text=True)
if result.returncode:
    sys.exit("AWS identity check failed; verify your named profile.")
if result.stdout.strip() != os.environ["AWS_ACCOUNT_ID"] or os.environ["CDK_DEFAULT_ACCOUNT"] != os.environ["AWS_ACCOUNT_ID"]:
    sys.exit("AWS profile and deployment account do not match.")
print("AWS identity matches deployment account. Bedrock invocation, budget and Amplify checks remain manual P0 prerequisites.")
