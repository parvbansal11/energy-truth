"""End-to-end curation: P1 ingest -> P2 disclosure -> P3 estimators/fusion -> P4 Chronos -> alerts.

Writes JSON tables to data/curated (and S3/DynamoDB when deployed). Every estimate row carries evidence_ids.
Run: python -m et_fusion.pipeline [--refresh] [--skip-forecast]"""
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from et_core.config import settings
from et_core.evidence import Evidence, EvidenceLedger, evidence_id, now_iso
from et_core.store import store
from et_connectors import brsr, cea, gibs, robbie
from et_connectors.ingest import build_company
from et_connectors.registry import COMPANIES, COMPARE_FY, CT_YEARS

from .alignment import ALIGNMENT_RULE, fy_months, fy_sum
from .estimators import LOW_COVERAGE, reported_sigma, scope1_independent, scope2_independent
from .fusion import discrepancy_z, inverse_variance, verdict

PROFILE_SECTOR = {"coal": "coal", "mixed fossil": "coal", "gas": "gas", "steel": "steel", "cement": "cement", "coal-mining": "coal-mining"}


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


# ------------------------------------------------------------------ monthly plant series (T1 targets)
def plant_monthly(asset: dict, posoco_m: pd.DataFrame, monthly: pd.DataFrame) -> tuple[pd.Series, str]:
    annual = {int(y): v for y, v in asset["ct"]["emissions_t"].items()}
    sector = PROFILE_SECTOR.get(asset["fuel"], "other")
    if asset["sector"] == "power" and sector == "other":
        sector = "coal"
    region = asset.get("region") if asset.get("country") == "IND" else None
    prof = robbie.sector_profile(posoco_m, monthly, sector, region)
    tag = f"calibrated_capacity_mix:{sector}:{region or 'India'}" if sector != "other" and asset.get("country") == "IND" else "calibrated_flat"
    if asset.get("country") != "IND":
        prof = pd.Series(1.0, index=prof.index)
    return robbie.calibrated_monthly(annual, prof), tag


