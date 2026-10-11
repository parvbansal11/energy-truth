"""Strands Agents SDK "Judge Agent" (AWS open source, plan §8.1): a conversational façade over the SAME tools the
LangGraph audit uses. Answers questions like "which demo company diverges most in power?" with cited evidence.
Runs on Amazon Nova (Bedrock) when the account has quota, else on Gemini; with neither, the API reports it as
unavailable rather than faking answers."""
from __future__ import annotations

import json

from strands import Agent, ModelRetryStrategy, tool

from et_core.config import settings

from . import tools as T

SYSTEM = (
    "You are ENERGY TRUTH's judge agent for Indian corporate energy-carbon disclosures. Use the tools; never invent numbers. "
    "Every number you state must come from a tool result, followed by its evidence id in square brackets. "
    "Low coverage means a gap is inconclusive; say so rather than accusing a company."
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


def _models():
    """Strands models in the shared chain's order (et_core.llm): Bedrock, then each Gemini model."""
    from et_core.config import env
    from et_core.llm import GEMINI_FALLBACK_MODELS, _model_down, _secret, bedrock_usable, providers, thinking_knob

    for p in providers():
        if p == "bedrock" and bedrock_usable():  # Strands' own retries are slow on a zero-quota account
            from strands.models import BedrockModel

            yield BedrockModel(model_id=settings.bedrock_text_model, region_name=settings.region, temperature=0.1), f"bedrock:{settings.bedrock_text_model}"
        elif p == "gemini":
            from strands.models.gemini import GeminiModel

            for mid in dict.fromkeys((env("GEMINI_MODEL", "gemini-3.5-flash"), *GEMINI_FALLBACK_MODELS)):
                if __import__("time").time() - _model_down.get(mid, 0) <= 600:
                    continue
                params = {"temperature": 0.1, **({"thinking_config": {"thinking_budget": 0}} if thinking_knob(mid) else {})}
                yield GeminiModel(client_args={"api_key": _secret("GEMINI_API_KEY")}, model_id=mid, params=params), f"gemini:{mid}"
        elif p == "ollama":
            try:
                from strands.models.ollama import OllamaModel
            except ImportError:  # the `ollama` client is installed on the EC2 box only
                continue
            mid = env("OLLAMA_MODEL", "qwen2.5:3b")
            yield OllamaModel(host=env("OLLAMA_URL", "http://127.0.0.1:11434"), model_id=mid, temperature=0.1), f"ollama:{mid}"


def ask(question: str) -> dict:
    import time

    from et_core import llm

    errors = []
    for model, name in _models():
        # fail fast on throttling (free-tier Gemini) and move to the next model instead of backing off for minutes
        agent = Agent(model=model, system_prompt=SYSTEM, tools=[list_scorecards, company_plants, grid_intensity_latest, evidence_lookup], callback_handler=None,
                      retry_strategy=ModelRetryStrategy(max_attempts=2, initial_delay=2, max_delay=4))
        try:
            return {"available": True, "answer": str(agent(question)), "model": name}
        except Exception as e:  # throttled / busy model: move on to the next one
            errors.append(f"{name}: {type(e).__name__}")
            if name.startswith("bedrock"):
                llm._down["bedrock"] = time.time()
            if name.startswith("gemini") and "Throttl" in type(e).__name__:
                llm._model_down[name.split(":", 1)[1]] = time.time()
    return {"available": False, "reason": "No AI provider answered: " + "; ".join(errors) if errors else "No AI provider is configured."}
