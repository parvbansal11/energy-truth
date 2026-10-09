# Demo data and interpretation

Climate TRACE owner-filtered facility responses were retrieved on 9 October 2026. The browser ships the original responses for calendar years 2023, 2024 and 2025, plus a derived combined snapshot. Each response retains its request URL, retrieval timestamp and SHA-256 fingerprint.

- NTPC Ltd: E100000001926 — 41 returned facilities per loaded year.
- Tata Steel Ltd: E100001010018 — 20 returned facilities per loaded year.
- Publisher: [Climate TRACE](https://climatetrace.org).
- API: [Climate TRACE API v7](https://api.climatetrace.org/v7/sources).
- Terms: [Climate TRACE terms](https://climatetrace.org/terms). Retain all source attribution; confirm applicable sector-specific restrictions before redistributing beyond the demo.

Derived transformations: convert tonnes to millions of tonnes for display; classify source activity strings into Coal, Gas, Mixed fossil, Steel or other sector labels; sum full-facility estimates; sort/filter; compute the largest facility's share of the loaded sum. No ownership percentages or uncertainty intervals are inferred. Source-restricted activity/capacity fields display 'Not available'.

These sums are not equity-weighted corporate Scope 1 and do not establish complete company coverage. Company disclosure extraction, boundary/period reconciliation and assurance are not implemented. No claims of under-reporting are made. The older plan's reference numbers are not used as substitutes for disclosures.

The evidence review runs deterministic local validation of source IDs, coordinates, selected year, gas and non-negative finite emissions, and derives research priorities. Its animated sequence presents those checks; it is not a live agent or satellite verification run.

Map context:
- [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors: default basemap tiles; live requests, no tile bulk cache.
- Esri World Imagery: optional satellite basemap; capture dates vary. Imagery is not a CO₂ measurement.
- [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/): cached public-domain country geometry as fallback. Geometry is reduced to the name property.

The WRI dataset was investigated but is not included in the browser demo. The app does not use its dated ownership data.
