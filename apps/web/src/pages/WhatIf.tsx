import { useEffect, useState } from "react";
import { api, type WhatIfResult } from "../lib/api";
import { monthLabel, pct, qty } from "../lib/format";
import { go } from "../lib/router";
import { useApp } from "../lib/store";
import { cx, Empty, EvidenceChip, PageShell, Panel, Stat } from "../components/ui";

/** What-if Energy Switch (plan §4 item 7): shift purchased power / raise RE share -> Δ Scope 2 on the Chronos grid path. */
export function WhatIf({ company }: { company?: string }) {
  const { companies, selected, select } = useApp();
  const sym = company || selected;
  const [re, setRe] = useState(20);
  const [shift, setShift] = useState(15);
  const [region, setRegion] = useState<string | null>(null);
  const [r, setR] = useState<WhatIfResult>();
  useEffect(() => {
    const t = setTimeout(() => api.whatif({ symbol: sym, re_share_pct: re, shift_pct: shift, region }).then(setR).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [sym, re, shift, region]);
  const withS2 = companies.filter((c) => c.has_disclosure);
  return (
    <PageShell title="What-if Energy Switch" kicker="Scope 2 scenarios · Chronos-2 grid path">
      <div className="flex flex-wrap gap-1.5">
        {companies.map((c) => (
          <button key={c.symbol} onClick={() => { select(c.symbol); go("whatif", c.symbol); }} disabled={!withS2.includes(c)}
            className={cx("rounded-full px-3 py-1 text-[12.5px] font-medium disabled:opacity-35", sym === c.symbol ? "bg-ink text-bg" : "border border-line-2 text-ink-2")}>{c.short}</button>
        ))}
      </div>
      {r && !r.available ? <Empty>{r.reason}</Empty> : !r ? <div className="skeleton h-60 rounded-xl" /> : (
        <>
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <Panel title="Levers">
              <label className="block text-[13px]">
                <div className="flex justify-between"><span>Renewable supply share</span><b className="tnum">{re}%</b></div>
                <input type="range" min={0} max={100} value={re} onChange={(e) => setRe(+e.target.value)} className="mt-2 w-full accent-[var(--accent)]" aria-label="Renewable supply share" />

              </label>
              <label className="mt-4 block text-[13px]">
                <div className="flex justify-between"><span>Load shifted to cleaner months</span><b className="tnum">{shift}%</b></div>
                <input type="range" min={0} max={50} value={shift} onChange={(e) => setShift(+e.target.value)} className="mt-2 w-full accent-[var(--accent)]" aria-label="Load shift percentage" />
                <p className="text-[11.5px] text-muted">Moved from {r.assumptions?.shift_months_from.map(monthLabel).join(", ")} to {r.assumptions?.shift_months_to.map(monthLabel).join(", ")}.</p>
              </label>
              <div className="mt-4 text-[13px]">
                <div className="mb-1">Grid region</div>
                <div className="flex flex-wrap gap-1">{[null, "India", "NR", "WR", "SR", "ER"].map((k) => (
                  <button key={String(k)} onClick={() => setRegion(k)} className={cx("rounded-lg px-2 py-1 text-[12px]", region === k ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2")}>{k ?? `auto (${r.region})`}</button>))}
                </div>
              </div>
            </Panel>
            <Panel title={`${companies.find((c) => c.symbol === sym)?.name} · Scope 2`} action={<EvidenceChip ids={r.evidence_ids || []} label="inputs" title="What-if inputs" />}>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="Baseline (CEA V20)" value={qty(r.baseline_cea_t)} sub={`${(r.mwh! / 1e6).toFixed(2)} TWh × ${r.ef_cea}`} />
                <Stat label={`Forecast grid (${r.region})`} value={qty(r.forecast_grid_t)} sub={`q10–q90 ${qty(r.forecast_grid_band_t![0])}–${qty(r.forecast_grid_band_t![1])}`} />
                <Stat label="Scenario" value={qty(r.scenario_t)} sub={<span className={(r.delta_vs_baseline_pct ?? 0) <= 0 ? "text-good" : "text-crit"}>{pct(r.delta_vs_baseline_pct)} vs baseline</span>} />
              </div>
              <Waterfall r={r} />

            </Panel>
          </div>
        </>
      )}
    </PageShell>
  );
}

function Waterfall({ r }: { r: WhatIfResult }) {
  const base = r.baseline_cea_t!, grid = r.forecast_grid_t!, scen = r.scenario_t!;
  const shifted = r.after_shift_t!;
  const steps = [
    { label: "CEA baseline", from: 0, to: base, tone: "var(--ink-2)" },
    { label: "Grid forecast Δ", from: base, to: grid, tone: grid > base ? "var(--div-pos)" : "var(--div-neg)" },
    { label: "Load shift", from: grid, to: shifted, tone: "var(--div-neg)" },
    { label: "RE share", from: shifted, to: scen, tone: "var(--div-neg)" },
    { label: "Scenario", from: 0, to: scen, tone: "var(--accent)" },
  ];
  const max = Math.max(...steps.map((s) => Math.max(s.from, s.to))) * 1.08;
  return (
    <div className="mt-5 space-y-2" role="img" aria-label="Scope 2 waterfall">
      {steps.map((s) => {
        const lo = Math.min(s.from, s.to), hi = Math.max(s.from, s.to);
        return (
          <div key={s.label} className="grid grid-cols-[110px_1fr_80px] items-center gap-2 text-[12px]">
            <span className="text-ink-2">{s.label}</span>
            <div className="relative h-5 rounded bg-surface-2">
              <div className="absolute inset-y-0 rounded transition-all duration-500" style={{ left: `${(lo / max) * 100}%`, width: `${Math.max(0.4, ((hi - lo) / max) * 100)}%`, background: s.tone }} />
            </div>
            <span className="tnum text-right">{s.label === "CEA baseline" || s.label === "Scenario" ? qty(s.to) : `${s.to - s.from > 0 ? "+" : ""}${qty(s.to - s.from)}`}</span>
          </div>
        );
      })}
    </div>
  );
}
