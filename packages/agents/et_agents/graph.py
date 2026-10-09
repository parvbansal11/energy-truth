"""LangGraph audit graph (plan §8.2).

  Resolver -> {DisclosureExtractor, AssetEnergyEstimator}
  DisclosureExtractor -> GridScope2Agent
  AssetEnergyEstimator -> SatelliteEnergyVerifier
  {AssetEnergyEstimator, GridScope2Agent} -> ChronosForecaster
  {SatelliteEnergyVerifier, ChronosForecaster, DisclosureExtractor} -> FusionUncertainty -> AuditorExplainer -> ReportGenerator

Every node streams events (node start/end, tool calls, map actions, evidence) through LangGraph's custom stream.
HITL: the Resolver interrupts when entity matches fall below HITL_ENTITY_THRESHOLD; resume with
{"decision": "accept" | "exclude"}."""
from __future__ import annotations

import asyncio
import operator
import time
import uuid
from pathlib import Path
from typing import Annotated, Any, AsyncIterator, Callable, TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from et_core.config import settings

from . import narrator, report, tools


def _merge(a: dict, b: dict) -> dict:
    return {**(a or {}), **(b or {})}


class AuditState(TypedDict, total=False):
    run_id: str
    query: str
    company_id: str
    company: dict
    scorecard: dict
    assets: list[dict]
    disclosures: list[dict]
    estimates: Annotated[dict, _merge]
    forecast: dict
    satellite: list[dict]
    evidence: Annotated[dict, _merge]
    messages: Annotated[list, operator.add]
    hitl_queue: list[dict]
    hitl_decision: dict
    auto_approve: bool
    map_actions: Annotated[list, operator.add]
    narrative: dict
    report_url: str


# ------------------------------------------------------------------ helpers
def _emit(kind: str, node: str, **data: Any) -> None:
    try:
        get_stream_writer()({"type": kind, "node": node, "ts": time.time(), **data})
    except Exception:
        pass


def _evidence(ids: list[str]) -> dict:
    return {e["id"]: e for e in tools.get_evidence([i for i in ids if i])}


def _pace() -> None:
    """Small pause so streamed steps are perceivable in the console (real work dominates when it is slow)."""
    time.sleep(float(__import__("os").environ.get("AGENT_STEP_DELAY", "0.35")))


# ------------------------------------------------------------------ nodes
def resolver(state: AuditState) -> dict:
    n = "Resolver"
    _emit("node", n, status="start", label="Resolving company identity")
    _emit("tool", n, tool="resolve_company", input={"query": state["query"]})
    c = tools.resolve_company(state["query"])
    if not c:
        _emit("node", n, status="error", summary=f"No company matches '{state['query']}'")
        raise ValueError(f"unknown company: {state['query']}")
    _pace()
    _emit("tool", n, tool="ct_owners+gem_entity", output=f"{c['name']} · CIN {c['cin']} · CT/GEM {c['entity_id']}")
    assets = tools.company_assets(c["symbol"])
    sc = tools.scorecard(c["symbol"])
    ev = _evidence(c["evidence_ids"] + c["coverage"]["evidence_ids"])
    _emit("map", n, action="fly_to_company", company=c["symbol"], asset_ids=[a["asset_id"] for a in assets])
    queue = c.get("hitl_queue", [])
    decision = state.get("hitl_decision")
    if queue and not decision:
        if state.get("auto_approve"):
            decision = {"decision": "accept", "by": "auto_approve"}
        else:
            _emit("hitl", n, items=queue, threshold=settings.hitl_threshold, label=f"{len(queue)} entity match(es) below {settings.hitl_threshold}")
            decision = interrupt({"type": "entity_review", "items": queue, "threshold": settings.hitl_threshold})
    _emit("node", n, status="end", summary=f"{c['short']}: {len([a for a in assets if a['ct']])} CT-linked assets, {c['coverage']['gem_assets']} GEM units"
          + (f"; HITL {decision['decision']} {len(queue)} match(es)" if queue else ""))
    return {"company_id": c["symbol"], "company": c, "scorecard": sc, "assets": assets, "evidence": ev, "hitl_queue": queue,
            "hitl_decision": decision or {}, "messages": [f"Resolved {c['name']}"]}


