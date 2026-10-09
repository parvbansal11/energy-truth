import { useEffect, useMemo, useState } from "react";
import { api, type Backtest } from "../lib/api";
import { monthLabel } from "../lib/format";
import { niceTicks } from "../components/charts/ScopeCompare";
import { useWidth } from "../components/charts/useWidth";
import { cx, EvidenceChip, PageShell, Panel } from "../components/ui";

type Res = { wql: number; median_mape_pct: number; coverage_80_pct: number | null };
const MODELS = [["seasonal_naive", "Seasonal naive (t−12)", "var(--ink-2)"], ["chronos2_univariate", "Chronos-2 univariate", "var(--s7)"], ["chronos2_covariates", "Chronos-2 + energy covariates", "var(--accent)"]] as const;

/** /eval/chronos (plan §6.5, P8): rolling-origin backtest on POSOCO all-India coal generation. */
export function ChronosEval() {
  const [b, setB] = useState<Backtest>();
  const [o, setO] = useState(23);
  useEffect(() => { api.backtest().then((r) => setB(r.backtest)).catch(() => {}); }, []);
  if (!b) return <PageShell title="Chronos-2 backtest" kicker="Evaluation"><div className="skeleton h-72 rounded-xl" /></PageShell>;
  const R = b.results as Record<string, Res | number>;
  const best = Math.max(...MODELS.map(([k]) => (R[k] as Res).wql));
  return (
    <PageShell title="Chronos-2 backtest" kicker={`${b.protocol.n_origins} rolling origins · horizon ${b.protocol.horizon} · ${b.protocol.eval_window.join(" → ")}`}
      actions={<a href={b.data.source_url} target="_blank" rel="noreferrer" className="text-[12px] text-accent hover:underline">POSOCO_data.csv · sha256 {b.data.sha256.slice(0, 10)}…</a>}>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Panel title="Weighted quantile loss (lower is better)">
          <div className="space-y-3">
            {MODELS.map(([k, label, color]) => {
              const r = R[k] as Res;
              return (
                <div key={k}>
                  <div className="flex justify-between text-[12.5px]"><span>{label}</span><b className="tnum">{r.wql.toFixed(3)}</b></div>
                  <div className="mt-1 h-3 rounded bg-surface-2"><div className="animate-grow-x h-full origin-left rounded" style={{ width: `${(r.wql / best) * 100}%`, background: color }} /></div>
                  <div className="tnum mt-0.5 text-[11px] text-muted">median MAPE {r.median_mape_pct.toFixed(1)}%{r.coverage_80_pct != null ? ` · 80% interval coverage ${r.coverage_80_pct.toFixed(0)}%` : ""}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-xl bg-accent/10 p-3 text-[13px] ring-1 ring-accent/30">
            Energy covariates cut WQL by <b>{(R.improvement_vs_seasonal_naive_pct as number).toFixed(0)}%</b> vs seasonal naive and <b>{(R.improvement_vs_univariate_pct as number).toFixed(0)}%</b> vs univariate Chronos-2, with near-nominal interval coverage: calibrated quantiles that can feed the fusion σ.
          </div>
          <p className="mt-3 text-[11.5px] text-muted">Target: {b.data.target}, {b.data.n_months} months ({b.data.first_month} → {b.data.last_month}). Past-only covariates: {b.protocol.past_only_covariates.join(", ")}; known-future: {b.protocol.known_future_covariates.join(", ")}. Model {b.model_id}, local CPU, {b.inference_seconds}s for all origins. Run {b.run_at.slice(0, 16)} UTC.</p>
        </Panel>
        <Panel title="Forecast vs actual at one origin" action={
          <input type="range" min={0} max={b.series.origins.length - 1} value={o} onChange={(e) => setO(+e.target.value)} className="w-40 accent-[var(--accent)]" aria-label="Select forecast origin" />}>
          <OriginChart b={b} idx={o} />
        </Panel>
      </div>
    </PageShell>
  );
}

function OriginChart({ b, idx }: { b: Backtest; idx: number }) {
  const [box, W] = useWidth<HTMLDivElement>(640);
  const og = b.series.origins[idx];
  const start = Math.max(0, b.series.months.indexOf(og.months[0]) - 18);
  const end = b.series.months.indexOf(og.months[og.months.length - 1]) + 1;
  const months = b.series.months.slice(start, end);
  const actual = b.series.actual.slice(start, end);
  const H = 260, L = 40, R = 8, T = 10, B = 22;
  const all = [...actual, ...og.q10, ...og.q90, ...og.seasonal_naive];
  const lo = Math.min(...all) * 0.97, hi = Math.max(...all) * 1.03;
  const x = (m: string) => L + (months.indexOf(m) / (months.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (ms: string[], vs: number[]) => ms.map((m, i) => `${i ? "L" : "M"}${x(m)},${y(vs[i])}`).join("");
  const band = `M${og.months.map((m, i) => `${x(m)},${y(og.q90[i])}`).join("L")}L${[...og.months].reverse().map((m, i) => `${x(m)},${y(og.q10[og.months.length - 1 - i])}`).join("L")}Z`;
  const ticks = niceTicks(lo, hi, 4);
  return (
    <div ref={box}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label={`Forecast from origin ${og.origin}`}>
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--grid)" /><text x={L - 5} y={y(t) + 3} textAnchor="end" fontSize={10.5} className="fill-muted tnum">{t}</text></g>)}
        {months.filter((m) => m.endsWith("-01")).map((m) => <text key={m} x={x(m)} y={H - 6} textAnchor="middle" fontSize={10.5} className="fill-muted">{m.slice(0, 4)}</text>)}
        <path d={band} fill="var(--accent)" fillOpacity={0.2} />
        <path d={path(months, actual)} fill="none" stroke="var(--ink)" strokeWidth={2} />
        <path d={path(og.months, og.seasonal_naive)} fill="none" stroke="var(--ink-2)" strokeWidth={1.5} strokeDasharray="2 3" />
        <path d={path(og.months, og.q50_univariate)} fill="none" stroke="var(--s7)" strokeWidth={2} strokeDasharray="5 3" />
        <path d={path(og.months, og.q50)} fill="none" stroke="var(--accent)" strokeWidth={2.2} />
        <line x1={x(og.months[0])} x2={x(og.months[0])} y1={T} y2={H - B} stroke="var(--axis)" strokeDasharray="3 3" />
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-ink-2">
        <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-ink" /> actual (MU/day)</span>
        <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-accent" /> Chronos-2 + covariates (q10–q90 band)</span>
        <span className="inline-flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-[var(--s7)]" /> univariate</span>
        <span className="inline-flex items-center gap-1"><span className="w-4 border-t-2 border-dotted border-ink-2" /> seasonal naive</span>
      </div>
      <p className="mt-1 text-[11.5px] text-muted">Origin {monthLabel(og.origin)} → forecasts {monthLabel(og.months[0])}–{monthLabel(og.months[og.months.length - 1])}. Drag the slider to step through all {b.series.origins.length} origins.</p>
    </div>
  );
}