def run(refresh: bool = False, skip_forecast: bool = False) -> dict:
    ledger = EvidenceLedger()
    ef, ef_version, ef_ev = cea.grid_factor()
    ledger.add(ef_ev)

    # ---------------- P1: national datasets
    log("P1 · Robbie Andrew POSOCO / CEA DGR / India monthly")
    posoco_path, ev_posoco = robbie.fetch_dataset("posoco", refresh=refresh)
    dgr_path, ev_dgr = robbie.fetch_dataset("cea_dgr", refresh=refresh)
    monthly_path, ev_monthly = robbie.fetch_dataset("monthly", refresh=refresh)
    for e in (ev_posoco, ev_dgr, ev_monthly):
        ledger.add(e)
    posoco_m = robbie.posoco_monthly(posoco_path)
    monthly = robbie.monthly_series(monthly_path)

    # ---------------- P1: entity graph
    companies, assets, ownership = [], [], []
    for sym in settings.demo_companies:
        if sym not in COMPANIES:
            continue
        log(f"P1 · entity graph {sym}")
        r = build_company(sym, ledger, refresh=refresh)
        companies.append(r["company"])
        assets.extend(r["assets"])
        ownership.extend(r["ownership"])

    # ---------------- P1: grid-region geometry for the choropleth
    from et_connectors.geo import region_states

    regions_geo, ev_geo = region_states(refresh=refresh)
    ledger.add(ev_geo)

    # ---------------- P1: GIBS layers
    log("P1 · GIBS layer probe")
    try:
        layers, layer_evs = gibs.probe_layers()
        for e in layer_evs:
            ledger.add(e)
    except Exception as e:  # recorded; UI hides layers it cannot date
        layers = {}
        log(f"GIBS probe failed: {e}")

    # ---------------- monthly plant series
    series: dict[str, pd.Series] = {}
    for a in assets:
        if a["ct"]:
            s, tag = plant_monthly(a, posoco_m, monthly)
            series[a["asset_id"]] = s
            a["target_construction"] = tag
            a["monthly_t"] = {str(k): round(float(v), 1) for k, v in s.items()}

    # ---------------- P2: disclosures
    disclosures = []
    for c in companies:
        for doc in COMPANIES[c["symbol"]]["brsr"]:
            log(f"P2 · BRSR {c['symbol']} {doc['fy']}")
            ex, evs = brsr.extract(c["symbol"], doc, refresh=refresh)
            for e in evs:
                ledger.add(e)
            disclosures.append({"company": c["symbol"], **ex.to_dict()})

    def disclosed(sym: str, metric: str, boundary: str, fy: str) -> dict | None:
        """Prefer the filing whose own reporting year is `fy` (restatements in later filings are noted)."""
        best = None
        for d in disclosures:
            if d["company"] != sym:
                continue
            f = d["fields"].get(f"{metric}.{boundary}.{fy}")
            if f and (best is None or d["fy"] == fy):
                best = {**f, "document_fy": d["fy"], "assurance": d["assurance"], "engine": d["engine"], "document_url": d["document_url"]}
        return best

    # ---------------- P4: grid intensity T3 (needed for Scope 2 nowcast)
    from et_chronos.features import covariates, fossil_share, future_covariates, grid_intensity

    gi = grid_intensity(posoco_m, ef)
    grid_doc = {
        "method": "cea_calibrated_fossil_share",
        "description": f"Monthly implied grid intensity = CEA {ef_version} factor ({ef} tCO2/MWh) x monthly fossil share (coal+lignite+gas of total, POSOCO) / FY2023-24 mean India fossil share.",
        "months": [str(p) for p in gi.index],
        "series": {k: [round(float(v), 4) if pd.notna(v) else None for v in gi[k]] for k in gi.columns},
        "fossil_share_india": [round(float(v), 4) for v in fossil_share(posoco_m, "India")],
        "fuel_mix_mu_per_day": {
            k: [round(float(v), 1) if pd.notna(v) else None for v in posoco_m[f"India: {k}"]] for k in ["Coal", "Lignite", "Gas", "Nuclear", "Hydro", "RES"]
        },
        "evidence_ids": [ev_posoco.id, ef_ev.id],
        "forecasts": {},
    }

    forecasts: dict[str, dict] = {}
    if not skip_forecast:
        from et_chronos.forecast import backend_name, forecast_multivariate, forecast_one

        H = max(settings.chronos_horizon, 6)
        log(f"P4 · T3 grid intensity forecasts ({backend_name()})")
        for region in ["India", *[r for r in ["NR", "WR", "SR", "ER", "NER"]]]:
            tgt = gi[region].dropna()
            cov = covariates(posoco_m, region).loc[tgt.index]
            fut = future_covariates(covariates(posoco_m, region), tgt.index[-1] + 1, H)
            f = forecast_one(tgt, cov[["demand_mu", "res_gen_mu", "month_sin", "month_cos"]], fut, H)
            grid_doc["forecasts"][region] = {**f.to_dict(), "target_construction": "cea_calibrated_fossil_share"}

        log("P4 · T1 plant forecasts")
        # history ends Dec of last CT year; months in the horizon that POSOCO already observed are nowcasts
        last = pd.Period(f"{max(CT_YEARS)}-12", "M")
        for a in assets:
            if not a["ct"]:
                continue
            s = series[a["asset_id"]]
            region = a.get("region") or "India"
            covall = covariates(posoco_m, region)
            cov = covall.reindex(s.index).ffill().bfill()
            fut = future_covariates(covall, last + 1, H)
            f = forecast_one(s, cov, fut, H)
            forecasts[a["asset_id"]] = {**f.to_dict(), "target_construction": a["target_construction"],
                                         "observed_covariate_months": [str(p) for p, o in zip(fut.index, fut["observed"]) if o],
                                         "evidence_ids": a["evidence_ids"][:3] + [ev_posoco.id]}

    # ---------------- P3: estimators + fusion per company / scope
    estimates, scorecards, alerts = [], [], []
    for c in companies:
        sym = c["symbol"]
        log(f"P3 · estimates {sym}")
        cas = [a for a in assets if a["company"] == sym and a["ct"]]
        rho_eff = c["coverage"]["rho_effective"]

        def fy_value(a: dict, fy: str) -> float:
            return fy_sum(series[a["asset_id"]], fy)[0]

        # rollup monthly series (T2 target) · ownership-weighted
        roll = sum(series[a["asset_id"]] * a["ownership_weight"] for a in cas) if cas else pd.Series(dtype=float)
        unweighted_cy = {str(y): round(sum(a["ct"]["emissions_t"].get(str(y), 0) for a in cas), 1) for y in CT_YEARS}

        sc = {"symbol": sym, "name": c["name"], "short": c["short"], "sector": c["sector"], "boundary": c["boundary"], "fy": COMPARE_FY,
              "coverage": c["coverage"], "alignment_rule": ALIGNMENT_RULE, "scopes": {}, "ct_owner_sum_cy_t": unweighted_cy,
              "flags": [], "hitl_queue": c["hitl_queue"], "computed_at": now_iso()}

        # --- Scope 1
        s1_assets = [{"value_t": fy_value(a, COMPARE_FY), "weight": a["ownership_weight"], "rel_sigma": a["ct"]["rel_sigma"],
                      "weight_assumed": a["weight_source"].startswith("assumed"), "asset_id": a["asset_id"]} for a in cas]
        ind1 = scope1_independent(s1_assets, rho_eff)
        ind1_ev = sorted({e for a in cas for e in a["evidence_ids"]})
        est_id = f"est:{sym}:S1:{COMPARE_FY}:independent"
        estimates.append({"estimate_id": est_id, "company": sym, "scope": "S1", "period": COMPARE_FY, "method": "ct_ownership_weighted_fy_aligned",
                          "value_t": ind1["value_t"], "sigma_t": ind1["sigma_t"], "components": ind1["components"], "flags": ind1["flags"], "evidence_ids": ind1_ev,
                          "contributors": sorted([{"asset_id": x["asset_id"], "value_t": x["value_t"] * x["weight"]} for x in s1_assets], key=lambda r: -r["value_t"])[:10]})
        rep1 = disclosed(sym, "scope1", c["boundary"], COMPARE_FY)
        scope1 = {"independent": {"value_t": ind1["value_t"], "sigma_t": ind1["sigma_t"], "components": ind1["components"], "estimate_id": est_id, "evidence_ids": ind1_ev},
                  "flags": list(ind1["flags"])}
        if rep1:
            step = 1e6 if rep1["raw_unit"].lower().startswith("million") and "." not in rep1["raw"] else 0
            assured_boundary = rep1["assurance"].get("scope") != "standalone only" or c["boundary"] == "standalone"
            s_rep = reported_sigma(rep1["value"], rep1["assurance"].get("level"), step, assured_boundary)
            fused, s_f = inverse_variance(rep1["value"], s_rep, ind1["value_t"], ind1["sigma_t"])
            z = discrepancy_z(ind1["value_t"], ind1["sigma_t"], rep1["value"], s_rep)
            low = rho_eff < LOW_COVERAGE
            scope1.update({
                "reported": {"value_t": rep1["value"], "sigma_t": s_rep, "raw": rep1["raw"], "raw_unit": rep1["raw_unit"], "page": rep1["page"], "quote": rep1["quote"],
                             "boundary": c["boundary"], "document_fy": rep1["document_fy"], "assurance": rep1["assurance"], "evidence_ids": [rep1["evidence_id"]]},
                "fused": {"value_t": fused, "sigma_t": s_f},
                "z": z, "gap_t": ind1["value_t"] - rep1["value"], "gap_pct": (ind1["value_t"] - rep1["value"]) / rep1["value"] * 100,
                "verdict": verdict(z, low),
            })
            if not assured_boundary:
                scope1["flags"].append("ASSURANCE_COVERS_STANDALONE_ONLY")
            for kind, v, s, eids in [("reported", rep1["value"], s_rep, [rep1["evidence_id"]]), ("fused", fused, s_f, ind1_ev + [rep1["evidence_id"]])]:
                estimates.append({"estimate_id": f"est:{sym}:S1:{COMPARE_FY}:{kind}", "company": sym, "scope": "S1", "period": COMPARE_FY, "method": kind, "value_t": v, "sigma_t": s, "evidence_ids": eids})
        else:
            scope1["reported"] = None
            scope1["verdict"] = {"code": "no_disclosure", "label": "No disclosure ingested", "tone": "slate", "text": "BRSR not yet extracted for this company; independent rebuild only."}
        sc["scopes"]["S1"] = scope1

        # --- Scope 2: BRSR MWh x CEA EF
        mwh = disclosed(sym, "electricity_nonrenewable_mwh", c["boundary"], COMPARE_FY)
        rep2 = disclosed(sym, "scope2", c["boundary"], COMPARE_FY)
        if mwh:
            non_india = any(a.get("country") != "IND" for a in cas) and c["boundary"] == "consolidated"
            ind2 = scope2_independent(mwh["value"], ef, ef_year_mismatch=COMPARE_FY != "FY2023-24", non_india_operations=non_india, mwh_is_total_consumption=True)
            eids2 = [mwh["evidence_id"], ef_ev.id]
            scope2 = {"independent": {"value_t": ind2["value_t"], "sigma_t": ind2["sigma_t"], "mwh": mwh["value"], "mwh_raw": f"{mwh['raw']} {mwh['raw_unit']}", "mwh_page": mwh["page"],
                                      "ef": ef, "ef_version": ef_version, "estimate_id": f"est:{sym}:S2:{COMPARE_FY}:independent", "evidence_ids": eids2},
                      "flags": ind2["flags"], "dependency_note": "Scope 2 rebuild reuses the company-disclosed electricity quantity; only the emission factor is independent."}
            estimates.append({"estimate_id": f"est:{sym}:S2:{COMPARE_FY}:independent", "company": sym, "scope": "S2", "period": COMPARE_FY, "method": "brsr_mwh_x_cea_ef",
                              "value_t": ind2["value_t"], "sigma_t": ind2["sigma_t"], "flags": ind2["flags"], "evidence_ids": eids2})
            if rep2:
                step = 1e6 if rep2["raw_unit"].lower().startswith("million") and "." not in rep2["raw"] else 0
                s_rep2 = reported_sigma(rep2["value"], rep2["assurance"].get("level"), step, rep2["assurance"].get("scope") != "standalone only" or c["boundary"] == "standalone")
                fused2, s_f2 = inverse_variance(rep2["value"], s_rep2, ind2["value_t"], ind2["sigma_t"])
                z2 = discrepancy_z(ind2["value_t"], ind2["sigma_t"], rep2["value"], s_rep2)
                scope2.update({"reported": {"value_t": rep2["value"], "sigma_t": s_rep2, "raw": rep2["raw"], "raw_unit": rep2["raw_unit"], "page": rep2["page"], "quote": rep2["quote"],
                                            "document_fy": rep2["document_fy"], "evidence_ids": [rep2["evidence_id"]]},
                               "fused": {"value_t": fused2, "sigma_t": s_f2}, "z": z2, "gap_t": ind2["value_t"] - rep2["value"],
                               "gap_pct": (ind2["value_t"] - rep2["value"]) / rep2["value"] * 100, "verdict": verdict(z2, False)})
            sc["scopes"]["S2"] = scope2
        else:
            sc["scopes"]["S2"] = {"reported": None, "independent": None, "flags": [], "verdict": {"code": "no_disclosure", "label": "Needs BRSR electricity (MWh)", "tone": "slate",
                                                                                                    "text": "Scope 2 rebuild requires the purchased-electricity quantity from the BRSR."}}

        # --- coverage / ownership flags
        if rho_eff < LOW_COVERAGE:
            sc["flags"].append({"code": "LOW_COVERAGE", "text": f"Only {c['coverage']['operating_emitting_matched']} of {c['coverage']['operating_emitting_locations']} operating emitting GEM locations have a Climate TRACE estimate (rho_eff = {rho_eff:.2f}).",
                                "missing": c["coverage"]["unmatched_emitting"]})
        if c["hitl_queue"]:
            sc["flags"].append({"code": "HITL_ENTITY_REVIEW", "text": f"{len(c['hitl_queue'])} entity match(es) below the {settings.hitl_threshold} threshold await human review."})

        # --- P4: T2 rollup + band breach (plan §6.6)
        if not skip_forecast and len(roll):
            from et_chronos.features import covariates as covf, future_covariates as futf
            from et_chronos.forecast import forecast_one as f1

            last = roll.index[-1]
            covall = covf(posoco_m, "India")
            f = f1(roll, covall.reindex(roll.index).ffill().bfill(), futf(covall, last + 1, H), H)
            sc["forecast"] = {**f.to_dict(), "history_months": [str(p) for p in roll.index], "history_t": [round(float(v), 1) for v in roll],
                              "target_construction": "ownership_weighted_sum_of_T1", "observed_covariate_months": [m for m in f.months if pd.Period(m, "M") in posoco_m.index]}
            # band for the most recent FY with a disclosure whose months are covered by history+forecast
            band = None
            fc = pd.DataFrame({"q10": f.q10, "q50": f.q50, "q90": f.q90}, index=pd.PeriodIndex(f.months, freq="M"))
            for d in sorted({d["fy"] for d in disclosures if d["company"] == sym}, reverse=True):
                months = fy_months(d)
                hist = [m for m in months if m in roll.index]
                fut = [m for m in months if m in fc.index]
                if len(hist) + len(fut) != 12 or not fut:
                    continue
                rep = disclosed(sym, "scope1", c["boundary"], d)
                prev_fy = f"FY{int(d[2:6]) - 1}-{str(int(d[2:6]))[-2:]}"
                prev_rep = disclosed(sym, "scope1", c["boundary"], prev_fy)
                prev_ind = fy_sum(roll, prev_fy)
                if not rep or not prev_rep or prev_ind[1] != 12:
                    continue
                base = float(roll.loc[hist].sum())
                q10, q50, q90 = (base + float(fc.loc[fut, q].sum()) for q in ["q10", "q50", "q90"])
                scale = prev_rep["value"] / prev_ind[0]  # boundary calibration from the previous FY (the "scaled" band)
                lo, mid, hi = q10 * scale, q50 * scale, q90 * scale
                breach = not (lo <= rep["value"] <= hi)
                contrib = sorted(
                    [{"asset_id": a["asset_id"], "name": a["name"], "fy_t": round(sum(float(series[a["asset_id"]].get(m, 0)) for m in hist) * a["ownership_weight"]
                                                                               + sum(forecasts.get(a["asset_id"], {}).get("q50", [0] * H)[i] for i, mm in enumerate(forecasts.get(a["asset_id"], {}).get("months", [])) if pd.Period(mm, "M") in fut) * a["ownership_weight"], 1)}
                     for a in cas], key=lambda r: -r["fy_t"])[:5]
                band = {"fy": d, "history_months": len(hist), "forecast_months": len(fut), "q10_t": lo, "q50_t": mid, "q90_t": hi, "unscaled": {"q10_t": q10, "q50_t": q50, "q90_t": q90},
                        "scale": scale, "scale_rule": f"reported/independent ratio in {prev_fy}", "reported_t": rep["value"], "reported_evidence_id": rep["evidence_id"],
                        "breach": breach, "contributors": contrib}
                if breach:
                    alerts.append({"alert_id": f"alert:{sym}:FORECAST_BAND_BREACH:{d}", "company": sym, "type": "FORECAST_BAND_BREACH", "severity": "high", "ts": now_iso(),
                                   "title": f"{c['short']} {d} Scope 1 outside the scaled Chronos band",
                                   "detail": f"Reported {rep['value']/1e6:.1f} Mt vs scaled band {lo/1e6:.1f}–{hi/1e6:.1f} Mt (median {mid/1e6:.1f}).",
                                   "evidence_ids": [rep["evidence_id"], est_id]})
                break
            sc["band"] = band

        # --- alerts: z > 2 (plan §8.3), low coverage
        z1 = sc["scopes"]["S1"].get("z")
        if z1 is not None and abs(z1) > 2:
            alerts.append({"alert_id": f"alert:{sym}:Z_GT_2:{COMPARE_FY}", "company": sym, "type": "DISCREPANCY_Z", "severity": "high", "ts": now_iso(),
                           "title": f"{c['short']} Scope 1 discrepancy |z| = {abs(z1):.1f}", "detail": sc["scopes"]["S1"]["verdict"]["text"], "evidence_ids": [est_id]})
        if rho_eff < LOW_COVERAGE:
            alerts.append({"alert_id": f"alert:{sym}:LOW_COVERAGE", "company": sym, "type": "LOW_COVERAGE", "severity": "medium", "ts": now_iso(),
                           "title": f"{c['short']}: {len(c['coverage']['unmatched_emitting'])} owned emitters lack an independent estimate",
                           "detail": ", ".join(c["coverage"]["unmatched_emitting"][:6]), "evidence_ids": c["coverage"]["evidence_ids"]})
        scorecards.append(sc)

    # ---------------- T4 multivariate plant cluster (top 5 plants, NTPC + Tata)
    clusters = {}
    if not skip_forecast:
        for sym in ["NTPC", "TATASTEEL"]:
            top = sorted([a for a in assets if a["company"] == sym and a["ct"]], key=lambda a: -a["ct"]["emissions_t"].get(str(max(CT_YEARS)), 0))[:5]
            if len(top) >= 2:
                df = pd.DataFrame({a["asset_id"]: series[a["asset_id"]] for a in top})
                fm = forecast_multivariate(df, H)
                clusters[sym] = {"assets": [a["asset_id"] for a in top], "names": [a["name"] for a in top], "forecasts": {k: v.to_dict() for k, v in fm.items()}}

    # ---------------- persist
    ev_rows = ledger.to_list()
    store.write("companies", companies)
    store.write("assets", assets, compact=True)
    store.write("ownership", ownership)
    store.write("disclosures", disclosures)
    store.write("estimates", estimates)
    store.write("scorecards", scorecards)
    store.write("grid", grid_doc)
    store.write("forecasts", {"assets": forecasts, "clusters": clusters})
    store.write("alerts", alerts)
    store.write("layers", layers)
    store.write("grid_regions", regions_geo, compact=True)
    store.write("evidence", ev_rows)
    store.write("manifest", {"generated_at": now_iso(), "compare_fy": COMPARE_FY, "ct_years": CT_YEARS, "ef": ef, "ef_version": ef_version,
                             "companies": [c["symbol"] for c in companies], "counts": {"assets": len(assets), "evidence": len(ev_rows), "estimates": len(estimates), "alerts": len(alerts)}})
    # DynamoDB mirror (no-op locally)
    store.put_rows("Company", [{**c, "CIN": c["cin"]} for c in companies], "cin", "symbol")
    store.put_rows("Asset", assets, "asset_id", "company")
    store.put_rows("Ownership", ownership, "company", "asset_id")
    store.put_rows("Estimate", estimates, "company", "estimate_id")
    store.put_rows("Alert", alerts, "company", "alert_id")
    log(f"done · {len(companies)} companies, {len(assets)} assets, {len(ev_rows)} evidence, {len(alerts)} alerts")
    return {"scorecards": scorecards}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="re-fetch every source instead of using data/raw cache")
    ap.add_argument("--skip-forecast", action="store_true")
    a = ap.parse_args()
    out = run(refresh=a.refresh, skip_forecast=a.skip_forecast)
    for sc in out["scorecards"]:
        s1 = sc["scopes"]["S1"]
        rep = s1.get("reported") or {}
        print(f"{sc['symbol']:11s} S1 ind {s1['independent']['value_t']/1e6:7.1f} ± {s1['independent']['sigma_t']/1e6:5.1f} Mt | rep {rep.get('value_t', float('nan'))/1e6:6.1f} | "
              f"z {s1.get('z', float('nan')):5.2f} | {s1['verdict']['label']} | rho {sc['coverage']['rho']:.3f} rho_eff {sc['coverage']['rho_effective']:.2f}"
              + (f" | band {sc['band']['fy']} {sc['band']['q10_t']/1e6:.1f}-{sc['band']['q90_t']/1e6:.1f} rep {sc['band']['reported_t']/1e6:.1f} breach={sc['band']['breach']}" if sc.get("band") else ""))
