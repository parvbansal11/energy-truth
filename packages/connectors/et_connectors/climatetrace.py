"""Climate TRACE API v7 connector (plan §5.1). Annual source totals by owner, plus per-source detail
(confidence ordinals, owners). Attribution: Climate TRACE (https://climatetrace.org)."""
from __future__ import annotations

from et_core.config import settings
from et_core.evidence import Evidence
from et_core.http import fetch

PUBLISHER = "Climate TRACE"
LICENSE = "Climate TRACE terms (attribution required) — https://climatetrace.org/terms"


def sources_by_owner(owner_id: str, year: int, *, refresh: bool = False) -> tuple[list[dict], Evidence]:
    url = f"{settings.climatetrace_api}/sources?ownerIds={owner_id}&year={year}&gas=co2e_100yr&limit=1000"
    r = fetch(url, settings.raw_dir / "climatetrace" / f"sources_{owner_id}_{year}.json", refresh=refresh)
    rows = r.json()
    ev = r.evidence(f"Climate TRACE v7 sources owned by {owner_id}, CY{year}", PUBLISHER, license=LICENSE, owner_id=owner_id, year=year, count=len(rows))
    return rows, ev


def source_detail(source_id: int, *, refresh: bool = False) -> tuple[dict, Evidence]:
    url = f"{settings.climatetrace_api}/sources/{source_id}"
    r = fetch(url, settings.raw_dir / "climatetrace" / "detail" / f"{source_id}.json", refresh=refresh)
    d = r.json()
    ev = r.evidence(f"Climate TRACE v7 source {source_id} — {d.get('name', '')}", PUBLISHER, license=LICENSE, source_id=source_id)
    return d, ev


# CT confidence ordinal -> relative 1-sigma for the asset's annual CO2e (plan §5.5: "CT confidence ordinals -> sigma_ind").
# Mapping is a modelling choice recorded in DECISIONS.md; it is applied identically to every asset.
CONFIDENCE_SIGMA = {"very high": 0.05, "high": 0.10, "medium": 0.20, "low": 0.35, "very low": 0.50}


def asset_relative_sigma(detail: dict, year: int) -> tuple[float, str]:
    for c in detail.get("confidence") or []:
        if c.get("year") == year:
            label = (c.get("total_co2e_100yrgwp") or c.get("co2_emissions") or "medium").lower()
            return CONFIDENCE_SIGMA.get(label, 0.20), label
    return 0.20, "unreported"
