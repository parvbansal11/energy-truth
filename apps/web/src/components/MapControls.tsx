import { useState } from "react";
import { Box, ChevronDown, Layers3 } from "lucide-react";
import { FUEL_LABEL } from "../lib/format";
import { useApp, type Layers } from "../lib/store";
import { cx } from "./ui";

export function MapControls() {
  const { layers, setLayers, meta, theme } = useApp();
  const [open, setOpen] = useState(false);
  const toggle = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  const L = meta?.layers || {};
  const rows: { k: keyof Layers; label: string; sub: string; disabled?: boolean }[] = [
    { k: "no2", label: "TROPOMI NO₂", sub: L.no2 ? `GIBS · ${L.no2.date} · combustion proxy` : "unavailable", disabled: !L.no2 },
    { k: "dnb", label: "VIIRS night lights", sub: L.dnb ? `GIBS · ${L.dnb.date} · activity proxy` : "unavailable", disabled: !L.dnb },
    { k: "grid", label: "Grid carbon intensity", sub: "POSOCO regions · latest month" },
    { k: "gemOnly", label: "GEM-only assets", sub: "owned, no CT estimate (hollow)" },
    { k: "satellite", label: "Satellite basemap", sub: "Esri World Imagery" },
  ];
  return (
    <div className="glass w-64 overflow-hidden rounded-2xl text-[12px]">
      <button onClick={() => setOpen(!open)} className="focus-ring flex w-full items-center justify-between px-3 py-2.5 font-semibold" aria-expanded={open}>
        <span className="inline-flex items-center gap-1.5"><Layers3 size={14} className="text-accent" /> Layers & legend</span>
        <ChevronDown size={14} className={cx("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="animate-fade-up space-y-3 border-t border-line px-3 pt-2.5 pb-3">
          <div className="inline-flex w-full rounded-lg bg-surface-2 p-0.5" role="radiogroup" aria-label="Colour plants by">
            {(["gap", "fuel"] as const).map((k) => (
              <button key={k} role="radio" aria-checked={layers.colorBy === k} onClick={() => setLayers((l) => ({ ...l, colorBy: k }))}
                className={cx("flex-1 rounded-md py-1 font-medium transition", layers.colorBy === k ? "bg-surface text-ink shadow-sm" : "text-muted")}>
                {k === "gap" ? "Colour: gap" : "Colour: fuel"}
              </button>
            ))}
          </div>
          {layers.colorBy === "gap" ? (
            <div>
              <div className="h-2 rounded-full" style={{ background: "linear-gradient(90deg, var(--div-neg), var(--div-mid), var(--div-pos))" }} />
              <div className="mt-1 flex justify-between text-[10.5px] text-muted"><span>rebuild &lt; reported</span><span>z = 0</span><span>rebuild &gt; reported</span></div>
              <p className="mt-1 text-[10.5px] leading-snug text-muted">Company-level gap (z, Scope 1). BRSR is filed per company, so every plant of a company shares its colour. Grey = no disclosure.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(FUEL_LABEL) as (keyof typeof FUEL_LABEL)[]).map((k, i) => (
                <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-ink-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: `var(--s${[1, 2, 3, 4][i]})` }} />{FUEL_LABEL[k]}</span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 text-[10.5px] text-muted">
            <span className="inline-flex items-end gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-ink-2" /><span className="h-3 w-3 rounded-full bg-ink-2" /></span> size = CY2024 CO₂e
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full ring-2 ring-ink-2" /> ring = coverage ρ</span>
          </div>
          <div className="space-y-1">
            {rows.map((r) => (
              <label key={r.k} className={cx("flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-2", r.disabled && "pointer-events-none opacity-50")}>
                <input type="checkbox" checked={!!layers[r.k]} onChange={() => toggle(r.k)} className="mt-0.5 accent-[var(--accent)]" disabled={r.disabled} />
                <span><span className="font-medium text-ink">{r.label}</span><span className="block text-[10.5px] text-muted">{r.sub}</span></span>
              </label>
            ))}
          </div>
          {layers.grid && (
            <div>
              <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${(theme === "dark" ? ["#3a2512", "#6b3d17", "#a35a1c", "#d9802a", "#f6b25c"] : ["#fde7cf", "#f8c48e", "#ee9a52", "#cf6d24", "#9a4712"]).join(",")})` }} />
              <div className="mt-1 flex justify-between text-[10.5px] text-muted"><span>lower tCO₂/MWh</span><span>higher</span></div>
            </div>
          )}
          <button onClick={() => toggle("columns")} className={cx("focus-ring flex w-full items-center justify-center gap-1.5 rounded-lg border py-1.5 font-medium transition", layers.columns ? "border-accent bg-accent/12 text-accent" : "border-line-2 text-ink-2 hover:text-ink")}>
            <Box size={14} /> {layers.columns ? "3D columns on" : "3D emission columns"}
          </button>
        </div>
      )}
    </div>
  );
}
