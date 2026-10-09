import { useState } from "react";
import { FLAG_SHORT, FLAG_TEXT, mt, pct, qty, signed } from "../lib/format";
import { useApp } from "../lib/store";
import { Ribbon } from "./charts/Ribbon";
import { ScopeCompare } from "./charts/ScopeCompare";
import { cx, EvidenceChip, Meter, Section, VerdictTag } from "./ui";

export function ScorecardPanel() {
  const { scorecard: sc } = useApp();
  const [scope, setScope] = useState<"S1" | "S2">("S1");
  if (!sc) return <div className="space-y-2 p-4">{[50, 120, 80].map((h, i) => <div key={i} className="skeleton" style={{ height: h }} />)}</div>;
  const s = sc.scopes[scope];
  const cov = sc.coverage;
  const flags = [...new Set(s.flags)];
  return (
    <div key={sc.symbol + scope} className="stagger">
      <Section>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="eyebrow">{sc.sector} · {sc.boundary}</div>
            <div className="mt-1 truncate text-[18px] font-light">{sc.name}</div>
          </div>
          <VerdictTag v={s.verdict} />
        </div>
        <div className="mt-3 grid grid-cols-2 border border-line" role="tablist" aria-label="Scope">
          {(["S1", "S2"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={scope === k} onClick={() => setScope(k)}
              className={cx("focus-ring eyebrow py-1.5 transition", scope === k ? "bg-surface-3 !text-ink" : "hover:!text-ink-2")}>
              {k === "S1" ? "Scope 1 · fuel" : "Scope 2 · grid"}
            </button>
          ))}
        </div>
      </Section>

      {s.independent ? (
        <Section label={`${sc.fy} · reported vs rebuilt`}>
          <div className="grid grid-cols-2 gap-px border border-line bg-line">
            <Num l="Reported" v={qty(s.reported?.value_t)} sub={s.reported ? `BRSR p.${s.reported.page}` : "not filed"} />
            <Num l="Independent" v={qty(s.independent.value_t)} sub={`± ${qty(s.independent.sigma_t)}`} tone="text-[var(--s1)]" />
            <Num l="Gap" v={pct(s.gap_pct)} sub={s.gap_t != null ? `${s.gap_t > 0 ? "+" : ""}${qty(s.gap_t)}` : undefined} tone={(s.gap_pct ?? 0) > 0 ? "text-pos" : "text-neg"} />
            <Num l="z-score" v={signed(s.z)} sub={s.fused ? `fused ${qty(s.fused.value_t)}` : undefined} />
          </div>
          <div className="mt-3"><ScopeCompare scope={s} unitScale={scope === "S2" && s.independent.value_t < 1e6 ? 1e3 : 1e6} /></div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {s.reported && <EvidenceChip ids={[...s.reported.evidence_ids, s.reported.assurance?.evidence_id]} label={`BRSR p.${s.reported.page}`} title="Reported value" />}
            <EvidenceChip ids={s.independent.evidence_ids} label={scope === "S1" ? "Plant sources" : "MWh × CEA"} title="Independent inputs" />
          </div>
        </Section>
      ) : (
        <Section><div className="text-[12px] text-muted">{s.verdict.text}</div></Section>
      )}

      {scope === "S1" && (
        <Section label="Coverage" action={<EvidenceChip ids={cov.evidence_ids} label="GEM" title="Coverage inputs" />}>
          <div className="flex items-end justify-between">
            <div><span className="tnum text-[22px] font-light">{cov.ct_linked_assets}</span><span className="tnum text-[12px] text-muted"> / {cov.gem_assets} units</span></div>
            <div className="text-right"><span className="tnum text-[22px] font-light">{Math.round(cov.rho_effective * 100)}%</span><div className="eyebrow !text-[8.5px]">emitters covered</div></div>
          </div>
          <div className="mt-2"><Meter value={cov.rho_effective} tone={cov.rho_effective < 0.8 ? "var(--accent)" : "var(--ok)"} /></div>
          {cov.unmatched_emitting.length > 0 && (
            <details className="mt-2 text-[11.5px] text-muted">
              <summary className="cursor-pointer hover:text-ink">{cov.unmatched_emitting.length} owned emitters missing</summary>
              <ul className="mt-1 space-y-0.5 pl-3">{cov.unmatched_emitting.map((n) => <li key={n}>· {n}</li>)}</ul>
            </details>
          )}
        </Section>
      )}

      {scope === "S1" && sc.forecast && (
        <Section label="Chronos-2 · monthly" action={sc.band && <span className={cx("map-chip rounded-[2px] px-1.5 py-0.5 text-[9.5px] uppercase", sc.band.breach ? "bg-accent text-accent-ink" : "bg-ok/15 text-ok")}>{sc.band.fy} {sc.band.breach ? "breach" : "in band"}</span>}>
          <Ribbon label="Monthly ownership-weighted emissions with Chronos-2 band"
            data={{ history: sc.forecast.history_months.slice(-18).map((m, i, arr) => ({ month: m, value: sc.forecast!.history_t[sc.forecast!.history_t.length - arr.length + i] })), forecast: sc.forecast, observed: new Set(sc.forecast.observed_covariate_months) }}
            scale={1e6} unit="Mt" digits={1} height={104} />
          {sc.band && (
            <div className="tnum mt-2 grid grid-cols-2 text-[11px]">
              <span className="text-muted">Band (scaled)</span><span className="text-right">{mt(sc.band.q10_t)} to {mt(sc.band.q90_t)} Mt</span>
              <span className="text-muted">BRSR {sc.band.fy}</span><span className={cx("text-right", sc.band.breach && "text-accent")}>{mt(sc.band.reported_t)} Mt</span>
            </div>
          )}
        </Section>
      )}

      {flags.length > 0 && (
        <Section label="Flags">
          <div className="flex flex-wrap gap-1.5">
            {flags.map((f) => <span key={f} title={FLAG_TEXT[f] || f} className="map-chip cursor-help rounded-[2px] border border-accent/30 bg-accent/5 px-1.5 py-0.5 text-[10px] text-accent">{FLAG_SHORT[f] || f}</span>)}
          </div>
        </Section>
      )}
    </div>
  );
}

function Num({ l, v, sub, tone }: { l: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <div className="eyebrow !text-[8.5px]">{l}</div>
      <div className={cx("tnum mt-1 text-[17px] leading-none font-light", tone)}>{v}</div>
      {sub && <div className="tnum mt-1 text-[10.5px] text-muted">{sub}</div>}
    </div>
  );
}
