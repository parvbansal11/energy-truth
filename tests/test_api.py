"""API integration tests (local app). Set E2E_API_URL to also hit a deployed endpoint."""
import os
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from apps.api.app import app

ROOT = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.skipif(not (ROOT / "data" / "curated" / "scorecards.json").exists(), reason="run make pipeline first")
c = TestClient(app)


def test_health_and_companies():
    assert c.get("/health").json()["data_ready"] is True
    cos = {x["symbol"]: x for x in c.get("/companies").json()["companies"]}
    assert set(cos) >= {"NTPC", "TATASTEEL", "ULTRACEMCO", "JSWSTEEL", "ADANIPOWER"}
    assert round(cos["NTPC"]["reported_t"] / 1e6) == 327 and round(cos["TATASTEEL"]["reported_t"] / 1e6) == 78


def test_scorecard_numbers_trace_to_evidence():
    sc = c.get("/companies/TATASTEEL/scorecard").json()
    ids = set(sc["scopes"]["S1"]["reported"]["evidence_ids"] + sc["scopes"]["S1"]["independent"]["evidence_ids"] + sc["coverage"]["evidence_ids"])
    ev = {e["id"] for e in c.get("/evidence", params={"ids": ",".join(ids)}).json()["evidence"]}
    assert ids == ev  # every id resolves
    assert sc["coverage"]["ct_linked_assets"] == 20 and sc["coverage"]["gem_assets"] == 109
    assert "LOW_COVERAGE" in sc["scopes"]["S1"]["flags"]


def test_ntpc_ct_owner_sum_matches_plan():
    sc = c.get("/companies/NTPC/scorecard").json()
    assert round(sc["ct_owner_sum_cy_t"]["2024"] / 1e6) == 368  # plan: NTPC CT ~368 Mt


def test_assets_grid_eval_alerts_whatif_report():
    a = c.get("/companies/NTPC/assets").json()["assets"]
    assert any(x["ct"] for x in a) and all("lat" in x for x in a)
    g = c.get("/grid").json()
    assert g["forecasts"]["India"]["q50"]
    assert c.get("/eval/chronos").json()["backtest"]["results"]["chronos2_covariates"]["wql"] < 0.03
    assert isinstance(c.get("/alerts").json()["alerts"], list)
    w = c.post("/whatif/scope2", json={"symbol": "NTPC", "re_share_pct": 10, "shift_pct": 5}).json()
    assert w["available"] and w["scenario_t"] < w["forecast_grid_t"]
    r = c.post("/reports/NTPC").json()
    pdf = c.get(r["url"])
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


@pytest.mark.skipif(not os.environ.get("E2E_API_URL"), reason="set E2E_API_URL for the deployed integration test")
def test_deployed_health():
    r = httpx.get(os.environ["E2E_API_URL"].rstrip("/") + "/health", timeout=30)
    assert r.status_code == 200 and r.json()["status"] == "ok"
