import { useState } from "react";
import { Info } from "lucide-react";
import { FLAG_SHORT, FLAG_TEXT, mt, pct, qty, signed } from "../lib/format";
import { useApp } from "../lib/store";
import { Ribbon } from "./charts/Ribbon";
import { ScopeCompare } from "./charts/ScopeCompare";
import { cx, EvidenceChip, Meter, Section, VerdictTag } from "./ui";

export function ScorecardPanel() {
  const { scorecard: sc } = useApp();
  const [scope, setScope] = useState<"S1" | "S2">("S1");
  if (!sc) return <div className="space-y-3 p-5">{[50, 120, 80].map((h, i) => <div key={i} className="skeleton" style={{ height: h }} />)}</div>;
  const s = sc.scopes[scope];
  const cov = sc.coverage;
  const flags = [...new Set(s.flags)];
  return (
    <div key={sc.symbol + scope} className="stagger divide-y divide-line">
      <Section>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="serif text-[24px] leading-tight">{sc.name}</div>
            <div className="mt-1 text-[12.5px] text-muted">{sc.sector} · {sc.boundary} · {sc.fy}</div>
          </div>
          <span data-tour="verdict"><VerdictTag v={s.verdict} /></span>
        </div>
        <div className="mt-4 grid grid-cols-2 rounded-xl bg-surface-3 p-1" role="tablist" aria-label="Scope">
          {(["S1", "S2"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={scope === k} onClick={() => setScope(k)}
              className={cx("focus-ring rounded-lg py-1.5 text-[12.5px] transition", scope === k ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink-2")}>
              {k === "S1" ? "Fuel burned" : "Electricity bought"}
            </button>
          ))}
        </div>
      </Section>

      {s.independent ? (
        <Section label={scope === "S1" ? "Scope 1: reported vs rebuilt" : "Scope 2: reported vs rebuilt"}>
          <div data-tour="numbers" className="grid grid-cols-2 gap-2">
            <Num l="Reported" v={qty(s.reported?.value_t)} sub={s.reported ? `Filing page ${s.reported.page}` : "Not filed"} />
            <Num l="Rebuilt" v={qty(s.independent.value_t)} sub={`± ${qty(s.independent.sigma_t)}`} tone="text-[var(--s1)]" />
            <Num l="Gap" v={pct(s.gap_pct)} sub={s.gap_t != null ? `${s.gap_t > 0 ? "+" : ""}${qty(s.gap_t)}` : undefined} />
            <Num l="z-score" v={signed(s.z)} sub={s.z == null ? undefined : Math.abs(s.z) < 1 ? "Close" : Math.abs(s.z) < 2 ? "Worth a look" : "Large gap"} />
          </div>
          <div className="mt-4"><ScopeCompare scope={s} unitScale={scope === "S2" && s.independent.value_t < 1e6 ? 1e3 : 1e6} /></div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {s.reported && <EvidenceChip ids={[...s.reported.evidence_ids, s.reported.assurance?.evidence_id]} label={`Filing, p.${s.reported.page}`} title="Reported value" />}
            <EvidenceChip ids={s.independent.evidence_ids} label={scope === "S1" ? "Plant data" : "Electricity × grid factor"} title="Rebuild inputs" />
          </div>
          {scope === "S2" && <p className="mt-3 flex gap-2 rounded-xl bg-surface-3/70 p-3 text-[12px] text-muted"><Info size={14} className="mt-px shrink-0" />Uses the company's own electricity figure; only the grid factor is independent.</p>}
        </Section>
      ) : (
        <Section><p className="rounded-xl bg-surface-3/70 p-3 text-[13px] text-muted">{s.verdict.text}</p></Section>
      )}

      {scope === "S1" && (
        <Section label="How much we can see" action={<EvidenceChip ids={cov.evidence_ids} label="Ownership data" title="Coverage inputs" />}>
          <div data-tour="coverage">
            <div className="flex items-end justify-between">
              <div className="tnum text-[26px] leading-none font-medium tracking-tight">{Math.round(cov.rho_effective * 100)}%<span className="ml-1.5 text-[12.5px] font-normal text-muted">of emitting plants</span></div>
              <div className="tnum text-right text-[12px] text-muted">{cov.ct_linked_assets} of {cov.gem_assets} units</div>
            </div>
            <div className="mt-3"><Meter value={cov.rho_effective} tone={cov.rho_effective < 0.8 ? "var(--sun)" : "var(--ok)"} /></div>
            {cov.unmatched_emitting.length > 0 && (
              <details className="group mt-3 text-[12.5px] text-muted">
                <summary className="cursor-pointer list-none hover:text-ink">{cov.unmatched_emitting.length} owned plant{cov.unmatched_emitting.length > 1 ? "s" : ""} not in the public data <span className="text-faint group-open:hidden">· show</span></summary>
                <ul className="mt-2 space-y-1 rounded-xl bg-surface-3/70 p-3">{cov.unmatched_emitting.map((n) => <li key={n}>{n}</li>)}</ul>
              </details>
            )}
          </div>
        </Section>
      )}

      {scope === "S1" && sc.forecast && (
        <Section label="Monthly forecast" action={sc.band && <span className={cx("rounded-full px-2.5 py-1 text-[11.5px]", sc.band.breach ? "bg-sun-soft text-sun" : "bg-ok-soft text-ok")}>{sc.band.fy} {sc.band.breach ? "outside range" : "in range"}</span>}>
          <div data-tour="forecast">
            <Ribbon label="Monthly ownership-weighted emissions with Chronos-2 range"
              data={{ history: sc.forecast.history_months.slice(-18).map((m, i, arr) => ({ month: m, value: sc.forecast!.history_t[sc.forecast!.history_t.length - arr.length + i] })), forecast: sc.forecast, observed: new Set(sc.forecast.observed_covariate_months) }}
              scale={1e6} unit="Mt" digits={1} height={110} />
            {sc.band && (
              <p className="tnum mt-2 text-[12.5px] text-muted">Expected {mt(sc.band.q10_t)} to {mt(sc.band.q90_t)} Mt for {sc.band.fy}; the filing says <span className={cx(sc.band.breach && "font-medium text-sun")}>{mt(sc.band.reported_t)} Mt</span>.</p>
            )}
          </div>
        </Section>
      )}

      {flags.length > 0 && (
        <Section label="Things to keep in mind">
          <div className="flex flex-wrap gap-1.5">
            {flags.map((f) => <span key={f} title={FLAG_TEXT[f] || f} className="cursor-help rounded-full bg-surface-3 px-2.5 py-1 text-[11.5px] text-ink-2">{FLAG_SHORT[f] || f}</span>)}
          </div>
        </Section>
      )}
    </div>
  );
}

function Num({ l, v, sub, tone }: { l: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-surface-3/70 px-3.5 py-3">
      <div className="text-[12px] text-muted">{l}</div>
      <div className={cx("tnum mt-1 text-[20px] leading-none font-medium tracking-tight", tone)}>{v}</div>
      {sub && <div className="tnum mt-1.5 text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}
