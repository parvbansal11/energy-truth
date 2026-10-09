"""Sentinel-2 L2A scenes from Element84 Earth Search STAC (no key) for plant focus (plan §7.2)."""
from __future__ import annotations

from datetime import date, timedelta

import httpx

from et_core.evidence import Evidence, evidence_id, now_iso

STAC = "https://earth-search.aws.element84.com/v1/search"


def latest_scene(lon: float, lat: float, days: int = 90, max_cloud: float = 30) -> tuple[dict | None, Evidence | None]:
    end = date.today()
    body = {
        "collections": ["sentinel-2-l2a"],
        "intersects": {"type": "Point", "coordinates": [lon, lat]},
        "datetime": f"{(end - timedelta(days=days)).isoformat()}T00:00:00Z/{end.isoformat()}T23:59:59Z",
        "query": {"eo:cloud_cover": {"lt": max_cloud}},
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
        "limit": 1,
    }
    r = httpx.post(STAC, json=body, timeout=30)
    r.raise_for_status()
    feats = r.json().get("features", [])
    if not feats:
        return None, None
    f = feats[0]
    a = f.get("assets", {})
    scene = {
        "id": f["id"],
        "datetime": f["properties"].get("datetime"),
        "cloud_cover": f["properties"].get("eo:cloud_cover"),
        "thumbnail": (a.get("thumbnail") or {}).get("href"),
        "visual": (a.get("visual") or {}).get("href"),
        "bbox": f.get("bbox"),
        "stac_url": f"https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/{f['id']}",
    }
    ev = Evidence(
        id=evidence_id("tile", "s2", f["id"]),
        kind="tile",
        title=f"Sentinel-2 L2A {f['id']} ({scene['datetime'][:10]}, cloud {scene['cloud_cover']:.0f}%)",
        publisher="Copernicus Sentinel-2 via Element84 Earth Search (AWS Open Data)",
        url=scene["stac_url"],
        retrieved_at=now_iso(),
        license="Copernicus Sentinel data — free and open, attribution required",
        meta=scene,
    )
    return scene, ev
