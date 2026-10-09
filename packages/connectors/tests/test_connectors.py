"""Connector contract tests on recorded fixtures (data/fixtures) + one live smoke test each (ET_LIVE=1)."""
import json
import os
from pathlib import Path

import pytest

from et_connectors import brsr, gem
from et_connectors.climatetrace import asset_relative_sigma
from et_connectors.ingest import boundary_weights, gem_locations
from et_connectors.resolve import haversine_km, match_source, trigram_cosine

FIX = Path(__file__).resolve().parents[3] / "data" / "fixtures"
RAW = Path(__file__).resolve().parents[3] / "data" / "raw"
live = pytest.mark.skipif(os.environ.get("ET_LIVE") != "1", reason="live API smoke tests run with ET_LIVE=1")


def load(name):
    return json.loads((FIX / name).read_text())


# ---------------------------------------------------------------- Climate TRACE
def test_ct_sources_contract():
    rows = load("ct_sources_tatasteel_2024.json")
    assert len(rows) == 20  # plan: Tata Steel ~20 CT-linked assets
    for r in rows:
        assert {"id", "name", "sector", "subsector", "centroid", "gas", "emissionsQuantity", "year"} <= r.keys()
        assert r["gas"] == "co2e_100yr" and r["year"] == 2024
    assert round(sum(r["emissionsQuantity"] for r in rows) / 1e6, 2) == 30.35  # CT owner-sum ~30 Mt


def test_ct_confidence_to_sigma():
    d = load("ct_detail_jamshedpur.json")
    sigma, label = asset_relative_sigma(d, 2025)
    assert label in {"very high", "high", "medium", "low", "very low"}
    assert 0 < sigma <= 0.5


# ---------------------------------------------------------------- GEM
def test_gem_assets_contract_and_coverage_denominator():
    d = load("gem_assets_tatasteel.json")
    assert d["total"] == 109  # plan: ~109 GEM assets for Tata Steel
    u = d["results"][0]
    assert {"asset_id", "location_id", "asset_type", "operating_status", "latitude", "longitude", "owners"} <= u.keys()


def test_gem_effective_and_direct_shares():
    g = load("gem_graph_tatasteel.json")
    eff, direct = gem.effective_shares(g), gem.direct_shares(g)
    assert eff["M0738_Base"] == pytest.approx(0.35)  # Benga mine held via a 35% JV
    assert direct["M0738_Base"] == 0.0  # not held directly by the listed entity
    assert direct["L100000102452_G100000100829"] == pytest.approx(1.0)  # Bhubaneshwar Jasper unit, direct 100%


def test_gem_locations_aggregate_units():
    d, g = load("gem_assets_tatasteel.json"), load("gem_graph_tatasteel.json")
    locs = gem_locations(d["results"], gem.effective_shares(g), gem.direct_shares(g))
    assert len(locs) == d["total_location_count"] == 30
    jam = next(l for l in locs if "Jamshedpur steel" in l["name"])
    assert jam["share"] == pytest.approx(1.0) and jam["status"] == "operating"


def test_boundary_weights():
    assert boundary_weights(0.5, 0.0) == {"standalone": 0.0, "consolidated": 1.0, "equity": 0.5}
    assert boundary_weights(0.35, 0.0)["consolidated"] == 0.0  # JV -> Scope 3 cat 15 under Tata's basis


# ---------------------------------------------------------------- entity resolution
def test_exact_coordinate_match():
    src = load("ct_sources_tatasteel_2024.json")[0]  # Jamshedpur steel plant
    d, g = load("gem_assets_tatasteel.json"), load("gem_graph_tatasteel.json")
    locs = gem_locations(d["results"], gem.effective_shares(g), gem.direct_shares(g))
    m = match_source(src, locs)
    assert m["review_status"] == "auto_accepted" and m["match_score"] >= 0.75


def test_unmatched_goes_to_review():
    src = {"name": "Nowhere Plant", "subsector": "iron-and-steel", "centroid": {"latitude": 0.0, "longitude": 0.0}}
    assert match_source(src, [])["review_status"] == "unmatched"


def test_similarity_helpers():
    assert trigram_cosine("Tata Steel Joda East Mine", "Joda East Mine") > 0.8
    assert haversine_km(28.6, 77.2, 28.6, 77.2) == 0
    assert 1100 < haversine_km(28.61, 77.21, 19.08, 72.88) < 1200  # Delhi-Mumbai


# ---------------------------------------------------------------- BRSR extraction (golden files: the filings themselves)
def test_parse_indian_grouping_and_units():
    assert brsr.parse_number("32,69,59,946.44") == pytest.approx(326959946.44)
    assert brsr.to_tco2e(78, "Million tonnes") == 78e6
    assert brsr.to_tco2e(64979.66, "Tonnes") == 64979.66
    assert brsr.to_mwh(321.77, "TJ") == pytest.approx(89380.5556, rel=1e-6)
    assert brsr.to_mwh(26.25, "PJ") == pytest.approx(7291666.67, rel=1e-6)
    with pytest.raises(ValueError):
        brsr.to_tco2e(1, "furlongs")


@pytest.mark.skipif(not (RAW / "brsr" / "ntpc-fy2025.pdf").exists(), reason="BRSR PDF cache missing")
def test_brsr_golden_ntpc():
    ex, _ = brsr.extract_rules("NTPC", "FY2024-25", RAW / "brsr" / "ntpc-fy2025.pdf", "u", "pdf")
    s1 = ex.fields["scope1.standalone.FY2024-25"]
    assert round(s1.value / 1e6) == 327 and s1.page == 17 and s1.unit == "tCO2e"  # plan: NTPC 327 Mt
    assert ex.fields["scope2.standalone.FY2024-25"].value == pytest.approx(64979.66)
    assert ex.assurance["level"] == "reasonable" and "VERITAS" in ex.assurance["provider"].upper()


@pytest.mark.skipif(not (RAW / "brsr" / "tatasteel-fy2025.pdf").exists(), reason="BRSR PDF cache missing")
def test_brsr_golden_tata():
    ex, _ = brsr.extract_rules("TATASTEEL", "FY2024-25", RAW / "brsr" / "tatasteel-fy2025.pdf", "u", "pdf")
    c = ex.fields["scope1.consolidated.FY2024-25"]
    assert c.value == 78e6 and c.page == 47  # plan: Tata Steel 78 Mt consolidated
    assert ex.fields["scope1.standalone.FY2024-25"].value == 61e6
    assert ex.fields["electricity_nonrenewable_mwh.consolidated.FY2024-25"].raw_unit == "PJ"
    assert ex.assurance["scope"] == "standalone only"


# ---------------------------------------------------------------- live smoke tests
@live
def test_live_climatetrace():
    import httpx

    r = httpx.get("https://api.climatetrace.org/v7/sources?ownerIds=E100001010018&year=2024&limit=5", timeout=30)
    assert r.status_code == 200 and isinstance(r.json(), list)


@live
def test_live_gem():
    import httpx

    assert httpx.get("https://api.globalenergymonitor.org/entities/E100001010018", timeout=30).json()["entity_id"] == "E100001010018"


@live
def test_live_robbie_and_gibs():
    import httpx

    assert httpx.head("https://robbieandrew.github.io/india/data/POSOCO_data.csv", timeout=30).status_code == 200
    from et_connectors.gibs import probe_layers

    cfg, _ = probe_layers()
    assert "no2" in cfg


@live
def test_live_sentinel2():
    from et_connectors.stac import latest_scene

    scene, ev = latest_scene(86.2001, 22.7883, days=120, max_cloud=60)
    assert scene is None or scene["id"].startswith("S2")
