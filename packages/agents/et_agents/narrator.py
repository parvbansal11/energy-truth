"""AuditorExplainer narrative with a citation lock (plan §8.2). The AI (Bedrock, Gemini or a local model) may only
rephrase one cited fact per sentence: each sentence must keep exactly that fact's numbers and may not add number
words or loaded words the fact does not use. Any sentence that fails falls back to the deterministic template, and
the citation is attached by code, never by the model."""
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


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def facts_from_state(state: dict) -> list[dict]:
    """Atomic, cited facts the narrator is allowed to use. Each is unambiguous on its own, because the AI may only
    rephrase one fact per sentence (see `lock_sentence`)."""
    c, sc = state["company"], state.get("scorecard") or {}
    est = state.get("estimates", {})
    s1, s2 = est.get("S1", {}), est.get("S2", {})
    cov = sc.get("coverage", {})
    boundary = sc.get("boundary") or c.get("boundary") or "reporting"
    f = []
    rep1, ind1 = s1.get("reported"), s1.get("independent")
    ind_cite = (ind1 or {}).get("evidence_ids", [None])[0] if ind1 else None
    if rep1:
        f.append({"key": "s1_reported", "text": f"{c['short']} reported {mt(rep1['value_t'])} Mt of Scope 1 emissions for {sc['fy']} ({rep1['boundary']} boundary, BRSR page {rep1['page']})", "cite": rep1["evidence_ids"][0]})
    elif ind1:
        f.append({"key": "s1_reported", "text": f"No BRSR Scope 1 figure has been ingested for {c['short']} yet, so there is no reported number to compare and only the independent rebuild is shown", "cite": ind_cite})
    if ind1:
        n = ind1.get("n_assets", len([a for a in state.get("assets", []) if a.get("ct")]))
        f.append({"key": "s1_independent", "text": f"The independent Scope 1 rebuild from {_plural(n, 'plant')} in public data is {mt(ind1['value_t'])} ± {mt(ind1['sigma_t'])} Mt", "cite": ind_cite})
    if s1.get("z") is not None:
        direction = "higher" if s1["gap_pct"] > 0 else "lower"
        f.append({"key": "s1_z", "text": f"The rebuild is {abs(s1['gap_pct']):.1f}% {direction} than reported (z = {s1['z']:.2f}), which reads as: {s1['verdict']['label']}", "cite": rep1["evidence_ids"][0] if rep1 else None})
    if cov and cov.get("operating_emitting_locations"):
        m, t = cov["operating_emitting_matched"], cov["operating_emitting_locations"]
        f.append({"key": "coverage", "text": f"{m} of {t} operating emitting plants inside the {boundary} boundary have an independent estimate ({round(100 * m / t)}% coverage)", "cite": (cov.get("evidence_ids") or [None])[0]})
        if cov.get("unmatched_emitting"):
            f.append({"key": "missing", "text": "Owned plants with no independent estimate yet: " + ", ".join(cov["unmatched_emitting"][:3]), "cite": (cov.get("evidence_ids") or [None])[0]})
    if s2.get("independent") and s2.get("reported"):
        f.append({"key": "s2", "text": f"Scope 2 rebuilt from the company's electricity use is {qty(s2['independent']['value_t'])} against {qty(s2['reported']['value_t'])} reported", "cite": s2["independent"]["evidence_ids"][1]})
    band = (state.get("forecast") or {}).get("band")
    if band:
        f.append({"key": "band", "text": f"The {band['fy']} BRSR figure of {mt(band['reported_t'])} Mt is {'outside' if band['breach'] else 'inside'} the Chronos-2 forecast range of {mt(band['q10_t'])} to {mt(band['q90_t'])} Mt", "cite": band["reported_evidence_id"]})
    return [x for x in f if x["cite"]]


def _sentence(fact: dict, text: str) -> str:
    t = text.strip().rstrip(".")
    return t[0].upper() + t[1:] + f" [{fact['cite']}]."


