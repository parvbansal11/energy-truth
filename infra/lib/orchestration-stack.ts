import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import { Construct } from "constructs";

/** SNS alert topic (email when z > 2 / band breach) — created first so the API stack can publish to it. */
export class AlertsTopicStack extends Stack {
  readonly topic: sns.Topic;
  constructor(scope: Construct, id: string, props: StackProps & { alertEmail?: string }) {
    super(scope, id, props);
    this.topic = new sns.Topic(this, "Alerts", { topicName: "energy-truth-alerts", displayName: "ENERGY TRUTH alerts" });
    if (props.alertEmail) this.topic.addSubscription(new subs.EmailSubscription(props.alertEmail));
    new CfnOutput(this, "AlertsTopicArn", { value: this.topic.topicArn });
  }
}

/** EventBridge schedule: daily alert evaluation (plan §8.3 item 6). Data refresh runs from `make pipeline`. */
export class OrchestrationStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps & { scheduleFn: lambda.IFunction }) {
    super(scope, id, props);
    const rule = new events.Rule(this, "DailyAlerts", { schedule: events.Schedule.rate(Duration.days(1)), description: "Re-evaluate ENERGY TRUTH alert rules" });
    rule.addTarget(new targets.LambdaFunction(props.scheduleFn, { retryAttempts: 1 }));
  }
}
