# Decisions

- 2026-10-09: Start local P0 in this fresh workspace; AWS access is not established. Do not mark deployment acceptance checks complete.
- User deferred map implementation. Record design only; prioritize factory ownership and evidence contracts in P1.
- PROJECT_CONTEXT.md and AGENTS.md override the older plan's endpoint default: local CPU Chronos, no idle compute.
- Foundation uses one CDK stack for retained data, Cognito and public read-only status routes. Split stacks, WebSocket orchestration, schedules, alarms and frontend provisioning remain P0 follow-ups.
- Company names are configured demo targets, not ingested corporate identities. Scorecards contain no emissions or evidence until ingestion.
- Source documents' numerical claims are not loaded as production data. Referenced source PDFs/backtest artifacts were not attached.
- Uniform DynamoDB pk/sk attribute names map to logical keys in the plan; table names come from outputs rather than an assumed prefix.
- No Sites hosting provisioned: retain the expressly selected AWS Amplify architecture. Local frontend shell only in this increment.
- Map design correction: company BRSR discrepancy is not evidence of any individual factory's discrepancy. Use evidence-availability colors until plant-level comparisons exist.
