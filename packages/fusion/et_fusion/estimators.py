"""Energy-carbon estimators (plan §5.5).

Scope 1 independent:  E = sum_a w_a * E_a^CT  (ownership-weighted, FY-aligned)
  sigma^2 = sum_a (r_a * w_a * E_a)^2       per-asset CT confidence (independent errors)
          + (SYSTEMATIC * E)^2             method-level bias floor (Gurney et al. 2024)
          + ((1 - rho_eff) * E)^2          coverage widening: missing owned emitters
Scope 2 independent:  E = MWh_BRSR * EF_CEA, sigma from EF version/year mismatch and MWh-proxy flags.
Reported sigma:       assurance level + printed rounding."""
from __future__ import annotations

import math

SYSTEMATIC = 0.05
LOW_COVERAGE = 0.8  # rho_effective below this sets the low-coverage flag
ASSURANCE_SIGMA = {"reasonable": 0.03, "limited": 0.07, "unspecified": 0.07, "none": 0.15}


def scope1_independent(assets: list[dict], rho_eff: float) -> dict:
    """assets: [{value_t, weight, rel_sigma}] with value_t already FY-aligned (full-facility tonnes)."""
    total = sum(a["weight"] * a["value_t"] for a in assets)
    var_assets = sum((a["rel_sigma"] * a["weight"] * a["value_t"]) ** 2 for a in assets)
    var_sys = (SYSTEMATIC * total) ** 2
    var_cov = ((1 - min(max(rho_eff, 0.0), 1.0)) * total) ** 2
    sigma = math.sqrt(var_assets + var_sys + var_cov)
    flags = []
    if rho_eff < LOW_COVERAGE:
        flags.append("LOW_COVERAGE")
    if any(a.get("weight_assumed") for a in assets):
        flags.append("OWNERSHIP_WEIGHT_ASSUMED")
    return {
        "value_t": total,
        "sigma_t": sigma,
        "components": {"assets_t": math.sqrt(var_assets), "systematic_t": math.sqrt(var_sys), "coverage_t": math.sqrt(var_cov)},
        "flags": flags,
    }


def scope2_independent(mwh: float, ef: float, *, ef_year_mismatch: bool, non_india_operations: bool, mwh_is_total_consumption: bool) -> dict:
    value = mwh * ef
    rel = 0.03  # CEA weighted-average factor vs actual supplier mix
    flags = []
    if ef_year_mismatch:
        rel = math.hypot(rel, 0.03)
        flags.append("EF_YEAR_MISMATCH")
    if non_india_operations:
        rel = math.hypot(rel, 0.15)
        flags.append("EF_GEOGRAPHY_MISMATCH")
    if mwh_is_total_consumption:
        flags.append("MWH_FROM_TOTAL_CONSUMPTION")
    return {"value_t": value, "sigma_t": value * rel, "rel_sigma": rel, "flags": flags}


def reported_sigma(value_t: float, assurance_level: str | None, printed_decimals_t: float | None = None, assured_boundary: bool = True) -> float:
    """sigma_rep from assurance level (plan: assurance flag -> sigma_rep) plus rounding of the printed value
    (uniform over +/- half the last printed unit -> step/sqrt(12))."""
    rel = ASSURANCE_SIGMA.get((assurance_level or "none").lower(), 0.15)
    if not assured_boundary:  # assurance covered another boundary (e.g. standalone only)
        rel = ASSURANCE_SIGMA["limited"]
    rounding = (printed_decimals_t or 0) / math.sqrt(12)
    return math.hypot(rel * value_t, rounding)
