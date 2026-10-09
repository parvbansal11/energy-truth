import * as path from 'node:path';
import { Stack, StackProps, RemovalPolicy, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as gateway from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
export class FoundationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    for (const kind of ['Raw', 'Curated', 'Reports']) {
      const bucket = new s3.Bucket(this, `${kind}Bucket`, { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true, versioned: true, removalPolicy: RemovalPolicy.RETAIN });
      new CfnOutput(this, `S3${kind}Bucket`, { value: bucket.bucketName });
    }
    for (const name of ['Company', 'Asset', 'Ownership', 'Disclosure', 'Estimate', 'ForecastRun', 'AgentRun', 'Alert']) {
      const table = new ddb.Table(this, `${name}Table`, { partitionKey: { name: 'pk', type: ddb.AttributeType.STRING }, sortKey: { name: 'sk', type: ddb.AttributeType.STRING }, billingMode: ddb.BillingMode.PAY_PER_REQUEST, pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }, removalPolicy: RemovalPolicy.RETAIN });
      new CfnOutput(this, `${name}TableName`, { value: table.tableName });
    }
    const pool = new cognito.UserPool(this, 'Users', { selfSignUpEnabled: false, signInAliases: { email: true }, removalPolicy: RemovalPolicy.RETAIN });
    const client = pool.addClient('WebClient', { generateSecret: false, authFlows: { userSrp: true } });
    const logGroup = new logs.LogGroup(this, 'ApiLogs', { retention: logs.RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.RETAIN });
    const fn = new lambda.Function(this, 'ApiHandler', { runtime: lambda.Runtime.PYTHON_3_12, handler: 'handler.handler', code: lambda.Code.fromAsset(path.join(__dirname, '../../apps/api'), { exclude: ['__pycache__', '*.pyc', 'local.py', 'requirements.txt'] }), memorySize: 128, timeout: Duration.seconds(10), logGroup });
    const api = new gateway.HttpApi(this, 'HttpApi');
    const integration = new HttpLambdaIntegration('ApiIntegration', fn);
    api.addRoutes({ path: '/health', methods: [gateway.HttpMethod.GET], integration });
    api.addRoutes({ path: '/companies', methods: [gateway.HttpMethod.GET], integration });
    api.addRoutes({ path: '/companies/{symbol}/scorecard', methods: [gateway.HttpMethod.GET], integration });
    new CfnOutput(this, 'ApiBaseUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'CognitoUserPoolId', { value: pool.userPoolId });
    new CfnOutput(this, 'CognitoClientId', { value: client.userPoolClientId });
  }
}
