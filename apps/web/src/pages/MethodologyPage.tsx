import { useEffect, useState } from "react";
import { api, type Evidence } from "../lib/api";
import { useApp } from "../lib/store";
import { PageShell, Panel } from "../components/ui";

const SOURCES = [
  ["Company BRSR filings", "Scope 1/2 GHG, electricity, assurance — page-cited", "Public statutory disclosure (SEBI)"],
  ["Climate TRACE API v7", "Plant-level annual CO₂e, activity, capacity, confidence", "Climate TRACE terms — attribution"],
  ["Global Energy Monitor Ownership API", "Owned units, capacity, status, ownership graph & equity shares", "CC BY 4.0"],
  ["Robbie M. Andrew — POSOCO / CEA DGR / India monthly", "Daily regional fuel mix & demand; monthly steel/cement/coal", "CC BY 4.0"],
  ["CEA CO₂ Baseline Database V20", "Grid emission factor 0.727 tCO₂/MWh, FY2023-24", "Government of India"],
  ["NASA EOSDIS GIBS", "TROPOMI NO₂ and VIIRS Day/Night Band tiles (dated)", "NASA open data"],
  ["Copernicus Sentinel-2 L2A (Element84 Earth Search)", "Latest low-cloud scene over a focused plant", "Copernicus open licence"],
  ["geoBoundaries IND ADM1", "State outlines for the grid-region choropleth", "CC BY 2.5 IN (DataMeet/ECI)"],
];

/** Data Provenance / Methodology (plan §4 item 10). */
export function MethodologyPage() {
  const { meta } = useApp();
  const [ev, setEv] = useState<Evidence[]>();
  useEffect(() => { api.evidence([]).then(setEv).catch(() => {}); }, []);
  const byKind = ev?.reduce<Record<string, number>>((a, e) => ({ ...a, [e.kind]: (a[e.kind] || 0) + 1 }), {});
  return (
    <PageShell title="Methodology & provenance" kicker="How every number is built — and what it cannot prove">
      <Panel title="The check is two sums">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="text-[12px] font-semibold text-accent">Scope 1 (fuel burned in owned assets)</div>
            <div className="mt-1 font-mono text-[13px]">E<sub>ind</sub> = Σ<sub>a</sub> w<sub>a</sub> · E<sub>a</sub><sup>CT</sup></div>
            <p className="mt-1 text-[12px] text-ink-2">w<sub>a</sub> follows the disclosure boundary: <b>standalone</b> = GEM direct share; <b>consolidated</b> = operational-control proxy (≥ 50% → 100%, JVs excluded as Scope 3 cat. 15); equity share shown as an alternative.</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="text-[12px] font-semibold text-accent">Scope 2 (electricity bought)</div>
            <div className="mt-1 font-mono text-[13px]">E<sub>ind</sub> = MWh<sup>BRSR</sup> × EF<sup>CEA V20</sup></div>
            <p className="mt-1 text-[12px] text-ink-2">Only the factor is independent — the electricity quantity is the company's own. Flags mark factor-year and geography mismatches.</p>
          </div>
        </div>
      </Panel>
      <Panel title="Uncertainty, fusion and verdicts">
        <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-ink-2">
          <li>σ<sub>ind</sub>² = Σ(r<sub>a</sub>·w<sub>a</sub>·E<sub>a</sub>)² + (5%·E)² + ((1−ρ<sub>eff</sub>)·E)² — CT confidence (very high 5% … very low 50%), a method-bias floor (Gurney et al. 2024), and a coverage term.</li>
          <li>σ<sub>rep</sub> from assurance level (reasonable 3%, limited 7%, none 15%) plus rounding of the printed figure (integer Mt → 1 Mt/√12).</li>
          <li>Fusion is inverse-variance; z = (E<sub>ind</sub> − E<sub>rep</sub>) / √(σ<sub>ind</sub>² + σ<sub>rep</sub>²). |z| &lt; 1 consistent, 1–2 watch, &gt; 2 significant gap.</li>
          <li><b>Low coverage overrides the verdict:</b> if fewer than 80% of in-boundary operating emitters have an independent estimate, the gap is "inconclusive" — never an accusation.</li>
          <li>Coverage: ρ = CT-linked assets / GEM units (plan definition); ρ<sub>eff</sub> = matched in-boundary operating emitting locations / all such locations.</li>
        </ul>
      </Panel>
      <Panel title="Period alignment & forecasts">
        <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-ink-2">
          <li>BRSR is Indian FY (Apr–Mar); Climate TRACE totals are calendar years. CT annual totals are spread over months with an activity profile (POSOCO regional coal/gas generation; India steel, cement and coal production indices) so each calendar year sums exactly to CT; the FY value is the Apr–Mar sum. Tag: <code className="font-mono">calibrated_capacity_mix</code>.</li>
          <li>Chronos-2 (amazon/chronos-2) runs locally on CPU by default; a SageMaker JumpStart endpoint is used only when deployed with approval. Future covariates use observed POSOCO values for months already published (nowcast) and last-year values beyond.</li>
          <li>Band-breach rule: FY band = observed months + forecast quantile sums, scaled by the previous FY's reported/independent ratio (boundary calibration). A BRSR value outside the scaled q10–q90 raises FORECAST_BAND_BREACH.</li>
          <li>Grid intensity = CEA V20 factor × monthly fossil share / FY2023-24 mean fossil share — an index, not an official monthly factor.</li>
        </ul>
      </Panel>
      <Panel title="Sources & licences">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="text-left text-muted"><tr><th className="py-1 pr-3">Source</th><th className="py-1 pr-3">Used for</th><th className="py-1">Licence</th></tr></thead>
            <tbody>{SOURCES.map((r) => <tr key={r[0]} className="border-t border-line"><td className="py-1.5 pr-3 font-medium">{r[0]}</td><td className="py-1.5 pr-3 text-ink-2">{r[1]}</td><td className="py-1.5 text-muted">{r[2]}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-muted">
          Evidence ledger: {ev ? `${ev.length} records` : "…"} {byKind && `(${Object.entries(byKind).map(([k, v]) => `${v} ${k}`).join(", ")})`} · data generated {meta?.manifest.generated_at.replace("T", " ").slice(0, 16)} UTC. Raw responses are cached with SHA-256 fingerprints in <code className="font-mono">data/raw</code> and mirrored to S3 when deployed.
        </p>
      </Panel>
      <Panel title="What this is not">
        <p className="text-[13px] text-ink-2">Not an assurance opinion, not an IIoT meter product and not an air-quality app. Satellite layers are activity proxies and context; they never measure a company's CO₂. A difference between two totals does not, by itself, prove misreporting — coverage, boundary and period must line up first, and the app says so whenever they don't.</p>
      </Panel>
    </PageShell>
  );
}
