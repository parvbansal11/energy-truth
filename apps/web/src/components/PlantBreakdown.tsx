import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { whatIfExclude } from "../lib/fusion";
import { mt, pct, qty, signed } from "../lib/format";
import { useApp } from "../lib/store";
import { cx, VerdictTag } from "./ui";

const SHOW = 10;

/** Which plants make up the rebuild, with a marker at the reported figure. Toggling a plant re-runs the same
 *  Scope 1 math as the server (lib/fusion.ts) so an analyst can test "what if this plant isn't theirs?". */
export function PlantBreakdown() {
  const { scorecard: sc, assetsBy, selected, excluded, toggleExclude, clearExcluded, openPlant, highlight } = useApp();
  const [hover, setHover] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const assets = assetsBy[selected] || [];
  const rows = useMemo(() => assets.filter((a) => a.ct && a.fy_t != null).map((a) => ({ a, t: a.ownership_weight * (a.fy_t as number) })).sort((x, y) => y.t - x.t), [assets]);
  if (!sc || !rows.length) return null;
  const s1 = sc.scopes.S1;
  const rep = s1.reported?.value_t ?? null;
  const base = rows.reduce((s, r) => s + r.t, 0);
  const max = Math.max(base, rep || 0) * 1.04;
  const what = excluded.size ? whatIfExclude(sc, assets, excluded) : null;
  const shown = all ? rows : rows.slice(0, SHOW);
  const rest = rows.slice(SHOW).reduce((s, r) => s + r.t, 0);
  const tone = (i: number) => `color-mix(in oklab, var(--s1) ${100 - Math.min(i, 9) * 7}%, var(--surface-3))`;
  let acc = 0;

  return (
    <div>
      {/* stacked rebuild with a reported marker */}
      <div className="relative mt-1 h-9" aria-label={`Rebuild ${mt(base)} Mt from ${rows.length} plants${rep ? `, reported ${mt(rep)} Mt` : ""}`}>
        <div className="absolute inset-y-2 left-0 right-0 overflow-hidden rounded-md bg-surface-3/70">
          {rows.map((r, i) => {
            const left = (acc / max) * 100;
            acc += r.t;
            const off = excluded.has(r.a.asset_id);
            return (
              <div key={r.a.asset_id} onMouseEnter={() => setHover(r.a.asset_id)} onMouseLeave={() => setHover(null)} onClick={() => toggleExclude(r.a.asset_id)}
                title={`${r.a.name}: ${mt(r.t, 2)} Mt`} className="absolute inset-y-0 cursor-pointer border-r-2 border-surface transition-[opacity,filter] duration-300"
                style={{ left: `${left}%`, width: `${(r.t / max) * 100}%`, background: off ? "repeating-linear-gradient(135deg, var(--line-2) 0 3px, transparent 3px 6px)" : tone(i), opacity: hover && hover !== r.a.asset_id ? 0.55 : 1 }} />
            );
          })}
        </div>
        {rep != null && (
          <div className="absolute inset-y-0" style={{ left: `${(rep / max) * 100}%` }}>
            <div className="h-full w-[2px] -translate-x-1/2 bg-ink" />
            <span className={cx("absolute -top-0.5 rounded bg-ink px-1 text-[10px] whitespace-nowrap text-white", rep / max > 0.6 ? "right-1.5" : "left-1.5")}>reported {mt(rep)}</span>
          </div>
        )}
      </div>

      {what && (
        <div className="animate-pop mt-3 rounded-xl border border-accent/30 bg-accent-soft/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-accent">What-if · {excluded.size} plant{excluded.size > 1 ? "s" : ""} left out</span>
            <button onClick={clearExcluded} className="focus-ring inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] text-ink-2 hover:bg-surface"><RotateCcw size={11} /> Reset</button>
          </div>
          <div className="tnum mt-2 grid grid-cols-3 gap-2 text-[12px]">
            <div><div className="text-muted">Rebuilt</div><div className="text-[15px] font-medium">{qty(what.ind.value_t)}</div><div className="text-muted">± {qty(what.ind.sigma_t)}</div></div>
            <div><div className="text-muted">Gap</div><div className="text-[15px] font-medium">{pct(what.gapPct)}</div><div className="text-muted">was {pct(s1.gap_pct)}</div></div>
            <div><div className="text-muted">z-score</div><div className="text-[15px] font-medium">{signed(what.z)}</div><div className="text-muted">was {signed(s1.z)}</div></div>
          </div>
          {what.verdict && <div className="mt-2"><VerdictTag v={what.verdict} /></div>}
          <p className="mt-2 text-[11.5px] text-muted">Coverage drops to {Math.round(what.rhoEff * 100)}% as plants are left out. The saved scorecard is unchanged.</p>
        </div>
      )}

      <ul className="mt-3 space-y-0.5">
        {shown.map((r, i) => {
          const off = excluded.has(r.a.asset_id);
          return (
            <li key={r.a.asset_id} onMouseEnter={() => setHover(r.a.asset_id)} onMouseLeave={() => setHover(null)}
              className={cx("group flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition", (hover === r.a.asset_id || highlight.includes(r.a.asset_id)) && "bg-surface-3/70")}>
              <input type="checkbox" checked={!off} onChange={() => toggleExclude(r.a.asset_id)} aria-label={`Count ${r.a.name}`} className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]" />
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: off ? "var(--line-2)" : tone(i) }} />
              <button onClick={() => openPlant(r.a.asset_id)} className={cx("min-w-0 flex-1 truncate text-left text-[12.5px] hover:text-accent", off ? "text-faint line-through" : "text-ink-2")}>{r.a.name}</button>
              {r.a.ownership_weight < 0.999 && <span className="tnum text-[10.5px] text-faint">{Math.round(r.a.ownership_weight * 100)}%</span>}
              <span className={cx("tnum w-14 text-right text-[12px]", off ? "text-faint" : "text-ink")}>{mt(r.t, 1)}</span>
            </li>
          );
        })}
      </ul>
      {rows.length > SHOW && (
        <button onClick={() => setAll(!all)} className="focus-ring mt-1 w-full rounded-lg py-1 text-[12px] text-muted hover:bg-surface-3/70 hover:text-ink">
          {all ? "Show fewer" : `+ ${rows.length - SHOW} smaller plants · ${mt(rest, 1)} Mt`}
        </button>
      )}
      <p className="mt-2 text-[11.5px] text-muted">Tap a plant to leave it out and see the comparison recompute. Values are ownership-weighted Mt for {sc.fy}.</p>
    </div>
  );
}
