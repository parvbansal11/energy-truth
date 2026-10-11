# Progress

## 2026-10-11 · Deployed on AWS, 25 companies, live add, interactive analysis
- **Live:** site on Amplify (`https://main.d3txtcxpzzsi8p.amplifyapp.com`) calling the EC2 backend (`https://52-203-18-31.sslip.io`, t3.xlarge, Caddy TLS). The Lambda + API Gateway API (`https://3n5w9upgdd.execute-api.us-east-1.amazonaws.com`) stays as fallback. S3/DynamoDB/Cognito/Secrets Manager/EventBridge/SNS/CloudWatch deployed by CDK.
- **Golden path on EC2:** `wss://52-203-18-31.sslip.io/ws` audit of NTPC → 9/9 nodes, PDF report.
- **AI:** Bedrock quota is 0 (support case open), so Gemini (`gemini-3.5-flash`) answers; local Ollama and templates behind it. Strands judge verified on Gemini with tool calls.
- **Data:** 25 companies, 717 plants; reported Scope 1 now for 8 companies (NTPC, Tata Steel, Tata Power, Reliance, Jindal Steel, IOC, JSW Energy, ACC). Verified numbers unchanged (NTPC 327.0 / 361.1 / z 1.43; Tata 78.0 / 30.8 / −4.42).
- **Tests:** pytest 34 passed, 5 skipped; Playwright 4/4 against local dev.

Branch `build/plan-end-to-end` implements plan phases P0–P8 on real data, locally verified (2026-10-10 IST).
AWS deployment is blocked on the human Step 1 (no AWS CLI, credentials or `.env` on this machine; see BLOCKERS.md).
The earlier GPT session's demo (commit `7c64bd1`) was a browser-only Climate TRACE viewer; this branch replaces it with the full plan.

| Phase | Status | Evidence |
|---|---|---|
| P0 Foundation | **Code done; deploy pending Step 1** | 7 CDK stacks synthesize (`make synth`); Lambda bundle 211 MB (`make lambda-bundle`); `GET /health` → 200 locally |
| P1 Ingest & entity graph | **Done (local)** | 5 companies, 267 assets, 208 evidence records; Tata 20 CT / 109 GEM (ρ 0.18); NTPC CT CY2024 = 368.43 Mt |
| P2 Disclosure extraction | **Done (rules engine); Bedrock path coded, unverified** | Tata S1 consolidated 78 Mt (p.47), NTPC 326.96 Mt (p.17); unit tests on Indian grouping / Mt / TJ / PJ |
| P3 Estimators & fusion | **Done** | `pytest packages/fusion`: 9 hand-computed cases pass; every estimate row has `evidence_ids`; low ρ widens σ + flag |
| P4 Chronos-2 | **Done (local CPU)** | Backtest reproduced: WQL 0.029 / 0.041 / 0.051; T1 (61+ plants), T2 rollups, T3 grid (India + 5 regions), T4 multivariate; band rule fires for NTPC FY2025-26 |
| P5 Map UI | **Done (local)** | MapLibre + deck.gl; GIBS NO₂ 2026-10-08 and VIIRS DNB 2026-10-09 tiles probed; Sentinel-2 on plant focus |
| P6 Agent graph | **Done (local)** — golden path works | "Audit NTPC" streams 9/9 nodes over WebSocket, HITL pause/resume, map highlights, cited narrative, PDF; Playwright passes |
| P7 Product surfaces | **Done (local)** | What-if Scope 2, Alerts (+ EventBridge/SNS in CDK), Report Studio PDF, Methodology, Grid Intensity Desk |
| P8 Hardening | **Done except deployed checks** | CloudWatch dashboard + alarms + $50 budget in CDK; `/eval/chronos`; README; `.env.example`; cost-check/teardown scripts |

## Verification output (local, 2026-10-10)

```text
make pipeline
  NTPC        S1 ind 361.1 ± 21.8 Mt | rep 327.0 | z 1.43 | Watch | rho 0.133 rho_eff 0.97 | band FY2025-26 311.5-316.3 rep 309.0 breach=True
  TATASTEEL   S1 ind  30.8 ±  9.1 Mt | rep  78.0 | z -4.42 | Inconclusive — low coverage | rho 0.183 rho_eff 0.73
  ULTRACEMCO  S1 ind  60.3 ± 31.0 Mt | no disclosure ingested | rho 0.346 rho_eff 0.49
  JSWSTEEL    S1 ind  36.8 ±  8.3 Mt | no disclosure ingested | rho 0.125 rho_eff 0.81
  ADANIPOWER  S1 ind  78.6 ±  5.5 Mt | no disclosure ingested | rho 0.092 rho_eff 1.00
python -m et_chronos.backtest
  seasonal_naive wql 0.0514 · univariate 0.0409 (cov 77.8%) · covariates 0.029 (MAPE 4.83%, cov 84.7%) · -43.6% vs naive
pytest -q                       34 passed, 5 skipped (live/deployed) ; ET_LIVE=1 -k live → 4 passed
npm run typecheck / build       ok (web + infra)
cdk synth                       Data, Auth, Ai, Alerts, Api, Orchestration, Monitoring (Frontend when AMPLIFY_REPOSITORY set)
playwright (golden path)        2 passed — Audit NTPC 9/9 + cited narrative + evidence drawer p.17; Tata low-coverage verdict
```

Browser walkthrough (desktop 1440×900, mobile 375×812, dark + light): map, scorecard, audit stream with HITL, citations → evidence drawer, plant detail with Sentinel-2, grid desk, what-if, alerts, eval, reports.

## Next (human)
1. AGENTS.md Step 1 → `make preflight` → `make deploy` → `make publish-data`. Then rerun the P0/P5/P6 "Done when" checks on the deployed URL.
2. Run the Step 3.2 numbers audit by hand against the cited PDF pages.
3. Approve or decline the SageMaker endpoint (`make deploy-chronos APPROVED=1`). Local CPU forecasts are already stored.
