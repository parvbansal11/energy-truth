import { useState } from "react";
import { BarChart3, Box, CircleDashed, CloudFog, Factory, Moon, Mountain, Palette, Satellite, X, Zap } from "lucide-react";
import { FUEL_LABEL, mt, num, signed } from "../lib/format";
import { useApp, type Layers } from "../lib/store";
import { cx, Dot } from "./ui";

type Tool = { k: keyof Layers; label: string; icon: typeof Satellite; title: string; on?: (l: Layers) => boolean; toggle?: (l: Layers) => Layers; disabled?: boolean };

export function LeftRail() {
  const { companies, selected, select, scorecards, layers, setLayers, meta, plant, assets, openPlant, assetsBy } = useApp();
  const [hint, setHint] = useState(true);
  const L = meta?.layers || {};
  const tools: Tool[] = [
    { k: "imagery", label: "Optical", icon: Satellite, title: "Esri World Imagery" },
    { k: "shade", label: "Shade", icon: Mountain, title: "Hillshade from AWS terrain tiles" },
    { k: "terrain", label: "Terrain", icon: Box, title: "3D terrain when focused on a plant" },
    { k: "no2", label: "NO₂", icon: CloudFog, title: L.no2 ? `TROPOMI NO₂ · ${L.no2.date}` : "unavailable", disabled: !L.no2 },
    { k: "dnb", label: "Night", icon: Moon, title: L.dnb ? `VIIRS night lights · ${L.dnb.date}` : "unavailable", disabled: !L.dnb },
    { k: "grid", label: "Grid", icon: Zap, title: "Grid carbon intensity by POSOCO region" },
    { k: "plants", label: "Plants", icon: Factory, title: "Climate TRACE plants" },
    { k: "gemOnly", label: "Gaps", icon: CircleDashed, title: "Owned assets with no independent estimate" },
    { k: "columns", label: "Columns", icon: BarChart3, title: "3D emission columns" },
    { k: "colorBy", label: "Fuel", icon: Palette, title: "Colour plants by fuel instead of gap", on: (l) => l.colorBy === "fuel", toggle: (l) => ({ ...l, colorBy: l.colorBy === "fuel" ? "gap" : "fuel" }) },
  ];
  const focusAsset = assets.find((a) => a.asset_id === plant);
  const alerts = Object.values(scorecards).filter((s) => (s.scopes.S1.z != null && Math.abs(s.scopes.S1.z) > 2) || s.band?.breach).length;

  return (
    <aside className="panel animate-slide-in-left flex h-full w-[264px] flex-col overflow-hidden" aria-label="Analyst tools">
      {focusAsset ? (
        <div className="border-b border-line px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Plant · {scorecards[focusAsset.company]?.short}</span>
            <button onClick={() => openPlant(undefined)} className="eyebrow hover:!text-ink">Theatre ↩</button>
          </div>
          <div className="mt-1.5 text-[15px] leading-tight">{focusAsset.name}</div>
          <div className="map-chip mt-2 inline-flex items-center gap-2 rounded-[3px] border border-line-2 px-1.5 py-0.5 text-[10px] text-muted">
            <span className="text-ok">DEM · SRTM</span>{focusAsset.lat.toFixed(3)}°N {focusAsset.lon.toFixed(3)}°E
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Mini v={focusAsset.ct ? mt(focusAsset.ct.emissions_t["2024"]) : "n/a"} l="Mt 2024" />
            <Mini v={focusAsset.ct?.capacity ? num(focusAsset.ct.capacity) : num(focusAsset.gem?.capacity)} l={(focusAsset.ct?.capacity_units || focusAsset.gem?.capacity_unit || "").replace("t of steel", "t steel")} />
            <Mini v={focusAsset.ownership_weight.toFixed(2)} l="Weight" />
          </div>
        </div>
      ) : (
        <div className="border-b border-line px-4 py-3">
          <div className="flex items-end justify-between">
            <div><div className="eyebrow">Theatre</div><div className="mt-0.5 text-[17px] font-light">India</div></div>
            <div className="flex gap-4 text-right">
              <Mini v={companies.length} l="Companies" />
              <Mini v={Object.values(assetsBy).flat().filter((a) => a.ct).length} l="Plants" />
              <Mini v={alerts} l="Alerts" tone="text-accent" />
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-line p-2">
        <div className="grid grid-cols-2 gap-1">
          {tools.map((t) => {
            const on = t.on ? t.on(layers) : Boolean(layers[t.k]);
            const Icon = t.icon;
            return (
              <button key={t.k} disabled={t.disabled} title={t.title} aria-pressed={on}
                onClick={() => setLayers((l) => (t.toggle ? t.toggle(l) : { ...l, [t.k]: !l[t.k] }))}
                className={cx("focus-ring flex h-[46px] flex-col items-center justify-center gap-1 rounded-[3px] border transition disabled:opacity-30",
                  on ? "border-accent/50 bg-accent/10 text-accent" : "border-line bg-surface/60 text-muted hover:border-line-2 hover:text-ink-2")}>
                <Icon size={14} strokeWidth={1.6} />
                <span className="map-chip text-[9px] tracking-[0.14em] uppercase">{t.label}</span>
              </button>
            );
          })}
        </div>
        <Legend />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="eyebrow px-4 pt-3 pb-1.5">Companies</div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {companies.map((c) => {
            const active = c.symbol === selected;
            const rep = c.reported_t, ind = c.independent_t;
            const max = Math.max(rep || 0, ind || 0) || 1;
            return (
              <li key={c.symbol}>
                <button onClick={() => select(c.symbol)} className={cx("focus-ring relative w-full rounded-[3px] px-2.5 py-2 text-left transition", active ? "bg-surface-2" : "hover:bg-surface-2/60")}>
                  {active && <span className="absolute inset-y-1.5 left-0 w-[2px] bg-accent" />}
                  <div className="flex items-center gap-2">
                    <Dot tone={c.verdict.tone} />
                    <span className={cx("text-[12.5px]", active ? "text-ink" : "text-ink-2")}>{c.short}</span>
                    <span className="map-chip ml-auto text-[10px] text-muted">{c.z != null ? `z ${signed(c.z, 1)}` : "no BRSR"}</span>
                  </div>
                  <div className="mt-1.5 space-y-[3px] pl-3.5">
                    {rep != null && <div className="h-[3px] bg-ink-2/70" style={{ width: `${(rep / max) * 100}%` }} title={`Reported ${mt(rep)} Mt`} />}
                    <div className="h-[3px] bg-[var(--s1)]" style={{ width: `${(ind / max) * 100}%` }} title={`Independent ${mt(ind)} Mt`} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[10px] text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-[3px] w-3 bg-ink-2/70" />reported</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-[3px] w-3 bg-[var(--s1)]" />independent</span>
        </div>
      </div>

      {hint && !plant && (
        <div className="m-2 mt-0 flex items-center gap-2 rounded-[3px] border border-accent/30 bg-accent/5 px-2.5 py-1.5 text-[11px] text-ink-2">
          <span className="h-1.5 w-1.5 bg-accent" /> Pick a company, then a plant
          <button onClick={() => setHint(false)} className="ml-auto text-muted hover:text-ink" aria-label="Dismiss hint"><X size={12} /></button>
        </div>
      )}
    </aside>
  );
}

function Mini({ v, l, tone }: { v: React.ReactNode; l: string; tone?: string }) {
  return <div><div className={cx("tnum text-[15px] leading-none font-light", tone)}>{v}</div><div className="eyebrow mt-1 !text-[8.5px]">{l}</div></div>;
}

function Legend() {
  const { layers } = useApp();
  return (
    <div className="mt-2 px-1">
      {layers.colorBy === "gap" ? (
        <>
          <div className="h-[5px]" style={{ background: "linear-gradient(90deg, var(--div-neg), var(--div-mid), var(--div-pos))" }} />
          <div className="map-chip mt-1 flex justify-between text-[9px] text-muted"><span>rebuild &lt; BRSR</span><span>z 0</span><span>rebuild &gt; BRSR</span></div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          {(Object.keys(FUEL_LABEL) as (keyof typeof FUEL_LABEL)[]).map((k, i) => (
            <span key={k} className="flex items-center gap-1.5 text-[10px] text-ink-2"><span className="h-2 w-2 rounded-full" style={{ background: `var(--s${i + 1})` }} />{FUEL_LABEL[k]}</span>
          ))}
        </div>
      )}
    </div>
  );
}
