"""NASA GIBS WMTS layer config (no key). Probes a real tile per layer to find the most recent date with
imagery, so the UI never shows an empty layer. Attribution: NASA EOSDIS GIBS."""
from __future__ import annotations

from datetime import date, timedelta

import httpx

from et_core.evidence import Evidence, evidence_id, now_iso, sha256_bytes

BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best"
LAYERS = {
    "no2": {
        "id": "TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column",
        "matrix": "GoogleMapsCompatible_Level6",
        "max_zoom": 6,
        "title": "TROPOMI tropospheric NO2 (Sentinel-5P)",
        "why": "Combustion proxy over coal plants and steel works; not a CO2 measurement",
        "probe": (4, 6, 11),
    },
    "dnb": {
        "id": "VIIRS_SNPP_DayNightBand_At_Sensor_Radiance",
        "matrix": "GoogleMapsCompatible_Level8",
        "max_zoom": 8,
        "title": "VIIRS Day/Night Band radiance (Suomi NPP)",
        "why": "Industrial night-time energy activity proxy",
        "probe": (4, 6, 11),
    },
    "truecolor": {
        "id": "VIIRS_SNPP_CorrectedReflectance_TrueColor",
        "matrix": "GoogleMapsCompatible_Level9",
        "max_zoom": 9,
        "title": "VIIRS corrected reflectance true colour",
        "why": "Daily cloud/haze context",
        "probe": (4, 6, 11),
    },
}


def tile_url(layer_key: str, day: str) -> str:
    L = LAYERS[layer_key]
    return f"{BASE}/{L['id']}/default/{day}/{L['matrix']}/{{z}}/{{y}}/{{x}}.png"


def probe_layers(start: date | None = None, max_back: int = 10) -> tuple[dict, list[Evidence]]:
    start = start or date.today()
    cfg, evs = {}, []
    for key, L in LAYERS.items():
        found = None
        for back in range(1, max_back + 1):
            day = (start - timedelta(days=back)).isoformat()
            z, x, y = L["probe"]
            url = f"{BASE}/{L['id']}/default/{day}/{L['matrix']}/{z}/{y}/{x}.png"
            try:
                r = httpx.get(url, timeout=20)
                if r.status_code == 200 and r.headers.get("content-type", "").startswith("image") and len(r.content) > 1500:
                    found = (day, url, sha256_bytes(r.content))
                    break
            except Exception:
                continue
        if not found:
            continue
        day, url, digest = found
        ev = Evidence(
            id=evidence_id("tile", L["id"], day),
            kind="tile",
            title=f"{L['title']} — {day}",
            publisher="NASA EOSDIS Global Imagery Browse Services (GIBS)",
            url=url,
            retrieved_at=now_iso(),
            sha256=digest,
            license="NASA EOSDIS open data — attribution requested",
            meta={"layer": L["id"], "date": day},
        )
        evs.append(ev)
        cfg[key] = {**{k: v for k, v in L.items() if k != "probe"}, "date": day, "template": tile_url(key, day), "evidence_id": ev.id}
    return cfg, evs