def disclosure_extractor(state: AuditState) -> dict:
    n = "DisclosureExtractor"
    c = state["company"]
    _emit("node", n, status="start", label="Reading BRSR Principle 6")
    docs = tools.brsr_disclosure(c["symbol"])
    if not docs:
        _emit("node", n, status="end", summary="No BRSR filing ingested for this company")
        return {"disclosures": [], "messages": ["No BRSR"]}
    ids: list[str] = []
    for d in docs:
        s1 = {k: v for k, v in d["fields"].items() if k.startswith("scope1")}
        page = next(iter(s1.values()))["page"] if s1 else None
        _emit("tool", n, tool="brsr_extract", input={"document": d["document_url"].split("/")[-1][:60], "fy": d["fy"], "engine": d["engine"]},
              output=f"reading p.{page} · {len(d['fields'])} fields · assurance: {d['assurance'].get('level', 'n/a')} ({d['assurance'].get('provider') or 'n/a'})")
        # verify each quoted row still appears on its cited page of the cached PDF
        pdf = settings.raw_dir / "brsr" / Path(d["document_url"]).name
        local = next((p for p in (settings.raw_dir / "brsr").glob("*.pdf") if p.stat().st_size and d["document_url"].endswith(p.name)), None)
        ids += [f["evidence_id"] for f in d["fields"].values()] + ([d["assurance"]["evidence_id"]] if d["assurance"].get("evidence_id") else [])
        _pace()
    sc = state["scorecard"]
    rep = sc["scopes"]["S1"].get("reported")
    if rep:
        _emit("tool", n, tool="unit_normaliser", input={"raw": f"{rep['raw']} {rep['raw_unit']}"}, output=f"{rep['value_t']:,.0f} tCO2e (p.{rep['page']}, {rep['boundary']})")
    _emit("node", n, status="end", summary=f"{len(docs)} filing(s); Scope 1 {sc['fy']} = {rep['value_t'] / 1e6:,.1f} Mt (p.{rep['page']})" if rep else f"{len(docs)} filing(s)")
    return {"disclosures": docs, "evidence": _evidence(ids), "messages": ["BRSR read"]}


def asset_estimator(state: AuditState) -> dict:
    from et_fusion.alignment import fy_sum
    from et_fusion.estimators import scope1_independent

    import pandas as pd

    n = "AssetEnergyEstimator"
    c, sc = state["company"], state["scorecard"]
    _emit("node", n, status="start", label="Summing ownership-weighted plant emissions")
    excluded = {q["asset_id"] for q in state.get("hitl_queue", [])} if (state.get("hitl_decision") or {}).get("decision") == "exclude" else set()
    cas = [a for a in state["assets"] if a["ct"] and a["asset_id"] not in excluded]
    _emit("tool", n, tool="ct_sources_by_owner", input={"owner": c["entity_id"], "years": "2023-2025"}, output=f"{len(cas)} sources, CT confidence → σ per asset")
    rows = []
    for a in sorted(cas, key=lambda a: -a["ct"]["emissions_t"].get("2024", 0)):
        s = pd.Series(a["monthly_t"]).rename(index=lambda k: pd.Period(k, "M"))
        v = fy_sum(s, sc["fy"])[0]
        rows.append({"value_t": v, "weight": a["ownership_weight"], "rel_sigma": a["ct"]["rel_sigma"], "weight_assumed": a["weight_source"].startswith("assumed"), "asset_id": a["asset_id"]})
    top = [r["asset_id"] for r in rows[:8]]
    for i in range(0, min(len(top), 8), 3):
        _emit("map", n, action="highlight", asset_ids=top[i:i + 3])
        _pace()
    _emit("tool", n, tool="gem_ownership_graph", input={"root": c["entity_id"], "boundary": c["boundary"]},
          output=f"weights: {sum(1 for r in rows if r['weight'] == 1)} at 100%, {sum(1 for r in rows if 0 < r['weight'] < 1)} partial, {sum(1 for r in rows if r['weight'] == 0)} outside boundary")
    ind = scope1_independent(rows, c["coverage"]["rho_effective"])
    evids = sorted({e for a in cas for e in a["evidence_ids"]})
    _emit("tool", n, tool="coverage_rho", output=f"ρ = {c['coverage']['ct_linked_assets']}/{c['coverage']['gem_assets']} = {c['coverage']['rho']:.2f}; ρ_eff = {c['coverage']['rho_effective']:.2f}")
    _emit("map", n, action="highlight", asset_ids=top, fit=True)
    _emit("node", n, status="end", summary=f"S1 independent {sc['fy']}: {ind['value_t'] / 1e6:,.1f} ± {ind['sigma_t'] / 1e6:,.1f} Mt" + (" · LOW COVERAGE" if "LOW_COVERAGE" in ind["flags"] else ""))
    return {"estimates": {"S1": {"independent": {**ind, "evidence_ids": evids, "n_assets": len(rows)}, "flags": ind["flags"]}}, "evidence": _evidence(evids), "messages": ["S1 rebuilt"]}


