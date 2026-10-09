# Blockers

## Deployment prerequisites
AWS CLI is not installed in the current shell. No .env was provided. AWS identity, Bedrock invocation, budgets, quota and Amplify setup have not been verified. Human account setup is defined in AGENTS.md Step 1. Do not paste access keys into chat.

## Evidence prerequisites
UNIFIED_COMPANY_CARBON_MODEL.md, carbon_coverage.csv, source BRSR PDFs and the existing Chronos backtest script/results are referenced but absent. Ingestion may fetch public evidence later; matching prior verified results requires their originals.

## Remaining P0 checks
CDK deployment, real API Gateway GET /health, Amplify hosting and outputs-to-.env are pending. WebSocket API, orchestration/monitoring and auth UI remain unimplemented. Current API serves only public metadata and readiness, no private data.

## Interactive demo status
The map/review/brief browser demo now runs without AWS. Cloud auth, live agent orchestration, BRSR reconciliation and Chronos forecasts remain outside this demo. Satellite basemap tiles are context imagery, not emissions evidence. Original cached source files and hashes ship with the frontend.
