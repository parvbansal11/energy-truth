import { CfnOutput, Fn, Stack, StackProps } from "aws-cdk-lib";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface ComputeProps extends StackProps {
  raw: s3.Bucket;
  curated: s3.Bucket;
  reports: s3.Bucket;
  tables: Record<string, ddb.Table>;
  bedrockPolicy: iam.ManagedPolicy;
  instanceType: string; // approved by a human (AGENTS.md §2.2): billed per hour while running
  appEnv: Record<string, string>;
}

/** One EC2 box running the full API (FastAPI + WebSocket agent stream + live Chronos-2 on CPU + a local Ollama model
 *  + the live "add company" worker). HTTPS comes from Caddy with a Let's Encrypt certificate for
 *  <elastic-ip>.sslip.io (CloudFront is blocked until AWS verifies this new account). Code arrives as
 *  s3://<raw>/releases/app.tgz (scripts/ec2_release.py); data is synced from S3. No NAT gateway, no SSH: admin via SSM. */
export class ComputeStack extends Stack {
  constructor(scope: Construct, id: string, props: ComputeProps) {
    super(scope, id, props);
    const vpc = new ec2.Vpc(this, "Vpc", { maxAzs: 1, natGateways: 0, subnetConfiguration: [{ name: "public", subnetType: ec2.SubnetType.PUBLIC }] });
    const sg = new ec2.SecurityGroup(this, "ApiSg", { vpc, description: "energy-truth API: HTTPS via Caddy (80 for the ACME challenge)", allowAllOutbound: true });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "ACME HTTP-01 + redirect");
    // the Elastic IP exists before the instance so its hostname can be baked into the instance's Caddy config
    const eip = new ec2.CfnEIP(this, "Ip", { domain: "vpc" });
    const host = Fn.join("", [Fn.join("-", Fn.split(".", eip.ref)), ".sslip.io"]);

    const role = new iam.Role(this, "Role", { assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com") });
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));
    role.addManagedPolicy(props.bedrockPolicy);
    props.raw.grantReadWrite(role);
    props.curated.grantReadWrite(role);
    props.reports.grantReadWrite(role);
    Object.values(props.tables).forEach((t) => t.grantReadWriteData(role));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:energy-truth/prod-*`],
    }));

    const env = {
      ...props.appEnv,
      AWS_REGION: this.region, AWS_DEFAULT_REGION: this.region, ET_ON_EC2: "1",
      S3_RAW_BUCKET: props.raw.bucketName, S3_CURATED_BUCKET: props.curated.bucketName, S3_REPORTS_BUCKET: props.reports.bucketName,
      ET_HOST: host, DATA_DIR: "/opt/energy-truth/data", OLLAMA_URL: "http://127.0.0.1:11434", OLLAMA_MODEL: "qwen2.5:3b",
      PYTHONPATH: "packages/core:packages/connectors:packages/fusion:packages/chronos:packages/agents:.",
    };
    const envFile = Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n");

    const ud = ec2.UserData.forLinux();
    ud.addCommands(
      "set -euxo pipefail",
      "export DEBIAN_FRONTEND=noninteractive",
      "apt-get update -y && apt-get install -y python3.12-venv python3-pip jq curl zstd",
      "snap install aws-cli --classic || true",
      "mkdir -p /opt/energy-truth/data",
      `cat > /etc/energy-truth.env <<'EOF'\n${envFile}\nEOF`,
      // release script: pull code + data, (re)install deps, restart. Re-run by scripts/ec2_release.py via SSM.
      `cat > /usr/local/bin/et-release <<'EOF'
#!/bin/bash
set -euxo pipefail
set -a; . /etc/energy-truth.env; set +a
cd /opt/energy-truth
aws s3 cp "s3://$S3_RAW_BUCKET/releases/app.tgz" /tmp/app.tgz
rm -rf app.new && mkdir app.new && tar -xzf /tmp/app.tgz -C app.new
[ -x venv/bin/python ] || python3.12 -m venv venv
venv/bin/pip install -q --upgrade pip
venv/bin/pip install -q torch --index-url https://download.pytorch.org/whl/cpu
venv/bin/pip install -q -r app.new/requirements-ec2.txt
aws s3 sync "s3://$S3_CURATED_BUCKET/curated" data/curated --only-show-errors
aws s3 sync "s3://$S3_RAW_BUCKET" data/raw --exclude "releases/*" --only-show-errors
rm -rf app.old; [ -d app ] && mv app app.old; mv app.new app
systemctl restart energy-truth
EOF`,
      "chmod +x /usr/local/bin/et-release",
      `cat > /etc/systemd/system/energy-truth.service <<'EOF'
[Unit]
Description=Energy Truth API
After=network-online.target ollama.service
[Service]
EnvironmentFile=/etc/energy-truth.env
WorkingDirectory=/opt/energy-truth/app
ExecStart=/opt/energy-truth/venv/bin/uvicorn apps.api.app:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=* --ws-ping-interval 20
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
EOF`,
      "systemctl daemon-reload && systemctl enable energy-truth",
      // Caddy: automatic Let's Encrypt TLS for <eip>.sslip.io, reverse proxy (incl. WebSocket) to uvicorn
      "apt-get install -y debian-keyring debian-archive-keyring apt-transport-https gnupg",
      "curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg",
      "curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list",
      "apt-get update -y && apt-get install -y caddy",
      Fn.join("", ["printf '%s {\\n  encode gzip\\n  reverse_proxy 127.0.0.1:8000\\n}\\n' ", host, " > /etc/caddy/Caddyfile"]),
      "systemctl restart caddy",
      // free local model for summaries when neither Bedrock nor Gemini answers
      "curl -fsSL https://ollama.com/install.sh | sh || true",
      "systemctl enable --now ollama || true",
      "(sleep 5; ollama pull qwen2.5:3b) > /var/log/ollama-pull.log 2>&1 &",
      // the first release may not be uploaded yet; scripts/ec2_release.py runs et-release again via SSM
      "/usr/local/bin/et-release || echo 'release not available yet'",
    );

    const instance = new ec2.Instance(this, "Api", {
      vpc, securityGroup: sg, role, userData: ud, vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType(props.instanceType),
      machineImage: ec2.MachineImage.fromSsmParameter("/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"),
      blockDevices: [{ deviceName: "/dev/sda1", volume: ec2.BlockDeviceVolume.ebs(60, { volumeType: ec2.EbsDeviceVolumeType.GP3, encrypted: true }) }],
      requireImdsv2: true,
      userDataCausesReplacement: false,
    });
    new ec2.CfnEIPAssociation(this, "IpAssoc", { allocationId: eip.attrAllocationId, instanceId: instance.instanceId });

    new CfnOutput(this, "Ec2InstanceId", { value: instance.instanceId });
    new CfnOutput(this, "Ec2PublicIp", { value: eip.ref });
    new CfnOutput(this, "Ec2ApiUrl", { value: Fn.join("", ["https://", host]) });
  }
}
