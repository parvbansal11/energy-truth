import { CfnOutput, SecretValue, Stack, StackProps } from "aws-cdk-lib";
import * as amplify from "aws-cdk-lib/aws-amplify";
import { Construct } from "constructs";

export interface FrontendProps extends StackProps {
  repository: string; // https://github.com/<owner>/energy-truth
  apiBaseUrl: string;
  wsUrl: string;
  userPoolId: string;
  userPoolClientId: string;
}

/** Amplify Hosting app for apps/web (monorepo appRoot). The GitHub token is read from Secrets Manager
 *  `energy-truth/github-token` — create it during AGENTS.md Step 1.F. First production publish is a STOP point. */
export class FrontendStack extends Stack {
  constructor(scope: Construct, id: string, props: FrontendProps) {
    super(scope, id, props);
    const app = new amplify.CfnApp(this, "Web", {
      name: "energy-truth",
      repository: props.repository,
      accessToken: SecretValue.secretsManager("energy-truth/github-token").unsafeUnwrap(),
      platform: "WEB",
      environmentVariables: [
        { name: "AMPLIFY_MONOREPO_APP_ROOT", value: "apps/web" },
        { name: "VITE_API_BASE_URL", value: props.apiBaseUrl },
        { name: "VITE_WS_URL", value: props.wsUrl },
        { name: "VITE_COGNITO_USER_POOL_ID", value: props.userPoolId },
        { name: "VITE_COGNITO_CLIENT_ID", value: props.userPoolClientId },
        { name: "VITE_AWS_REGION", value: this.region },
      ],
      customRules: [{ source: "/<*>", target: "/index.html", status: "404-200" }],
    });
    new amplify.CfnBranch(this, "Main", { appId: app.attrAppId, branchName: "main", enableAutoBuild: true, stage: "PRODUCTION" });
    new CfnOutput(this, "AmplifyAppId", { value: app.attrAppId });
    new CfnOutput(this, "FrontendUrl", { value: `https://main.${app.attrDefaultDomain}` });
  }
}
