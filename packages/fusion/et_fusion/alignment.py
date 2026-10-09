"""Period alignment (plan §5.4): BRSR = Indian FY (Apr-Mar); CT = calendar-year totals.
FY totals are the sum of the monthly series over Apr(Y)..Mar(Y+1)."""
from __future__ import annotations

import pandas as pd


def fy_months(fy: str) -> pd.PeriodIndex:
    """'FY2024-25' -> 2024-04 .. 2025-03"""
    y = int(fy[2:6])
    return pd.period_range(f"{y}-04", f"{y + 1}-03", freq="M")


def fy_sum(series: pd.Series, fy: str) -> tuple[float, int]:
    """Sum of a monthly series over the fiscal year; returns (total, months_present)."""
    months = fy_months(fy)
    present = [m for m in months if m in series.index]
    return float(series.loc[present].sum()), len(present)


def cy_weights(fy: str) -> dict[int, float]:
    """Calendar-year weights implied by FY months (used only as a fallback when no monthly profile exists)."""
    y = int(fy[2:6])
    return {y: 9 / 12, y + 1: 3 / 12}


ALIGNMENT_RULE = ("Calendar-year Climate TRACE totals are distributed over months with an activity profile "
                  "(POSOCO regional generation for power, India production indices for steel/cement/coal) so each "
                  "calendar year sums exactly to the CT total; the fiscal-year value is the Apr–Mar sum.")
