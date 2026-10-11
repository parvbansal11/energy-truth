# Decisions (deviations and modelling choices)

## Scope and process
- **All phases were built locally before any AWS deploy.** No AWS CLI, credentials or `.env` exist on this machine, so P0's deployed checks wait for the human Step 1. Each phase still has passing local checks. Commits use phase-prefixed messages on one branch (`build/plan-end-to-end`) rather than a branch per phase.
- **The previous demo UI (GPT session, commit `7c64bd1`) was replaced** by a Tailwind v4 + MapLibre + deck.gl app that implements every plan §4 surface. The user asked for CSS animations and Tailwind. 3D uses deck.gl ColumnLayer, which plan §7.3 ships; photoreal 3D and particles stay out, as the plan rules.
- **Two of the plan's companion files were not supplied.** For the Chronos backtest script, `et_chronos/backtest.py` was rebuilt from the plan §6.5 protocol and reproduces the verified table exactly. `UNIFIED_COMPANY_CARBON_MODEL.md` and `carbon_coverage.csv` are absent and nothing depends on them.

## Numbers listed as verified in the plan
- **Tata Steel 78 Mt** = consolidated Scope 1, FY2024-25 (BRSR, PDF page 47). The same filing restates FY2023-24 as 77 Mt.
- **NTPC 327 Mt** = standalone Scope 1, FY2024-25: 32,69,59,946.44 t (PDF page 17). NTPC's FY2025-26 BRSR reports 309.0 Mt; it feeds the band-breach rule.
- **NTPC "~368 Mt"** = the Climate TRACE CY2024 owner-sum, unweighted: 368.43 Mt, shown as `ct_owner_sum_cy_t`. The fused independent value (361.1 Mt) is FY-aligned and boundary-weighted, so it is a different quantity. The verified number is not altered.
- **CEA 0.727** is pinned from V20. Cross-check: NTPC's printed Scope 2 equals its electricity × 0.727 exactly.

## Method choices (recorded so a reviewer can disagree)
- **Boundary-matched weights.** The *standalone* boundary uses GEM direct share. The *consolidated* boundary uses an operational-control proxy: effective share ≥ 50% counts 100%, and JVs are excluded, matching Tata's stated basis of JVs in Scope 3 cat. 15. Equity share is stored as an alternative. Unmatched CT sources get w = 1 with an `OWNERSHIP_WEIGHT_ASSUMED` flag.
- **Coverage.** ρ = CT-linked assets / GEM units, as the plan defines it. ρ_eff = in-boundary operating emitting GEM locations matched to a CT source / all such locations. ρ_eff drives σ widening, the LOW_COVERAGE flag (< 0.8), and the "inconclusive" verdict override.
- **σ_ind** = per-asset CT confidence (very high 5%, high 10%, medium 20%, low 35%, very low 50%) ⊕ a 5% method floor ⊕ (1 − ρ_eff)·E.
- **σ_rep** = assurance level (reasonable 3%, limited/unspecified 7%, none 15%) ⊕ printed rounding. Limited-level σ applies when assurance covers another boundary.
- **FY alignment.** CT calendar-year totals are spread monthly with activity profiles (POSOCO regional coal/gas; India steel/cement/coal indices). The FY value is the Apr–Mar sum. Tag: `target_construction=calibrated_capacity_mix:*`.
- **Grid intensity (T3)** = CEA EF × monthly fossil share / FY2023-24 mean fossil share. It is an index, labelled as such. Regional series use the national calibration.
- **Band-breach "scaled" band** = observed months plus forecast quantile sums, multiplied by the previous FY's reported/independent ratio. This removes a constant boundary offset before checking year-over-year consistency.
- **Scope 2 MWh** comes from BRSR P6 Q1 row D ("total non-renewable electricity") as the purchased-power proxy, flagged `MWH_FROM_TOTAL_CONSUMPTION`. Consolidated boundaries with non-Indian operations add `EF_GEOGRAPHY_MISMATCH`.
- **Map colour = company-level gap z**, the same for all of a company's plants. BRSR is filed per company, so no plant-level gap is invented. The legend says so.

