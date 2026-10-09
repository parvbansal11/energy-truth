# Blockers — what a human must do

## 1. AWS Step 1 (blocks every deployed "Done when" check)
- No AWS CLI, credentials, profile or `.env` exist on this machine. Complete AGENTS.md 1.A–1.H, copy `.env.example` → `.env`, then run `make preflight`. It needs only boto3, not the CLI.
- **Fallback in use:** everything runs locally. The API, agent stream, forecasts and PDFs work without AWS.

## 2. Bedrock access (Step 1.C)
- Nova extraction, the Nova narrator, Titan entity embeddings and the Strands judge agent are coded but **not exercised**.
- **Fallback in use:** the deterministic BRSR parser (golden-tested), the citation-locked template narrator, and trigram name similarity. The UI shows which engine ran.

## 3. SageMaker Chronos-2 endpoint (STOP point)
- `make deploy-chronos APPROVED=1` needs a human decision plus the g5 or CPU quota (Step 1.D).
- **Fallback in use:** Chronos-2 on local CPU. Forecasts are stored in `data/curated/forecasts.json` and `scorecards.json`.

## 4. Amplify (Step 1.F)
- Needs a GitHub repo, the Secrets Manager secret `energy-truth/github-token`, `AMPLIFY_REPOSITORY`, and approval for the first production publish.

## 5. Data gaps
- **BRSR for UltraTech, JSW Steel and Adani Power is not ingested** (P2's scope is Tata + NTPC). Their scorecards show the independent rebuild only. To add one, append its filing to `packages/connectors/et_connectors/registry.py` and re-run `make pipeline`.
- **Tata Steel FY2025-26 BRSR is not ingested**, so there is no Tata band-breach check yet.
- **CEA V21/V22 factors are login-walled.** V20 (0.727) is pinned and flagged `EF_YEAR_MISMATCH` for FY2024-25.
- **The FIRMS MAP_KEY is absent**, so the thermal-anomaly layer is not shipped (plan §15 fallback).
- **One low-score entity match each** for NTPC (Barauni, unmatched) and Tata (four iron-ore mines) awaits human review. The agent pauses on them by design.