def grid_scope2(state: AuditState) -> dict:
    n = "GridScope2Agent"
    sc = state["scorecard"]
    _emit("node", n, status="start", label="Scope 2: BRSR MWh × CEA grid factor")
    s2 = sc["scopes"].get("S2") or {}
    ind = s2.get("independent")
    g = tools.grid_intensity()
    if g:
        last = g["months"][-1]
        _emit("tool", n, tool="posoco_intensity_nowcast", input={"month": last}, output=f"India implied {g['series']['India'][-1]:.3f} tCO2/MWh ({g['method']})")
    if not ind:
        _emit("node", n, status="end", summary="No BRSR electricity quantity — Scope 2 not rebuilt")
        return {"estimates": {"S2": {"independent": None, "reported": None}}, "messages": ["S2 skipped"]}
    _pace()
    _emit("tool", n, tool="cea_grid_factor", input={"version": ind["ef_version"]}, output=f"{ind['mwh']:,.0f} MWh × {ind['ef']} = {ind['value_t']:,.0f} tCO2")
    _emit("node", n, status="end", summary=f"S2 independent {ind['value_t'] / 1e6:,.3f} Mt ({', '.join(s2.get('flags', [])) or 'no flags'})")
    return {"estimates": {"S2": {"independent": ind, "reported": s2.get("reported"), "flags": s2.get("flags", [])}}, "evidence": _evidence(ind["evidence_ids"]), "messages": ["S2 rebuilt"]}


def satellite_verifier(state: AuditState) -> dict:
    n = "SatelliteEnergyVerifier"
    _emit("node", n, status="start", label="Satellite energy-activity context")
    top = sorted([a for a in state["assets"] if a["ct"] and a["country"] == "IND"], key=lambda a: -a["ct"]["emissions_t"].get("2024", 0))[:1]
    out, ids = [], []
    layers = tools.store.read("layers", {})
    for k in ("no2", "dnb"):
        if k in layers:
            _emit("tool", n, tool="gibs_wmts", input={"layer": layers[k]["id"]}, output=f"tile date {layers[k]['date']} (verified PNG)")
            ids.append(layers[k]["evidence_id"])
    for a in top:
        _emit("map", n, action="fly_to", asset_ids=[a["asset_id"]], lon=a["lon"], lat=a["lat"], zoom=9)
        _emit("tool", n, tool="sentinel2_stac", input={"lon": round(a["lon"], 4), "lat": round(a["lat"], 4)})
        ctx = tools.satellite_context(a["lat"], a["lon"])
        s2 = ctx.get("sentinel2")
        if s2:
            e = ctx["sentinel2_evidence"]
            out.append({"asset_id": a["asset_id"], "asset_name": a["name"], **s2, "evidence_id": e["id"]})
            _emit("tool", n, tool="sentinel2_stac", output=f"{s2['id']} · {s2['datetime'][:10]} · cloud {s2['cloud_cover']:.0f}%", image=s2.get("thumbnail"))
            ev = {e["id"]: e}
        else:
            ev = {}
            _emit("tool", n, tool="sentinel2_stac", output=f"no low-cloud scene in 90 days ({ctx.get('sentinel2_error', 'none found')})")
    _emit("node", n, status="end", summary=f"{len(ids)} GIBS layers + {len(out)} Sentinel-2 scene(s) — context only, not CO₂ measurements")
    return {"satellite": out, "evidence": {**_evidence(ids), **(ev if top else {})}, "messages": ["satellite context"]}


def chronos_forecaster(state: AuditState) -> dict:
    n = "ChronosForecaster"
    c = state["company"]
    _emit("node", n, status="start", label="Chronos-2 forecast with energy covariates")
    _emit("tool", n, tool="chronos2.predict_quantiles", input={"target": "ownership-weighted monthly tCO2e (T2)", "covariates": "coal/gas/RES gen, demand, month sin/cos", "quantiles": [0.1, 0.5, 0.9]})
    f = tools.chronos_rollup(c["symbol"])
    if not f:
        _emit("node", n, status="end", summary="No forecastable history")
        return {"forecast": {}, "messages": ["no forecast"]}
    band = f.get("band")
    _emit("tool", n, tool="chronos2.predict_quantiles", output=f"{f['mode']} · {f['backend']} · {len(f['months'])} months {f['months'][0]}→{f['months'][-1]}")
    ids = []
    if band:
        _emit("tool", n, tool="band_breach_rule", input={"fy": band["fy"]},
              output=f"scaled band {band['q10_t'] / 1e6:,.1f}–{band['q90_t'] / 1e6:,.1f} Mt vs BRSR {band['reported_t'] / 1e6:,.1f} → {'BREACH' if band['breach'] else 'inside'}")
        ids.append(band["reported_evidence_id"])
        if band["breach"]:
            _emit("map", n, action="highlight", asset_ids=[x["asset_id"] for x in band["contributors"]], tone="alert")
    _emit("node", n, status="end", summary=(f"FORECAST_BAND_BREACH ({band['fy']})" if band and band["breach"] else "forecast band computed"))
    return {"forecast": f, "evidence": _evidence(ids), "messages": ["forecast"]}