## Engineering
- **BRSR extraction defaults to the deterministic rules engine.** Bedrock Nova runs as a second engine when credentials exist. Its values must literally appear on the cited page, and any disagreement is surfaced.
- **Narrator.** Without Bedrock, a template renders the same cited facts. In both cases the citation lock drops sentences with uncited or unknown evidence, or numbers absent from the facts.
- **The Strands judge agent needs Bedrock.** Without it the API says so rather than faking an answer.
- **HITL on AWS.** Lambda has no cross-invocation checkpoint, so a WebSocket "resume" re-runs the deterministic graph with the analyst's decision supplied up front. Locally, LangGraph `interrupt()` uses InMemorySaver.
- **The Lambda is a zip built from manylinux wheels**, with no Docker; it is 211 MB. torch/Chronos are excluded from Lambda: the API serves stored forecast runs or calls the SageMaker endpoint when `CHRONOS_ENDPOINT_NAME` is set.
- **fpdf2 replaces WeasyPrint** because Pango/Cairo native libraries aren't available in Lambda.
- **The basemap is Esri Canvas / World Imagery.** It needs no key. Amazon Location remains an optional configuration (`VITE_LOCATION_*`).
- **No OpenSearch by default.** Entity resolution at 5-company scale runs in memory (trigram cosine, or Titan when Bedrock is available). The plan's OpenSearch vector path is behind `deployOpenSearch=true`.
- **No VIIRS thermal layer.** The GIBS MVT URL is unconfirmed and FIRMS needs a MAP_KEY; this is the plan §15 fallback. NO₂ and night lights ship.

## UI redesign (2026-10-10, user request)
- Replaced the first UI with an analyst-console design: a landing page (3D terrain hero + sign-in), then a console with a workflow stepper (Company · Audit · Review · Plant · Report), a left tool rail, an "Ask" bar and a tabbed right panel. The reference product's interaction model was used as inspiration, not copied.
- Fonts: Geist (UI) and Geist Mono (labels, data chips). The theme is dark only, with amber for priority/selection and green for system status. Data colours are unchanged (validated palette).
- Terrain: AWS Open Data Terrain Tiles (terrarium DEM, no key) for hillshade and 3D. Selecting a plant flies the camera to ground level with imagery draped and terrain-pinned markers. deck.gl layers are hidden in that mode because non-interleaved deck points do not follow terrain.
- Landing hero = the Singrauli coalfield (NTPC Vindhyachal, Singrauli, Rihand), with the real CT 2024 figures pinned on the plants.
- Sign-in: Cognito SRP when `VITE_COGNITO_*` is set; the SDK is lazy-loaded. Otherwise an explicitly labelled demo session (sessionStorage). The email/password form is disabled with a note when no pool is configured.
- Copy: em dashes removed from every UI and API string (verdict label is now "Inconclusive: low coverage"); auditor note shortened to seven cited lines; long explanations moved into tooltips and disclosures.

## Friendly redesign (2026-10-10, second user request)
- The dark "analyst console" read as military. Replaced with a warm, editorial light theme inspired by (not copied from) harvey.ai: paper background, Newsreader serif for headings, Geist for UI, sentence-case labels instead of mono uppercase, soft rounded cards, pill buttons, toggle switches instead of tile grids, natural-colour imagery instead of sepia.
- Landing: serif hero, the live 3D terrain shown inside a rounded "product window" with real data cards floating on it, sources strip, three-step explainer, sign-in as a modal (Cognito when configured, else labelled demo access).
- Guided tour (`components/Tour.tsx`): 13 steps with a smooth spotlight that glides between elements and a card with progress, Back/Next and Esc/arrow keys. Opens automatically on first visit or after "Start the guided demo"; replay from the Tour button. Steps act for the user where useful (select NTPC, fly into Vindhyachal, return).
- Agent copy rewritten in plain language ("Quick check needed… Should we count it?", step summaries without internal codes); auditor note uses "we can see 39 of its 40 emitting plants" instead of rho_eff.
- Fix: deck.gl's MapboxOverlay throws every frame under MapLibre 6 terrain; the overlay is detached in 3D focus and re-attached after terrain is switched off (order matters, otherwise React crashes).

