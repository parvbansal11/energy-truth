"""Agent graph + citation lock tests on the curated tables (run `make pipeline` first)."""
import os
from pathlib import Path

import pytest

from et_agents.narrator import citation_lock

ROOT = Path(__file__).resolve().parents[3]
curated = pytest.mark.skipif(not (ROOT / "data" / "curated" / "scorecards.json").exists(), reason="run make pipeline first")


def test_citation_lock_drops_uncited_unknown_and_invented_numbers():
    facts = [{"text": "NTPC reported 327.0 Mt", "cite": "ev_pdf_page_0123456789"}]
    text = ("NTPC reported 327.0 Mt [ev_pdf_page_0123456789]. "
            "It emitted 999 Mt [ev_pdf_page_0123456789]. "
            "Unknown source says so [ev_api_payload_aaaaaaaaaa]. "
            "No citation here.")
    kept, dropped = citation_lock(text, facts, {"ev_pdf_page_0123456789"})
    assert kept == "NTPC reported 327.0 Mt [ev_pdf_page_0123456789]."
    assert len(dropped) == 3


@curated
def test_audit_graph_streams_every_node_and_cites_only_state_evidence():
    os.environ["AGENT_STEP_DELAY"] = "0"
    from et_agents.graph import NODES, run_sync

    events = []
    result = run_sync("NTPC", auto_approve=True, on_event=events.append)
    ended = {e["node"] for e in events if e["type"] == "node" and e.get("status") == "end"}
    assert ended == set(NODES)
    assert result["type"] == "result" and result["report_url"].endswith(".pdf")
    s1 = result["estimates"]["S1"]
    assert round(s1["reported"]["value_t"] / 1e6) == 327
    assert s1["verdict"]["code"] in {"consistent", "watch", "significant_gap", "inconclusive_low_coverage"}
    import re

    cited = set(re.findall(r"\[(ev_[a-z_]+_[0-9a-f]{10})\]", result["narrative"]["narrative"]))
    assert cited and cited <= set(result["evidence_ids"])
    assert any(e["type"] == "map" for e in events)


@curated
def test_hitl_interrupt_and_exclude_resume():
    import asyncio

    os.environ["AGENT_STEP_DELAY"] = "0"
    from et_agents.graph import stream_audit

    async def go():
        evs = [e async for e in stream_audit("TATASTEEL", run_id="t-hitl")]
        assert evs[-1]["type"] == "interrupt" and evs[-1]["value"]["items"]
        after = [e async for e in stream_audit("", run_id="t-hitl", resume={"decision": "exclude"})]
        return after[-1]

    final = asyncio.run(go())
    assert final["type"] == "result"
    assert final["estimates"]["S1"]["verdict"]["code"] == "inconclusive_low_coverage"  # Tata: low coverage, not an accusation


@curated
def test_whatif_scope2_math():
    from et_agents.whatif import scope2_whatif

    r = scope2_whatif("NTPC", re_share_pct=100, shift_pct=0)
    assert r["available"] and r["scenario_t"] == pytest.approx(0)
    base = scope2_whatif("NTPC", 0, 0)
    assert base["baseline_cea_t"] == pytest.approx(64979.66, abs=0.01)
    assert base["scenario_t"] == pytest.approx(base["forecast_grid_t"])