def fusion_uncertainty(state: AuditState) -> dict:
    from et_fusion import discrepancy_z, inverse_variance, verdict

    n = "FusionUncertainty"
    sc = state["scorecard"]
    _emit("node", n, status="start", label="Inverse-variance fusion and z-scores")
    est = dict(state.get("estimates") or {})
    s1 = dict(est.get("S1") or {})
    rep = sc["scopes"]["S1"].get("reported")
    ind = s1.get("independent")
    out = {}
    if rep and ind:
        m, s = inverse_variance(rep["value_t"], rep["sigma_t"], ind["value_t"], ind["sigma_t"])
        z = discrepancy_z(ind["value_t"], ind["sigma_t"], rep["value_t"], rep["sigma_t"])
        v = verdict(z, "LOW_COVERAGE" in ind["flags"])
        _emit("tool", n, tool="inverse_variance", input={"reported": f"{rep['value_t'] / 1e6:.1f}±{rep['sigma_t'] / 1e6:.1f}", "independent": f"{ind['value_t'] / 1e6:.1f}±{ind['sigma_t'] / 1e6:.1f}"},
              output=f"fused {m / 1e6:,.1f} ± {s / 1e6:,.1f} Mt · z = {z:+.2f}")
        out["S1"] = {**s1, "reported": rep, "fused": {"value_t": m, "sigma_t": s}, "z": z, "gap_pct": (ind["value_t"] - rep["value_t"]) / rep["value_t"] * 100, "verdict": v}
    else:
        out["S1"] = {**s1, "reported": None, "verdict": sc["scopes"]["S1"]["verdict"]}
    s2 = dict(est.get("S2") or {})
    if s2.get("independent") and s2.get("reported"):
        r2, i2 = s2["reported"], s2["independent"]
        m2, sd2 = inverse_variance(r2["value_t"], r2["sigma_t"], i2["value_t"], i2["sigma_t"])
        z2 = discrepancy_z(i2["value_t"], i2["sigma_t"], r2["value_t"], r2["sigma_t"])
        out["S2"] = {**s2, "fused": {"value_t": m2, "sigma_t": sd2}, "z": z2, "gap_pct": (i2["value_t"] - r2["value_t"]) / r2["value_t"] * 100, "verdict": verdict(z2, False)}
        _emit("tool", n, tool="inverse_variance", input={"scope": "S2"}, output=f"z = {z2:+.2f}")
    _emit("node", n, status="end", summary=f"S1 verdict: {out['S1']['verdict']['label']}" + (f" (z = {out['S1']['z']:+.2f})" if out["S1"].get("z") is not None else ""))
    return {"estimates": out, "messages": ["fused"]}


def auditor_explainer(state: AuditState) -> dict:
    n = "AuditorExplainer"
    _emit("node", n, status="start", label="Writing cited narrative (citation lock)")
    r = narrator.explain(state)
    _emit("tool", n, tool="narrator", input={"engine": r["engine"], "allowed_evidence": len(state.get("evidence", {}))},
          output=f"{len(r['claims'])} cited claims · {len(r['dropped_sentences'])} sentence(s) dropped by citation lock")
    _emit("narrative", n, text=r["narrative"], engine=r["engine"], claims=r["claims"])
    _emit("node", n, status="end", summary="Narrative cites only evidence collected in this run")
    return {"narrative": r, "messages": ["narrative"]}


def report_generator(state: AuditState) -> dict:
    n = "ReportGenerator"
    _emit("node", n, status="start", label="Rendering Energy & GHG Audit PDF")
    path = report.build(state)
    url = f"/reports/{path.name}"
    _emit("tool", n, tool="pdf_render", output=f"{path.name} ({path.stat().st_size / 1024:.0f} KB)" + (" → S3" if settings.s3_reports_bucket else ""))
    _emit("node", n, status="end", summary="Audit PDF ready", url=url)
    return {"report_url": url}


