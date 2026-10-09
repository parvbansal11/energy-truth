# Progress

## P0 — foundation in progress

User authorized starting the build while deferring map implementation.

Plan:
1. Scaffold React/Vite/TypeScript frontend and Python API with shared response contracts.
2. Add AWS CDK data/auth/HTTP API foundation, with no idle compute services.
3. Add environment template, local development commands, AWS preflight and read-only cost inspection.
4. Verify API contracts, frontend build and CDK synthesis locally.

Files: apps/web, apps/api, packages, infra, scripts, tests, .env.example, Makefile, README.md, DECISIONS.md, BLOCKERS.md.

P0 completion requires deployed API health, Amplify URL and CDK outputs. Those checks remain pending. AWS CLI is unavailable here; AWS setup is not established. Local work proceeds without declaring P0 complete.

Map proposal will be recorded in docs/MAP_DESIGN.md; no map dependencies, layers, or map UI will be implemented in this increment.

## Local increment verified — 2026-10-09 IST

- React/Vite company workspace implemented; five configured demo targets, empty scorecards and disabled audit execution.
- Python API implemented with shared local FastAPI/Lambda response logic.
- CDK foundation synthesizes: 3 private S3 buckets, 8 DynamoDB tables, Cognito, Lambda, HTTP API and logs. Data resources retained; idle compute absent.
- npm dependencies locked in package-lock.json; installed Python dependencies pinned in apps/api/requirements-lock.txt.
- Map design documented only in docs/MAP_DESIGN.md.

Verification:
```text
python -m unittest discover -s tests -v
Ran 3 tests — OK
npm run typecheck
web tsc --noEmit — passed
infra tsc --noEmit — passed
npm run build
29 modules transformed; built in 331ms
npm run synth
exit 0; CloudFormation template generated
Template inspection
3 S3 buckets + 8 DynamoDB tables; retained and tagged
No SageMaker endpoint/OpenSearch collection/NAT gateway/ECS service
GET http://127.0.0.1:8000/health
200 {"status":"ok","service":"energy-truth-api","phase":"P0","data_ready":false}
GET http://127.0.0.1:5173/api/companies
200; five configured targets with readiness=not_ingested
GET http://127.0.0.1:8000/companies/TATASTEEL/scorecard
200; estimates=[] and evidence=[]
GET http://127.0.0.1:5173/
200; frontend HTML served
```

The in-app computer-use browser blocked localhost; rendered browser QA and interactive selection testing are not verified. A preview opening was queued through open_in_codex. The initial sandbox build stalled; the build succeeded with approved process access. No AWS resources were deployed. P0 remains in progress; do not begin P1 under the phase acceptance rules until P0 deployment prerequisites and remaining foundation work are resolved.
