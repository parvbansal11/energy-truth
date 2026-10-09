"""Global Energy Monitor Ownership API connector (plan §5.1): entity identity, all eventually-owned assets
(units) with capacity/status/location, and the downward ownership graph with cumulative equity shares."""
from __future__ import annotations

from et_core.config import settings
from et_core.evidence import Evidence
from et_core.http import fetch

PUBLISHER = "Global Energy Monitor"
LICENSE = "GEM Ownership Tracker — CC BY 4.0 attribution to Global Energy Monitor"


def entity(entity_id: str, *, refresh: bool = False) -> tuple[dict, Evidence]:
    url = f"{settings.gem_api}/entities/{entity_id}"
    r = fetch(url, settings.raw_dir / "gem" / f"entity_{entity_id}.json", refresh=refresh)
    d = r.json()
    return d, r.evidence(f"GEM entity {entity_id} — {d.get('full_name', '')}", PUBLISHER, license=LICENSE)


def assets(entity_id: str, *, refresh: bool = False, page: int = 200) -> tuple[list[dict], Evidence]:
    """All units for which `entity_id` is an upstream owner. Pages are cached individually."""
    rows: list[dict] = []
    first = None
    offset = 0
    while True:
        url = f"{settings.gem_api}/assets?owner_entity_id={entity_id}&limit={page}&offset={offset}"
        r = fetch(url, settings.raw_dir / "gem" / f"assets_{entity_id}_{offset}.json", refresh=refresh)
        d = r.json()
        first = first or (r, d)
        rows.extend(d["results"])
        offset += page
        if offset >= d.get("total", 0) or not d["results"]:
            break
    r0, d0 = first
    ev = r0.evidence(f"GEM assets eventually owned by {entity_id} ({len(rows)} units)", PUBLISHER, license=LICENSE, total=d0.get("total"), locations=d0.get("total_location_count"))
    return rows, ev


def ownership_graph(entity_id: str, *, refresh: bool = False) -> tuple[dict, Evidence]:
    url = f"{settings.gem_api}/ownership/graph?root={entity_id}&direction=down&max_depth=10"
    r = fetch(url, settings.raw_dir / "gem" / f"graph_{entity_id}.json", refresh=refresh)
    return r.json(), r.evidence(f"GEM ownership graph (down) from {entity_id}", PUBLISHER, license=LICENSE)


def effective_shares(graph: dict) -> dict[str, float]:
    """asset_id -> effective equity share of the root (0..1). Sums distinct routes, capped at 1."""
    out: dict[str, float] = {}
    for node_id, routes in (graph.get("paths") or {}).items():
        total = sum(float(r.get("cumulative_pct") or 0) for r in routes)
        out[node_id] = min(total, 100.0) / 100.0
    return out


def direct_shares(graph: dict) -> dict[str, float]:
    """asset_id -> share held directly by the root entity (route length 2: root -> asset). Standalone boundary."""
    out: dict[str, float] = {}
    for node_id, routes in (graph.get("paths") or {}).items():
        total = sum(float(r.get("cumulative_pct") or 0) for r in routes if len(r.get("route") or []) == 2)
        out[node_id] = min(total, 100.0) / 100.0
    return out
