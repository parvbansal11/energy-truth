"""P1 — ingest + canonical energy graph (Company, Asset, Ownership) with coverage rho (plan §5.2, §9.1)."""
from __future__ import annotations

from collections import defaultdict

from et_core.evidence import EvidenceLedger

from . import climatetrace, gem
from .registry import COMPANIES, CT_YEARS
from .resolve import EMITTING_TYPES, STATE_REGION, haversine_km, match_source


def gem_locations(units: list[dict], shares: dict[str, float], direct: dict[str, float] | None = None) -> list[dict]:
    direct = direct or {}
    by_loc: dict[str, list[dict]] = defaultdict(list)
    for u in units:
        by_loc[u.get("location_id") or u["asset_id"]].append(u)
    locs = []
    for loc_id, us in by_loc.items():
        op = [u for u in us if u.get("operating_status") == "operating"]
        basis = op or us
        cap = sum(float(u.get("capacity_value") or 0) for u in basis)
        w_share = (
            sum(shares.get(u["asset_id"], 0.0) * float(u.get("capacity_value") or 0) for u in basis) / cap
            if cap > 0 else sum(shares.get(u["asset_id"], 0.0) for u in basis) / len(basis)
        )
        d_share = (
            sum(direct.get(u["asset_id"], 0.0) * float(u.get("capacity_value") or 0) for u in basis) / cap
            if cap > 0 else sum(direct.get(u["asset_id"], 0.0) for u in basis) / len(basis)
        )
        statuses = sorted({u.get("operating_status") or "unknown" for u in us})
        u0 = us[0]
        locs.append({
            "location_id": loc_id,
            "name": u0.get("project_name") or u0.get("asset_name"),
            "asset_type": u0.get("asset_type"),
            "status": "operating" if op else statuses[0],
            "statuses": statuses,
            "units": len(us),
            "operating_units": len(op),
            "capacity": round(cap, 3),
            "capacity_unit": u0.get("capacity_unit"),
            "country": u0.get("country"),
            "state": u0.get("state_province"),
            "lat": u0.get("latitude"),
            "lon": u0.get("longitude"),
            "wiki_url": u0.get("wiki_url"),
            "share": round(w_share, 4),
            "direct_share": round(d_share, 4),
            "unit_ids": [u["asset_id"] for u in us],
        })
    return locs


def boundary_weights(equity: float, direct: float) -> dict[str, float]:
    """Weights per reporting boundary (GHG Protocol):
    standalone   - assets held directly by the listed entity (direct share)
    consolidated - operational-control proxy: effective share >= 50% counts 100%, JVs excluded (reported in Scope 3 cat. 15)
    equity       - effective equity share (alternative view)"""
    return {"standalone": round(direct, 4), "consolidated": 1.0 if equity >= 0.5 else 0.0, "equity": round(equity, 4)}


def _fuel(src: dict) -> str:
    if src["sector"] == "power":
        t = (src.get("assetType") or "").lower()
        return "coal" if t == "coal" else "gas" if t == "gas" else "mixed fossil" if "," in t else t or "power"
    return {"iron-and-steel": "steel", "cement": "cement", "coal-mining": "coal-mining", "iron-mining": "iron-mining"}.get(src.get("subsector"), src.get("subsector", "other"))


