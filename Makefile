# ENERGY TRUTH — see AGENTS.md for phases and STOP points.
PY      := .venv/bin/python
PYPATH  := PYTHONPATH=packages/core:packages/connectors:packages/fusion:packages/chronos:packages/agents:.
API_PORT ?= 8000

.PHONY: install pipeline backtest api web dev test test-py test-web e2e build synth lambda-bundle deploy outputs publish-data amplify deploy-chronos preflight cost-check teardown teardown-ml

install:            ## python venv + node deps + playwright browser
	python3.12 -m venv .venv
	$(PY) -m pip install -q --upgrade pip
	$(PY) -m pip install -q -r requirements-dev.txt
	npm ci
	npx -w apps/web playwright install chromium

pipeline:           ## P1-P4: fetch (cached) -> entity graph -> BRSR -> fusion -> Chronos -> alerts  (add ARGS=--refresh)
	$(PYPATH) $(PY) -m et_fusion.pipeline $(ARGS)

backtest:           ## P4: reproduce the Chronos-2 POSOCO backtest (plan §6.5)
	$(PYPATH) $(PY) -m et_chronos.backtest

api:                ## FastAPI + WebSocket on :$(API_PORT)
	$(PYPATH) $(PY) -m uvicorn apps.api.app:app --host 127.0.0.1 --port $(API_PORT)

web:                ## Vite dev server on :5173 (proxies /api -> :$(API_PORT))
	LOCAL_API_URL=http://127.0.0.1:$(API_PORT) npm run dev -w apps/web

dev:                ## api + web together
	$(MAKE) -j2 api web

test: test-py test-web build synth   ## everything that runs offline

test-py:
	$(PYPATH) $(PY) -m pytest -q

test-web:
	npm run typecheck

e2e:                ## Playwright golden-path smoke test (needs `make dev` running, or E2E_BASE_URL)
	npx -w apps/web playwright test

build:
	npm run build

synth:
	cd infra && npx cdk synth --quiet

lambda-bundle:      ## Lambda zip asset (manylinux wheels, no Docker)
	./scripts/bundle_lambda.sh

preflight:          ## AGENTS.md Step 1 checks (identity, Bedrock, budget, quota)
	$(PY) scripts/aws_preflight.py

deploy: preflight lambda-bundle   ## P0: deploy all stacks, write outputs to .env, publish data
	mkdir -p work
	set -a; . ./.env; set +a; cd infra && npx cdk bootstrap "aws://$${CDK_DEFAULT_ACCOUNT}/$${CDK_DEFAULT_REGION:-us-east-1}" --profile "$${AWS_PROFILE:-energy-truth}" --tags Project=energy-truth
	set -a; . ./.env; set +a; cd infra && npx cdk deploy --all --require-approval never --outputs-file ../work/cdk-outputs.json --profile "$${AWS_PROFILE:-energy-truth}"
	$(PY) scripts/write_outputs_to_env.py
	$(MAKE) publish-data
	$(PY) scripts/configure_amplify.py --release

outputs:
	$(PY) scripts/write_outputs_to_env.py

amplify:            ## point the hand-made Amplify app at the API/Cognito and build main (add RELEASE=1)
	$(PY) scripts/configure_amplify.py $(if $(RELEASE),--release,)

publish-data:       ## upload curated + raw evidence to S3, mirror rows to DynamoDB
	$(PY) scripts/publish_data.py

deploy-chronos:     ## STOP POINT: hourly-billed SageMaker endpoint — requires APPROVED=1
	$(PY) scripts/deploy_chronos.py $(if $(APPROVED),--approved,)

cost-check:         ## idle billable resources + month-to-date spend
	$(PY) scripts/cost_check.py

teardown-ml:        ## delete SageMaker endpoints (needs YES=1)
	$(PY) scripts/teardown_ml.py $(if $(YES),--yes,)

teardown:           ## destroy app stacks; buckets/tables are RETAINed (data deletion is a STOP point)
	@if [ -z "$(YES)" ]; then echo "Refusing: re-run with YES=1 after human approval (AGENTS.md §2.2)."; exit 1; fi
	$(MAKE) teardown-ml YES=1
	cd infra && npx cdk destroy --all --force --profile "$${AWS_PROFILE:-energy-truth}"
