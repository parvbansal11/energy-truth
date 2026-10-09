"""Strands Agents SDK "Judge Agent" (AWS open source, plan §8.1): a conversational façade over the SAME tools the
LangGraph audit uses. Answers questions like "which demo company diverges most in power?" with cited evidence.
Requires Bedrock (Amazon Nova); without credentials the API reports it as unavailable rather than faking answers."""
from __future__ import annotations

import json

from strands import Agent, tool

from et_core.config import settings

from . import tools as T

SYSTEM = (
    "You are ENERGY TRUTH's judge agent for Indian corporate energy-carbon disclosures. Use the tools; never invent numbers. "
    "Every number you state must come from a tool result, followed by its evidence id in square brackets. "
    "Low coverage means a gap is inconclusive — say so rather than accusing a company."
)


@tool
def list_scorecards() -> str:
    """Return reported vs independent Scope 1/2, z-scores, coverage and verdict for every demo company."""
    out = []
    for s in T.store.read("scorecards", []):
        s1 = s["scopes"]["S1"]
        out.append({"symbol": s["symbol"], "fy": s["fy"], "reported_t": (s1.get("reported") or {}).get("value_t"), "independent_t": s1["independent"]["value_t"],
                    "z": s1.get("z"), "verdict": s1["verdict"]["label"], "rho_effective": s["coverage"]["rho_effective"],
                    "evidence": (s1.get("reported") or {}).get("evidence_ids", []) + s1["independent"]["evidence_ids"][:2]})
    return json.dumps(out)


@tool
def company_plants(symbol: str, top: int = 10) -> str:
    """Largest Climate TRACE plants for a company with ownership weight, confidence and evidence ids."""
    rows = sorted([a for a in T.company_assets(symbol) if a["ct"]], key=lambda a: -a["ct"]["emissions_t"].get("2024", 0))[:top]
    return json.dumps([{"name": a["name"], "cy2024_t": a["ct"]["emissions_t"].get("2024"), "weight": a["ownership_weight"], "confidence": a["ct"]["confidence"],
                        "evidence": a["evidence_ids"][-1]} for a in rows])


@tool
def grid_intensity_latest() -> str:
    """Latest CEA-calibrated monthly grid intensity for India and POSOCO regions plus Chronos forecast."""
    g = T.grid_intensity()
    return json.dumps({"month": g["months"][-1], "latest": {k: v[-1] for k, v in g["series"].items()}, "forecast_india": g["forecasts"].get("India"), "evidence": g["evidence_ids"]})


@tool
def evidence_lookup(evidence_id: str) -> str:
    """Resolve an evidence id to its source (URL, page, quote, hash)."""
    return json.dumps(T.get_evidence([evidence_id]))


def build_agent() -> Agent:
    from strands.models import BedrockModel

    model = BedrockModel(model_id=settings.bedrock_text_model, region_name=settings.region, temperature=0.1)
    return Agent(model=model, system_prompt=SYSTEM, tools=[list_scorecards, company_plants, grid_intensity_latest, evidence_lookup], callback_handler=None)


def ask(question: str) -> dict:
    if not settings.bedrock_enabled:
        return {"available": False, "reason": "Bedrock credentials are not configured (AGENTS.md Step 1.C). The Strands judge agent runs only against Amazon Nova."}
    agent = build_agent()
    res = agent(question)
    return {"available": True, "answer": str(res), "model": settings.bedrock_text_model}
