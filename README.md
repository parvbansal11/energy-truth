# ENERGY TRUTH

**Outside-in audit of Indian companies' reported energy carbon.** Companies self-report Scope 1 (fuel burned) and Scope 2 (electricity bought) in their SEBI BRSR filings, and lenders take those numbers at face value. ENERGY TRUTH rebuilds them from independent public data (plant inventories, ownership graphs, grid fuel mix, satellites), fuses the two with explicit uncertainty, forecasts with Chronos-2, and links every number to its evidence.

> WeMakeDevs × AWS Environmental Hacks · Waste & Energy track. Product plan: [`docs/ENERGY_CARBON_PLATFORM_PLAN.md`](docs/ENERGY_CARBON_PLATFORM_PLAN.md) · Process: [`AGENTS.md`](AGENTS.md) · Status: [`PROGRESS.md`](PROGRESS.md)

## What it shows (real data, FY2024-25)

| Company | Reported S1 (BRSR) | Independent rebuild | z | Verdict | Coverage |
|---|---|---|---|---|---|
| NTPC (standalone) | **327.0 Mt** (p.17) | 361.1 ± 21.8 Mt | +1.43 | Watch | 41 CT-linked / 308 GEM units; 97% of in-boundary emitters |
| Tata Steel (consolidated) | **78.0 Mt** (p.47) | 30.8 ± 9.1 Mt | −4.42 | **Inconclusive: low coverage** | 20 / 109; IJmuiden, NINL, Thailand plants missing from CT |
| Tata Power (standalone) | 41.35 Mt (p.33) | 24.5 ± 2.2 Mt | −2.56 | Significant gap | 100% of matched emitters |
| Reliance (standalone) | 36.46 Mt (p.36) | 22.6 ± 24.6 Mt | −0.55 | Inconclusive: low coverage | 0% of owned emitting GEM locations matched to a CT estimate |
| Jindal Steel (standalone) | 21.49 Mt (p.21) | 56.0 ± 9.9 Mt | +3.46 | Significant gap | 85% |
| Indian Oil (standalone) | 21.24 Mt (p.37) | 23.6 ± 4.3 Mt | +0.51 | Consistent | 100% |
| JSW Energy (standalone) | 20.52 Mt (p.33) | 15.2 ± 1.2 Mt | −3.82 | Significant gap | 100% |
| ACC (standalone) | 13.49 Mt (p.32) | 10.7 ± 4.5 Mt | −0.60 | Inconclusive: low coverage | 59% |

**25 companies** in total across power, steel, cement, aluminium/metals and oil & gas: every one has an independent rebuild from Climate TRACE plants weighted by the GEM ownership graph; the 7 above (plus NTPC/Tata) also have a page-cited BRSR figure. The rest show "no filing" instead of any guessed number, and any company can be **added live** from the UI.

- NTPC's Climate TRACE owner-sum for CY2024 is **368.43 Mt** (unweighted). The rebuild above is FY-aligned and ownership-weighted.
- NTPC Scope 2 rebuild (89,381 MWh × CEA 0.727) = **64,979.66 t**, identical to the filing.
- **Chronos-2 backtest** (All-India coal generation, 24 rolling origins): WQL **0.029** with energy covariates vs 0.041 univariate vs 0.051 seasonal naive, with 85% coverage of the 80% interval.
- **Band breach:** NTPC's FY2025-26 BRSR (309.0 Mt) falls outside the scaled Chronos band (311.5–316.3 Mt).

## Product surfaces

**New:** plant breakdown with toggles (leave a plant out and the Scope 1 fusion, z-score and verdict recompute instantly) · Compare page (reported vs rebuilt scatter + ranked z) · live **Add a company** (GEM search → optional BRSR link → the EC2 worker rebuilds it in ~1 minute) · 2023–2025 year switch · sector search.

Map home (plants sized by CO₂e, coloured by gap or fuel, ring = coverage, hollow = owned but no estimate, 3D columns) · Energy Carbon Scorecard · Plant Energy Detail (+ Sentinel-2) · Agent Audit Console (LangGraph, live stream, HITL, cited narrative) · Evidence Drawer · Grid Intensity Desk · What-if Energy Switch · Alerts Inbox · Report Studio (PDF) + Strands Judge Agent · Methodology / Provenance · `/eval/chronos`.

## Architecture

```mermaid
flowchart LR
  subgraph Sources [Public sources]
    BRSR[BRSR PDFs]
    CT[Climate TRACE v7]
    GEM[GEM ownership API]
    POS[POSOCO / CEA via R. Andrew]
    CEA[CEA EF V20]
    GIBS[NASA GIBS]
    S2[Sentinel-2 STAC]
  end
  subgraph Pipeline [make pipeline]
    CON[connectors + evidence ledger]
    ER[entity resolution\nexact · trigram/Titan · spatial]
    EXT[BRSR extraction\nrules + Bedrock Nova]
    FUS[estimators + inverse-variance fusion]
    CHR[Chronos-2 T1–T4\nlocal CPU / SageMaker]
  end
  subgraph AWS
    S3[(S3 raw / curated / reports)]
    DDB[(DynamoDB x8)]
    API[API Gateway HTTP + WebSocket\nLambda: FastAPI + LangGraph]
    BR[Bedrock Nova + Titan]
    SM[SageMaker Chronos-2\n(flag, scale-to-zero)]
    EB[EventBridge -> SNS alerts]
    CW[CloudWatch dashboard + alarms]
    AMP[Amplify: React + MapLibre + deck.gl]
    COG[Cognito]
  end
  Sources --> CON --> ER --> FUS
  CON --> EXT --> FUS
  CON --> CHR --> FUS
  FUS --> S3 & DDB
  AMP <--> API
  API --> S3 & DDB & BR & SM
  EB --> API
  API --> CW
  COG --> AMP
```

