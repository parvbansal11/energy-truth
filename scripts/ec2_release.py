"""Ship the backend to the EC2 box: tar the code -> s3://<raw>/releases/app.tgz -> run `et-release` on the instance via SSM.

Also writes the AI secrets from .env into Secrets Manager `energy-truth/prod` (the instance reads them at runtime),
so keys never sit in the CloudFormation template, the tarball or git.
Usage: python scripts/ec2_release.py [--no-restart] [--secrets-only]
"""
import argparse
import io
import json
import os
import tarfile
import time
from pathlib import Path

import boto3

ROOT = Path(__file__).resolve().parents[1]
INCLUDE = ["packages", "apps/api", "requirements-ec2.txt", "pyproject.toml"]
SECRET_KEYS = ["GEMINI_API_KEY"]


def env() -> dict:
    out = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def put_secrets(sm, e: dict) -> None:
    vals = {k: e[k] for k in SECRET_KEYS if e.get(k)}
    if not vals:
        print("no AI secrets in .env; skipping Secrets Manager")
        return
    body = json.dumps(vals)
    try:
        sm.put_secret_value(SecretId="energy-truth/prod", SecretString=body)
        print(f"updated secret energy-truth/prod ({', '.join(vals)})")
    except sm.exceptions.ResourceNotFoundException:
        sm.create_secret(Name="energy-truth/prod", SecretString=body, Tags=[{"Key": "Project", "Value": "energy-truth"}])
        print(f"created secret energy-truth/prod ({', '.join(vals)})")


def tarball() -> bytes:
    buf = io.BytesIO()
    skip = lambda ti: None if any(p in ti.name for p in ("__pycache__", ".pytest_cache", "/tests/")) or ti.name.endswith(".pyc") else ti
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        for rel in INCLUDE:
            tf.add(ROOT / rel, arcname=rel, filter=skip)
    return buf.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-restart", action="store_true")
    ap.add_argument("--secrets-only", action="store_true")
    args = ap.parse_args()
    e = env()
    session = boto3.Session(profile_name=e.get("AWS_PROFILE") or os.environ.get("AWS_PROFILE") or None, region_name=e.get("AWS_REGION", "us-east-1"))
    put_secrets(session.client("secretsmanager"), e)
    if args.secrets_only:
        return
    data = tarball()
    session.client("s3").put_object(Bucket=e["S3_RAW_BUCKET"], Key="releases/app.tgz", Body=data)
    print(f"uploaded releases/app.tgz ({len(data) / 1e6:.1f} MB)")
    iid = e.get("EC2_INSTANCE_ID")
    if args.no_restart or not iid:
        print("not restarting (no EC2_INSTANCE_ID in .env yet)" if not iid else "not restarting")
        return
    ssm = session.client("ssm")
    cmd = ssm.send_command(InstanceIds=[iid], DocumentName="AWS-RunShellScript", Parameters={"commands": ["/usr/local/bin/et-release"], "executionTimeout": ["1800"]},
                           TimeoutSeconds=600)["Command"]["CommandId"]
    print(f"et-release running on {iid} (command {cmd})")
    while True:
        time.sleep(8)
        try:
            inv = ssm.get_command_invocation(CommandId=cmd, InstanceId=iid)
        except ssm.exceptions.InvocationDoesNotExist:
            continue
        if inv["Status"] not in ("Pending", "InProgress", "Delayed"):
            print(inv["Status"])
            print((inv.get("StandardErrorContent") or "")[-1500:] if inv["Status"] != "Success" else (inv.get("StandardOutputContent") or "")[-400:])
            raise SystemExit(0 if inv["Status"] == "Success" else 1)


if __name__ == "__main__":
    main()
