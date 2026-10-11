import { App, Tags } from "aws-cdk-lib";
import { AiStack } from "../lib/ai-stack";
import { ApiStack } from "../lib/api-stack";
import { AuthStack } from "../lib/auth-stack";
import { ComputeStack } from "../lib/compute-stack";
import { DataStack } from "../lib/data-stack";
import { FrontendStack } from "../lib/frontend-stack";
import { MonitoringStack } from "../lib/monitoring-stack";
import { AlertsTopicStack, OrchestrationStack } from "../lib/orchestration-stack";

const app = new App();
const flag = (k: string) => [true, "true"].includes(app.node.tryGetContext(k));
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION || "us-east-1" };
const prefix = process.env.DDB_TABLE_PREFIX || "energytruth_";
// API Gateway rejects duplicate origins, so normalise and dedupe
const corsOrigins = [...new Set((process.env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173").split(",").concat(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [])
  .map((o) => o.trim().replace(/\/$/, "")).filter(Boolean))];

const data = new DataStack(app, "EnergyTruthData", { env, tablePrefix: prefix, deployOpenSearch: flag("deployOpenSearch") });
// reuse a Cognito pool created by hand in Step 1.E (any region) instead of making a second one
const auth = process.env.COGNITO_USER_POOL_ID ? undefined : new AuthStack(app, "EnergyTruthAuth", { env });
const ai = new AiStack(app, "EnergyTruthAi", { env, deployChronos: flag("deployChronos") });
const topic = new AlertsTopicStack(app, "EnergyTruthAlerts", { env, alertEmail: process.env.ALERT_EMAIL });
const passthrough = Object.fromEntries(
  ["BEDROCK_TEXT_MODEL_ID", "BEDROCK_FAST_MODEL_ID", "BEDROCK_EMBED_MODEL_ID", "CHRONOS_ENDPOINT_NAME", "CHRONOS_HORIZON_MONTHS", "CEA_EF_TCO2_PER_MWH", "CEA_EF_VERSION", "HITL_ENTITY_THRESHOLD", "DEMO_COMPANIES"]
    .filter((k) => process.env[k])
    .map((k) => [k, process.env[k] as string]),
);
const api = new ApiStack(app, "EnergyTruthApi", {
  env, raw: data.raw, curated: data.curated, reports: data.reports, tables: data.tables, tablePrefix: prefix,
  bedrockPolicy: ai.bedrockPolicy, alertsTopic: topic.topic, corsOrigins, env_: passthrough,
});
new OrchestrationStack(app, "EnergyTruthOrchestration", { env, scheduleFn: api.scheduleFn });
new MonitoringStack(app, "EnergyTruthMonitoring", {
  env, fns: [api.httpFn, api.wsFn, api.scheduleFn], httpApi: api.httpApi, alertsTopic: topic.topic, budgetEmail: process.env.BUDGET_EMAIL, budgetUsd: 50,
});
// an Amplify app connected by hand in Step 1.F is configured by scripts/configure_amplify.py instead
if (auth && process.env.AMPLIFY_REPOSITORY && !process.env.AMPLIFY_APP_ID) {
  new FrontendStack(app, "EnergyTruthFrontend", {
    env, repository: process.env.AMPLIFY_REPOSITORY, apiBaseUrl: api.httpApi.apiEndpoint, wsUrl: process.env.WS_URL || "",
    userPoolId: auth.pool.userPoolId, userPoolClientId: auth.client.userPoolClientId,
  });
}
// EC2 + CloudFront API (hourly billed while running: STOP point, approved 2026-10-11 for t3.xlarge)
if (flag("deployEc2")) {
  const appEnv = Object.fromEntries(
    ["BEDROCK_TEXT_MODEL_ID", "BEDROCK_FAST_MODEL_ID", "BEDROCK_EMBED_MODEL_ID", "CEA_EF_TCO2_PER_MWH", "CEA_EF_VERSION", "HITL_ENTITY_THRESHOLD",
      "LLM_PROVIDERS", "GEMINI_MODEL", "CHRONOS_HORIZON_MONTHS", "AGENT_STEP_DELAY"]
      .filter((k) => process.env[k]).map((k) => [k, process.env[k] as string]),
  );
  new ComputeStack(app, "EnergyTruthCompute", {
    env, raw: data.raw, curated: data.curated, reports: data.reports, tables: data.tables, bedrockPolicy: ai.bedrockPolicy,
    instanceType: app.node.tryGetContext("ec2InstanceType") || "t3.xlarge",
    appEnv: { ...appEnv, DDB_TABLE_PREFIX: prefix, CORS_ORIGINS: corsOrigins.join(",") },
  });
}
Tags.of(app).add("Project", "energy-truth");