## 2026-10-10 · Deploy against hand-made Step 1 resources
- Cognito pool and Amplify app were created by hand (pool in **ap-south-1**). CDK now skips `EnergyTruthAuth` when `COGNITO_USER_POOL_ID` is set and skips `EnergyTruthFrontend` when `AMPLIFY_APP_ID` is set, so no duplicates. The SPA derives the Cognito region from the pool ID.
- `scripts/configure_amplify.py` (`make amplify`) sets the `VITE_*` env vars + SPA rewrite on the existing Amplify app and starts a `main` build. `make deploy` now runs `cdk bootstrap` first (idempotent).
- Access keys live in the `~/.aws` profile `energy-truth`, not in `.env`. `*.env` files are gitignored.

## 2026-10-11 · AI chain, EC2 backend, 26 companies, interactive analysis
- **AI provider chain** (`et_core/llm.py`): Bedrock Nova → Gemini (`gemini-flash-latest`, key in Secrets Manager `energy-truth/prod`) → a free local model on the EC2 box (Ollama `qwen2.5:3b`) → deterministic templates. Reason: the new account's Bedrock quotas are all applied as 0 (support case open). Bedrock takes over automatically once quota lands. The narrator stays citation-locked whichever model answers; the Strands judge agent runs on Bedrock or Gemini.
- **BRSR extraction for new companies**: the deterministic parser runs first; the AI fills only fields the parser could not find, and every AI value must appear literally on the cited page. Units: case-aware (`Mt`/`MMT` = million, `MT` = metric tonnes kept as before for the verified NTPC/Tata path), Terajoule words mapped, and any Scope 1 below 1,000 t is rejected as a lost header multiplier. Verified figures (NTPC 327 Mt, Tata 78 Mt) are unchanged: rules values always win.
- **26 companies** (was 5): GEM entity ids from the GEM API search, kept only when Climate TRACE links emitting plants to the owner (Coal India, Dalmia, NHPC, Adani Enterprises had none). Reported Scope 1 added for Tata Power 41.35 Mt (p.33), Reliance 36.46 Mt (p.36), Jindal Steel 21.49 Mt (p.21), IOC 21.24 Mt (p.37), JSW Energy 20.52 Mt (p.33), ACC 13.49 Mt (p.32); each PDF downloaded and its company + FY2024-25 verified. Others show "no filing" rather than any guessed number.
- **EC2 backend** (`EnergyTruthCompute`, `-c deployEc2=true`, t3.xlarge approved by the team): FastAPI + WebSocket + Chronos-2 on CPU + Ollama + the live add-company worker. CloudFront is blocked until AWS verifies the account, so HTTPS is Caddy with Let's Encrypt on `<elastic-ip>.sslip.io`. No NAT gateway; admin via SSM; code shipped by `scripts/ec2_release.py`. The Lambda API stays deployed as a fallback.
- **Live "Add a company"**: GEM search → optional BRSR link → `pipeline.run(only=[symbol])` builds just that company and merges it into the curated tables (runtime registry in `custom_companies`). Runs on EC2 only (Lambda returns 501).
- **Interactive analysis**: plant breakdown with toggles that re-run the Scope 1 fusion client-side (`lib/fusion.ts` mirrors `estimators.py`/`fusion.py`; saved scorecards unchanged), a Compare page (reported vs rebuilt scatter + ranked z), sector search/filter, and a 2023–2025 year switch on the map.
