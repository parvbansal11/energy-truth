import { useState } from "react";
import type { Scope } from "../../lib/api";
import { qty } from "../../lib/format";
import { useWidth } from "./useWidth";

/** Dot-and-whisker on one shared axis: Reported, Independent, Fused (each ±1σ). */
export function ScopeCompare({ scope, unitScale = 1e6 }: { scope: Scope; unitScale?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [box, W] = useWidth<HTMLDivElement>(320);
  const rows = [
    { key: "Reported (BRSR)", v: scope.reported?.value_t, s: scope.reported?.sigma_t, color: "var(--ink)" },
    { key: "Independent rebuild", v: scope.independent?.value_t, s: scope.independent?.sigma_t, color: "var(--s1)" },
    { key: "Fused", v: scope.fused?.value_t, s: scope.fused?.sigma_t, color: "var(--accent)" },
  ].filter((r) => r.v != null) as { key: string; v: number; s: number; color: string }[];
  if (!rows.length) return <div ref={box} />;
  // dot plots need no zero baseline: frame the ±σ ranges with a little air
  const rawLo = Math.min(...rows.map((r) => r.v - 1.4 * r.s));
  const rawHi = Math.max(...rows.map((r) => r.v + 1.4 * r.s));
  const padV = (rawHi - rawLo) * 0.08;
  const lo = Math.max(0, rawLo - padV);
  const hi = rawHi + padV;
  const L = 4, R = 10, rowH = 26, H = rows.length * rowH + 18;
  const x = (v: number) => L + ((v - lo) / (hi - lo || 1)) * (W - L - R);
  const ticks = niceTicks(lo / unitScale, hi / unitScale, 4);
  return (
    <div ref={box} className="relative">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full overflow-visible" role="img" aria-label="Reported versus independent versus fused emissions with one-sigma ranges">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t * unitScale)} x2={x(t * unitScale)} y1={0} y2={H - 16} stroke="var(--grid)" strokeWidth={1} />
            <text x={x(t * unitScale)} y={H - 3} textAnchor="middle" className="fill-muted tnum" fontSize={10.5}>{t}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = i * rowH + 11;
          return (
            <g key={r.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="cursor-default">
              <rect x={0} y={y - 11} width={W} height={rowH} fill="transparent" />
              <line x1={x(r.v - r.s)} x2={x(r.v + r.s)} y1={y} y2={y} stroke={r.color} strokeWidth={2} strokeLinecap="round" opacity={0.55} className="draw-line" style={{ ["--len" as string]: 400 }} />
              <line x1={x(r.v - r.s)} x2={x(r.v - r.s)} y1={y - 4} y2={y + 4} stroke={r.color} strokeWidth={1.5} opacity={0.6} />
              <line x1={x(r.v + r.s)} x2={x(r.v + r.s)} y1={y - 4} y2={y + 4} stroke={r.color} strokeWidth={1.5} opacity={0.6} />
              <circle cx={x(r.v)} cy={y} r={hover === i ? 6 : 5} fill={r.color} stroke="var(--surface)" strokeWidth={2} className="transition-all" />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
        {rows.map((r, i) => (
          <span key={r.key} className={`inline-flex items-center gap-1 transition-opacity ${hover != null && hover !== i ? "opacity-40" : ""}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: r.color }} /> {r.key}: <b className="tnum font-semibold text-ink">{qty(r.v)}</b>
            <span className="tnum text-muted">± {qty(r.s)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function niceTicks(lo: number, hi: number, n: number): number[] {
  const span = hi - lo || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / n)));
  const err = (n / span) * step;
  const mult = err <= 0.15 ? 10 : err <= 0.35 ? 5 : err <= 0.75 ? 2 : 1;
  const s = step * mult;
  const out: number[] = [];
  for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) out.push(Number(v.toFixed(6)));
  return out;
}