def build_graph(checkpointer=None):
    g = StateGraph(AuditState)
    g.add_node("Resolver", resolver)
    g.add_node("DisclosureExtractor", disclosure_extractor)
    g.add_node("AssetEnergyEstimator", asset_estimator)
    g.add_node("GridScope2Agent", grid_scope2)
    g.add_node("SatelliteEnergyVerifier", satellite_verifier)
    g.add_node("ChronosForecaster", chronos_forecaster)
    g.add_node("FusionUncertainty", fusion_uncertainty)
    g.add_node("AuditorExplainer", auditor_explainer)
    g.add_node("ReportGenerator", report_generator)
    g.add_edge(START, "Resolver")
    g.add_edge("Resolver", "DisclosureExtractor")
    g.add_edge("Resolver", "AssetEnergyEstimator")
    g.add_edge("DisclosureExtractor", "GridScope2Agent")
    g.add_edge("AssetEnergyEstimator", "SatelliteEnergyVerifier")
    g.add_edge(["AssetEnergyEstimator", "GridScope2Agent"], "ChronosForecaster")
    g.add_edge(["SatelliteEnergyVerifier", "ChronosForecaster", "DisclosureExtractor"], "FusionUncertainty")
    g.add_edge("FusionUncertainty", "AuditorExplainer")
    g.add_edge("AuditorExplainer", "ReportGenerator")
    g.add_edge("ReportGenerator", END)
    return g.compile(checkpointer=checkpointer or InMemorySaver())


GRAPH = build_graph()
NODES = ["Resolver", "DisclosureExtractor", "AssetEnergyEstimator", "GridScope2Agent", "SatelliteEnergyVerifier", "ChronosForecaster", "FusionUncertainty", "AuditorExplainer", "ReportGenerator"]


def _final_payload(state: dict) -> dict:
    est = state.get("estimates", {})
    return {"type": "result", "run_id": state.get("run_id"), "company": state.get("company_id"), "estimates": est, "narrative": state.get("narrative"),
            "report_url": state.get("report_url"), "evidence_ids": sorted(state.get("evidence", {}).keys()), "forecast_mode": (state.get("forecast") or {}).get("mode")}


async def stream_audit(query: str, *, run_id: str | None = None, auto_approve: bool = False, hitl_decision: dict | None = None,
                       resume: dict | None = None) -> AsyncIterator[dict]:
    """Yield UI events. Pass `resume` with the same run_id to continue after a HITL interrupt."""
    run_id = run_id or uuid.uuid4().hex[:12]
    cfg = {"configurable": {"thread_id": run_id}}
    if resume is not None:
        inp: Any = Command(resume=resume)
    else:
        inp = {"run_id": run_id, "query": query, "auto_approve": auto_approve, "evidence": {}, "estimates": {}, "messages": [], "map_actions": [],
               **({"hitl_decision": hitl_decision} if hitl_decision else {})}
        yield {"type": "run", "run_id": run_id, "nodes": NODES, "ts": time.time()}
    q: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def worker():
        try:
            for mode, chunk in GRAPH.stream(inp, cfg, stream_mode=["custom", "updates"]):
                if mode == "custom":
                    loop.call_soon_threadsafe(q.put_nowait, chunk)
                elif mode == "updates" and "__interrupt__" in chunk:
                    loop.call_soon_threadsafe(q.put_nowait, {"type": "interrupt", "run_id": run_id, "value": chunk["__interrupt__"][0].value})
            snap = GRAPH.get_state(cfg)
            if not snap.next:
                loop.call_soon_threadsafe(q.put_nowait, _final_payload(snap.values))
        except Exception as e:
            loop.call_soon_threadsafe(q.put_nowait, {"type": "error", "message": f"{type(e).__name__}: {e}"})
        finally:
            loop.call_soon_threadsafe(q.put_nowait, None)

    loop.run_in_executor(None, worker)
    while True:
        ev = await q.get()
        if ev is None:
            break
        ev.setdefault("run_id", run_id)
        yield ev


def run_sync(query: str, auto_approve: bool = True, on_event: Callable[[dict], None] | None = None) -> dict:
    """Blocking helper for tests / CLI."""
    async def go():
        last = {}
        async for ev in stream_audit(query, auto_approve=auto_approve):
            if on_event:
                on_event(ev)
            last = ev
        return last
    return asyncio.run(go())
