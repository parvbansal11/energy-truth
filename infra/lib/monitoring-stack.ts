import { Duration, Stack, StackProps } from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as gateway from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";

export interface MonitoringProps extends StackProps {
  fns: lambda.IFunction[];
  httpApi: gateway.HttpApi;
  alertsTopic: sns.ITopic;
  budgetEmail?: string;
  budgetUsd: number;
}

/** CloudWatch dashboard + alarms and a cost budget (AGENTS.md §2.5). */
export class MonitoringStack extends Stack {
  constructor(scope: Construct, id: string, props: MonitoringProps) {
    super(scope, id, props);
    const dash = new cw.Dashboard(this, "Dashboard", { dashboardName: "energy-truth" });
    const p = { period: Duration.minutes(5) };
    dash.addWidgets(
      new cw.GraphWidget({ title: "Lambda invocations", left: props.fns.map((f) => f.metricInvocations(p)), width: 8 }),
      new cw.GraphWidget({ title: "Lambda errors", left: props.fns.map((f) => f.metricErrors(p)), width: 8 }),
      new cw.GraphWidget({ title: "Lambda duration p90", left: props.fns.map((f) => f.metricDuration({ ...p, statistic: "p90" })), width: 8 }),
      new cw.GraphWidget({
        title: "HTTP API 4xx / 5xx / latency",
        left: [props.httpApi.metricClientError(p), props.httpApi.metricServerError(p)],
        right: [props.httpApi.metricLatency({ ...p, statistic: "p90" })],
        width: 24,
      }),
    );
    for (const f of props.fns) {
      new cw.Alarm(this, `${f.node.id}Errors`, {
        metric: f.metricErrors(p),
        threshold: 3,
        evaluationPeriods: 1,
        treatMissingData: cw.TreatMissingData.NOT_BREACHING,
        alarmDescription: `Errors in ${f.node.id}`,
      }).addAlarmAction(new cwActions.SnsAction(props.alertsTopic));
    }
    new cw.Alarm(this, "Api5xx", { metric: props.httpApi.metricServerError(p), threshold: 5, evaluationPeriods: 1, treatMissingData: cw.TreatMissingData.NOT_BREACHING })
      .addAlarmAction(new cwActions.SnsAction(props.alertsTopic));

    if (props.budgetEmail) {
      new budgets.CfnBudget(this, "Budget", {
        budget: { budgetName: "energy-truth", budgetType: "COST", timeUnit: "MONTHLY", budgetLimit: { amount: props.budgetUsd, unit: "USD" }, costFilters: { TagKeyValue: ["user:Project$energy-truth"] } },
        notificationsWithSubscribers: [50, 80, 100].map((t) => ({
          notification: { comparisonOperator: "GREATER_THAN", notificationType: "ACTUAL", threshold: t, thresholdType: "PERCENTAGE" },
          subscribers: [{ subscriptionType: "EMAIL", address: props.budgetEmail! }],
        })),
      });
    }
  }
}
