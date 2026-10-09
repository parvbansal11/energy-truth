"""Report Studio: BRSR-style Energy & GHG Audit PDF (plan §4 item 9). Every number carries a citation that
resolves to the Evidence appendix. fpdf2 is used instead of WeasyPrint (no native Pango in Lambda; DECISIONS.md)."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fpdf import FPDF

from et_core.config import settings

INK, MUTED, ACCENT, RED, AMBER, GREEN = (17, 24, 39), (100, 110, 125), (13, 110, 99), (185, 50, 50), (190, 120, 20), (30, 130, 80)


def _t(s: str) -> str:
    """fpdf core fonts are latin-1; map the few unicode glyphs we use."""
    rep = {"₂": "2", "–": "-", "—": "-", "±": "+/-", "ρ": "rho", "σ": "sigma", "×": "x", "’": "'", "“": '"', "”": '"', "≥": ">=", "…": "...", "→": "->", "Δ": "delta "}
    for k, v in rep.items():
        s = s.replace(k, v)
    return s.encode("latin-1", "replace").decode("latin-1")


class AuditPDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*ACCENT)
        self.cell(0, 6, "ENERGY TRUTH  |  Energy & GHG Audit", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(220, 225, 230)
        self.line(10, 16, 200, 16)
        self.ln(3)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*MUTED)
        self.cell(0, 6, _t(f"Independent public-data audit; not an assurance opinion. Page {self.page_no()}"), align="C")


def build(state: dict, out_dir: Path | None = None) -> Path:
    out_dir = out_dir or settings.reports_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    c, sc = state["company"], state.get("scorecard") or {}
    ev = state.get("evidence", {})
    order: list[str] = []

    def cite(eid: str | None) -> str:
        if not eid or eid not in ev:
            return ""
        if eid not in order:
            order.append(eid)
        return f"[{order.index(eid) + 1}]"

    pdf = AuditPDF(format="A4")
    pdf.set_auto_page_break(True, 15)
    pdf.add_page()
    pdf.set_text_color(*INK)
    pdf.set_font("Helvetica", "B", 20)
    pdf.cell(0, 10, _t(c["name"]), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 6, _t(f"{sc.get('fy', '')} | boundary: {c.get('boundary')} | CIN {c.get('cin')} | generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    s1 = (state.get("estimates") or {}).get("S1", {})
    verdict = s1.get("verdict", {})
    tone = {"red": RED, "amber": AMBER, "green": GREEN}.get(verdict.get("tone"), MUTED)
    pdf.set_fill_color(*tone)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 9, _t(f"  Scope 1 verdict: {verdict.get('label', 'n/a')}"), fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*INK)
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(0, 5, _t(verdict.get("text", "")))
    pdf.ln(3)

    # ---- scorecard table
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Energy-carbon scorecard (Mt CO2e)", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 8)
    widths = [22, 38, 42, 38, 22, 28]
    for h, w in zip(["Scope", "Reported (BRSR)", "Independent rebuild", "Fused", "z", "Gap"], widths):
        pdf.cell(w, 7, h, border="B")
    pdf.ln()
    pdf.set_font("Helvetica", "", 8)
    for scope in ["S1", "S2"]:
        s = (state.get("estimates") or {}).get(scope, {})
        rep, ind, fu = s.get("reported"), s.get("independent"), s.get("fused")
        row = [
            scope,
            f"{rep['value_t'] / 1e6:,.3f} {cite(rep['evidence_ids'][0])}" if rep else "not disclosed",
            f"{ind['value_t'] / 1e6:,.3f} +/- {ind['sigma_t'] / 1e6:,.3f} {cite((ind.get('evidence_ids') or [None])[0])}" if ind else "n/a",
            f"{fu['value_t'] / 1e6:,.3f} +/- {fu['sigma_t'] / 1e6:,.3f}" if fu else "n/a",
            f"{s['z']:.2f}" if s.get("z") is not None else "-",
            f"{s['gap_pct']:+.1f}%" if s.get("gap_pct") is not None else "-",
        ]
        for v, w in zip(row, widths):
            pdf.cell(w, 7, _t(v), border="B")
        pdf.ln()
    pdf.ln(3)

    cov = sc.get("coverage", {})
    if cov:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, "Coverage", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(0, 5, _t(f"{cov['ct_linked_assets']} Climate TRACE-linked assets vs {cov['gem_assets']} GEM units (rho = {cov['rho']:.3f}). "
                                f"{cov['operating_emitting_matched']} of {cov['operating_emitting_locations']} operating emitting locations inside the {cov.get('boundary', '')} boundary have an independent estimate "
                                f"(rho_eff = {cov['rho_effective']:.2f}) {cite(cov['evidence_ids'][0])}. Missing: {', '.join(cov.get('unmatched_emitting', [])[:10]) or 'none'}."))
        pdf.ln(2)

    band = (state.get("forecast") or {}).get("band")
    if band:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, "Chronos-2 forecast band", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(0, 5, _t(f"{band['fy']}: scaled band {band['q10_t'] / 1e6:,.1f} - {band['q90_t'] / 1e6:,.1f} Mt (median {band['q50_t'] / 1e6:,.1f}); "
                                f"BRSR {band['reported_t'] / 1e6:,.1f} Mt {cite(band['reported_evidence_id'])} -> {'FORECAST_BAND_BREACH' if band['breach'] else 'within band'}. "
                                f"Band = {band['history_months']} observed + {band['forecast_months']} forecast months, scaled by {band['scale_rule']} ({band['scale']:.3f})."))
        pdf.ln(2)

    # ---- top plants
    assets = sorted([a for a in state.get("assets", []) if a.get("ct")], key=lambda a: -a["ct"]["emissions_t"].get("2024", 0))[:12]
    if assets:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, "Largest plants (Climate TRACE, CY2024)", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 8)
        for a in assets:
            pdf.cell(95, 5.5, _t(a["name"][:55]), border="B")
            pdf.cell(25, 5.5, _t(f"{a['ct']['emissions_t'].get('2024', 0) / 1e6:,.2f} Mt"), border="B")
            pdf.cell(25, 5.5, _t(f"w={a['ownership_weight']:.2f}"), border="B")
            pdf.cell(25, 5.5, _t(a["ct"].get("confidence", "")), border="B")
            pdf.cell(20, 5.5, _t(cite(a["evidence_ids"][-1] if a.get("evidence_ids") else None)), border="B", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    # ---- narrative
    nar = state.get("narrative") or {}
    if nar.get("narrative"):
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, _t(f"Auditor note ({nar.get('engine')})"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 9)
        import re

        txt = re.sub(r"\[(ev_[a-z_]+_[0-9a-f]{10})\]", lambda m: cite(m.group(1)), nar["narrative"])
        pdf.multi_cell(0, 5, _t(txt))

    # ---- evidence appendix
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Evidence", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 7.5)
    for i, eid in enumerate(order, 1):
        e = ev[eid]
        line = f"[{i}] {e['title']} - {e['publisher']}. {e['url']}" + (f" (p.{e['page']})" if e.get("page") else "") + (f" sha256 {e['sha256'][:16]}..." if e.get("sha256") else "") + (f" \"{e['quote'][:140]}\"" if e.get("quote") else "")
        pdf.multi_cell(0, 4, _t(line))
        pdf.ln(0.5)
    pdf.ln(2)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(0, 4, _t("Sources: Climate TRACE; Global Energy Monitor; Robbie M. Andrew (India energy data from Grid-India/CEA); Central Electricity Authority; NASA EOSDIS GIBS; Copernicus Sentinel-2 via Element84; company BRSR filings."))

    path = out_dir / f"{c['symbol']}_{state.get('run_id', 'audit')}.pdf"
    pdf.output(str(path))
    if settings.s3_reports_bucket:
        import boto3

        s3 = boto3.client("s3", region_name=settings.region)
        key = f"reports/{path.name}"
        s3.upload_file(str(path), settings.s3_reports_bucket, key, ExtraArgs={"ContentType": "application/pdf"})
    return path
