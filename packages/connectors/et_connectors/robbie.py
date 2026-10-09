"""Robbie Andrew's India energy datasets (derived from Grid-India/POSOCO and CEA daily reports).
Cite: Robbie M. Andrew, https://robbieandrew.github.io/india/ ."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from et_core.config import settings
from et_core.evidence import Evidence
from et_core.http import fetch

PUBLISHER = "Robbie M. Andrew (CICERO), from Grid-India/POSOCO and CEA reports"
LICENSE = "CC BY 4.0 — cite Andrew, R. M. (2020) ESSD"
FILES = {"posoco": "POSOCO_data.csv", "cea_dgr": "CEA_DGR_data.csv", "monthly": "India_monthly_data.csv"}
REGIONS = ["NR", "WR", "SR", "ER", "NER"]


def fetch_dataset(name: str, *, refresh: bool = False) -> tuple[Path, Evidence]:
    fn = FILES[name]
    r = fetch(f"{settings.robbie_base}/{fn}", settings.raw_dir / "robbie" / fn, refresh=refresh)
    return r.path, r.evidence(f"{fn} (India energy, Robbie Andrew)", PUBLISHER, kind="dataset", license=LICENSE)


def posoco_monthly(path: Path, min_coverage: float = 0.9) -> pd.DataFrame:
    """Monthly mean MU/day per region and fuel from POSOCO daily reports; incomplete edge months dropped."""
    df = pd.read_csv(path, low_memory=False).copy()
    df = df.assign(date=pd.to_datetime(df["yyyymmdd"].astype(str), format="%Y%m%d"))
    keep = ["date"] + [c for c in df.columns if any(c.startswith(f"{r}:") for r in REGIONS + ["India"])]
    df = df[keep].dropna(subset=["India: Coal"])
    g = df.groupby(df["date"].dt.to_period("M"))
    m = g.mean(numeric_only=True)
    cov = g.size() / [p.days_in_month for p in m.index]
    return m[cov >= min_coverage]


def monthly_series(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df.index = pd.PeriodIndex(df["yyyymm"].astype(str).str[:4] + "-" + df["yyyymm"].astype(str).str[4:], freq="M")
    return df.drop(columns=["yyyymm"])


def sector_profile(posoco_m: pd.DataFrame, monthly: pd.DataFrame, sector: str, region: str | None) -> pd.Series:
    """Monthly activity profile used to distribute an annual CT total across months (plan §6.2 option 2).

    power/coal  -> regional coal generation (MU/day x days)      power/gas -> regional gas generation
    steel       -> India crude steel production index              cement    -> India cement production
    coal mining -> India coal production                          other     -> flat (equal months)
    """
    days = pd.Series([p.days_in_month for p in posoco_m.index], index=posoco_m.index)
    r = region if region in REGIONS else "India"
    if sector in ("coal", "power"):
        col = f"{r}: Coal" if f"{r}: Coal" in posoco_m else "India: Coal"
        return (posoco_m[col] * days).rename("profile")
    if sector == "gas":
        return (posoco_m[f"{r}: Gas"].fillna(posoco_m["India: Gas"]) * days).rename("profile")
    col = {"steel": "IDY.PRD.OEA.STL", "cement": "CEM.PRD", "coal-mining": "COL.HRD.PRD.REV"}.get(sector)
    if col and col in monthly:
        return monthly[col].astype(float).rename("profile")
    return pd.Series(1.0, index=posoco_m.index, name="profile")


def calibrated_monthly(annual: dict[int, float], profile: pd.Series) -> pd.Series:
    """Distribute annual totals over months so each calendar year sums exactly to the CT annual figure."""
    out = {}
    for year, total in annual.items():
        months = [p for p in profile.index if p.year == year]
        vals = profile.loc[months].astype(float).replace([np.inf, -np.inf], np.nan)
        if len(months) < 12 or vals.isna().any() or vals.sum() <= 0:
            vals = pd.Series(1.0, index=pd.period_range(f"{year}-01", f"{year}-12", freq="M"))
        w = vals / vals.sum()
        for p, wi in w.items():
            out[p] = total * wi
    return pd.Series(out).sort_index()
