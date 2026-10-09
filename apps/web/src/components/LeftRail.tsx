import { ArrowLeft, BarChart3, CircleDashed, CloudFog, Factory, Moon, Mountain, Palette, Satellite, Box, Zap } from "lucide-react";
import { FUEL_LABEL, mt, num, signed } from "../lib/format";
import { useApp, type Layers } from "../lib/store";
import { cx, Dot, Switch } from "./ui";

type Tool = { k: keyof Layers; label: string; icon: typeof Satellite; hint: string; on?: (l: Layers) => boolean; toggle?: (l: Layers) => Layers; disabled?: boolean };

export function LeftRail() {
  const { companies, selected, select, scorecards, layers, setLayers, meta, plant, assets, openPlant } = useApp();
  const L = meta?.layers || {};
  const tools: Tool[] = [
    { k: "imagery", label: "Satellite", icon: Satellite, hint: "Esri World Imagery" },
    { k: "shade", label: "Relief", icon: Mountain, hint: "Hillshade from AWS terrain" },
    { k: "terrain", label: "3D terrain", icon: Box, hint: "When you open a plant" },
    { k: "no2", label: "NO₂ from space", icon: CloudFog, hint: L.no2 ? `Sentinel-5P · ${L.no2.date}` : "Unavailable", disabled: !L.no2 },
    { k: "dnb", label: "Night lights", icon: Moon, hint: L.dnb ? `VIIRS · ${L.dnb.date}` : "Unavailable", disabled: !L.dnb },
    { k: "grid", label: "Grid carbon", icon: Zap, hint: "Cleanliness by region" },
    { k: "plants", label: "Plants", icon: Factory, hint: "Climate TRACE estimates" },
    { k: "gemOnly", label: "Missing plants", icon: CircleDashed, hint: "Owned, no estimate yet" },
    { k: "columns", label: "3D columns", icon: BarChart3, hint: "Height = emissions" },
    { k: "colorBy", label: "Colour by fuel", icon: Palette, hint: "Instead of the gap", on: (l) => l.colorBy === "fuel", toggle: (l) => ({ ...l, colorBy: l.colorBy === "fuel" ? "gap" : "fuel" }) },
  ];
  const focusAsset = assets.find((a) => a.asset_id === plant);

  return (
    <aside className="panel animate-slide-in-left flex h-full w-[272px] flex-col overflow-hidden" aria-label="Companies and map layers">
      {focusAsset ? (
        <div className="border-b border-line p-4">
          <button onClick={() => openPlant(undefined)} className="focus-ring inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12.5px] text-ink-2 hover:bg-surface-3"><ArrowLeft size={13} /> Back to map</button>
          <div className="serif mt-2 text-[20px] leading-tight">{focusAsset.name}</div>
          <div className="mt-1 text-[12.5px] text-muted">{scorecards[focusAsset.company]?.short} · {focusAsset.state || focusAsset.country}</div>
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-surface-3/70 p-3">
            <Mini v={focusAsset.ct ? mt(focusAsset.ct.emissions_t["2024"]) : "n/a"} l="Mt CO₂e" />
            <Mini v={focusAsset.ct?.capacity ? num(focusAsset.ct.capacity) : num(focusAsset.gem?.capacity)} l={focusAsset.ct?.capacity_units === "MW" || focusAsset.gem?.capacity_unit === "MW" ? "MW" : "capacity"} />
            <Mini v={`${Math.round(focusAsset.ownership_weight * 100)}%`} l="owned" />
          </div>
        </div>
      ) : (
        <div className="px-5 pt-4 pb-3">
          <div className="text-[12.5px] text-muted">Companies · FY2024-25</div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!focusAsset && (
          <ul data-tour="companies" className="px-2.5 pb-3">
            {companies.map((c) => {
              const active = c.symbol === selected;
              const rep = c.reported_t, ind = c.independent_t;
              const max = Math.max(rep || 0, ind || 0) || 1;
              return (
                <li key={c.symbol}>
                  <button onClick={() => select(c.symbol)} className={cx("focus-ring w-full rounded-xl px-3 py-2.5 text-left transition", active ? "bg-surface shadow-[var(--shadow-sm)] ring-1 ring-line" : "hover:bg-surface-3/70")}>
                    <div className="flex items-center gap-2.5">
                      <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10.5px] font-semibold", active ? "bg-accent text-white" : "bg-surface-3 text-ink-2")}>{c.short.slice(0, 2).toUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-ink">{c.short}</span>
                        <span className="block text-[11.5px] text-muted">{c.sector}</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-[11.5px] text-muted"><Dot tone={c.verdict.tone} />{c.z != null ? signed(c.z, 1) : "no filing"}</span>
                    </div>
                    <div className="mt-2 space-y-1 pl-[38px]">
                      {rep != null && <div className="h-1 rounded-full bg-[#b9b4a8]" style={{ width: `${(rep / max) * 100}%` }} title={`Reported ${mt(rep)} Mt`} />}
                      <div className="h-1 rounded-full bg-[var(--s1)]" style={{ width: `${(ind / max) * 100}%` }} title={`Rebuilt ${mt(ind)} Mt`} />
                    </div>
                  </button>
                </li>
              );
            })}
            <li className="flex gap-4 px-3 pt-2 text-[11.5px] text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-1 w-3 rounded-full bg-[#b9b4a8]" />Reported</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-1 w-3 rounded-full bg-[var(--s1)]" />Rebuilt</span>
            </li>
          </ul>
        )}

        <div data-tour="layers" className="border-t border-line px-2.5 py-3">
          <div className="px-2.5 pb-1.5 text-[12.5px] text-muted">Map layers</div>
          {tools.map((t) => {
            const on = t.on ? t.on(layers) : Boolean(layers[t.k]);
            const Icon = t.icon;
            return (
              <button key={t.k} disabled={t.disabled} aria-pressed={on}
                onClick={() => setLayers((l) => (t.toggle ? t.toggle(l) : { ...l, [t.k]: !l[t.k] }))}
                className="focus-ring flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-surface-3/70 disabled:opacity-40">
                <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-lg transition", on ? "bg-accent-soft text-accent" : "bg-surface-3 text-muted")}><Icon size={14} /></span>
                <span className="min-w-0 flex-1"><span className="block text-[13px] text-ink">{t.label}</span><span className="block truncate text-[11px] text-muted">{t.hint}</span></span>
                <Switch on={on} />
              </button>
            );
          })}
          <Legend />
        </div>
      </div>
    </aside>
  );
}

function Mini({ v, l }: { v: React.ReactNode; l: string }) {
  return <div><div className="tnum text-[16px] leading-none font-medium">{v}</div><div className="mt-1 text-[11px] text-muted">{l}</div></div>;
}

function Legend() {
  const { layers } = useApp();
  return (
    <div className="mx-2.5 mt-2 rounded-xl bg-surface-3/60 p-3">
      {layers.colorBy === "gap" ? (
        <>
          <div className="h-1.5 rounded-full" style={{ background: "linear-gradient(90deg, var(--div-neg), var(--div-mid), var(--div-pos))" }} />
          <div className="mt-1.5 flex justify-between text-[11px] text-muted"><span>Rebuild lower</span><span>Rebuild higher</span></div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          {(Object.keys(FUEL_LABEL) as (keyof typeof FUEL_LABEL)[]).map((k, i) => (
            <span key={k} className="flex items-center gap-1.5 text-[11px] text-ink-2"><span className="h-2 w-2 rounded-full" style={{ background: `var(--s${i + 1})` }} />{FUEL_LABEL[k]}</span>
          ))}
        </div>
      )}
    </div>
  );
}
