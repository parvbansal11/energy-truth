PYTHON := .venv/bin/python
.PHONY: install dev api test synth deploy preflight cost-check teardown
install:
	npm ci
	python3 -m venv .venv
	$(PYTHON) -m pip install -r apps/api/requirements-lock.txt
api:
	$(PYTHON) -m uvicorn apps.api.local:app --host 127.0.0.1 --port 8000
dev:
	npm run dev
test:
	node --import tsx tests/review.test.ts
	$(PYTHON) -m unittest discover -s tests -v
	npm run typecheck
	npm run build
synth:
	npm run synth
preflight:
	$(PYTHON) scripts/aws_preflight.py
deploy: preflight
	mkdir -p work
	npm run deploy -w infra -- --profile "$${AWS_PROFILE:-energy-truth}" --outputs-file work/cdk-outputs.json
cost-check:
	$(PYTHON) scripts/cost_check.py
teardown:
	@echo 'Resource deletion requires explicit approval under AGENTS.md. No resources deleted.'
	@exit 1
