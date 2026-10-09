"""Feature matrices for Chronos-2 tasks T1-T4 (plan §6.2)."""
from __future__ import annotations

import numpy as np
import pandas as pd

REGIONS = ["NR", "WR", "SR", "ER", "NER"]


def fossil_share(m: pd.DataFrame, region: str = "India") -> pd.Series:
    """(coal + lignite + gas) / total generation for a POSOCO region, monthly."""
    fossil = sum(m[f"{region}: {k}"].fillna(0) for k in ["Coal", "Lignite", "Gas"])
    return (fossil / m[f"{region}: Total"]).rename(f"{region}_fossil_share")


def grid_intensity(m: pd.DataFrame, ef_cea: float, calib_fy: str = "FY2023-24") -> pd.DataFrame:
    """T3 target: implied tCO2/MWh = CEA EF x fossil_share(month) / mean India fossil_share over the CEA FY.
    Calibration makes the FY average of the India series equal the CEA factor (method tag: cea_calibrated_fossil_share)."""
    y = int(calib_fy[2:6])
    calib_months = pd.period_range(f"{y}-04", f"{y + 1}-03", freq="M")
    india = fossil_share(m, "India")
    k = ef_cea / india.loc[[p for p in calib_months if p in india.index]].mean()
    out = pd.DataFrame({"India": india * k})
    for r in REGIONS:
        out[r] = fossil_share(m, r) * k
    return out


def covariates(m: pd.DataFrame, region: str = "India") -> pd.DataFrame:
    r = region if f"{region}: Coal" in m else "India"
    c = pd.DataFrame(index=m.index)
    c["coal_gen_mu"] = m[f"{r}: Coal"]
    c["gas_gen_mu"] = m[f"{r}: Gas"].fillna(0)
    c["res_gen_mu"] = m[f"{r}: RES"].fillna(0)
    c["demand_mu"] = m[f"{r}: EnergyMet"] if f"{r}: EnergyMet" in m else m["India: EnergyMet"]
    c["month_sin"] = np.sin(2 * np.pi * c.index.month / 12)
    c["month_cos"] = np.cos(2 * np.pi * c.index.month / 12)
    return c


def calendar(index: pd.PeriodIndex) -> pd.DataFrame:
    return pd.DataFrame({"month_sin": np.sin(2 * np.pi * index.month / 12), "month_cos": np.cos(2 * np.pi * index.month / 12)}, index=index)


def future_covariates(cov: pd.DataFrame, start: pd.Period, horizon: int) -> pd.DataFrame:
    """Known-future covariates for months start..start+H-1. Months already observed in POSOCO use the
    observed values (nowcast); later months use last-year seasonal persistence (same month, previous year)."""
    idx = pd.period_range(start, periods=horizon, freq="M")
    rows = {}
    for p in idx:
        if p in cov.index:
            rows[p] = cov.loc[p]
        else:
            prev = p - 12
            rows[p] = cov.loc[prev] if prev in cov.index else cov.iloc[-1]
    f = pd.DataFrame(rows).T
    f.index = idx
    f[["month_sin", "month_cos"]] = calendar(idx)
    f["observed"] = [p in cov.index for p in idx]
    return f
