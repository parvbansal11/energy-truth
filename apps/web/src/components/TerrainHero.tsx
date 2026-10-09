import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { api, type Asset } from "../lib/api";
import { mt } from "../lib/format";
import { consoleStyle } from "../lib/mapstyle";

maplibregl.setWorkerUrl(workerUrl);

// Singrauli coalfield (MP/UP): NTPC Vindhyachal, Singrauli and Rihand beside the Rihand reservoir.
const CENTER: [number, number] = [82.72, 24.13];
const BBOX = { w: 82.2, e: 83.2, s: 23.8, n: 24.5 };

/** Gently orbiting 3D terrain (natural colour) with the real plants of the view pinned. */
export function TerrainHero({ onReady }: { onReady?: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [plants, setPlants] = useState<Asset[]>([]);
  useEffect(() => {
    api.assets("NTPC").then((a) => setPlants(a.filter((x) => x.ct && x.lon > BBOX.w && x.lon < BBOX.e && x.lat > BBOX.s && x.lat < BBOX.n))).catch(() => {});
  }, []);
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current, style: consoleStyle({ tone: "hero" }), center: CENTER, zoom: 11, pitch: 62, bearing: -30,
      interactive: false, attributionControl: false, maxPitch: 85, fadeDuration: 0,
    });
    map.current = m;
    let raf = 0;
    let t0 = 0;
    const fallback = setTimeout(() => onReady?.(), 2500);
    m.on("load", () => {
      m.setTerrain({ source: "dem", exaggeration: 3 });
      onReady?.();
      const spin = (t: number) => {
        if (!t0) t0 = t;
        m.setBearing(-30 + ((t - t0) / 1000) * 1.1);
        raf = requestAnimationFrame(spin);
      };
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) raf = requestAnimationFrame(spin);
    });
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current);
    return () => { clearTimeout(fallback); cancelAnimationFrame(raf); ro.disconnect(); m.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m || !plants.length) return;
    const markers = plants.map((p) => {
      const node = document.createElement("div");
      node.className = "pointer-events-none flex flex-col items-center";
      node.innerHTML = `<span class="whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-medium text-[#1c1b18] shadow-[0_4px_14px_-4px_rgba(0,0,0,0.35)]">${p.name.replace(/ (super thermal )?power station/i, "")} <span style="color:#2f6b55">${mt(p.ct!.emissions_t["2024"])} Mt</span></span>
        <span class="h-4 w-px bg-white/90"></span><span class="relative block h-2 w-2 rounded-full bg-white text-white ping"></span>`;
      return new maplibregl.Marker({ element: node, anchor: "bottom" }).setLngLat([p.lon, p.lat]).addTo(m);
    });
    return () => markers.forEach((k) => k.remove());
  }, [plants]);
  return <div ref={el} className="absolute inset-0" style={{ width: "100%", height: "100%" }} aria-hidden />;
}
