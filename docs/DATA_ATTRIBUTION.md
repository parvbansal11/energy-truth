# Data sources, transformations and attribution

Every curated number carries `evidence_ids`. Each evidence record holds the URL, retrieval timestamp, SHA-256 of the cached payload, and the local cache path; PDF evidence also holds the page and quote. Raw payloads live in `data/raw/**` with `*.meta.json` provenance and are mirrored to `S3_RAW_BUCKET` when deployed.

| Source | Endpoint / file | Used for | Licence / terms |
|---|---|---|---|
| Company BRSR filings | NTPC FY2024-25 & FY2025-26; Tata Steel FY2023-24 & FY2024-25 (`data/raw/brsr/*.pdf`) | Scope 1/2, electricity, assurance — page-cited | Public statutory disclosure (SEBI LODR 34(2)(f)) |
| Climate TRACE API v7 | `/v7/sources?ownerIds=…&year=…`, `/v7/sources/{id}` | Plant annual CO₂e (100-yr), activity, capacity, confidence | Climate TRACE terms — attribution required (climatetrace.org/terms) |
| Global Energy Monitor Ownership API | `/entities/{id}`, `/assets?owner_entity_id=`, `/ownership/graph` | Owned units, status, capacity, ownership shares, coverage denominator | CC BY 4.0 — Global Energy Monitor |
| Robbie M. Andrew — India energy data | `POSOCO_data.csv`, `CEA_DGR_data.csv`, `India_monthly_data.csv` | Regional fuel mix, demand, steel/cement/coal indices, Chronos covariates | CC BY 4.0 — cite Andrew (2020), ESSD; derived from Grid-India & CEA reports |
| CEA CO₂ Baseline Database V20 | pinned constant 0.727 tCO₂/MWh (FY2023-24) | Scope 2 grid factor, intensity calibration | Government of India |
| NASA EOSDIS GIBS | WMTS `TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column`, `VIIRS_SNPP_DayNightBand_At_Sensor_Radiance` | Energy-activity proxy layers (dated) | NASA open data — attribution requested |
| Copernicus Sentinel-2 L2A (Element84 Earth Search) | STAC `/v1/search` | Latest low-cloud scene over a focused plant | Copernicus Sentinel data, free & open |
| geoBoundaries IND ADM1 | simplified GeoJSON | State outlines for the grid-region choropleth | CC BY 2.5 IN (DataMeet India / ECI) |
| Esri | Canvas Dark/Light Gray, World Imagery tiles | Basemap context only | Esri terms of use; attribution shown on map |

## Transformations
- Units normalised to tCO₂e and MWh, with Indian digit grouping parsed (32,69,59,946.44).
- Calendar-year CT totals are spread to months with activity profiles. The FY value is the Apr–Mar sum.
- Ownership weights come from the GEM graph (direct / effective shares), matched to the disclosure boundary.
- Grid intensity is the CEA-calibrated fossil-share index.
- Satellite imagery is context or an activity proxy. **It never measures CO₂** and is never used as a number in an estimate.

## Limitations
The independent rebuild covers only owned assets with a Climate TRACE estimate (see coverage ρ_eff). Process emissions and combustion are both inside CT's facility totals. A reported-vs-independent gap is a research lead, not proof of misreporting. The app marks low-coverage gaps "inconclusive".
