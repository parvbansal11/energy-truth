"""Agent tools (plan §8.2). Pure functions over curated data + live public APIs. The LangGraph nodes and the
Strands Judge Agent call the same functions."""
from __future__ import annotations

from typing import Any

from et_core.config import settings
from et_core.store import store


def _ev_index() -> dict[str, dict]:
    return {e["id"]: e for e in store.read("evidence", [])}


def get_evidence(ids: list[str]) -> list[dict]:
    idx = _ev_index()
    return [idx[i] for i in ids if i in idx]


def resolve_company(query: str) -> dict | None:
    """Resolve a name / NSE symbol / CIN / CT-GEM entity id to a company record."""
    q = query.strip().lower()
    for c in store.read("companies", []):
        keys = [c["symbol"], c["name"], c["short"], c["cin"] or "", c["entity_id"]]
        if any(q == k.lower() for k in keys) or any(q in k.lower() for k in keys if len(q) >= 3):
            return c
    return None


def company_assets(symbol: str) -> list[dict]:
    return [a for a in store.read("assets", []) if a["company"] == symbol]


def brsr_disclosure(symbol: str) -> list[dict]:
    return [d for d in store.read("disclosures", []) if d["company"] == symbol]


def scorecard(symbol: str) -> dict | None:
    return next((s for s in store.read("scorecards", []) if s["symbol"] == symbol), None)


def grid_intensity() -> dict:
    return store.read("grid", {})


def satellite_context(lat: float, lon: float) -> dict[str, Any]:
    """GIBS layer tiles (dated) + latest Sentinel-2 L2A scene over a plant."""
    from et_connectors.stac import latest_scene

    out: dict[str, Any] = {"gibs": store.read("layers", {})}
    try:
        scene, ev = latest_scene(lon, lat)
        out["sentinel2"] = scene
        out["sentinel2_evidence"] = ev.to_dict() if ev else None
    except Exception as e:
        out["sentinel2"] = None
        out["sentinel2_error"] = type(e).__name__
    return out


def chronos_rollup(symbol: str) -> dict | None:
    """Company T2 forecast. Runs Chronos-2 live when the model is available (local CPU or SageMaker endpoint);
    otherwise returns the stored forecast run with its timestamp."""
    sc = scorecard(symbol)
    if not sc or not sc.get("forecast"):
        return None
    stored = {**sc["forecast"], "mode": "stored_run", "band": sc.get("band")}
    try:
        import pandas as pd
        from et_chronos.features import covariates, future_covariates
        from et_chronos.forecast import forecast_one
        from et_connectors import robbie

        hist = pd.Series(sc["forecast"]["history_t"], index=pd.PeriodIndex(sc["forecast"]["history_months"], freq="M"))
        path, _ = robbie.fetch_dataset("posoco")
        m = robbie.posoco_monthly(path)
        cov = covariates(m, "India")
        H = len(sc["forecast"]["months"])
        f = forecast_one(hist, cov.reindex(hist.index).ffill().bfill(), future_covariates(cov, hist.index[-1] + 1, H), H)
        return {**stored, **f.to_dict(), "mode": "live_inference"}
    except Exception:
        return stored


def fuse(rep: float, s_rep: float, ind: float, s_ind: float) -> dict:
    from et_fusion import discrepancy_z, inverse_variance

    m, s = inverse_variance(rep, s_rep, ind, s_ind)
    return {"fused_t": m, "fused_sigma_t": s, "z": discrepancy_z(ind, s_ind, rep, s_rep)}


def bedrock_available() -> bool:
    return settings.bedrock_enabled
