import { useEffect, useMemo, useState } from "react";
import { api, type Grid } from "../lib/api";
import { monthLabel } from "../lib/format";
import { Ribbon } from "../components/charts/Ribbon";
import { StackedArea } from "../components/charts/StackedArea";
import { cx, EvidenceChip, PageShell, Panel, Stat } from "../components/ui";

const REGIONS = [["India", "All-India"], ["NR", "Northern"], ["WR", "Western"], ["SR", "Southern"], ["ER", "Eastern"], ["NER", "North-Eastern"]] as const;
const FUELS = [
  ["Coal", "Coal", "var(--s1)"], ["Lignite", "Lignite", "var(--s7)"], ["Gas", "Gas", "var(--s2)"],
  ["Nuclear", "Nuclear", "var(--s5)"], ["Hydro", "Hydro", "var(--s3)"], ["RES", "Solar + wind + other RE", "var(--s4)"],
] as const;

/** Grid Intensity Desk (plan §4 item 4): POSOCO fuel mix -> implied tCO2/MWh path -> Chronos T3 forecast. */
export function GridDesk() {
  const [g, setG] = useState<Grid>();
  const [region, setRegion] = useState<string>("India");
  const [span, setSpan] = useState<24 | 48 | 999>(48);
  useEffect(() => { api.grid().then(setG).catch(() => {}); }, []);
  const hist = useMemo(() => {
    if (!g) return [];
    const s = g.series[region] || [];
    return g.months.map((m, i) => ({ month: m, value: s[i] as number })).filter((d) => d.value != null).slice(-span);
  }, [g, region, span]);
  if (!g) return <PageShell title="Grid Intensity Desk" kicker="Scope 2 engine"><div className="skeleton h-72 rounded-[3px]" /></PageShell>;
  const f = g.forecasts[region];
  const latest = hist[hist.length - 1];
  const yearAgo = hist[hist.length - 13];
  const mixMonths = g.months.slice(-span);
  const n0 = g.months.length - mixMonths.length;
  return (
    <PageShell title="Grid Intensity Desk" kicker="Scope 2 engine"
      actions={<EvidenceChip ids={g.evidence_ids} label="POSOCO + CEA V20" title="Grid intensity sources" />}>
      <div className="grid gap-4 sm:grid-cols-4">
        <Panel><Stat label={`Latest · ${latest ? monthLabel(latest.month) : ""}`} value={<>{latest?.value.toFixed(3)} <span className="text-xs text-muted">tCO₂/MWh</span></>} sub={region} /></Panel>
        <Panel><Stat label="vs a year earlier" value={yearAgo ? `${(((latest.value - yearAgo.value) / yearAgo.value) * 100).toFixed(1)}%` : ", "} sub={yearAgo ? monthLabel(yearAgo.month) : ""} /></Panel>
        <Panel><Stat label="Chronos-2 median, +6 mo" value={f ? f.q50[f.q50.length - 1].toFixed(3) : ", "} sub={f ? `${monthLabel(f.months[f.months.length - 1])} · q10–q90 ${f.q10[f.q10.length - 1].toFixed(3)}–${f.q90[f.q90.length - 1].toFixed(3)}` : ""} /></Panel>
        <Panel><Stat label="Pinned CEA factor" value="0.727" sub="V20 · FY2023-24 · all-India" /></Panel>
      </div>
      <Panel title="Implied grid carbon intensity" action={
        <div className="flex flex-wrap gap-1">
          {REGIONS.map(([k, l]) => <button key={k} onClick={() => setRegion(k)} className={cx("rounded-md px-2 py-1 text-[12px] font-medium", region === k ? "bg-accent text-accent-ink" : "text-muted hover:bg-surface-2")}>{l}</button>)}
        </div>}>
        <Ribbon label={`${region} implied grid intensity with Chronos-2 forecast`} data={{ history: hist, forecast: f, observed: new Set(f?.observed_covariate_months) }} unit="tCO₂/MWh" digits={3} height={230} color="var(--s2)" />
        <p className="eyebrow mt-2 !normal-case !tracking-normal">CEA V20 factor × monthly fossil share, calibrated to FY2023-24. An index, not an official monthly factor.</p>
      </Panel>
      <Panel title="All-India generation mix (MU/day, monthly mean)" action={
        <div className="flex gap-1">{([24, 48, 999] as const).map((s) => <button key={s} onClick={() => setSpan(s)} className={cx("rounded-md px-2 py-1 text-[12px]", span === s ? "bg-surface-2 text-ink" : "text-muted")}>{s === 999 ? "All" : `${s / 12}y`}</button>)}</div>}>
        <StackedArea unit="MU/d" months={mixMonths} series={FUELS.map(([k, l, c]) => ({ key: k, label: l, color: c, values: g.fuel_mix_mu_per_day[k].slice(n0) }))} />
        <p className="eyebrow mt-2 !normal-case !tracking-normal">Grid-India daily reports via Robbie M. Andrew (CC BY 4.0)</p>
      </Panel>
      <Panel title="Data table">
        <div className="max-h-64 overflow-auto">
          <table className="tnum w-full text-[12px]">
            <thead className="sticky top-0 bg-surface text-left text-muted"><tr><th className="py-1">Month</th>{REGIONS.map(([k]) => <th key={k} className="py-1 text-right">{k}</th>)}<th className="py-1 text-right">Fossil share</th></tr></thead>
            <tbody>{g.months.slice(-24).reverse().map((m) => { const i = g.months.indexOf(m); return (
              <tr key={m} className="border-t border-line"><td className="py-1">{monthLabel(m)}</td>{REGIONS.map(([k]) => <td key={k} className="py-1 text-right">{g.series[k][i]?.toFixed(3) ?? ", "}</td>)}<td className="py-1 text-right">{(g.fossil_share_india[i] * 100).toFixed(1)}%</td></tr>); })}</tbody>
          </table>
        </div>
      </Panel>
    </PageShell>
  );
}
