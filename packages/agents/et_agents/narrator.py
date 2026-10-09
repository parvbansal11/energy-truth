"""AuditorExplainer narrative with a citation lock (plan §8.2): the narrative may cite only evidence present in
state, and every number it states must come from the facts table. Amazon Nova writes the prose when Bedrock is
available; otherwise a deterministic template renders the same facts. Either way the validator runs."""
from __future__ import annotations

import json
import re

from et_core.config import settings

CITE = re.compile(r"\[(ev_[a-z_]+_[0-9a-f]{10})\]")
NUMBER = re.compile(r"(?<![\w.])(-?\d+(?:,\d{3})*(?:\.\d+)?)(?![\w])")


def mt(v: float | None) -> str:
    return "n/a" if v is None else f"{v / 1e6:,.1f}"


def qty(v: float | None) -> str:
    """Mt for large values, kt below 1 Mt (NTPC Scope 2 is ~65 kt)."""
    if v is None:
        return "n/a"
    return f"{v / 1e6:,.1f} Mt" if abs(v) >= 1e6 else f"{v / 1e3:,.1f} kt"


def facts_from_state(state: dict) -> list[dict]:
    """Atomic, cited facts the narrator is allowed to use (kept terse on purpose)."""
    c, sc = state["company"], state.get("scorecard") or {}
    est = state.get("estimates", {})
    s1, s2 = est.get("S1", {}), est.get("S2", {})
    cov = sc.get("coverage", {})
    f = []
    rep1 = s1.get("reported")
    if rep1:
        f.append({"key": "s1_reported", "text": f"{c['short']} reported {mt(rep1['value_t'])} Mt Scope 1 for {sc['fy']} ({rep1['boundary']}, BRSR p.{rep1['page']})", "cite": rep1["evidence_ids"][0]})
    ind1 = s1.get("independent")
    if ind1:
        n = ind1.get("n_assets", len([a for a in state.get("assets", []) if a.get("ct")]))
        f.append({"key": "s1_independent", "text": f"rebuilt from {n} plants: {mt(ind1['value_t'])} ± {mt(ind1['sigma_t'])} Mt", "cite": (ind1.get("evidence_ids") or [None])[0]})
    if s1.get("z") is not None:
        f.append({"key": "s1_z", "text": f"gap {s1['gap_pct']:+.1f}%, z = {s1['z']:.2f}: {s1['verdict']['label']}", "cite": rep1["evidence_ids"][0] if rep1 else None})
    if cov:
        f.append({"key": "coverage", "text": f"coverage {cov['operating_emitting_matched']} of {cov['operating_emitting_locations']} in-boundary emitters (rho_eff {cov['rho_effective']:.2f})", "cite": (cov.get("evidence_ids") or [None])[0]})
        if cov.get("unmatched_emitting"):
            f.append({"key": "missing", "text": "missing: " + ", ".join(cov["unmatched_emitting"][:3]), "cite": (cov.get("evidence_ids") or [None])[0]})
    if s2.get("independent") and s2.get("reported"):
        f.append({"key": "s2", "text": f"Scope 2 rebuilt {qty(s2['independent']['value_t'])} vs {qty(s2['reported']['value_t'])} reported", "cite": s2["independent"]["evidence_ids"][1]})
    band = (state.get("forecast") or {}).get("band")
    if band:
        f.append({"key": "band", "text": f"{band['fy']} BRSR {mt(band['reported_t'])} Mt is {'outside' if band['breach'] else 'inside'} the Chronos band {mt(band['q10_t'])} to {mt(band['q90_t'])} Mt", "cite": band["reported_evidence_id"]})
    return [x for x in f if x["cite"]]


def template_narrative(state: dict, facts: list[dict]) -> str:
    by = {x["key"]: x for x in facts}
    parts = []
    for k in ["s1_reported", "s1_independent", "s1_z", "coverage", "missing", "s2", "band"]:
        if k in by:
            t = by[k]["text"]
            parts.append(t[0].upper() + t[1:] + f" [{by[k]['cite']}].")
    return " ".join(parts)


def nova_narrative(state: dict, facts: list[dict]) -> str:
    import boto3

    prompt = ("Write a 5-7 sentence audit note for an ESG analyst using ONLY these facts. Copy numbers exactly. "
              "End each sentence with the citation tag of the fact it uses, e.g. [ev_x_0123456789]. No other numbers. "
              "Do not accuse the company; explain uncertainty and coverage.\nFACTS:\n" + json.dumps([{"fact": x["text"], "cite": x["cite"]} for x in facts], indent=1))
    r = boto3.client("bedrock-runtime", region_name=settings.region).converse(
        modelId=settings.bedrock_text_model, messages=[{"role": "user", "content": [{"text": prompt}]}], inferenceConfig={"maxTokens": 700, "temperature": 0.2})
    return r["output"]["message"]["content"][0]["text"].strip()


def citation_lock(text: str, facts: list[dict], allowed_ids: set[str]) -> tuple[str, list[str]]:
    """Drop sentences that cite unknown evidence, cite nothing, or contain numbers absent from the facts."""
    allowed_numbers = {n.replace(",", "") for x in facts for n in NUMBER.findall(x["text"])}
    kept, dropped = [], []
    for sent in re.split(r"(?<=[.])\s+", text):
        cites = CITE.findall(sent)
        nums = {n.replace(",", "") for n in NUMBER.findall(CITE.sub("", sent))}
        if not cites or any(c not in allowed_ids for c in cites) or not nums <= allowed_numbers:
            dropped.append(sent)
        else:
            kept.append(sent)
    return " ".join(kept), dropped


def explain(state: dict) -> dict:
    facts = facts_from_state(state)
    allowed = set(state.get("evidence", {}).keys())
    engine = "template"
    text = template_narrative(state, facts)
    if settings.bedrock_enabled:
        try:
            text = nova_narrative(state, facts)
            engine = f"bedrock:{settings.bedrock_text_model}"
        except Exception:
            engine = "template (bedrock call failed)"
    locked, dropped = citation_lock(text, facts, allowed)
    claims = [{"text": x["text"], "evidence_id": x["cite"]} for x in facts]
    return {"narrative": locked, "engine": engine, "dropped_sentences": dropped, "claims": claims}
