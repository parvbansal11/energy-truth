"""What-if Energy Switch (plan §4 item 7) and store-backed audit state for Report Studio."""
from __future__ import annotations

from et_core.config import settings
from et_core.store import store

from . import tools as T


def scope2_whatif(symbol: str, re_share_pct: float, shift_pct: float, region: str | None = None) -> dict:
    """Δ Scope 2 when (a) a share of purchased grid electricity is replaced by renewable supply and (b) a share of
    consumption is shifted from the highest- to the lowest-intensity months of the Chronos grid forecast.

    baseline       = MWh x CEA EF (location-based, version-pinned)
    forecast-grid  = sum_m (MWh/12) x I_m over the Chronos T3 horizon months (annualised), I = regional or India
    scenario       = forecast-grid with RE share removed and shift applied"""
    sc = T.scorecard(symbol)
    if not sc:
        raise KeyError("unknown company")
    s2 = sc["scopes"].get("S2") or {}
    ind = s2.get("independent")
    if not ind:
        return {"available": False, "reason": "This company has no BRSR electricity quantity ingested, so Scope 2 cannot be rebuilt."}
    g = T.grid_intensity()
    reg = region or _dominant_region(symbol) or "India"
    f = g["forecasts"].get(reg) or g["forecasts"]["India"]
    q50 = f["q50"]
    mwh = ind["mwh"]
    monthly = mwh / 12
    n = len(q50)
    grid_t = sum(monthly * i for i in q50) * 12 / n
    lo_t = sum(monthly * i for i in f["q10"]) * 12 / n
    hi_t = sum(monthly * i for i in f["q90"]) * 12 / n
    # shift: move shift_pct of one month's load from each of the top-k intensity months to the bottom-k months
    order = sorted(range(n), key=lambda i: q50[i])
    k = max(1, n // 3)
    moved = monthly * shift_pct / 100
    delta_shift = sum(moved * (q50[order[j]] - q50[order[-1 - j]]) for j in range(k)) * 12 / n
    scen = (grid_t + delta_shift) * (1 - re_share_pct / 100)
    return {
        "available": True,
        "symbol": symbol,
        "mwh": mwh,
        "region": reg,
        "months": f["months"],
        "intensity_q50": q50,
        "baseline_cea_t": ind["value_t"],
        "ef_cea": ind["ef"],
        "ef_version": ind["ef_version"],
        "forecast_grid_t": grid_t,
        "forecast_grid_band_t": [lo_t, hi_t],
        "scenario_t": scen,
        "delta_vs_baseline_t": scen - ind["value_t"],
        "delta_vs_baseline_pct": (scen - ind["value_t"]) / ind["value_t"] * 100,
        "assumptions": {"re_share_pct": re_share_pct, "shift_pct": shift_pct, "shift_months_from": [f["months"][i] for i in order[-k:]], "shift_months_to": [f["months"][i] for i in order[:k]]},
        "method": "Chronos-2 T3 grid-intensity forecast (CEA-calibrated fossil share) applied to BRSR electricity; RE share removes grid emissions proportionally.",
        "evidence_ids": ind["evidence_ids"] + g["evidence_ids"],
    }


def _dominant_region(symbol: str) -> str | None:
    from collections import Counter

    regs = Counter()
    for a in T.company_assets(symbol):
        if a.get("ct") and a.get("region"):
            regs[a["region"]] += a["ct"]["emissions_t"].get("2024", 0)
    return regs.most_common(1)[0][0] if regs else None


def state_from_store(symbol: str) -> dict | None:
    """Assemble an audit state from curated tables (same shape the LangGraph run produces)."""
    from . import narrator

    sc = T.scorecard(symbol)
    c = next((x for x in store.read("companies", []) if x["symbol"] == symbol), None)
    if not sc or not c:
        return None
    assets = T.company_assets(symbol)
    ids = set(c["evidence_ids"]) | set(c["coverage"]["evidence_ids"])
    for scope in sc["scopes"].values():
        for k in ("reported", "independent"):
            if scope.get(k):
                ids |= set(scope[k].get("evidence_ids", []))
    if sc.get("band"):
        ids.add(sc["band"]["reported_evidence_id"])
    for a in assets:
        ids |= set(a["evidence_ids"])
    ev = {e["id"]: e for e in T.get_evidence(sorted(ids))}
    s1 = dict(sc["scopes"]["S1"])
    s1["independent"] = {**s1["independent"], "n_assets": len([a for a in assets if a["ct"]])}
    st = {"run_id": "studio", "company": c, "company_id": symbol, "scorecard": sc, "assets": assets, "estimates": {"S1": s1, "S2": sc["scopes"].get("S2", {})},
          "forecast": {"band": sc.get("band")}, "evidence": ev, "satellite": []}
    st["narrative"] = narrator.explain(st)
    return st
