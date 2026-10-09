import * as path from "node:path";
import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as gateway from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration, WebSocketLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";

export interface ApiStackProps extends StackProps {
  raw: s3.IBucket;
  curated: s3.IBucket;
  reports: s3.IBucket;
  tables: Record<string, ddb.ITable>;
  tablePrefix: string;
  bedrockPolicy: iam.IManagedPolicy;
  alertsTopic: sns.ITopic;
  corsOrigins: string[];
  env_: Record<string, string>;
}

/** HTTP API (REST-style routes) + WebSocket API (agent stream), both backed by the same Python bundle. */
export class ApiStack extends Stack {
  readonly httpApi: gateway.HttpApi;
  readonly httpFn: lambda.Function;
  readonly wsFn: lambda.Function;
  readonly scheduleFn: lambda.Function;
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    // Built by scripts/bundle_lambda.sh (manylinux wheels, no Docker needed)
    const code = lambda.Code.fromAsset(path.join(__dirname, "../../work/lambda"));
    const environment = {
      ...props.env_,
      S3_RAW_BUCKET: props.raw.bucketName,
      S3_CURATED_BUCKET: props.curated.bucketName,
      S3_REPORTS_BUCKET: props.reports.bucketName,
      DDB_TABLE_PREFIX: props.tablePrefix,
      ALERTS_TOPIC_ARN: props.alertsTopic.topicArn,
      DATA_DIR: "/tmp/data",
      BEDROCK_ENABLED: "true",
      CORS_ORIGINS: props.corsOrigins.join(","),
    };
    const fn = (name: string, handler: string, memory: number, timeout: number) => {
      const f = new lambda.Function(this, name, {
        runtime: lambda.Runtime.PYTHON_3_12,
        architecture: lambda.Architecture.X86_64,
        handler,
        code,
        memorySize: memory,
        timeout: Duration.seconds(timeout),
        environment,
        logGroup: new logs.LogGroup(this, `${name}Logs`, { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
        tracing: lambda.Tracing.ACTIVE,
      });
      props.raw.grantReadWrite(f);
      props.curated.grantReadWrite(f);
      props.reports.grantReadWrite(f);
      Object.values(props.tables).forEach((t) => t.grantReadWriteData(f));
      f.role?.addManagedPolicy(props.bedrockPolicy);
      props.alertsTopic.grantPublish(f);
      return f;
    };
    this.httpFn = fn("ApiHandler", "handler.handler", 1024, 29);
    this.wsFn = fn("AgentStreamHandler", "handler.ws_handler", 1536, 300);
    this.scheduleFn = fn("AlertsSchedule", "handler.schedule", 512, 120);
    if (process.env.CHRONOS_ENDPOINT_NAME) {
      for (const f of [this.httpFn, this.wsFn]) {
        f.addToRolePolicy(new iam.PolicyStatement({ actions: ["sagemaker:InvokeEndpoint"], resources: [`arn:aws:sagemaker:${this.region}:${this.account}:endpoint/${process.env.CHRONOS_ENDPOINT_NAME}`] }));
      }
    }

    this.httpApi = new gateway.HttpApi(this, "HttpApi", {
      apiName: "energy-truth-http",
      corsPreflight: { allowOrigins: props.corsOrigins, allowMethods: [gateway.CorsHttpMethod.ANY], allowHeaders: ["content-type", "authorization"] },
      defaultIntegration: new HttpLambdaIntegration("HttpDefault", this.httpFn),
    });

    const ws = new gateway.WebSocketApi(this, "AgentWs", {
      apiName: "energy-truth-agent-ws",
      connectRouteOptions: { integration: new WebSocketLambdaIntegration("WsConnect", this.wsFn) },
      disconnectRouteOptions: { integration: new WebSocketLambdaIntegration("WsDisconnect", this.wsFn) },
      defaultRouteOptions: { integration: new WebSocketLambdaIntegration("WsDefault", this.wsFn) },
    });
    const stage = new gateway.WebSocketStage(this, "WsProd", { webSocketApi: ws, stageName: "prod", autoDeploy: true });
    ws.grantManageConnections(this.wsFn);

    new CfnOutput(this, "ApiBaseUrl", { value: this.httpApi.apiEndpoint });
    new CfnOutput(this, "WsUrl", { value: stage.url });
  }
}
