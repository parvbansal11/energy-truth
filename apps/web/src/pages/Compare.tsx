import { useMemo, useState } from "react";
import { type CompanySummary } from "../lib/api";
import { mt, signed } from "../lib/format";
import { go } from "../lib/router";
import { useApp } from "../lib/store";
import { useWidth } from "../components/charts/useWidth";
import { cx, PageShell, VerdictTag } from "../components/ui";

const TONE: Record<string, string> = { green: "var(--ok)", amber: "var(--sun)", red: "var(--crit)", slate: "var(--faint)" };
const GROUP = (s: string) => /power/i.test(s) ? "Power" : /steel/i.test(s) ? "Steel" : /cement/i.test(s) ? "Cement" : /alumin|zinc|metal/i.test(s) ? "Metals" : /oil|gas/i.test(s) ? "Oil & gas" : "Other";

/** Every company at once: reported vs rebuilt (log-log, parity line, ±20% band) and a ranked z-score view. */
export function Compare() {
  const { companies, select } = useApp();
  const [sector, setSector] = useState("All");
  const [hover, setHover] = useState<string | null>(null);
  const sectors = useMemo(() => ["All", ...Array.from(new Set(companies.map((c) => GROUP(c.sector))))], [companies]);
  const rows = companies.filter((c) => sector === "All" || GROUP(c.sector) === sector);
  const filed = rows.filter((c) => c.reported_t != null);
  const open = (c: CompanySummary) => { go("map"); select(c.symbol); };
  return (
    <PageShell title="Compare companies" kicker={`${companies.length} companies · FY2024-25 · Scope 1`}>
      <div className="flex flex-wrap gap-1.5">
        {sectors.map((s) => (
          <button key={s} onClick={() => setSector(s)} className={cx("focus-ring rounded-full px-3 py-1.5 text-[12.5px] transition", sector === s ? "bg-ink text-white" : "bg-surface text-ink-2 ring-1 ring-line hover:bg-surface-3")}>{s}</button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-[15px] font-medium">Reported vs rebuilt</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">On the line, the filing matches the public plant data. Above it, the company reports more than we can see; below it, less. Click a company to open it.</p>
          <Scatter rows={rows} hover={hover} setHover={setHover} onPick={open} />
          <Legend />
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-[15px] font-medium">How big is each gap?</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">z-score: the gap divided by its combined uncertainty. Inside the shaded band (±2) the difference could be noise.</p>
          <ZRank rows={filed} hover={hover} setHover={setHover} onPick={open} />
        </section>
      </div>
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-[15px] font-medium">All companies</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="tnum w-full min-w-[640px] text-[13px]">
            <thead><tr className="text-left text-[12px] text-muted"><th className="py-2 font-normal">Company</th><th className="font-normal">Sector</th><th className="text-right font-normal">Reported Mt</th><th className="text-right font-normal">Rebuilt Mt</th><th className="text-right font-normal">z</th><th className="text-right font-normal">Coverage</th><th className="pl-4 font-normal">Verdict</th></tr></thead>
            <tbody>
              {[...rows].sort((a, b) => b.independent_t - a.independent_t).map((c) => (
                <tr key={c.symbol} onClick={() => open(c)} onMouseEnter={() => setHover(c.symbol)} onMouseLeave={() => setHover(null)}
                  className={cx("cursor-pointer border-t border-line transition", hover === c.symbol ? "bg-surface-3/70" : "hover:bg-surface-3/50")}>
                  <td className="py-2">{c.short}</td><td className="text-muted">{c.sector}</td>
                  <td className="text-right">{c.reported_t != null ? mt(c.reported_t, 1) : <span className="text-faint">no filing</span>}</td>
                  <td className="text-right">{mt(c.independent_t, 1)}</td>
                  <td className="text-right">{c.z != null ? signed(c.z, 1) : "–"}</td>
                  <td className="text-right">{Math.round(c.coverage.rho_effective * 100)}%</td>
                  <td className="pl-4"><VerdictTag v={c.verdict} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  );
}

type P = { rows: CompanySummary[]; hover: string | null; setHover: (s: string | null) => void; onPick: (c: CompanySummary) => void };

function Scatter({ rows, hover, setHover, onPick }: P) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const H = 390, m = { l: 44, r: 14, t: 12, b: 92 };
  const filed = rows.filter((c) => c.reported_t != null);
  const vals = rows.flatMap((c) => [c.independent_t, c.reported_t ?? c.independent_t]).filter((v) => v > 0);
  const lo = Math.log10(Math.max(1e5, Math.min(...vals, 1e6) * 0.7)), hi = Math.log10(Math.max(...vals, 1e7) * 1.4);
  const iw = Math.max(10, w - m.l - m.r), ih = H - m.t - m.b;
  const x = (v: number) => m.l + ((Math.log10(Math.max(v, 1)) - lo) / (hi - lo)) * iw;
  const y = (v: number) => m.t + ih - ((Math.log10(Math.max(v, 1)) - lo) / (hi - lo)) * ih;
  const ticks = [1e6, 3e6, 1e7, 3e7, 1e8, 3e8].filter((t) => Math.log10(t) >= lo && Math.log10(t) <= hi);
  const r = (c: CompanySummary) => 4 + 6 * c.coverage.rho_effective;
  const stripY = H - 14;
  const h = rows.find((c) => c.symbol === hover);
  return (
    <div ref={ref} className="relative mt-3">
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label="Scatter of reported versus rebuilt Scope 1 emissions by company">
          {/* ±20% band around parity */}
          <path d={`M${x(10 ** lo)},${y(10 ** lo * 1.2)} L${x(10 ** hi / 1.2)},${y(10 ** hi)} L${x(10 ** hi)},${y(10 ** hi)} L${x(10 ** hi)},${y(10 ** hi / 1.2)} L${x(10 ** lo * 1.2)},${y(10 ** lo)} L${x(10 ** lo)},${y(10 ** lo)} Z`} fill="var(--surface-3)" opacity={0.8} />
          <line x1={x(10 ** lo)} y1={y(10 ** lo)} x2={x(10 ** hi)} y2={y(10 ** hi)} stroke="var(--line-2)" strokeWidth={1.5} strokeDasharray="4 4" />
          {ticks.map((t) => (
            <g key={t} className="text-[10.5px]" fill="var(--muted)">
              <line x1={m.l} x2={m.l + iw} y1={y(t)} y2={y(t)} stroke="var(--line)" />
              <text x={m.l - 6} y={y(t) + 3} textAnchor="end">{t / 1e6}</text>
              <text x={x(t)} y={m.t + ih + 14} textAnchor="middle">{t / 1e6}</text>
            </g>
          ))}
          <text x={m.l + iw / 2} y={m.t + ih + 30} textAnchor="middle" className="text-[11px]" fill="var(--muted)">Rebuilt from public plant data (Mt, log scale)</text>
          <text transform={`translate(12 ${m.t + ih / 2}) rotate(-90)`} textAnchor="middle" className="text-[11px]" fill="var(--muted)">Reported in filing (Mt)</text>
          {/* companies without a filing: a strip under the axis */}
          <line x1={m.l} x2={m.l + iw} y1={stripY} y2={stripY} stroke="var(--line)" strokeDasharray="2 3" />
          <text x={m.l} y={stripY - 10} className="text-[10.5px]" fill="var(--faint)">No filing yet (rebuild only)</text>
          {rows.filter((c) => c.reported_t == null).map((c) => (
            <circle key={c.symbol} cx={x(c.independent_t)} cy={stripY} r={hover === c.symbol ? 6 : 4} fill="none" stroke="var(--faint)" strokeWidth={1.5}
              onMouseEnter={() => setHover(c.symbol)} onMouseLeave={() => setHover(null)} onClick={() => onPick(c)} className="cursor-pointer" />
          ))}
          {filed.map((c) => (
            <g key={c.symbol} onMouseEnter={() => setHover(c.symbol)} onMouseLeave={() => setHover(null)} onClick={() => onPick(c)} className="cursor-pointer">
              <circle cx={x(c.independent_t)} cy={y(c.reported_t!)} r={r(c) + 8} fill="transparent" />
              <circle cx={x(c.independent_t)} cy={y(c.reported_t!)} r={hover === c.symbol ? r(c) + 2 : r(c)} fill={TONE[c.verdict.tone]} stroke="var(--surface)" strokeWidth={2} style={{ transition: "r 150ms" }} />
              <text x={x(c.independent_t) + r(c) + 4} y={y(c.reported_t!) + 3.5} className="text-[11px]" fill="var(--ink-2)">{c.short}</text>
            </g>
          ))}
        </svg>
      )}
      {h && w > 0 && (
        <div className="pointer-events-none absolute z-10 w-52 rounded-xl bg-surface p-3 text-[12px] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)] ring-1 ring-line"
          style={{ left: Math.min(w - 216, x(h.independent_t) + 12), top: h.reported_t != null ? Math.max(0, y(h.reported_t) - 20) : stripY - 110 }}>
          <div className="font-medium text-ink">{h.name}</div>
          <div className="tnum mt-1 text-ink-2">Rebuilt {mt(h.independent_t, 1)} Mt{h.reported_t != null ? ` · reported ${mt(h.reported_t, 1)} Mt` : " · no filing"}</div>
          <div className="tnum text-muted">{h.z != null ? `z ${signed(h.z, 1)} · ` : ""}coverage {Math.round(h.coverage.rho_effective * 100)}%</div>
          <div className="mt-1.5"><VerdictTag v={h.verdict} /></div>
        </div>
      )}
    </div>
  );
}

function ZRank({ rows, hover, setHover, onPick }: P) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const sorted = [...rows].sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
  const rowH = 30, m = { l: 96, r: 44, t: 18, b: 22 }, H = m.t + m.b + sorted.length * rowH;
  const lim = Math.max(3, ...sorted.map((c) => Math.abs(c.z ?? 0))) * 1.08;
  const iw = Math.max(10, w - m.l - m.r);
  const x = (z: number) => m.l + ((z + lim) / (2 * lim)) * iw;
  return (
    <div ref={ref} className="mt-3">
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label="Ranked z-scores by company">
          <rect x={x(-2)} y={m.t - 6} width={x(2) - x(-2)} height={H - m.t - m.b + 6} fill="var(--surface-3)" rx={4} />
          <line x1={x(0)} x2={x(0)} y1={m.t - 6} y2={H - m.b} stroke="var(--line-2)" />
          {[-2, 0, 2].map((t) => <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="text-[10.5px]" fill="var(--muted)">{t > 0 ? `+${t}` : t}</text>)}
          <text x={x(-lim) + 2} y={10} className="text-[10.5px]" fill="var(--muted)">rebuild lower</text>
          <text x={x(lim) - 2} y={10} textAnchor="end" className="text-[10.5px]" fill="var(--muted)">rebuild higher</text>
          {sorted.map((c, i) => {
            const cy = m.t + i * rowH + rowH / 2, z = c.z ?? 0;
            return (
              <g key={c.symbol} onMouseEnter={() => setHover(c.symbol)} onMouseLeave={() => setHover(null)} onClick={() => onPick(c)} className="cursor-pointer">
                <rect x={0} y={cy - rowH / 2} width={w} height={rowH} fill={hover === c.symbol ? "var(--surface-3)" : "transparent"} opacity={0.6} />
                <text x={m.l - 10} y={cy + 4} textAnchor="end" className="text-[12px]" fill="var(--ink-2)">{c.short}</text>
                <line x1={x(0)} x2={x(z)} y1={cy} y2={cy} stroke={TONE[c.verdict.tone]} strokeWidth={2} />
                <circle cx={x(z)} cy={cy} r={hover === c.symbol ? 6.5 : 5} fill={TONE[c.verdict.tone]} stroke="var(--surface)" strokeWidth={2} />
                <text x={w - 4} y={cy + 4} textAnchor="end" className="tnum text-[11px]" fill="var(--muted)">{signed(z, 1)}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
      {[["green", "Consistent"], ["amber", "Watch or low coverage"], ["red", "Significant gap"]].map(([t, l]) => (
        <span key={t} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TONE[t] }} />{l}</span>
      ))}
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-[var(--faint)]" />No filing</span>
      <span>Dot size = coverage</span>
    </div>
  );
}
