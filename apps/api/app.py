"""ENERGY TRUTH HTTP + WebSocket API. Runs locally with uvicorn and on AWS Lambda via Mangum (handler.py).
All numbers come from curated tables produced by `python -m et_fusion.pipeline`."""
from __future__ import annotations

import json
import os
import time
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel

from et_core import llm
from et_core.config import env, settings
from et_core.store import store

app = FastAPI(title="ENERGY TRUTH API", version="1.0.0")
origins = [o for o in env("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])


def _need(name: str):
    doc = store.read(name)
    if doc is None:
        raise HTTPException(503, f"curated table '{name}' missing · run `make pipeline`")
    return doc


@app.get("/health")
def health():
    m = store.read("manifest") or {}
    return {"status": "ok", "service": "energy-truth-api", "data_ready": bool(m), "generated_at": m.get("generated_at"), "bedrock": settings.bedrock_enabled, "ai": llm.status(),
            "live_add": not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"), "companies": len(m.get("companies", [])),
            "chronos_backend": f"sagemaker:{settings.chronos_endpoint}" if settings.chronos_endpoint else "local-cpu"}


@app.get("/meta")
def meta():
    return {"manifest": _need("manifest"), "layers": store.read("layers", {}), "hitl_threshold": settings.hitl_threshold, "bedrock": settings.bedrock_enabled}


@app.get("/companies")
def companies():
    out = []
    for s in _need("scorecards"):
        s1 = s["scopes"]["S1"]
        out.append({"symbol": s["symbol"], "name": s["name"], "short": s["short"], "sector": s["sector"], "fy": s["fy"], "boundary": s["boundary"],
                    "reported_t": (s1.get("reported") or {}).get("value_t"), "independent_t": s1["independent"]["value_t"], "z": s1.get("z"),
                    "verdict": s1["verdict"], "coverage": {k: s["coverage"][k] for k in ["rho", "rho_effective", "ct_linked_assets", "gem_assets"]},
                    "has_disclosure": bool(s1.get("reported")), "band_breach": bool((s.get("band") or {}).get("breach"))})
    return {"companies": out}


@app.get("/companies/{symbol}/scorecard")
def scorecard(symbol: str):
    s = next((x for x in _need("scorecards") if x["symbol"] == symbol.upper()), None)
    if not s:
        raise HTTPException(404, "unknown company")
    return s


@app.get("/companies/{symbol}/assets")
def company_assets(symbol: str):
    rows = [a for a in _need("assets") if a["company"] == symbol.upper()]
    slim = []
    for a in rows:
        slim.append({k: a.get(k) for k in ["asset_id", "company", "name", "sector", "subsector", "fuel", "asset_type", "country", "state", "region", "lat", "lon",
                                          "ownership_weight", "weights", "weight_source", "match", "evidence_ids", "target_construction"]}
                    | {"ct": a["ct"] and {k: a["ct"][k] for k in ["source_id", "emissions_t", "confidence", "rel_sigma", "capacity", "capacity_units", "activity", "activity_units", "emissions_factor", "emissions_factor_units"]},
                       "gem": a["gem"], "fy_t": _fy_value(a)})
    return {"assets": slim}


def _fy_value(a: dict) -> float | None:
    """Full-facility tonnes in the comparison FY (Apr-Mar sum of the calibrated monthly series), as the pipeline uses."""
    m = a.get("monthly_t")
    if not m:
        return None
    from et_connectors.registry import COMPARE_FY

    y0 = int(COMPARE_FY[2:6])
    months = [f"{y0}-{k:02d}" for k in range(4, 13)] + [f"{y0 + 1}-{k:02d}" for k in range(1, 4)]
    return round(sum(float(m.get(k, 0)) for k in months), 1) if all(k in m for k in months) else None


@app.get("/assets/{asset_id}")
def asset_detail(asset_id: str):
    a = next((x for x in _need("assets") if x["asset_id"] == asset_id), None)
    if not a:
        raise HTTPException(404, "unknown asset")
    fc = (store.read("forecasts") or {}).get("assets", {}).get(asset_id)
    cluster = next(({"company": k, **v} for k, v in ((store.read("forecasts") or {}).get("clusters") or {}).items() if asset_id in v["assets"]), None)
    return {"asset": a, "forecast": fc, "cluster": cluster and {"company": cluster["company"], "names": cluster["names"], "forecast": cluster["forecasts"].get(asset_id)}}


@lru_cache(maxsize=256)
def _scene(lat: float, lon: float, bucket: int):
    from et_connectors.stac import latest_scene

    scene, ev = latest_scene(lon, lat)
    return scene, ev and ev.to_dict()


@app.get("/assets/{asset_id}/sentinel")
def asset_sentinel(asset_id: str):
    a = next((x for x in _need("assets") if x["asset_id"] == asset_id), None)
    if not a or a["lat"] is None:
        raise HTTPException(404, "unknown asset")
    try:
        scene, ev = _scene(round(a["lat"], 4), round(a["lon"], 4), int(time.time() // 21600))
    except Exception as e:
        raise HTTPException(502, f"Sentinel-2 STAC unavailable: {type(e).__name__}")
    return {"scene": scene, "evidence": ev}


@app.get("/evidence")
def evidence(ids: str = Query("")):
    want = {i for i in ids.split(",") if i}
    rows = _need("evidence")
    return {"evidence": [e for e in rows if not want or e["id"] in want]}


@app.get("/evidence/{eid}")
def evidence_one(eid: str):
    e = next((x for x in _need("evidence") if x["id"] == eid), None)
    if not e:
        raise HTTPException(404, "unknown evidence")
    return e


@app.get("/grid")
def grid():
    return _need("grid")


@app.get("/grid/regions")
def grid_regions():
    return _need("grid_regions")


@app.get("/eval/chronos")
def eval_chronos():
    p = Path(__file__).resolve().parents[2] / "energy_truth_eval" / "chronos_backtest_posoco_result.json"
    doc = store.read("chronos_backtest") or (json.loads(p.read_text()) if p.exists() else None)
    if not doc:
        raise HTTPException(503, "backtest not run · `make backtest`")
    clusters = (store.read("forecasts") or {}).get("clusters", {})
    return {"backtest": doc, "clusters": clusters}


@app.get("/alerts")
def alerts():
    return {"alerts": store.read("alerts", [])}


@app.post("/alerts/run")
def alerts_run():
    """Re-evaluate alert rules on curated data and publish to SNS when configured (EventBridge schedule calls this)."""
    from et_agents.alerts import evaluate

    return evaluate(publish=True)


class WhatIf(BaseModel):
    symbol: str
    re_share_pct: float = 0.0
    shift_pct: float = 0.0
    region: str | None = None


@app.post("/whatif/scope2")
def whatif(body: WhatIf):
    from et_agents.whatif import scope2_whatif

    try:
        return scope2_whatif(body.symbol.upper(), body.re_share_pct, body.shift_pct, body.region)
    except KeyError as e:
        raise HTTPException(404, str(e))


@app.post("/reports/{symbol}")
def make_report(symbol: str):
    from et_agents.report import build
    from et_agents.whatif import state_from_store

    st = state_from_store(symbol.upper())
    if not st:
        raise HTTPException(404, "unknown company")
    path = build(st)
    return {"url": f"/reports/{path.name}", "bytes": path.stat().st_size, "evidence_count": len(st["evidence"])}


@app.get("/reports/{name}")
def get_report(name: str):
    if "/" in name or not name.endswith(".pdf"):
        raise HTTPException(400, "bad name")
    p = settings.reports_dir / name
    if p.exists():
        return FileResponse(p, media_type="application/pdf", filename=name)
    if settings.s3_reports_bucket:
        import boto3

        url = boto3.client("s3", region_name=settings.region).generate_presigned_url("get_object", Params={"Bucket": settings.s3_reports_bucket, "Key": f"reports/{name}"}, ExpiresIn=3600)
        return RedirectResponse(url)
    raise HTTPException(404, "report not found")


# ---------------------------------------------------------------- live "add a company" (EC2 backend)
import os
import re
import threading
import uuid

_jobs: dict[str, dict] = {}
_job_lock = threading.Lock()


class AddCompany(BaseModel):
    entity_id: str
    name: str
    symbol: str | None = None
    sector: str | None = None
    brsr_url: str | None = None


@app.get("/gem/search")
def gem_search(q: str = Query(..., min_length=2)):
    """GEM Ownership API entity search, Indian entities first. Marks companies already tracked."""
    import httpx

    from et_connectors.registry import COMPANIES

    r = httpx.get(f"{settings.gem_api}/entities", params={"q": q, "limit": 25}, timeout=40)
    r.raise_for_status()
    tracked = {m["entity_id"]: s for s, m in COMPANIES.items()}
    rows = [{"entity_id": x["entity_id"], "name": x.get("full_name") or x["name"], "country": x.get("headquarters_country"),
             "listed": x.get("PubliclyListed") == "1", "tracked": tracked.get(x["entity_id"])} for x in r.json().get("results", [])]
    rows.sort(key=lambda x: (x["country"] != "India", not x["listed"]))
    return {"results": rows[:12], "evidence": {"publisher": "Global Energy Monitor", "url": str(r.url)}}


def _run_add(job_id: str, body: AddCompany) -> None:
    from et_connectors.registry import COMPANIES, register
    from et_fusion import pipeline

    job = _jobs[job_id]
    say = lambda m: job["log"].append({"t": time.time(), "msg": m})
    pipeline._listeners.append(say)
    try:
        sym = body.symbol or re.sub(r"[^A-Z0-9]", "", body.name.upper().replace(" LTD", "").replace(" LIMITED", ""))[:12]
        if sym in COMPANIES and COMPANIES[sym]["entity_id"] != body.entity_id:
            sym = (sym + body.entity_id[-4:])[:14]
        meta = {"symbol": sym, "name": body.name, "short": body.name.replace(" Ltd", "").replace(" Limited", "")[:22], "entity_id": body.entity_id,
                "cin": None, "sector": body.sector or "Industrial", "boundary": "standalone", "custom": True,
                "brsr": [{"fy": "FY2024-25", "url": body.brsr_url, "file": f"{sym.lower()}-fy2025.pdf"}] if body.brsr_url else []}
        register(meta)
        job.update(symbol=sym, status="running")
        say(f"Registered {body.name} as {sym} (GEM {body.entity_id})")
        try:
            import chronos  # noqa: F401  (Chronos-2 on CPU is available on the EC2 box)
            skip = False
        except Exception:
            skip = True
            say("Chronos-2 not installed here: skipping forecasts")
        out = pipeline.run(only=[sym], skip_forecast=skip)
        sc = (out.get("scorecards") or [None])[0]
        if not sc or not sc["scopes"]["S1"]["independent"]["value_t"]:
            job.update(status="done", warning="No Climate TRACE emitting assets are linked to this owner, so there is nothing to rebuild yet.")
        else:
            job.update(status="done")
        say("Done")
    except Exception as e:
        job.update(status="error", error=f"{type(e).__name__}: {str(e)[:300]}")
    finally:
        pipeline._listeners.remove(say)
        _job_lock.release()


@app.post("/companies/add")
def add_company(body: AddCompany):
    if os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        raise HTTPException(501, "Adding companies runs on the EC2 backend (Lambda cannot run the full pipeline).")
    if not re.fullmatch(r"E\d{12}", body.entity_id):
        raise HTTPException(400, "entity_id must be a GEM entity id like E100000001926")
    if body.brsr_url and not body.brsr_url.startswith("https://"):
        raise HTTPException(400, "brsr_url must be an https link to the company's BRSR PDF")
    if not _job_lock.acquire(blocking=False):
        raise HTTPException(409, "Another company is being added right now. Try again in a minute.")
    job_id = uuid.uuid4().hex[:12]
    _jobs[job_id] = {"job_id": job_id, "status": "queued", "log": [], "started": time.time(), "name": body.name}
    threading.Thread(target=_run_add, args=(job_id, body), daemon=True).start()
    return _jobs[job_id]


@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "unknown job")
    return job


class Question(BaseModel):
    question: str


@app.post("/judge")
def judge(q: Question):
    from et_agents.judge import ask

    return ask(q.question)


@app.websocket("/ws")
async def ws_audit(ws: WebSocket):
    """Client sends {"action":"audit","company":"NTPC","auto_approve":false} or {"action":"resume","run_id":"..","decision":"accept|exclude"}."""
    from et_agents.graph import stream_audit

    await ws.accept()
    try:
        while True:
            msg = json.loads(await ws.receive_text())
            if msg.get("action") == "audit":
                gen = stream_audit(msg.get("company", "NTPC"), auto_approve=bool(msg.get("auto_approve")))
            elif msg.get("action") == "resume":
                gen = stream_audit("", run_id=msg["run_id"], resume={"decision": msg.get("decision", "accept"), "by": "analyst"})
            else:
                await ws.send_text(json.dumps({"type": "error", "message": "unknown action"}))
                continue
            async for ev in gen:
                await ws.send_text(json.dumps(ev, default=str))
    except WebSocketDisconnect:
        return
