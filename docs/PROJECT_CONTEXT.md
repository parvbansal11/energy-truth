PROJECT_CONTEXT.md: everything decided so far (read before coding)
Background for the coding agent (Codex). It explains why we are building ENERGY TRUTH and what was decided during ideation.
    •    What to build: docs/ENERGY_CARBON_PLATFORM_PLAN.md (source of truth for product, data, math, architecture).
    •    How to build it: AGENTS.md (3-step process, phases P0–P8, STOP points, review).
    •    Why: this file.
Written 2026-10-09 (Fri night, IST). Team is in Delhi, India.

1. The hackathon
    •    Event: WeMakeDevs × AWS Environmental Hacks. https://www.wemakedevs.org/aws/env
    •    Dates: started Thu 8 Oct 2026, ends Sun 11 Oct 2026. Confirm the exact submission time on the page.
    •    Tracks: Air · Heat and Water · Waste and Energy (ours: rooftop solar, EV, e-waste, recycling, power).
    •    Eligibility: use at least one AWS open-source tool (e.g. Strands Agents SDK, SAM CLI, Finch, OpenSearch, Cedar) or deploy on AWS. We do both.
    •    Credits: AWS Free Tier, up to $200 in credits for a new account. Spend carefully.
    •    Judging criteria:
    1    Idea and impact: does it fix a real environmental problem? "A small problem solved well beats a big one solved vaguely."
    2    Built on AWS: mandatory to win a prize.
    3    Design and usability: would someone not on the team know what to do with it?
    4    Execution: "One feature that runs beats five that almost do."
    5    Demo video: 3 minutes, recorded, no live demo. The video is all the judges see.
    •    Extras: blog post on AWS Builder Center (separate prize); top 10 students get fast-track Amazon interviews.
2. How we got to the idea
Early ideation shortlisted consumer ideas: a "Bad Air Day" AQI protocol for schools, underpass waterlogging reports, a rooftop solar calculator, heat alerts for outdoor workers. The team chose a more ambitious B2B idea in the Waste and Energy track: ENERGY TRUTH.
3. The reference business: LogicLadder / The Sustainability Cloud
We used an existing Indian company as the idea reference:
    •    LogicLadder, maker of The Sustainability Cloud (TSC): https://www.thesustainabilitycloud.com/logicladder/
    •    Indian SaaS for enterprise ESG and sustainability. Products: TSC NetZero (Scope 1/2/3 carbon accounting, BRSR, CBAM, SBTi), TSC Energy (energy monitoring, anomaly alerts, REC tracking, budgeting, automated Scope 2 accounting), TSC Water, TSC Enviro.
    •    TSC Energy product page (studied in detail): https://www.thesustainabilitycloud.com/products/energy/
    •    They list NTPC as a customer and offer BRSR reporting software.
Our positioning against them (the core pitch):

LogicLadder / TSC
ENERGY TRUTH (us)
Direction
Inside-out: helps a company produce its carbon numbers
Outside-in: checks a company's published numbers
Data
Company's own meters, SCADA/IIoT, internal records
Public data only: BRSR filings, Climate TRACE, GEM, CEA, POSOCO grid data, satellites
User
The company's own sustainability team
Lenders, ESG analysts, investors, journalists, regulators-curious researchers
Output
Compliance reports
"Reported vs independent" with uncertainty and evidence
One-line pitch: LogicLadder helps companies write their carbon numbers. ENERGY TRUTH checks them.
Rules for using the reference:
    •    Copy UX patterns only (asset map + table, breakdown by source, alert inbox, report export). Plan §2 lists what we take, beat, and skip.
    •    Never copy their branding, name, logo, colors, text, or screenshots. Never imply affiliation.
    •    Skip everything that needs private meter data (IIoT, SCADA/Modbus, energy budgeting, REC tracking).
4. First principles: what ENERGY TRUTH is
    1    The claim. India's top 1,000 listed companies publish yearly energy carbon in BRSR filings (SEBI rule): Scope 1 (fuel burned) and Scope 2 (electricity bought). Banks and investors take them at face value.
    2    The gap. Nobody independently checks them, though public data already describes the same plants. Research shows self-reports often drift from independent estimates (plan §1.4).
    3    The check is two sums.
    ◦    Scope 1 rebuilt = Σ over plants the company owns (GEM) of plant emissions (Climate TRACE) × ownership share.
    ◦    Scope 2 rebuilt = purchased electricity MWh (from BRSR) × CEA grid factor (0.727 tCO₂/MWh, FY23-24, V20).
    4    Output. Reported vs rebuilt, with an error range, a "matches / big gap" verdict, and evidence for every number.
    5    Honesty is the feature. When free data misses plants (Tata Steel: ~20 CT-linked of ~109 GEM assets), say "low coverage, don't trust this gap" rather than accusing the company. Credibility is the product.
    6    Everything else is presentation. The map, satellite layers, agent stream, and Chronos forecast exist to make the one comparison visible and believable. If a feature doesn't help someone see "reported vs real, and why," it's lower priority.
