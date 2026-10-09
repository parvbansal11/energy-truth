import { useRef, useState } from "react";
import { monthLabel } from "../../lib/format";
import { niceTicks } from "./ScopeCompare";
import { useWidth } from "./useWidth";

export type StackSeries = { key: string; label: string; color: string; values: (number | null)[] };

/** Stacked area (fuel mix) with 2px surface gaps between bands and a crosshair tooltip. */
export function StackedArea({ months, series, height = 220, unit }: { months: string[]; series: StackSeries[]; height?: number; unit: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [box, W] = useWidth<HTMLDivElement>(720);
  const [hi, setHi] = useState<number | null>(null);
  const H = height, L = 42, R = 8, T = 8, B = 20;
  const n = months.length;
  const cum = months.map((_, i) => {
    let acc = 0;
    return series.map((s) => { const lo = acc; acc += s.values[i] ?? 0; return [lo, acc]; });
  });
  const max = Math.max(...cum.map((c) => c[c.length - 1][1])) * 1.05;
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = niceTicks(0, max, 4);
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    setHi(Math.max(0, Math.min(n - 1, Math.round(((((e.clientX - r.left) / r.width) * W - L) / (W - L - R)) * (n - 1)))));
  };
  return (
    <div ref={box} className="relative">
      <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" onMouseMove={onMove} onMouseLeave={() => setHi(null)} role="img" aria-label="India monthly generation by fuel">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={L - 5} y={y(t) + 3} textAnchor="end" fontSize={10.5} className="fill-muted tnum">{t.toLocaleString("en-IN")}</text>
          </g>
        ))}
        {months.map((m, i) => (m.endsWith("-01") ? <text key={m} x={x(i)} y={H - 5} textAnchor="middle" fontSize={10.5} className="fill-muted">{m.slice(0, 4)}</text> : null))}
        {series.map((s, k) => {
          const top = months.map((_, i) => `${x(i).toFixed(1)},${y(cum[i][k][1]).toFixed(1)}`).join("L");
          const bot = months.map((_, i) => `${x(n - 1 - i).toFixed(1)},${y(cum[n - 1 - i][k][0]).toFixed(1)}`).join("L");
          return <path key={s.key} d={`M${top}L${bot}Z`} fill={s.color} stroke="var(--surface)" strokeWidth={1} opacity={hi == null ? 0.92 : 0.85} />;
        })}
        {hi != null && <line x1={x(hi)} x2={x(hi)} y1={T} y2={H - B} stroke="var(--ink)" opacity={0.5} />}
      </svg>
      {hi != null && (
        <div className="pointer-events-none absolute top-1 rounded-lg border border-line-2 bg-surface px-2.5 py-1.5 text-[11px] shadow-panel" style={{ left: `${Math.min(72, Math.max(4, (x(hi) / W) * 100 + 2))}%` }}>
          <div className="mb-0.5 font-medium">{monthLabel(months[hi])}</div>
          {[...series].reverse().map((s) => (
            <div key={s.key} className="tnum flex items-center justify-between gap-3 text-ink-2">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}</span>
              <span>{(s.values[hi] ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })} {unit}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-ink-2">
        {series.map((s) => <span key={s.key} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
      </div>
    </div>
  );
}
