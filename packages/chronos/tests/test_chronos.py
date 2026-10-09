"""Chronos feature construction + verification that the stored backtest reproduces plan §6.5."""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from et_chronos.backtest import QUANTILES, wql
from et_chronos.features import future_covariates, grid_intensity
from et_connectors.robbie import calibrated_monthly, posoco_monthly

ROOT = Path(__file__).resolve().parents[3]
POSOCO = ROOT / "data" / "raw" / "robbie" / "POSOCO_data.csv"


def test_wql_perfect_and_point_forecast():
    y = np.array([10.0, 20.0])
    assert wql(y, {q: y for q in QUANTILES}) == 0
    # point forecast off by +1 everywhere: QL_q = sum(max(q*-1, (q-1)*-1)) = 2*(1-q); wQL = mean_q 2*2(1-q)/30
    expected = np.mean([2 * 2 * (1 - q) / 30 for q in QUANTILES])
    assert wql(y, {q: y + 1 for q in QUANTILES}) == pytest.approx(expected)


def test_calibrated_monthly_preserves_annual_totals():
    prof = pd.Series(np.arange(1, 25, dtype=float), index=pd.period_range("2023-01", "2024-12", freq="M"))
    s = calibrated_monthly({2023: 1200.0, 2024: 600.0}, prof)
    assert s[[p for p in s.index if p.year == 2023]].sum() == pytest.approx(1200)
    assert s[[p for p in s.index if p.year == 2024]].sum() == pytest.approx(600)
    assert s.iloc[11] > s.iloc[0]  # follows the profile shape


@pytest.mark.skipif(not POSOCO.exists(), reason="POSOCO cache missing")
def test_grid_intensity_calibrates_to_cea():
    m = posoco_monthly(POSOCO)
    gi = grid_intensity(m, 0.727, "FY2023-24")
    fy = pd.period_range("2023-04", "2024-03", freq="M")
    assert gi.loc[fy, "India"].mean() == pytest.approx(0.727, abs=1e-9)
    assert gi["India"].between(0.4, 1.0).all()


@pytest.mark.skipif(not POSOCO.exists(), reason="POSOCO cache missing")
def test_future_covariates_use_observed_months_then_seasonal():
    m = posoco_monthly(POSOCO)
    from et_chronos.features import covariates

    cov = covariates(m)
    last = cov.index[-1]
    f = future_covariates(cov, last - 1, 4)
    assert f["observed"].tolist()[:2] == [True, True] and not f["observed"].iloc[-1]
    assert f.loc[last + 1, "coal_gen_mu"] == pytest.approx(cov.loc[last + 1 - 12, "coal_gen_mu"])


def test_backtest_result_reproduces_plan_table():
    """Plan §6.5 verified table: WQL 0.051 (seasonal naive) / 0.041 (univariate) / 0.029 (covariates), coverage 78% / 85%."""
    r = json.loads((ROOT / "energy_truth_eval" / "chronos_backtest_posoco_result.json").read_text())
    res = r["results"]
    assert r["data"]["n_months"] == 94 and r["data"]["first_month"] == "2018-12"
    assert round(res["seasonal_naive"]["wql"], 3) == 0.051
    assert round(res["chronos2_univariate"]["wql"], 3) == 0.041
    assert round(res["chronos2_covariates"]["wql"], 3) == 0.029
    assert round(res["chronos2_covariates"]["coverage_80_pct"]) == 85
    assert res["improvement_vs_seasonal_naive_pct"] > 40
