"""Point an Amplify app connected by hand (AGENTS.md Step 1.F) at the deployed API + Cognito, then build `main`.

Reads AMPLIFY_APP_ID, API_BASE_URL, WS_URL, COGNITO_* from .env. Finds the app's region itself.
Starting the first production build is a STOP point (AGENTS.md §2.2): pass --release once a human approves.
"""
import argparse
import os
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

REGIONS = ["us-east-1", "ap-south-1", "us-east-2", "us-west-2", "eu-west-1", "eu-central-1", "ap-southeast-1"]


def load_env() -> dict:
    env = {}
    for line in Path(".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def find_app(session, app_id):
    for region in REGIONS:
        c = session.client("amplify", region_name=region)
        try:
            return c, c.get_app(appId=app_id)["app"]
        except ClientError as e:
            if e.response["Error"]["Code"] not in ("NotFoundException", "UnrecognizedClientException", "AccessDeniedException"):
                raise
    sys.exit(f"Amplify app {app_id} not found in {REGIONS}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", action="store_true", help="start a build of the branch (STOP point: human-approved)")
    ap.add_argument("--branch", default="main")
    args = ap.parse_args()
    env = load_env()
    session = boto3.Session(profile_name=env.get("AWS_PROFILE") or os.environ.get("AWS_PROFILE") or None)
    amp, app = find_app(session, env["AMPLIFY_APP_ID"])
    print(f"app {app['name']} ({app['appId']}) in {amp.meta.region_name}; repo {app.get('repository', '-')}")

    vars_ = dict(app.get("environmentVariables") or {})
    vars_.update({
        "AMPLIFY_MONOREPO_APP_ROOT": "apps/web",
        # EC2 backend (FastAPI serves /ws on the same host) when deployed, else the serverless API Gateway pair
        "VITE_API_BASE_URL": env.get("EC2_API_URL") or env["API_BASE_URL"],
        "VITE_WS_URL": "" if env.get("EC2_API_URL") else env.get("WS_URL", ""),
        "VITE_COGNITO_USER_POOL_ID": env.get("COGNITO_USER_POOL_ID", ""),
        "VITE_COGNITO_CLIENT_ID": env.get("COGNITO_CLIENT_ID", ""),
        "VITE_AWS_REGION": env.get("COGNITO_REGION") or env.get("AWS_REGION", "us-east-1"),
        "VITE_GIBS_ENABLED": "true",
    })
    vars_ = {k: v for k, v in vars_.items() if v}  # an unset value means "derive it" (e.g. the WebSocket URL from the API host)
    rules = app.get("customRules") or []
    spa = {"source": "/<*>", "target": "/index.html", "status": "404-200"}
    if not any(r.get("source") == spa["source"] for r in rules):
        rules.append(spa)
    amp.update_app(appId=app["appId"], environmentVariables=vars_, customRules=rules)
    print("env vars set:", ", ".join(k for k in vars_ if k.startswith(("VITE_", "AMPLIFY_"))))

    branches = {b["branchName"]: b for b in amp.list_branches(appId=app["appId"])["branches"]}
    if args.branch not in branches:
        amp.create_branch(appId=app["appId"], branchName=args.branch, stage="PRODUCTION", enableAutoBuild=True)
        print(f"created branch {args.branch}")
    if not args.release:
        print("not starting a build (re-run with --release once approved)")
        return
    job = amp.start_job(appId=app["appId"], branchName=args.branch, jobType="RELEASE")["jobSummary"]
    print(f"build started: job {job['jobId']} -> https://{args.branch}.{app['defaultDomain']}")


if __name__ == "__main__":
    main()
