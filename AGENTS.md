# AGENTS.md — ENERGY TRUTH: How we implement it

> **Read this first, every session.**
> This file is the **process**: who does what, in what order, and how work gets checked.
> The **product** (what we're building, data sources, math, architecture, phases P0–P8) is in
> `docs/ENERGY_CARBON_PLATFORM_PLAN.md`. That plan is the source of truth for *what*.
> This file is the source of truth for *how*.
>
> Companion docs: `docs/UNIFIED_COMPANY_CARBON_MODEL.md`, `docs/carbon_coverage.csv`.
> Hackathon: WeMakeDevs × AWS Environmental Hacks, Waste and Energy track. Ends **Sunday 11 Oct 2026**
> (confirm the exact submission time on https://www.wemakedevs.org/aws/env).

---

## The 3 steps at a glance

| Step | Who | What | Output |
|---|---|---|---|
| **1. Manual AWS setup** | Human (team) | Account, credits, IAM, Bedrock access, quotas, budgets, Amplify | Filled `.env` + verified access |
| **2. Autonomous implementation** | Codex | Build P0 → P8 from the plan, phase by phase, with checks | Working deployed app + `PROGRESS.md` |
| **3. Review** | Human (team), helped by Codex | Verify numbers, usability, cost, security, video | Submission-ready project |

Steps overlap: Step 3 review happens **after every phase**, not only at the end.

---

# STEP 1 — Manual AWS work (human only)

Codex must **not** do these. They involve billing, root credentials, and console clicks.
Do them in order. Tick each box. Every step ends with an **Output** that goes into `.env`.

Region for everything: **`us-east-1`** (Bedrock models + SageMaker JumpStart Chronos-2).

### 1.A Account and credits
- [ ] Create or log in to the AWS account. Activate the Free Tier / up to $200 credits (per the hackathon page).
- [ ] Enable **MFA on the root user**. Never use root after this.
- [ ] Billing → **Budgets** → create a cost budget of **$50** with email alerts at 50%, 80%, and 100%.
- [ ] Billing → **Cost allocation tags** → activate the tag key `Project` (all resources get `Project=energy-truth`).
- **Output:** `AWS_ACCOUNT_ID=…`, `AWS_REGION=us-east-1`

### 1.B IAM for the coding agent
- [ ] Create IAM user `energy-truth-admin` (or an IAM Identity Center user).
- [ ] Attach `AdministratorAccess` for hackathon speed, **or** a scoped policy covering: S3, DynamoDB, Lambda, API Gateway, Amplify, Cognito, Bedrock, SageMaker, IAM PassRole (scoped), EventBridge, SNS, CloudWatch, Location, OpenSearch Serverless, Secrets Manager, CloudFormation.
- [ ] Create an access key, **or** set up `aws sso login` with a profile.
- [ ] On the laptop: `aws configure --profile energy-truth`
- [ ] Verify: `aws sts get-caller-identity --profile energy-truth` returns your account ID.
- **Output:** `AWS_PROFILE=energy-truth`, `CDK_DEFAULT_ACCOUNT=…`, `CDK_DEFAULT_REGION=us-east-1`

### 1.C Bedrock model access
- [ ] Console → Bedrock (us-east-1) → **Model access**. Enable: Amazon **Nova Pro**, **Nova Lite**, **Titan Text Embeddings V2**. If the console no longer has a Model access page, models are enabled on first use. Confirm with the test below.
- [ ] Copy the **exact model IDs** shown in the console (they can differ from the defaults below).
- [ ] Verify:
  ```bash
  aws bedrock list-foundation-models --region us-east-1 --by-provider amazon --profile energy-truth \
    --query "modelSummaries[].modelId"
  ```
- **Output:** `BEDROCK_TEXT_MODEL_ID`, `BEDROCK_FAST_MODEL_ID`, `BEDROCK_EMBED_MODEL_ID`

### 1.D SageMaker quota for Chronos-2
- [ ] Service Quotas → Amazon SageMaker → search `ml.g5.xlarge for endpoint usage` → request **1** if it shows 0.
- [ ] Also check `ml.c5.2xlarge for endpoint usage` (CPU fallback).
- [ ] Note: approval can take hours to days. **Do not wait for it.** Phase P4 has a local-CPU fallback.
- **Output:** `CHRONOS_JUMPSTART_MODEL_ID=pytorch-forecasting-chronos-2`, `CHRONOS_INSTANCE_TYPE=ml.g5.xlarge` (or the CPU type if the GPU is denied)

### 1.E Cognito
- [ ] Create User Pool `energy-truth-users` + App Client (public SPA, **no client secret**).
- [ ] Create one demo user for the judges' video.
- **Output:** `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_REGION=us-east-1`
- (Codex may instead create this in CDK in P0. If so, skip here and fill from CDK outputs.)

### 1.F GitHub + Amplify
- [ ] Create the GitHub repo `energy-truth` (private until submission).
- [ ] Amplify Hosting → connect the repo, branch `main`, app root `apps/web`.
- **Output:** `AMPLIFY_APP_ID`, `FRONTEND_URL`

### 1.G Optional keys
- [ ] NASA FIRMS MAP_KEY (free) → `FIRMS_MAP_KEY`
- [ ] Carbon Mapper token → `CARBON_MAPPER_TOKEN`
- [ ] Amazon Location map resource → `LOCATION_MAP_NAME`
- [ ] Route 53 domain + ACM cert → `CUSTOM_DOMAIN`

### 1.H Secrets hygiene
- [ ] `.env` is in `.gitignore`. Only `.env.example` (no values) is committed.
- [ ] Deployed secrets go into **Secrets Manager** at `energy-truth/prod`. Lambdas read them at runtime.

### 1.I Handoff to Codex (end of Step 1)
Repo layout before starting Codex:
```
energy-truth/
  AGENTS.md                                  ← this file
  docs/ENERGY_CARBON_PLATFORM_PLAN.md        ← the build plan
  docs/UNIFIED_COMPANY_CARBON_MODEL.md
  docs/carbon_coverage.csv
  energy_truth_eval/chronos_backtest_posoco.py   ← existing verified backtest
  energy_truth_eval/chronos_backtest_posoco_result.json
  .env            (gitignored, filled from Steps 1.A–1.G)
  .env.example
  .gitignore
```
Then from the repo folder run `codex` and paste the **Kickoff prompt** from Step 2.

**Step 1 is done when:** `aws sts get-caller-identity` works, a Bedrock test call returns text, the budget alert exists, and `.env` has every value above that is not marked "filled by CDK".

---

# STEP 2 — Autonomous implementation (Codex)

## 2.1 Operating rules for Codex

1. **Plan before code.** At the start of each phase, write a short plan in `PROGRESS.md` (tasks, files, verification), then build.
2. **One phase at a time,** in the order in §2.3. A phase is done only when its **Done when** checks pass, shown with real command output.
3. **Real data only.** Never invent, simulate, or "placeholder" a number that reaches the UI. Every number shown must trace to an `evidence` record (URL, PDF page, API payload hash, tile timestamp). If a source is unreachable, record it in `BLOCKERS.md` and use the fallback listed in the plan (§15, §16).
4. **Cache what you fetch.** Raw API/PDF responses go to `data/raw/` locally and `S3_RAW_BUCKET` remotely, so demos never depend on a flaky live API.
5. **Commit after every working task.** Conventional commits (`feat:`, `fix:`, `data:`, `infra:`). One branch per phase (`p1-ingest`, …), merged to `main` when the phase passes.
6. **Keep these files current:**
   - `PROGRESS.md`: phase status, what works, what's next
   - `DECISIONS.md`: any deviation from the plan and why
   - `BLOCKERS.md`: what's blocked, the fallback used, what a human must do
7. **Use the `.env` values.** Never hardcode account IDs, keys, or model IDs. Never print secrets in logs or commit them.
8. **Tag every AWS resource** `Project=energy-truth`.

## 2.2 STOP points: ask the human before you…
- create anything billed per hour while idle: **SageMaker endpoint**, **OpenSearch Serverless collection**, NAT gateway, Fargate service left running;
- change IAM users/roles outside CDK, or touch billing;
- delete any AWS resource or S3 data;
- deploy to the production Amplify branch for the first time;
- make any change that alters a number the plan already lists as verified (Tata 78 Mt, NTPC 327 Mt, CEA 0.727, backtest table).

Otherwise keep going without asking.

## 2.3 Phase order with "Done when" checks

Phases follow `docs/ENERGY_CARBON_PLATFORM_PLAN.md` §14. Build the **golden path** first, then widen:
**Golden path = "Audit NTPC" works end to end** (scorecard + plants on map + agent stream + forecast band). After P6 the golden path must work before any P7 polish.

### P0 — Foundation
- Monorepo per plan §17. Python (connectors, fusion, agents, API) + React/Vite (web) + CDK (infra).
- CDK stacks per plan §12: data (S3 ×3, DynamoDB tables §9.1), auth (Cognito), api (API Gateway HTTP + WebSocket, Lambda), orchestration (EventBridge, SNS), monitoring. Feature flags `deployChronos=false`, `deployOpenSearch=false` by default.
- Makefile targets: `make test`, `make deploy`, `make teardown`, `make cost-check`.
- **Done when:** `cdk deploy` succeeds; `GET /health` returns 200 from API Gateway; the Amplify URL shows a placeholder page; outputs are written back to `.env`.

### P1 — Ingest and entity graph
- Connectors (plan §5.1): Climate TRACE v7, GEM ownership, Robbie Andrew POSOCO / CEA DGR / India monthly, CEA EF V20, GIBS layer config.
- Load Company, Asset, Ownership tables for `DEMO_COMPANIES`. Compute coverage ρ = CT-linked assets / GEM assets.
- Entity resolution per §5.3 (exact ID match first, then Titan embeddings + spatial).
- **Done when:** for each demo company the asset count, the CT-linked count, and ρ print from DynamoDB; Tata Steel shows ~20 CT-linked vs ~109 GEM; contract tests pass against recorded fixtures.

### P2 — Disclosure extraction
- Fetch BRSR PDFs for demo companies → S3. Bedrock Nova extracts energy consumption, Scope 1, Scope 2, purchased electricity MWh, and assurance status into a strict JSON schema with page numbers.
- **Done when:** extracted Scope 1 for Tata Steel = 78 Mt and NTPC = 327 Mt (matches plan); each field has a page reference; a unit test checks units (t vs Mt) are normalized to tCO₂e.

### P3 — Estimators and fusion
- Scope 1 independent = Σ ownership-weighted CT asset emissions; Scope 2 = BRSR MWh × CEA EF (version-pinned). Inverse-variance fusion and z-scores per plan §5.5. Evidence objects on every estimate.
- **Done when:** `pytest packages/fusion` passes, including hand-computed cases; NTPC independent S1 ≈ 368 Mt; every estimate row has `evidence_ids`; low ρ widens σ and sets a flag.

### P4 — Chronos-2
- Port `energy_truth_eval/chronos_backtest_posoco.py` into `packages/chronos`. Reproduce the verified backtest table (plan §6.5) first.
- Build T3 (grid intensity) and T1/T2 (plant/company) per §6.2, with the `target_construction` tag.
- Inference: **local CPU Chronos-2 by default**, writing forecasts to S3/DynamoDB. SageMaker JumpStart endpoint only behind `deployChronos=true`, after STOP-point approval, with scale-to-zero.
- **Done when:** the backtest reproduces WQL ≈ 0.029 with covariates vs ≈ 0.051 seasonal naive; forecasts with q10/q50/q90 exist for demo companies; the band-breach rule (§6.6) runs.

### P5 — Map UI
- React + MapLibre + deck.gl (plan §7). Plant layer (size = emissions, color = gap, outline = ρ), grid choropleth, GIBS NO₂ + VIIRS DNB layers, Sentinel-2 on plant focus. Scorecard panel and Evidence Drawer.
- **Done when:** on the deployed Amplify URL, selecting NTPC shows its plants, the scorecard numbers match the API, and toggling NO₂ shows real tiles for a recent date.

### P6 — Agent graph
- LangGraph graph per plan §8.2 with the tools listed; streaming via API Gateway WebSocket to the Agent Audit Console; map actions (fly-to, highlight) synced to nodes; HITL pause below `HITL_ENTITY_THRESHOLD`.
- Strands Agents SDK "Judge Agent" wrapping the same tools (AWS open-source credit).
- Citation lock: the narrative may only cite `evidence` in state.
- **Done when:** clicking **Audit NTPC** on the deployed site streams every node live, highlights plants on the map, and ends with a cited narrative. **Golden path complete — tell the human.**

### P7 — Product surfaces
- What-if Scope 2 (§4 item 7), Alerts (EventBridge schedule + SNS email when z > 2), Report Studio PDF to S3, Methodology / Provenance page, Grid Intensity Desk.
- **Done when:** each surface works on at least NTPC and Tata Steel; the PDF opens and every number in it has a citation.

### P8 — Hardening
- CloudWatch dashboard + alarms; scale-to-zero / teardown verified; `/eval/chronos` page with the backtest chart; README with architecture diagram and setup; `.env.example` complete.
- **Done when:** a fresh clone + `.env` + `make deploy` works; `make cost-check` shows no idle billable resources except those approved; the Step 3 checklist is ready for the human.

## 2.4 Testing standard
- **Fusion math:** unit tests with hand-calculated expected values.
- **Connectors:** contract tests on recorded fixtures in `data/fixtures/` + one live smoke test each (skipped if offline).
- **Extraction:** golden-file tests against known BRSR values.
- **API:** integration test hitting the deployed endpoint.
- **Web:** one Playwright smoke test of the golden path.

## 2.5 Cost guardrails
- SageMaker real-time GPU endpoints and OpenSearch Serverless collections **bill per hour even when idle**. Off by default; on only after approval; `make teardown-ml` must delete them.
- If OpenSearch is not approved, use FAISS index files on S3 (plan §9 already lists this fallback).
- `make cost-check` lists running endpoints, collections, Fargate tasks, and month-to-date spend (`aws ce get-cost-and-usage`).

## 2.6 Kickoff prompt (human pastes this into Codex)

```
Read AGENTS.md fully, then docs/ENERGY_CARBON_PLATFORM_PLAN.md fully.
Confirm Step 1 is done by running: aws sts get-caller-identity, a Bedrock test call,
and checking .env against Step 1 outputs. Report anything missing.
Then write the P0 plan into PROGRESS.md and start P0.
Follow §2.1 rules and stop at §2.2 STOP points. After each phase, show the
"Done when" evidence and continue to the next phase.
```

**Resume prompt (any new session):**
```
Read AGENTS.md, PROGRESS.md, DECISIONS.md, BLOCKERS.md. Continue from the current phase.
```

**Phase review prompt (after each phase):**
```
Review phase <Pn> against its "Done when" checks in AGENTS.md. Run every check, show output,
list anything that is not real data or not traceable to evidence, and fix it before moving on.
```

---

# STEP 3 — Review (human, with the agent's help)

## 3.1 After every phase (10 minutes)
- [ ] Read the phase section in `PROGRESS.md`. Did every "Done when" check show real output?
- [ ] Skim `DECISIONS.md` and `BLOCKERS.md`. Do you agree with each deviation?
- [ ] Open the deployed URL (from P0 on). Does it still load?
- [ ] `make cost-check`. Is anything running that shouldn't be?

## 3.2 Numbers audit (the most important review)
One wrong number destroys trust in a "truth" product. Check each against its original source, by hand:

| Number | Expected | Source to open | ✓ |
|---|---|---|---|
| Tata Steel reported Scope 1 | 78 Mt | Tata Steel BRSR PDF, page cited in app | |
| NTPC reported Scope 1 | 327 Mt | NTPC BRSR PDF | |
| NTPC independent Scope 1 | ~368 Mt | Climate TRACE owner sum | |
| Tata CT-linked vs GEM assets | ~20 vs ~109 | CT + GEM APIs | |
| CEA grid factor | 0.727 tCO₂/MWh (FY23-24, V20) | CEA baseline V20 | |
| Chronos backtest WQL | 0.029 vs 0.051 | `chronos_backtest_posoco_result.json` | |
| 3 random plants on the map | match CT values | Click Evidence Drawer → source | |

## 3.3 Judging criteria check
- [ ] **01 Idea and impact:** can you state the problem and user in one sentence? ("Lenders and analysts can't check Indian companies' reported energy carbon. We check it against independent public data, with evidence.")
- [ ] **02 Built on AWS:** list every AWS service actually used and what it does. Strands (AWS open source) is visible in the code.
- [ ] **03 Design and usability:** **stranger test.** Give the URL to someone outside the team with no explanation. Can they audit a company in under 2 minutes? Note where they get stuck and fix it.
- [ ] **04 Execution:** the golden path works 5 times in a row on the deployed URL, in an incognito window.
- [ ] **05 Demo video:** see 3.5.

## 3.4 Security and cost before submission
- [ ] No secrets in git history (`git log -p | grep -iE "aws_secret|AKIA"` returns nothing).
- [ ] Repo made public if required by the rules; `.env.example` present.
- [ ] SageMaker endpoints and OpenSearch collections deleted or scaled to zero after recording.
- [ ] Budget alert still on. Check final spend.

## 3.5 Demo video (3 minutes, no live demo, so this is the whole pitch)
| Time | Show |
|---|---|
| 0:00–0:20 | Problem: companies self-report energy carbon; banks trust it; nobody checks. |
| 0:20–0:50 | Map: NTPC plants, size = emissions, color = gap; toggle NO₂ layer. |
| 0:50–1:50 | **Wow:** click **Audit Tata Steel**. Agent streams each step; the scorecard shows 78 Mt reported vs rebuild + low-coverage warning; open the Evidence Drawer. |
| 1:50–2:20 | Chronos: forecast band; backtest shows covariates cut error ~43%. |
| 2:20–2:45 | AWS architecture slide: Bedrock, SageMaker Chronos-2, Strands, Lambda, S3, DynamoDB, Amplify, EventBridge/SNS. |
| 2:45–3:00 | Who uses it + export the audit report. |

- [ ] Record on the deployed URL, not localhost.
- [ ] Captions on; readable font size; no secrets on screen.
- [ ] Optional: blog post on AWS Builder Center (separate prize).

## 3.6 Submission checklist
- [ ] Deployed URL works in incognito
- [ ] Repo link + README (problem, architecture, setup, data sources and licenses/attribution: Climate TRACE, GEM, Robbie Andrew, NASA EOSDIS, Copernicus)
- [ ] 3-minute video uploaded
- [ ] Submitted **before** the deadline with buffer

---

## Suggested timeline (adjust to the real deadline)

| When | Step |
|---|---|
| Fri night | Step 1 complete; Codex starts P0 |
| Sat morning | P1–P3 (data + numbers) → numbers audit 3.2 |
| Sat afternoon | P4–P5 (Chronos + map) |
| Sat evening | P6 → **golden path working** |
| Sun morning | P7–P8 as time allows → Step 3 review → record video |
| Sun (well before deadline) | Submit |

**Cut line:** if the golden path is not working by Saturday night, stop starting new phases. Finish P6, harden it, record. A working core beats unfinished extras.
