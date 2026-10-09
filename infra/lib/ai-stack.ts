import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface AiStackProps extends StackProps {
  deployChronos: boolean;
}

/** Bedrock access policy (Nova + Titan) and, behind deployChronos=true, the SageMaker execution role used by
 *  scripts/deploy_chronos.py to create the JumpStart Chronos-2 endpoint with scale-to-zero (AGENTS.md §2.2 STOP point). */
export class AiStack extends Stack {
  readonly bedrockPolicy: iam.ManagedPolicy;
  constructor(scope: Construct, id: string, props: AiStackProps) {
    super(scope, id, props);
    this.bedrockPolicy = new iam.ManagedPolicy(this, "BedrockInvoke", {
      statements: [
        new iam.PolicyStatement({
          actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream", "bedrock:Converse", "bedrock:ConverseStream"],
          resources: [
            `arn:aws:bedrock:${this.region}::foundation-model/amazon.nova-*`,
            `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-*`,
            `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
          ],
        }),
      ],
    });
    if (props.deployChronos) {
      const role = new iam.Role(this, "ChronosSageMakerRole", {
        assumedBy: new iam.ServicePrincipal("sagemaker.amazonaws.com"),
        managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSageMakerFullAccess")],
      });
      new CfnOutput(this, "ChronosRoleArn", { value: role.roleArn });
    }
  }
}
