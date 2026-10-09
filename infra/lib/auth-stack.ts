import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

/** Cognito user pool + public SPA client (no secret) for demo sign-in and alert subscriptions. */
export class AuthStack extends Stack {
  readonly pool: cognito.UserPool;
  readonly client: cognito.UserPoolClient;
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.pool = new cognito.UserPool(this, "Users", {
      userPoolName: "energy-truth-users",
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: { minLength: 12, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.client = this.pool.addClient("WebClient", { generateSecret: false, authFlows: { userSrp: true }, preventUserExistenceErrors: true });
    new CfnOutput(this, "CognitoUserPoolId", { value: this.pool.userPoolId });
    new CfnOutput(this, "CognitoClientId", { value: this.client.userPoolClientId });
  }
}
