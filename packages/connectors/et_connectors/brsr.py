"""BRSR (SEBI Business Responsibility & Sustainability Report) fetch + extraction (plan P2).

Two engines produce the same strict schema with page references:
  * "bedrock": Amazon Nova (Bedrock Converse) reads the candidate pages and returns JSON (used when AWS
    credentials are available); every value it returns is cross-checked against the page text.
  * "rules":   deterministic locator for the SEBI-prescribed Principle 6 tables (Q1 energy, Q7 GHG).
All values are normalised to tCO2e and MWh. Indian digit grouping (32,69,59,946.44) is handled."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from et_core.config import settings
from et_core.evidence import Evidence, evidence_id
from et_core.http import fetch

NUM = r"-?\d[\d,]*(?:\.\d+)?"
MWH_PER = {"TJ": 1e12 / 3.6e9, "PJ": 1e15 / 3.6e9, "GJ": 1e9 / 3.6e9, "J": 1 / 3.6e9, "MWH": 1.0, "GWH": 1e3, "KWH": 1e-3}
T_PER = {"million tonnes": 1e6, "mn tonnes": 1e6, "mnt": 1e6, "tonnes": 1.0, "tco2e": 1.0, "mt": 1e6, "kilotonnes": 1e3}


def parse_number(s: str) -> float:
    """'32,69,59,946.44' -> 326959946.44 ; '78' -> 78.0"""
    return float(s.replace(",", ""))


def to_tco2e(value: float, unit: str) -> float:
    u = unit.lower()
    for k in ["million tonnes", "mn tonnes", "kilotonnes", "tonnes"]:
        if k in u:
            return value * T_PER[k]
    if re.search(r"\bmt\b|mnt", u):
        return value * 1e6
    raise ValueError(f"unknown GHG unit: {unit!r}")


def to_mwh(value: float, unit: str) -> float:
    u = unit.upper().replace(" ", "")
    for k in ["PJ", "TJ", "GJ", "GWH", "MWH", "KWH"]:
        if k in u:
            return value * MWH_PER[k]
    raise ValueError(f"unknown energy unit: {unit!r}")


@dataclass
class Field:
    value: float
    unit: str  # normalised unit (tCO2e | MWh)
    raw: str
    raw_unit: str
    page: int
    quote: str
    boundary: str
    fy: str
    evidence_id: str = ""


@dataclass
class Extraction:
    symbol: str
    fy: str
    engine: str
    document_url: str
    pages_scanned: int
    fields: dict[str, Field] = field(default_factory=dict)
    assurance: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        d = {k: v for k, v in self.__dict__.items() if k != "fields"}
        d["fields"] = {k: v.__dict__ for k, v in self.fields.items()}
        return d


def download(symbol: str, doc: dict, *, refresh: bool = False) -> tuple[Path, Evidence]:
    r = fetch(doc["url"], settings.raw_dir / "brsr" / doc["file"], refresh=refresh, browser=True)
    ev = r.evidence(f"{symbol} BRSR {doc['fy']} (PDF)", symbol, kind="pdf", license="Public statutory disclosure (SEBI LODR Reg. 34(2)(f))")
    return r.path, ev


def page_texts(pdf_path: Path) -> list[str]:
    import pdfplumber

    with pdfplumber.open(pdf_path) as pdf:
        return [(p.extract_text() or "") for p in pdf.pages]


def _fy_label(fy: str, offset: int) -> str:
    a = int(fy[2:6]) - offset
    return f"FY{a}-{str(a + 1)[-2:]}"


def _line_with(text: str, pattern: str) -> tuple[str, int] | None:
    for line in text.splitlines():
        m = re.search(pattern, line, re.I)
        if m:
            return line, m.end()
    return None


def _split_columns(nums: list[str], header_page: str) -> list[tuple[str, int]]:
    """Map the numbers on a row to (boundary, fy_offset) according to the table header layout."""
    both = re.search(r"standalone", header_page, re.I) and re.search(r"consolidated", header_page, re.I)
    if both and len(nums) >= 8:  # Tata energy: secondary/primary per boundary-year
        return [("standalone", 0), ("standalone_primary", 0), ("standalone", 1), ("standalone_primary", 1),
                ("consolidated", 0), ("consolidated_primary", 0), ("consolidated", 1), ("consolidated_primary", 1)]
    if both and len(nums) >= 4:
        return [("standalone", 0), ("standalone", 1), ("consolidated", 0), ("consolidated", 1)]
    return [("standalone", 0), ("standalone", 1)]


def extract_rules(symbol: str, fy: str, pdf_path: Path, url: str, pdf_ev_id: str) -> tuple[Extraction, list[Evidence]]:
    pages = page_texts(pdf_path)
    ex = Extraction(symbol=symbol, fy=fy, engine="rules", document_url=url, pages_scanned=len(pages))
    evs: list[Evidence] = []

    def record(key: str, value: float, unit: str, raw: str, raw_unit: str, page_no: int, line: str, boundary: str, fy_lbl: str):
        ev = Evidence(
            id=evidence_id("pdf_page", url, page_no, key, boundary, fy_lbl),
            kind="pdf_page",
            title=f"{symbol} BRSR {fy} · {key.replace('_', ' ')} ({boundary}, {fy_lbl}), p.{page_no}",
            publisher=symbol,
            url=f"{url}#page={page_no}",
            retrieved_at="",
            page=page_no,
            quote=line.strip()[:300],
            license="Public statutory disclosure",
            meta={"pdf_evidence_id": pdf_ev_id, "value_raw": raw, "unit_raw": raw_unit},
        )
        evs.append(ev)
        ex.fields[f"{key}.{boundary}.{fy_lbl}"] = Field(value, unit, raw, raw_unit, page_no, line.strip()[:300], boundary, fy_lbl, ev.id)

    for i, t in enumerate(pages):
        pno = i + 1
        # ---- GHG table (Principle 6, Essential Indicator 7)
        for scope, pat in [("scope1", r"Total Scope 1 emissions"), ("scope2", r"Total Scope 2 emissions")]:
            hit = _line_with(t, pat)
            if not hit:
                continue
            line, end = hit
            tail = line[end:]
            um = re.search(r"(Million tonnes|Mn\.? ?tonnes|Tonnes|MnT|tCO2e)", tail, re.I)
            if not um:
                ex.warnings.append(f"{scope} unit not found on p.{pno}")
                continue
            nums = re.findall(NUM, tail[um.end():].replace("CO2", "").replace("COe", ""))
            nums = [n for n in nums if re.search(r"\d", n) and n not in ("2",)]
            if not nums:
                continue
            for (boundary, off), raw in zip(_split_columns(nums, t), nums):
                if boundary.endswith("_primary"):
                    continue
                v = to_tco2e(parse_number(raw), um.group(1))
                record(scope, v, "tCO2e", raw, um.group(1), pno, line, boundary, _fy_label(fy, off))
        # ---- Energy table (Essential Indicator 1): non-renewable / renewable electricity
        if re.search(r"Total electricity consumption", t, re.I):
            unit_m = re.search(r"\((?:in )?(TJ|PJ|GJ|Giga ?Joule|Joules?)\)|\b(TJ|PJ|GJ)\b", t)
            unit = (unit_m.group(1) or unit_m.group(2)) if unit_m else ""
            unit = {"Giga Joule": "GJ", "GigaJoule": "GJ"}.get(unit, unit)
            rows = [l for l in t.splitlines() if re.search(r"Total electricity consumption \((A|D)\)", l, re.I)]
            for line in rows:
                kind = "electricity_renewable" if re.search(r"\(A\)", line) else "electricity_nonrenewable"
                tail = re.split(r"\((?:A|D)\)", line, maxsplit=1, flags=re.I)[1]
                row_unit = re.search(r"\b(PJ|TJ|GJ|MWh|GWh)\b", tail)  # a unit printed on the row wins over the table title
                row_u = row_unit.group(1) if row_unit else unit
                tail = re.sub(r"\b(PJ|TJ|GJ|MWh|GWh)\b", " ", tail)
                nums = re.findall(NUM, tail)
                if not row_u or not nums:
                    continue
                cols = _split_columns(nums, t)
                for (boundary, off), raw in zip(cols, nums):
                    if boundary.endswith("_primary"):
                        continue
                    record(kind + "_mwh", to_mwh(parse_number(raw), row_u), "MWh", raw, row_u, pno, line, boundary, _fy_label(fy, off))
        # ---- assurance note for the GHG table
        if re.search(r"Total Scope 1 emissions", t, re.I):
            m = re.search(r"((?:Yes|No)[^.]{0,40}(?:reasonable|limited)?\s*assurance[^.]*\.)", t, re.I | re.S)
            if m:
                q = " ".join(m.group(1).split())
                level = "reasonable" if re.search(r"reasonable\s+assurance", q, re.I) else "limited" if re.search(r"limited\s+assurance", q, re.I) else "unspecified"
                prov = re.search(r"(Bureau Veritas|Price Waterhouse[^,]*?LLP|TUV India Private Limited|KPMG[^,.]*|Deloitte[^,.]*|DNV[^,.]*)", q, re.I)
                scope_note = "standalone only" if re.search(r"for\s+Standalone", q, re.I) else "as tabled"
                ev = Evidence(id=evidence_id("pdf_page", url, pno, "assurance"), kind="pdf_page", title=f"{symbol} BRSR {fy} · GHG assurance note, p.{pno}",
                              publisher=symbol, url=f"{url}#page={pno}", retrieved_at="", page=pno, quote=q[:300], license="Public statutory disclosure",
                              meta={"pdf_evidence_id": pdf_ev_id})
                evs.append(ev)
                ex.assurance = {"assured": q.lower().startswith("yes"), "level": level, "provider": prov.group(1).strip() if prov else None,
                                "scope": scope_note, "page": pno, "quote": q[:300], "evidence_id": ev.id}
    if not any(k.startswith("scope1") for k in ex.fields):
        ex.warnings.append("Scope 1 row not located")
    return ex, evs


# ---------------------------------------------------------------- Bedrock Nova engine
SCHEMA_PROMPT = """You extract figures from an Indian company's BRSR (Principle 6) pages.
Return ONLY JSON: {"rows":[{"metric":"scope1|scope2|electricity_nonrenewable|electricity_renewable",
"boundary":"standalone|consolidated","fiscal_year":"FY2024-25","value":"<number exactly as printed>",
"unit":"<unit exactly as printed>","page":<int>}], "assurance":{"assured":bool,"level":"reasonable|limited|none",
"provider":"<name or null>","page":<int>}}
Use secondary (final) electricity, not primary-energy columns. Never compute or round; copy printed values."""


def extract_bedrock(symbol: str, fy: str, pdf_path: Path, url: str, pdf_ev_id: str) -> tuple[Extraction, list[Evidence]]:
    import boto3

    pages = page_texts(pdf_path)
    cand = [(i + 1, t) for i, t in enumerate(pages) if re.search(r"Scope 1|electricity consumption", t, re.I)][:4]
    doc = "\n\n".join(f"<page n={n}>\n{t}\n</page>" for n, t in cand)
    client = boto3.client("bedrock-runtime", region_name=settings.region)
    resp = client.converse(
        modelId=settings.bedrock_text_model,
        system=[{"text": SCHEMA_PROMPT}],
        messages=[{"role": "user", "content": [{"text": doc}]}],
        inferenceConfig={"maxTokens": 1500, "temperature": 0},
    )
    text = resp["output"]["message"]["content"][0]["text"]
    data = json.loads(text[text.find("{"): text.rfind("}") + 1])
    ex = Extraction(symbol=symbol, fy=fy, engine=f"bedrock:{settings.bedrock_text_model}", document_url=url, pages_scanned=len(pages))
    evs: list[Evidence] = []
    for row in data.get("rows", []):
        page_text = pages[int(row["page"]) - 1]
        if row["value"] not in page_text:  # citation lock: value must literally appear on the cited page
            ex.warnings.append(f"bedrock value {row['value']} not found on p.{row['page']} · dropped")
            continue
        metric = row["metric"]
        if metric.startswith("scope"):
            v, unit = to_tco2e(parse_number(row["value"]), row["unit"]), "tCO2e"
        else:
            v, unit, metric = to_mwh(parse_number(row["value"]), row["unit"]), "MWh", metric + "_mwh"
        line = next((l for l in page_text.splitlines() if row["value"] in l), "")
        ev = Evidence(id=evidence_id("pdf_page", url, row["page"], metric, row["boundary"], row["fiscal_year"]), kind="pdf_page",
                      title=f"{symbol} BRSR {fy} · {metric} ({row['boundary']}, {row['fiscal_year']}), p.{row['page']}", publisher=symbol,
                      url=f"{url}#page={row['page']}", retrieved_at="", page=int(row["page"]), quote=line[:300], license="Public statutory disclosure",
                      meta={"pdf_evidence_id": pdf_ev_id, "engine": ex.engine})
        evs.append(ev)
        ex.fields[f"{metric}.{row['boundary']}.{row['fiscal_year']}"] = Field(v, unit, row["value"], row["unit"], int(row["page"]), line[:300], row["boundary"], row["fiscal_year"], ev.id)
    ex.assurance = data.get("assurance", {})
    return ex, evs


def extract(symbol: str, doc: dict, *, engine: str = "auto", refresh: bool = False) -> tuple[Extraction, list[Evidence]]:
    path, pdf_ev = download(symbol, doc, refresh=refresh)
    use_bedrock = engine == "bedrock" or (engine == "auto" and settings.bedrock_enabled)
    rules, rules_evs = extract_rules(symbol, doc["fy"], path, doc["url"], pdf_ev.id)
    for e in rules_evs:
        e.retrieved_at = pdf_ev.retrieved_at
    if use_bedrock:
        try:
            br, br_evs = extract_bedrock(symbol, doc["fy"], path, doc["url"], pdf_ev.id)
            # Cross-check: any disagreement with the deterministic parse is surfaced, rules value kept.
            for k, f in br.fields.items():
                if k in rules.fields and abs(rules.fields[k].value - f.value) > 1e-6 * max(1, abs(f.value)):
                    rules.warnings.append(f"bedrock/rules disagree on {k}: {f.value} vs {rules.fields[k].value}")
            rules.engine = f"rules+{br.engine}"
        except Exception as e:  # Bedrock unavailable or malformed output: deterministic result stands
            rules.warnings.append(f"bedrock extraction skipped: {type(e).__name__}")
    return rules, [pdf_ev, *rules_evs]
