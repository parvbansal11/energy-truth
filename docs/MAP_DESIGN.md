> **Implemented.** The map ships in `apps/web/src/components/MapView.tsx`. Colour = company-level gap z (or fuel), size = CY2024 CO₂e, ring = coverage ρ_eff, hollow = owned GEM asset with no CT estimate, plus 3D columns, GIBS NO₂ / VIIRS layers, the grid-intensity choropleth and the Sentinel-2 preview. The proposal below is kept for history.


# Company factory map — proposal only

User requested thinking through a factory map and deferring implementation.

Purpose: inspect the company-to-factory ownership graph and investigate evidence coverage. Selecting a company focuses its owned assets; selecting a factory opens ownership, fuel, capacity, period, emissions method and evidence. An adjacent table makes the same records searchable and accessible.

## Encodings
- Point location: sourced coordinates, with location confidence. Missing coordinates remain in the table.
- Size: plant estimate, ownership-weighted contribution available separately. Do not size unknown emissions as zero.
- Color: evidence availability or a valid plant-level anomaly. A company-wide BRSR gap cannot be allocated to individual factories without plant-level disclosures.
- Ownership: effective direct/indirect equity weight, original source, match confidence and review status. Prevent duplicate plants and unit-level double counting.
- Coverage: company-level count of CT-linked versus GEM assets; optionally capacity-weighted coverage where consistent capacity exists. Asset-count coverage is not emissions completeness.

## Evidence rules
NO₂, night lights and thermal signals are activity proxies, not direct CO₂ measurements. Imagery timestamps and resolution remain visible. Annual CT values are annual; monthly capacity/fuel-mix reconstructions must say 'modelled'. Match company boundary (consolidated versus standalone), geography, gases and reporting period before interpreting discrepancy. Industry process emissions must be distinguished from energy combustion when source breakdown permits it; otherwise label total Scope 1 and boundary mismatch.

## First map increment after verified data
NTPC company selector → owned plants + accessible table → factory detail → source drawer. No per-factory gap colors until justified. Tata Steel adds unresolved links and low-coverage handling. Layers and 3D follow the working audit.

No map packages or map UI were added in P0.