**Agent graph (LangGraph, plan §8.2):** Resolver → {DisclosureExtractor, AssetEnergyEstimator} → GridScope2Agent / SatelliteEnergyVerifier → ChronosForecaster → FusionUncertainty → AuditorExplainer (citation lock) → ReportGenerator. The Resolver pauses for human review when an entity match scores below 0.75. A **Strands Agents SDK** judge agent wraps the same tools.

```
apps/web            React 19 + Vite + Tailwind v4 + MapLibre (AWS terrain tiles) + deck.gl · Geist fonts · landing + sign-in + analyst console
apps/api            FastAPI app (HTTP + WebSocket) · Lambda handlers via Mangum
packages/core       config, evidence ledger, cached fetch, S3/DynamoDB store
packages/connectors Climate TRACE, GEM, Robbie Andrew, CEA, GIBS, STAC, BRSR, entity resolution
packages/fusion     estimators, fusion, FY alignment, pipeline (P1–P4)
packages/chronos    backtest, features, local/SageMaker inference
packages/agents     LangGraph graph, tools, narrator, report PDF, what-if, alerts, Strands judge
infra               CDK: Data · Auth · Ai · Alerts · Api · Orchestration · Monitoring · Frontend
data/raw            cached source payloads + PDFs (sha256 in *.meta.json)   data/curated  pipeline output
```

## Run locally

```bash
make install        # python3.12 venv, npm workspaces, playwright chromium
make pipeline       # cached sources -> curated tables (ARGS=--refresh re-fetches everything)
make dev            # API :8000 + web :5173  ->  open http://localhost:5173
```

Try it: click **Audit NTPC**, choose *Include* at the human-review step, watch the nodes stream and the plants light up, open a citation, then download the PDF. Press **⌘K** to jump to any plant.

Tests:

```bash
make test           # pytest (fusion hand cases, connector contracts, BRSR golden files, Chronos, agents, API) + typecheck + build + cdk synth
make e2e            # Playwright golden path (needs `make dev` running)
ET_LIVE=1 make test-py   # also run live API smoke tests
```

## Running on AWS today

| Service | What it does |
|---|---|
| **EC2** (t3.xlarge, `EnergyTruthCompute`) | FastAPI + WebSocket agent stream, Chronos-2 on CPU, local Ollama model, live add-company worker; HTTPS via Caddy + Let's Encrypt |
| **Amplify Hosting** | the React site, built from `main` |
| **Lambda + API Gateway** (HTTP + WebSocket) | serverless copy of the API (fallback) and the daily alert evaluation |
| **S3** · **DynamoDB** | raw evidence cache, curated tables, PDF reports · Company/Asset/Estimate/Alert rows |
| **Cognito** | sign-in |
| **Secrets Manager** | AI keys (`energy-truth/prod`), read at runtime |
| **EventBridge** · **SNS** · **CloudWatch** | daily alert schedule · alert email · dashboard + alarms |
| **Bedrock** (Nova) · **Strands Agents SDK** | first choice for the narrator/extractor/judge once the account's Bedrock quota is granted; the Strands judge runs on Bedrock or Gemini |

AI chain: Bedrock → Gemini → a free local model on the EC2 box (Ollama) → deterministic templates. Every AI output is citation-locked to the evidence.

## Deploy on AWS

1. Complete **AGENTS.md Step 1** (account, budget, IAM profile, Bedrock access, `.env`). Then run `make preflight`.
2. Run `make deploy`. It bundles the Lambda (no Docker needed), deploys every stack, writes outputs into `.env`, and uploads the curated data and evidence cache.
3. Amplify: create the Secrets Manager secret `energy-truth/github-token`, set `AMPLIFY_REPOSITORY`, then `make deploy` again. The first production publish is a STOP point.
4. Optional, and billed hourly: `make deploy-chronos APPROVED=1` creates a SageMaker JumpStart Chronos-2 endpoint that scales to zero. Remove it with `make teardown-ml YES=1`. OpenSearch only deploys with `cdk deploy -c deployOpenSearch=true`.
5. EC2 backend (billed hourly, team-approved): `cd infra && npx cdk deploy EnergyTruthCompute -c deployEc2=true`, then `python scripts/ec2_release.py` to ship code (and AI keys to Secrets Manager) and `python scripts/configure_amplify.py --release` to point the site at it.
6. Run `make cost-check` before and after recording.

## Data sources & attribution

Climate TRACE (attribution required) · Global Energy Monitor Ownership Tracker (CC BY 4.0) · Robbie M. Andrew, India energy data from Grid-India/POSOCO and CEA (CC BY 4.0) · Central Electricity Authority CO₂ Baseline Database V20 · NASA EOSDIS GIBS · Copernicus Sentinel-2 via Element84 Earth Search · geoBoundaries IND ADM1 (CC BY 2.5 IN, DataMeet/ECI) · Esri basemaps · company BRSR filings (NTPC, Tata Steel, Tata Power, Reliance, Jindal Steel, Indian Oil, JSW Energy, ACC) · sslip.io (free DNS for the EC2 HTTPS name). See [`docs/DATA_ATTRIBUTION.md`](docs/DATA_ATTRIBUTION.md).

*An independent public-data audit, not an assurance opinion. A gap between two totals does not prove misreporting. The app says when coverage, boundary or period don't line up.*