5. Verified facts (do not change without re-verifying from source)
Fact
Value
Source
Tata Steel reported Scope 1 (consolidated)
78 Mt
Tata Steel BRSR PDF
Tata Steel Climate TRACE owner-sum
~30 Mt (incomplete coverage)
CT API v7
Tata Steel assets: CT-linked vs GEM
~20 vs ~109
CT + GEM APIs
NTPC reported Scope 1
327 Mt
NTPC BRSR PDF
NTPC Climate TRACE estimate
~368 Mt
CT API v7
CEA grid emission factor
0.727 tCO₂/MWh (FY23-24, V20)
CEA CO₂ baseline V20
Chronos-2 backtest (all-India coal gen)
WQL 0.029 with covariates vs 0.051 seasonal naive (~43% better); 85% coverage of 80% interval
energy_truth_eval/chronos_backtest_posoco_result.json
CT API v7 source emissions
Annual only in tested responses (not monthly)
Plan §6.2
No free bulk BRSR API
BRSR needs PDF extraction
Plan §5.1
CDP data
Paid, do not depend on it
Plan §5.1
Demo companies: TATASTEEL, NTPC, ULTRACEMCO, JSWSTEEL, ADANIPOWER.
6. Product shape (summary; full detail in the plan)
    •    Home: map of a company's plants. Size = emissions, color = reported-vs-independent gap, outline = coverage.
    •    Scorecard: reported vs independent vs fused (± range) for Scope 1 and 2, coverage ratio, Chronos 6-month band.
    •    Evidence Drawer: every number links to its source (PDF page, API payload, tile timestamp).
    •    "Audit <company>" agent: streams steps live (resolve → read BRSR → sum plants → grid → satellite → forecast → fuse → explain), lights up plants on the map, ends with a narrative that only cites collected evidence.
    •    Golden path for the demo: "Audit NTPC" and "Audit Tata Steel" working end to end on the deployed URL.
7. Stack decisions
    •    AWS services: Amplify Hosting, API Gateway (HTTP + WebSocket), Lambda, S3, DynamoDB, Bedrock (Nova Pro/Lite, Titan Embed v2), SageMaker JumpStart Chronos-2 (optional), EventBridge, SNS, Cognito, CloudWatch.
    •    AWS open source: Strands Agents SDK (must be visibly used), Chronos-2.
    •    Agent graph: LangGraph per plan §8, with a Strands "Judge Agent" over the same tools.
    •    Frontend: React + Vite + MapLibre GL + deck.gl.
    •    Region: us-east-1.
    •    Chronos inference: local CPU by default (already proven fast). SageMaker endpoint only with human approval.
8. Cost and time warnings
    •    Per-hour-while-idle services (SageMaker real-time endpoints, OpenSearch Serverless, NAT gateways, always-on Fargate) can eat the $200 credits. Off by default; ask before creating; tear down after recording. Use FAISS on S3 instead of OpenSearch unless approved.
    •    Time: ~40 hours remain from Fri night. Cut line: if the golden path isn't working by Saturday night, stop starting new phases and harden what works.
    •    Judges reward working over complete. Never fake data to fill a screen.
9. The 3-step process (detail in AGENTS.md)
    1    Manual AWS setup (human): account, credits, budget alert, IAM + aws configure, Bedrock model access, SageMaker quota request, Cognito, Amplify, .env.
    2    Autonomous implementation (Codex): phases P0 → P8, each with "Done when" checks, STOP points before anything billed hourly or destructive, PROGRESS.md / DECISIONS.md / BLOCKERS.md kept current.
    3    Review (human): numbers audit against original sources, stranger usability test, cost/security check, 3-minute video, submission.
10. Codex model guidance (team's choice)
    •    Default model: Sol (GPT-6.1 Sol) at medium effort.
    •    Raise to high when stuck or for phase reviews.
    •    Use Astra only for the hardest phases if Sol fails: P3 fusion math and P6 agent streaming.
    •    Use Terra / Luna at low effort for small fixes.
    •    Avoid max/ultra effort; they drain the usage allowance.
11. Attribution required in README and app
Climate TRACE, Global Energy Monitor, Robbie Andrew (India energy data), CEA, NASA EOSDIS/GIBS, Copernicus/Sentinel, and company BRSR filings. LogicLadder/TSC is an inspiration reference only. Do not mention it in the app UI.