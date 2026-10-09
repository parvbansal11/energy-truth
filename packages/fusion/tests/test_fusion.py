"""Hand-calculated fusion cases (AGENTS.md §2.4)."""
import math

import pandas as pd
import pytest

from et_fusion import discrepancy_z, fy_months, fy_sum, inverse_variance, reported_sigma, scope1_independent, scope2_independent, verdict
from et_fusion.estimators import SYSTEMATIC


def test_inverse_variance_hand_case():
    # w_rep = 1/100 = 0.01, w_ind = 1/400 = 0.0025 ; mean = (1.0 + 0.3)/0.0125 = 104 ; sigma = sqrt(1/0.0125) = 8.944
    mean, sigma = inverse_variance(100, 10, 120, 20)
    assert mean == pytest.approx(104.0)
    assert sigma == pytest.approx(math.sqrt(80))


def test_inverse_variance_equal_sigmas_is_midpoint():
    mean, sigma = inverse_variance(10, 2, 20, 2)
    assert mean == pytest.approx(15)
    assert sigma == pytest.approx(2 / math.sqrt(2))


def test_z_score_hand_case():
    # (120 - 100) / sqrt(20^2 + 10^2) = 20 / 22.3607 = 0.8944
    assert discrepancy_z(120, 20, 100, 10) == pytest.approx(0.894427, rel=1e-5)
    assert discrepancy_z(80, 3, 100, 4) == pytest.approx(-4.0)


def test_scope1_weighted_sum_and_sigma():
    assets = [{"value_t": 100.0, "weight": 1.0, "rel_sigma": 0.1}, {"value_t": 50.0, "weight": 0.5, "rel_sigma": 0.2}]
    r = scope1_independent(assets, rho_eff=1.0)
    assert r["value_t"] == pytest.approx(125.0)  # 100 + 0.5*50
    # assets: sqrt((0.1*100)^2 + (0.2*25)^2) = sqrt(100 + 25) ; systematic: 0.05*125 = 6.25 ; coverage 0
    expected = math.sqrt(125 + (SYSTEMATIC * 125) ** 2)
    assert r["sigma_t"] == pytest.approx(expected)
    assert r["flags"] == []


def test_low_rho_widens_sigma_and_flags():
    assets = [{"value_t": 100.0, "weight": 1.0, "rel_sigma": 0.1}]
    full = scope1_independent(assets, rho_eff=1.0)
    low = scope1_independent(assets, rho_eff=0.5)
    assert low["sigma_t"] > full["sigma_t"]
    assert low["components"]["coverage_t"] == pytest.approx(50.0)
    assert "LOW_COVERAGE" in low["flags"]


def test_scope2_matches_ntpc_disclosure():
    # NTPC FY2024-25 BRSR: 321.77 TJ non-renewable electricity = 89,380.56 MWh ; x 0.727 = 64,979.66 t (as printed)
    mwh = 321.77 * 1e12 / 3.6e9
    r = scope2_independent(mwh, 0.727, ef_year_mismatch=True, non_india_operations=False, mwh_is_total_consumption=True)
    assert r["value_t"] == pytest.approx(64979.66, abs=0.01)
    assert "EF_YEAR_MISMATCH" in r["flags"]


def test_reported_sigma_assurance_and_rounding():
    # 78 Mt printed as an integer (step 1 Mt) with standalone-only assurance -> limited-level 7%
    s = reported_sigma(78e6, "reasonable", printed_decimals_t=1e6, assured_boundary=False)
    assert s == pytest.approx(math.hypot(0.07 * 78e6, 1e6 / math.sqrt(12)))
    assert reported_sigma(100, "reasonable") == pytest.approx(3.0)


def test_verdict_low_coverage_overrides():
    assert verdict(5.0, low_coverage=True)["code"] == "inconclusive_low_coverage"
    assert verdict(0.5, False)["code"] == "consistent"
    assert verdict(-1.5, False)["code"] == "watch"
    assert verdict(2.5, False)["code"] == "significant_gap"


def test_fy_alignment_sum():
    s = pd.Series(1.0, index=pd.period_range("2024-01", "2025-12", freq="M"))
    total, n = fy_sum(s, "FY2024-25")
    assert (total, n) == (12.0, 12)
    assert str(fy_months("FY2024-25")[0]) == "2024-04"
    assert str(fy_months("FY2024-25")[-1]) == "2025-03"