def build_company(symbol: str, ledger: EvidenceLedger, refresh: bool = False) -> dict:
    meta = COMPANIES[symbol]
    eid = meta["entity_id"]
    ent, ev_ent = gem.entity(eid, refresh=refresh)
    units, ev_units = gem.assets(eid, refresh=refresh)
    graph, ev_graph = gem.ownership_graph(eid, refresh=refresh)
    for e in (ev_ent, ev_units, ev_graph):
        ledger.add(e)
    shares = gem.effective_shares(graph)
    locs = gem_locations(units, shares, gem.direct_shares(graph))

    # ---- Climate TRACE sources, all years
    by_id: dict[int, dict] = {}
    yearly: dict[int, dict[int, float]] = defaultdict(dict)
    year_ev: dict[int, str] = {}
    for y in CT_YEARS:
        rows, ev = climatetrace.sources_by_owner(eid, y, refresh=refresh)
        year_ev[y] = ledger.add(ev)
        for r in rows:
            by_id.setdefault(r["id"], r)
            yearly[r["id"]][y] = float(r["emissionsQuantity"] or 0.0)

    assets, ownership, hitl = [], [], []
    matched_locs: set[str] = set()
    for sid, src in by_id.items():
        detail, ev_d = climatetrace.source_detail(sid, refresh=refresh)
        ledger.add(ev_d)
        m = match_source(src, locs)
        loc = next((l for l in locs if l["location_id"] == m["location_id"]), None)
        covered = [l for l in locs if l["location_id"] in m["location_ids"]]
        matched_locs.update(l["location_id"] for l in covered)
        if covered:
            cap = sum(l["capacity"] for l in covered)
            avg = lambda key: sum(l[key] * l["capacity"] for l in covered) / cap if cap > 0 else sum(l[key] for l in covered) / len(covered)
            weight, direct_w = avg("share"), avg("direct_share")
            wsrc = "gem_ownership_graph"
        else:
            weight, direct_w, wsrc = 1.0, 1.0, "assumed_100pct_ct_owner_link"
        bw = boundary_weights(weight, direct_w)
        rel_sigma, conf_label = climatetrace.asset_relative_sigma(detail, max(CT_YEARS))
        state = loc["state"] if loc else None
        if not state:  # nearest GEM location within 50 km supplies the state for region assignment
            near = sorted(((haversine_km(src["centroid"]["latitude"], src["centroid"]["longitude"], l["lat"], l["lon"]), l) for l in locs if l["lat"] is not None), key=lambda t: t[0])
            state = near[0][1]["state"] if near and near[0][0] < 50 else None
        ev_ids = [year_ev[y] for y in CT_YEARS if y in yearly[sid]] + [ev_d.id] + ([ev_units.id, ev_graph.id] if loc else [])
        asset = {
            "asset_id": f"ct:{sid}",
            "company": symbol,
            "name": src["name"],
            "sector": src["sector"],
            "subsector": src["subsector"],
            "fuel": _fuel(src),
            "asset_type": src.get("assetType"),
            "country": src.get("country"),
            "state": state,
            "region": STATE_REGION.get(state or "", None) if src.get("country") == "IND" else None,
            "lat": src["centroid"]["latitude"],
            "lon": src["centroid"]["longitude"],
            "ct": {
                "source_id": sid,
                "emissions_t": {str(y): v for y, v in sorted(yearly[sid].items())},
                "activity": src.get("activity"),
                "activity_units": src.get("activityUnits"),
                "capacity": src.get("capacity"),
                "capacity_units": src.get("capacityUnits"),
                "emissions_factor": src.get("emissionsFactor"),
                "emissions_factor_units": src.get("emissionsFactorUnits"),
                "confidence": conf_label,
                "rel_sigma": rel_sigma,
                "confidence_detail": next((c for c in detail.get("confidence") or [] if c.get("year") == max(CT_YEARS)), None),
            },
            "gem": loc and {**{k: loc[k] for k in ["location_id", "name", "asset_type", "status", "units", "operating_units", "capacity", "capacity_unit", "wiki_url", "share"]},
                            "covered_locations": [{"location_id": l["location_id"], "name": l["name"], "share": l["share"], "capacity": l["capacity"]} for l in covered]},
            "ownership_weight": round(bw[meta["boundary"]], 4),
            "weights": bw,
            "weight_source": wsrc,
            "match": m,
            "evidence_ids": ev_ids,
        }
        assets.append(asset)
        ownership.append({"company": symbol, "asset_id": asset["asset_id"], "weight": asset["ownership_weight"], "source": wsrc, **{k: m[k] for k in ["match_method", "match_score", "review_status"]}})
        if m["review_status"] in ("needs_review", "unmatched"):
            hitl.append({"asset_id": asset["asset_id"], "name": src["name"], "reason": m["review_status"], "score": m["match_score"], "candidate_location": m.get("location_id")})

    # ---- GEM-only locations: owned assets with no Climate TRACE estimate (coverage gap, shown hollow on the map)
    for loc in locs:
        if loc["location_id"] in matched_locs:
            continue
        assets.append({
            "asset_id": f"gem:{loc['location_id']}",
            "company": symbol,
            "name": loc["name"],
            "sector": None,
            "subsector": None,
            "fuel": loc["asset_type"],
            "asset_type": loc["asset_type"],
            "country": loc["country"],
            "state": loc["state"],
            "region": STATE_REGION.get(loc["state"] or "") if loc["country"] == "India" else None,
            "lat": loc["lat"],
            "lon": loc["lon"],
            "ct": None,
            "gem": {k: loc[k] for k in ["location_id", "name", "asset_type", "status", "units", "operating_units", "capacity", "capacity_unit", "wiki_url", "share"]},
            "ownership_weight": boundary_weights(loc["share"], loc["direct_share"])[meta["boundary"]],
            "weights": boundary_weights(loc["share"], loc["direct_share"]),
            "weight_source": "gem_ownership_graph",
            "match": {"match_method": "gem_only", "match_score": None, "review_status": "no_ct_estimate"},
            "evidence_ids": [ev_units.id, ev_graph.id],
        })

    # ---- coverage
    ct_linked = len(by_id)
    gem_units = len(units)
    # coverage is measured inside the disclosure boundary: owned emitters that the BRSR would include
    emitting = [l for l in locs if l["asset_type"] in EMITTING_TYPES and l["status"] == "operating"
                and boundary_weights(l["share"], l["direct_share"])[meta["boundary"]] > 0]
    emitting_matched = [l for l in emitting if l["location_id"] in matched_locs]
    rho = ct_linked / gem_units if gem_units else 0.0
    rho_eff = len(emitting_matched) / len(emitting) if emitting else 0.0
    company = {
        "symbol": symbol,
        "name": meta["name"],
        "short": meta["short"],
        "sector": meta["sector"],
        "entity_id": eid,
        "ct_owner_id": eid,
        "gem_entity_id": eid,
        "cin": (ent.get("external_ids") or {}).get("india_cin") or meta["cin"],
        "lei": (ent.get("external_ids") or {}).get("lei"),
        "home_page": ent.get("home_page"),
        "boundary": meta["boundary"],
        "coverage": {
            "ct_linked_assets": ct_linked,
            "gem_assets": gem_units,
            "gem_locations": len(locs),
            "rho": round(rho, 4),
            "operating_emitting_locations": len(emitting),
            "operating_emitting_matched": len(emitting_matched),
            "rho_effective": round(rho_eff, 4),
            "unmatched_emitting": sorted([l["name"] for l in emitting if l["location_id"] not in matched_locs]),
            "definition": "rho = CT-linked assets / GEM assets (plan §5.5); rho_effective = operating emitting GEM locations inside the disclosure boundary matched to a CT source / all such locations",
            "boundary": meta["boundary"],
            "evidence_ids": [ev_units.id, ev_graph.id] + [year_ev[y] for y in CT_YEARS],
        },
        "hitl_queue": hitl,
        "evidence_ids": [ev_ent.id],
    }
    return {"company": company, "assets": assets, "ownership": ownership}
