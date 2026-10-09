import { App, Tags } from 'aws-cdk-lib';
import { FoundationStack } from '../lib/foundation-stack';
const app = new App();
for (const flag of ['deployChronos', 'deployOpenSearch']) {
  if ([true, 'true'].includes(app.node.tryGetContext(flag))) throw new Error(`${flag} is unsupported in P0; keep idle compute disabled.`);
}
new FoundationStack(app, 'EnergyTruthFoundation', { env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION || 'us-east-1' } });
Tags.of(app).add('Project', 'energy-truth');
