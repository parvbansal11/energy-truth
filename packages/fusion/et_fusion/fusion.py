"""Inverse-variance fusion and discrepancy z-score (plan §5.5)."""
from __future__ import annotations

import math


def inverse_variance(x_rep: float, s_rep: float, x_ind: float, s_ind: float) -> tuple[float, float]:
    """Fuse two estimates of the same quantity. Returns (mean, sigma)."""
    if s_rep <= 0 and s_ind <= 0:
        raise ValueError("at least one sigma must be positive")
    if s_rep <= 0:
        return x_rep, 0.0
    if s_ind <= 0:
        return x_ind, 0.0
    w_rep, w_ind = 1 / s_rep**2, 1 / s_ind**2
    mean = (w_rep * x_rep + w_ind * x_ind) / (w_rep + w_ind)
    return mean, math.sqrt(1 / (w_rep + w_ind))


def discrepancy_z(x_ind: float, s_ind: float, x_rep: float, s_rep: float) -> float:
    """z = (E_ind - E_rep) / sqrt(s_ind^2 + s_rep^2). Positive z: independent rebuild exceeds the disclosure."""
    return (x_ind - x_rep) / math.sqrt(s_ind**2 + s_rep**2)


def verdict(z: float, low_coverage: bool) -> dict:
    """Plain-language reading of z. Low coverage overrides: a gap from a partial inventory proves nothing."""
    if low_coverage:
        return {"code": "inconclusive_low_coverage", "label": "Inconclusive — low coverage", "tone": "amber",
                "text": "The independent inventory misses owned assets, so the gap cannot be read as misreporting."}
    a = abs(z)
    if a < 1:
        return {"code": "consistent", "label": "Consistent", "tone": "green", "text": "Reported and independent agree within uncertainty."}
    if a < 2:
        return {"code": "watch", "label": "Watch", "tone": "amber", "text": "Moderate gap; check boundary, period and ownership assumptions."}
    return {"code": "significant_gap", "label": "Significant gap", "tone": "red", "text": "Gap exceeds 2 sigma of combined uncertainty; investigate with the evidence below."}
