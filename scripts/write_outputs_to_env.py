"""Copy `cdk deploy --outputs-file work/cdk-outputs.json` values into .env (AGENTS.md P0 'outputs written back to .env')."""
import json
import re
from pathlib import Path

MAP = {"S3RawBucket": "S3_RAW_BUCKET", "S3CuratedBucket": "S3_CURATED_BUCKET", "S3ReportsBucket": "S3_REPORTS_BUCKET", "ApiBaseUrl": "API_BASE_URL", "WsUrl": "WS_URL",
       "CognitoUserPoolId": "COGNITO_USER_POOL_ID", "CognitoClientId": "COGNITO_CLIENT_ID", "AlertsTopicArn": "ALERTS_TOPIC_ARN", "AmplifyAppId": "AMPLIFY_APP_ID",
       "FrontendUrl": "FRONTEND_URL", "Ec2InstanceId": "EC2_INSTANCE_ID", "Ec2PublicIp": "EC2_PUBLIC_IP", "Ec2ApiUrl": "EC2_API_URL", "OpenSearchEndpoint": "OPENSEARCH_ENDPOINT", "OpenSearchCollectionArn": "OPENSEARCH_COLLECTION_ARN"}
# API/WS URLs reach Amplify via scripts/configure_amplify.py; .env keeps VITE_API_BASE_URL=/api so local dev uses the Vite proxy
VITE = {"COGNITO_USER_POOL_ID": "VITE_COGNITO_USER_POOL_ID", "COGNITO_CLIENT_ID": "VITE_COGNITO_CLIENT_ID"}
outs = {k: v for stack in json.loads(Path("work/cdk-outputs.json").read_text()).values() for k, v in stack.items()}
env = Path(".env")
text = env.read_text() if env.exists() else Path(".env.example").read_text()
vals = {MAP[k]: v for k, v in outs.items() if k in MAP}
vals.update({VITE[k]: v for k, v in list(vals.items()) if k in VITE})
for k, v in vals.items():
    text = re.sub(rf"^{k}=.*$", f"{k}={v}", text, flags=re.M) if re.search(rf"^{k}=", text, re.M) else text + f"\n{k}={v}"
env.write_text(text)
print("\n".join(f"{k}={v}" for k, v in vals.items()))
