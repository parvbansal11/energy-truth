"""India state boundaries (geoBoundaries IND ADM1, CC BY 2.5 IN — DataMeet / ECI) tagged with POSOCO grid region,
thinned for the browser (coordinates rounded to ~1 km, collinear duplicates removed)."""
from __future__ import annotations

import json
import unicodedata

from et_core.config import settings
from et_core.evidence import Evidence
from et_core.http import fetch

from .resolve import STATE_REGION

URL = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/ADM1/geoBoundaries-IND-ADM1_simplified.geojson"


def _plain(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def _thin(ring: list, step: float = 0.04) -> list:
    out = []
    for x, y in ring:
        p = [round(x / step) * step, round(y / step) * step]
        p = [round(p[0], 3), round(p[1], 3)]
        if not out or out[-1] != p:
            out.append(p)
    if len(out) >= 4 and out[0] != out[-1]:
        out.append(out[0])
    return out if len(out) >= 4 else []


def region_states(refresh: bool = False) -> tuple[dict, Evidence]:
    r = fetch(URL, settings.raw_dir / "geo" / "geoBoundaries-IND-ADM1_simplified.geojson", refresh=refresh)
    d = json.loads(r.content)
    feats = []
    alias = {"Dadra and Nagar Haveli and Daman and Diu": "Dadra and Nagar Haveli and Daman and Diu"}
    for f in d["features"]:
        name = _plain(f["properties"]["shapeName"])
        name = alias.get(name, name)
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        thinned = [[_thin(ring) for ring in poly] for poly in polys]
        thinned = [[ring for ring in poly if ring] for poly in thinned]
        thinned = [poly for poly in thinned if poly]
        feats.append({"type": "Feature", "properties": {"state": name, "region": STATE_REGION.get(name)}, "geometry": {"type": "MultiPolygon", "coordinates": thinned}})
    ev = r.evidence("geoBoundaries India ADM1 (simplified)", "geoBoundaries / DataMeet India / Election Commission of India", kind="dataset", license="CC BY 2.5 IN")
    return {"type": "FeatureCollection", "features": feats}, ev
