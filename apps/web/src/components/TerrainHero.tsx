import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { api, type Asset } from "../lib/api";
import { mt } from "../lib/format";
import { consoleStyle } from "../lib/mapstyle";

maplibregl.setWorkerUrl(workerUrl);

// Singrauli coalfield (MP/UP): NTPC Vindhyachal, Singrauli and Rihand beside the Rihand reservoir.
const CENTER: [number, number] = [82.74, 24.13];
const BBOX = { w: 82.2, e: 83.2, s: 23.8, n: 24.5 };

/** Cinematic, non-interactive 3D terrain with the real plants of the view pinned. */
export function TerrainHero({ onReady }: { onReady?: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const [plants, setPlants] = useState<Asset[]>([]);
  useEffect(() => {
    api.assets("NTPC").then((a) => setPlants(a.filter((x) => x.ct && x.lon > BBOX.w && x.lon < BBOX.e && x.lat > BBOX.s && x.lat < BBOX.n))).catch(() => {});
  }, []);
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current, style: consoleStyle({ tone: "sand" }), center: CENTER, zoom: 11.2, pitch: 66, bearing: -28,
      interactive: false, attributionControl: false, maxPitch: 85, fadeDuration: 0,
    });
    // attribution lives in the landing footer; keep the focal point right of the headline
    m.setPadding({ left: Math.round(innerWidth * 0.38), top: 0, right: 0, bottom: 0 });
    let raf = 0;
    let t0 = 0;
    const fallback = setTimeout(() => onReady?.(), 2500);
    m.on("load", () => {
      m.setTerrain({ source: "dem", exaggeration: 4 });
      onReady?.();
      const spin = (t: number) => {
        if (!t0) t0 = t;
        m.setBearing(-28 + ((t - t0) / 1000) * 1.4);
        raf = requestAnimationFrame(spin);
      };
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) raf = requestAnimationFrame(spin);
    });
    (el.current as HTMLDivElement & { __map?: maplibregl.Map }).__map = m;
    return () => { clearTimeout(fallback); cancelAnimationFrame(raf); m.remove(); };
  }, []);
  useEffect(() => {
    const m = (el.current as (HTMLDivElement & { __map?: maplibregl.Map }) | null)?.__map;
    if (!m || !plants.length) return;
    const markers = plants.map((p) => {
      const node = document.createElement("div");
      node.className = "pointer-events-none flex items-center gap-2";
      node.innerHTML = `<span class="relative block h-2.5 w-2.5 rounded-full bg-[var(--accent)] text-[var(--accent)] ping"></span>
        <span class="map-chip whitespace-nowrap rounded-[3px] border border-white/15 bg-black/55 px-1.5 py-0.5 text-[10px] tracking-wider text-white/90 backdrop-blur">${p.name.replace(/ power station/i, "").toUpperCase()} <span style="color:var(--accent)">${mt(p.ct!.emissions_t["2024"])} MT</span></span>`;
      return new maplibregl.Marker({ element: node, anchor: "left" }).setLngLat([p.lon, p.lat]).addTo(m);
    });
    return () => markers.forEach((k) => k.remove());
  }, [plants]);
  return <div ref={el} className="absolute inset-0" style={{ width: "100%", height: "100%" }} aria-hidden />;
}
