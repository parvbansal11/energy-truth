import { useMemo, useRef, useState } from "react";
import { monthLabel } from "../../lib/format";
import { niceTicks } from "./ScopeCompare";
import { useWidth } from "./useWidth";

export type RibbonData = {
  history: { month: string; value: number }[];
  forecast?: { months: string[]; q10: number[]; q50: number[]; q90: number[] };
  observed?: Set<string>;
};

/** History line + Chronos-2 q10–q90 ribbon + dashed median, with crosshair tooltip. */
export function Ribbon({ data, height = 150, unit = "", scale = 1, digits = 1, color = "var(--s1)", label }: {
  data: RibbonData; height?: number; unit?: string; scale?: number; digits?: number; color?: string; label: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [box, W] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const H = height, L = 38, R = 8, T = 8, B = 20;
  const pts = useMemo(() => {
    const h = data.history.map((d) => ({ m: d.month, v: d.value / scale, kind: "h" as const }));
    const f = data.forecast ? data.forecast.months.map((m, i) => ({ m, v: data.forecast!.q50[i] / scale, lo: data.forecast!.q10[i] / scale, hi: data.forecast!.q90[i] / scale, kind: "f" as const })) : [];
    return [...h, ...f] as { m: string; v: number; lo?: number; hi?: number; kind: "h" | "f" }[];
  }, [data, scale]);
  if (!pts.length) return <div ref={box} />;
  const vals = pts.flatMap((p) => [p.v, p.lo ?? p.v, p.hi ?? p.v]);
  let lo = Math.min(...vals), hiV = Math.max(...vals);
  const pad = (hiV - lo) * 0.1 || 1;
  lo -= pad; hiV += pad;
  const x = (i: number) => L + (i / Math.max(1, pts.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hiV - lo)) * (H - T - B);
  const hIdx = pts.filter((p) => p.kind === "h").length;
  const histPath = pts.slice(0, hIdx).map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const fStart = Math.max(0, hIdx - 1);
  const fPts = pts.slice(fStart);
  const band = fPts.length > 1
    ? `M${fPts.map((p, i) => `${x(fStart + i).toFixed(1)},${y(p.hi ?? p.v).toFixed(1)}`).join("L")}L${[...fPts].reverse().map((p, i) => `${x(fStart + fPts.length - 1 - i).toFixed(1)},${y(p.lo ?? p.v).toFixed(1)}`).join("L")}Z`
    : "";
  const medPath = fPts.map((p, i) => `${i ? "L" : "M"}${x(fStart + i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const ticks = niceTicks(lo, hiV, 3);
  const jan = pts.map((p, i) => ({ p, i })).filter(({ p }) => p.m.endsWith("-01"));
  const lastI = pts.length - 1;
  const xTicks = [...jan, ...(jan.length && x(lastI) - x(jan[jan.length - 1].i) < 46 ? [] : [{ p: pts[lastI], i: lastI }])];
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHi(Math.max(0, Math.min(pts.length - 1, Math.round(((px - L) / (W - L - R)) * (pts.length - 1)))));
  };
  const hp = hi != null ? pts[hi] : null;
  return (
    <div ref={box} className="relative">
      <svg ref={ref} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full touch-none" onMouseMove={onMove} onMouseLeave={() => setHi(null)} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={L - 5} y={y(t) + 3} textAnchor="end" fontSize={10.5} className="fill-muted tnum">{t.toLocaleString("en-IN", { maximumFractionDigits: digits })}</text>
          </g>
        ))}
        {xTicks.map(({ p, i }) => (
          <text key={p.m} x={x(i)} y={H - 5} textAnchor="middle" fontSize={10.5} className="fill-muted">{p.m.endsWith("-01") ? p.m.slice(0, 4) : monthLabel(p.m)}</text>
        ))}
        {band && <path d={band} fill={color} fillOpacity={0.2} />}
        {hIdx < pts.length && <line x1={x(hIdx - 1)} x2={x(hIdx - 1)} y1={T} y2={H - B} stroke="var(--axis)" strokeDasharray="3 3" />}
        <path d={histPath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" className="draw-line" style={{ ["--len" as string]: 2400 }} />
        {fPts.length > 1 && <path d={medPath} fill="none" stroke={color} strokeWidth={2} strokeDasharray="4 3" />}
        {hp && (
          <g pointerEvents="none">
            <line x1={x(hi!)} x2={x(hi!)} y1={T} y2={H - B} stroke="var(--ink-2)" strokeWidth={1} opacity={0.5} />
            <circle cx={x(hi!)} cy={y(hp.v)} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hp && (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-line-2 bg-surface px-2 py-1 text-[11px] shadow-panel" style={{ left: `${Math.min(70, Math.max(0, (x(hi!) / W) * 100 - 10))}%` }}>
          <div className="font-medium text-ink">{monthLabel(hp.m)} · {hp.kind === "h" ? "observed" : data.observed?.has(hp.m) ? "nowcast (observed covariates)" : "forecast"}</div>
          <div className="tnum text-ink-2">
            {hp.kind === "f" ? `median ${hp.v.toFixed(digits)} · q10–q90 ${hp.lo!.toFixed(digits)}–${hp.hi!.toFixed(digits)}` : hp.v.toFixed(digits)} {unit}
          </div>
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 rounded" style={{ background: color }} /> history</span>
        {data.forecast && <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm opacity-30" style={{ background: color }} /> Chronos-2 q10–q90</span>}
        {data.forecast && <span className="inline-flex items-center gap-1"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: color }} /> median</span>}
      </div>
    </div>
  );
}
