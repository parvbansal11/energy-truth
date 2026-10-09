"""Entity resolution CT source <-> GEM location (plan §5.3).

1. exact:   same coordinates (<0.25 km) and compatible sector   -> score 1.0
2. soft:    name similarity (Titan Embeddings v2 when Bedrock is available, else character-trigram cosine)
            combined with spatial proximity (<=10 km) and a sector-compatibility gate
3. store `match_method`, `match_score`, `review_status` (needs_review below HITL_ENTITY_THRESHOLD)."""
from __future__ import annotations

import math
import re
from collections import Counter
from functools import lru_cache

from et_core.config import settings

SECTOR_COMPAT = {
    "electricity-generation": {"Coal Plant", "Oil & Gas Plant", "Gas Plant", "Bioenergy Power Plant", "Bioenergy Plant", "Oil Plant"},
    "iron-and-steel": {"Iron & Steel Plant"},
    "cement": {"Cement or Concrete Plant", "Cement & Concrete Plant", "Cement Plant"},
    "coal-mining": {"Coal Mine"},
    "iron-mining": {"Iron Ore Mine"},
    "oil-and-gas-production": {"Oil & Gas Extraction Area", "Oil & Gas Plant"},
}
EMITTING_TYPES = {"Coal Plant", "Oil & Gas Plant", "Gas Plant", "Iron & Steel Plant", "Cement or Concrete Plant", "Cement & Concrete Plant", "Cement Plant", "Coal Mine", "Iron Ore Mine"}
FUEL_COMPAT = {"coal": {"Coal Plant"}, "gas": {"Oil & Gas Plant", "Gas Plant"}, "oil": {"Oil & Gas Plant", "Oil Plant"}, "biomass": {"Bioenergy Plant", "Bioenergy Power Plant"}}
STOP = r"\b(power station|power plant|steel plant|steelworks|steel works|plant|works|mine|ltd|limited|tata steel|ntpc|jsw|adani|ultratech|cement|thermal|project|station|unit|phase)\b"


def haversine_km(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _norm(name: str) -> str:
    s = re.sub(STOP, " ", name.lower())
    return re.sub(r"[^a-z0-9 ]", " ", s).strip()


def _trigrams(s: str) -> Counter:
    s = f"  {s} "
    return Counter(s[i:i + 3] for i in range(len(s) - 2))


def trigram_cosine(a: str, b: str) -> float:
    ta, tb = _trigrams(_norm(a)), _trigrams(_norm(b))
    if not ta or not tb:
        return 0.0
    dot = sum(ta[k] * tb.get(k, 0) for k in ta)
    return dot / math.sqrt(sum(v * v for v in ta.values()) * sum(v * v for v in tb.values()))


@lru_cache(maxsize=4096)
def _titan(text: str) -> tuple[float, ...]:
    import json

    import boto3

    body = json.dumps({"inputText": text, "dimensions": 256, "normalize": True})
    r = boto3.client("bedrock-runtime", region_name=settings.region).invoke_model(modelId=settings.bedrock_embed_model, body=body)
    return tuple(json.loads(r["body"].read())["embedding"])


def name_similarity(a: str, b: str) -> tuple[float, str]:
    if settings.bedrock_enabled:
        try:
            ea, eb = _titan(_norm(a) or a), _titan(_norm(b) or b)
            return max(0.0, sum(x * y for x, y in zip(ea, eb))), "titan-embed-v2"
        except Exception:
            pass
    return trigram_cosine(a, b), "trigram-cosine"


def _compatible(src: dict) -> set[str]:
    compat = SECTOR_COMPAT.get(src.get("subsector", ""), set())
    fuel = (src.get("assetType") or "").lower()
    if src.get("subsector") == "electricity-generation" and fuel in FUEL_COMPAT:
        compat = FUEL_COMPAT[fuel]
    return compat


def match_source(src: dict, locations: list[dict], radius_km: float = 10.0) -> dict:
    """Best GEM location for a CT source with method/score, plus co-located compatible locations that the
    same CT source covers (e.g. CT 'Barh I & II' = GEM 'Barh I' + 'Barh II'). Unmatched -> HITL."""
    lat, lon = src["centroid"]["latitude"], src["centroid"]["longitude"]
    compat = _compatible(src)
    best, colocated = None, []
    for loc in locations:
        if compat and loc["asset_type"] not in compat:
            continue
        if loc["lat"] is None:
            continue
        d = haversine_km(lat, lon, loc["lat"], loc["lon"])
        if d > radius_km:
            continue
        if d < 0.25:
            colocated.append(loc["location_id"])
            cand = {"location_id": loc["location_id"], "distance_km": round(d, 3), "match_method": "exact_coordinates+sector", "match_score": 1.0, "name_method": None}
        else:
            ns, how = name_similarity(src["name"], loc["name"])
            spatial = max(0.0, 1 - d / radius_km)
            cand = {"location_id": loc["location_id"], "distance_km": round(d, 3), "match_method": f"spatial+{how}", "match_score": round(0.5 * ns + 0.5 * spatial, 3), "name_method": how}
        if best is None or cand["match_score"] > best["match_score"]:
            best = cand
    if best is None:
        return {"location_id": None, "location_ids": [], "distance_km": None, "match_method": "unmatched", "match_score": 0.0, "review_status": "unmatched"}
    best["location_ids"] = sorted(set(colocated) | {best["location_id"]})
    best["review_status"] = "auto_accepted" if best["match_score"] >= settings.hitl_threshold else "needs_review"
    return best


# Indian state -> Grid-India regional load despatch area (POSOCO regions)
STATE_REGION = {
    **{s: "NR" for s in ["Punjab", "Haryana", "Rajasthan", "Delhi", "Uttar Pradesh", "Uttarakhand", "Himachal Pradesh", "Jammu and Kashmir", "Ladakh", "Chandigarh"]},
    **{s: "WR" for s in ["Gujarat", "Maharashtra", "Madhya Pradesh", "Chhattisgarh", "Goa", "Dadra and Nagar Haveli and Daman and Diu", "Dadra and Nagar Haveli", "Daman and Diu"]},
    **{s: "SR" for s in ["Andhra Pradesh", "Telangana", "Karnataka", "Kerala", "Tamil Nadu", "Puducherry", "Lakshadweep"]},
    **{s: "ER" for s in ["Bihar", "Jharkhand", "Odisha", "West Bengal", "Sikkim", "Andaman and Nicobar Islands"]},
    **{s: "NER" for s in ["Assam", "Arunachal Pradesh", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Tripura"]},
}
