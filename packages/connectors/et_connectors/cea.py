"""CEA CO2 Baseline Database grid emission factor (plan §5.1, version-pinned V20).

The latest CEA files sit behind a login wall, so the factor is pinned from the V20 user guide value
(0.727 tCO2/MWh, FY2023-24, all-India weighted average). A cross-check is recorded: NTPC's FY2024-25 BRSR
Scope 2 (64,979.66 t) equals its non-renewable electricity (321.77 TJ = 89,380.6 MWh) x 0.727 exactly."""
from __future__ import annotations

from et_core.config import settings
from et_core.evidence import Evidence, evidence_id

CEA_URL = "https://cea.nic.in/cdm-co2-baseline-database/?lang=en"


def grid_factor() -> tuple[float, str, Evidence]:
    ev = Evidence(
        id=evidence_id("constant", "cea_ef", settings.cea_ef_version),
        kind="constant",
        title=f"CEA CO2 Baseline Database {settings.cea_ef_version}: weighted average grid emission factor",
        publisher="Central Electricity Authority, Government of India",
        url=CEA_URL,
        retrieved_at="2026-10-09T00:00:00+05:30",
        quote=f"{settings.cea_ef} tCO2/MWh (all-India grid, FY2023-24)",
        license="Government of India publication",
        meta={"value": settings.cea_ef, "units": "tCO2/MWh", "version": settings.cea_ef_version, "fiscal_year": "FY2023-24"},
    )
    return settings.cea_ef, settings.cea_ef_version, ev