def template_narrative(state: dict, facts: list[dict]) -> str:
    return " ".join(_sentence(x, x["text"]) for x in facts)


# words that change meaning or tone; allowed only when the fact itself already uses them
GUARDED = re.compile(r"\b(one|two|three|four|five|six|seven|eight|nine|ten|single|only|just|all|every|none|no|not|never|"
                     r"fraud\w*|misreport\w*|mislead\w*|false\w*|lie\w*|cheat\w*|manipulat\w*|inflat\w*|hid\w*|conceal\w*|"
                     r"under-?report\w*|over-?report\w*|wrong\w*|error\w*|accura\w*|inaccura\w*|verif\w*|prove\w*|confirm\w*)\b", re.I)


def lock_sentence(fact: dict, text: str) -> str | None:
    """Accept an AI sentence for one fact only if it keeps exactly the fact's numbers, adds no guarded words the
    fact does not use, and adds no citation of its own. Otherwise None (the template sentence is used)."""
    if not text or CITE.search(text) or "[" in text:
        return None
    norm = lambda s: sorted(n.replace(",", "") for n in NUMBER.findall(s))
    if norm(text) != norm(fact["text"]):
        return None
    neg = {"no", "not", "none", "never"}
    fam = lambda w: "<neg>" if w.lower() in neg else w.lower()  # a fact that negates may be paraphrased with any negation
    fact_words = {fam(w) for w in GUARDED.findall(fact["text"])}
    if any(fam(w) not in fact_words for w in GUARDED.findall(text)):
        return None
    if fact["key"] == "s1_reported" and "No BRSR" in fact["text"] and re.search(r"\breported\s+\d", text):
        return None
    if fact["key"] == "s1_z":  # the verdict must survive the rephrasing (e.g. "Watch", "Significant gap")
        label = fact["text"].rsplit(":", 1)[-1]
        if not all(w in text.lower() for w in re.findall(r"[a-z]+", label.lower())):
            return None
    return text


def llm_narrative(state: dict, facts: list[dict]) -> tuple[list[str | None], str]:
    """Ask the AI to rephrase each fact as one plain sentence. Returns one candidate per fact (None if missing)."""
    from et_core.llm import complete_json

    prompt = ("Rephrase each fact below as ONE clear sentence for an ESG analyst. Rules: keep every number exactly as written "
              "(same digits, same units); add no numbers, no new claims, no judgement words, no citations; do not change "
              "what the fact says. Return JSON {\"sentences\": [{\"key\": \"<fact key>\", \"text\": \"<sentence>\"}]} in the same order.\nFACTS:\n"
              + json.dumps([{"key": x["key"], "fact": x["text"]} for x in facts], indent=1, ensure_ascii=False))
    data, engine = complete_json(prompt, max_tokens=1200, temperature=0.1)
    by = {str(r.get("key")): str(r.get("text", "")) for r in data.get("sentences", []) if isinstance(r, dict)}
    return [by.get(x["key"]) for x in facts], engine


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
    candidates, engine = [None] * len(facts), "template"
    try:
        candidates, engine = llm_narrative(state, facts)
    except Exception:
        engine = "template (no AI provider answered)"
    sentences, ai_used, rejected = [], 0, []
    for fact, cand in zip(facts, candidates):
        ok = lock_sentence(fact, cand) if cand else None
        if ok:
            ai_used += 1
        elif cand:
            rejected.append(cand)
        sentences.append(_sentence(fact, ok or fact["text"]))
    text = " ".join(sentences)
    if facts and engine != "template" and not engine.startswith("template"):
        engine = f"{engine} ({ai_used} of {len(facts)} sentences; the rest use the checked template)" if ai_used < len(facts) else engine
    locked, dropped = citation_lock(text, facts, allowed)  # final belt-and-braces check on the assembled note
    claims = [{"text": x["text"], "evidence_id": x["cite"]} for x in facts]
    return {"narrative": locked, "engine": engine, "dropped_sentences": dropped + rejected, "claims": claims}
