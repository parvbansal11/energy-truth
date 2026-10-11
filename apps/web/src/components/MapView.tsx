import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as GLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ColumnLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { api, type Asset, type Grid } from "../lib/api";
import { FUEL_GROUP, FUEL_LABEL, mt, signed } from "../lib/format";
import { consoleStyle } from "../lib/mapstyle";
import { useApp } from "../lib/store";

maplibregl.setWorkerUrl(workerUrl);

type RGB = [number, number, number];
type RGBA = [number, number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
const rgba = (c: RGB, a: number): RGBA => [c[0], c[1], c[2], a];
const PAL = { neg: hex("#2a78d6"), mid: hex("#a3a29b"), pos: hex("#e34948"), coal: hex("#2a78d6"), gas: hex("#eb6834"), steel: hex("#1baf7a"), other: hex("#eda100"), ring: hex("#ffffff"), ink: hex("#1c1b18"), accent: hex("#2f6b55"), alert: hex("#b7791f") };
const INTENSITY_RAMP = ["#fdf1df", "#f8d4a5", "#efa967", "#d77a35", "#a2521c"];
const REGION_LABEL: Record<string, { name: string; at: [number, number] }> = {
  NR: { name: "Northern grid", at: [76.3, 29.8] }, WR: { name: "Western grid", at: [74.2, 21.4] }, SR: { name: "Southern grid", at: [77.6, 12.6] },
  ER: { name: "Eastern grid", at: [86.6, 23.9] }, NER: { name: "North-eastern grid", at: [93.2, 25.9] },
};
const isIndia = (a: Asset) => a.country === "IND" || a.country === "India";
const short = (n: string) => n.replace(/ (power station|steel plant|thermal power (plant|project|station)|super thermal power (station|project)|cement plant)$/i, "");

const yearRef = { current: "2024" };
const E = (a: Asset) => a.ct?.emissions_t[yearRef.current] || 0;

export function MapView() {
  const app = useApp();
  const { assets, selected, scorecards, layers, setLayers, highlight, alertIds, mapCmd, plant, openPlant, meta, select, excluded } = app;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<GLMap | null>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; a: Asset } | null>(null);
  const [tick, setTick] = useState(0);
  const [grid, setGrid] = useState<Grid>();
  const [regions, setRegions] = useState<GeoJSON.FeatureCollection>();
  const focus = Boolean(plant);
  const focusAsset = useMemo(() => assets.find((a) => a.asset_id === plant), [assets, plant]);

  // ---------------------------------------------------------------- init once
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({ container: el.current, style: consoleStyle({ hillshade: true }), center: [80, 22.5], zoom: 3.9, attributionControl: false, maxPitch: 80 });
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "Climate TRACE · GEM · NASA GIBS · geoBoundaries · AWS Terrain Tiles" }), "bottom-right");
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    const ov = new MapboxOverlay({ interleaved: false, layers: [] });
    m.addControl(ov as unknown as maplibregl.IControl);
    m.on("load", () => {
      setReady(true);
      m.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"); // start collapsed
    });
    map.current = m;
    overlay.current = ov;
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; overlay.current = null; };
  }, []);

  useEffect(() => { api.grid().then(setGrid).catch(() => {}); api.regions().then(setRegions).catch(() => {}); }, []);

  // ---------------------------------------------------------------- base layer visibility (no style rebuild)
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    m.setLayoutProperty("imagery", "visibility", layers.imagery ? "visible" : "none");
    m.setLayoutProperty("hillshade", "visibility", layers.shade ? "visible" : "none");
    m.setLayoutProperty("ref", "visibility", layers.imagery ? "none" : "visible");
    // deck.gl's overlay cannot follow MapLibre 6 terrain (it throws on every frame), so it is detached in 3D focus
    const ov = overlay.current as unknown as maplibregl.IControl | null;
    const terrain = focus && layers.terrain;
    // order matters: detach before terrain turns on, re-attach only after terrain is off
    if (terrain) {
      if (ov && m.hasControl(ov)) m.removeControl(ov);
      m.setTerrain({ source: "dem", exaggeration: 1.6 });
    } else {
      m.setTerrain(null);
      try { if (ov && !m.hasControl(ov)) m.addControl(ov); } catch { /* overlay re-attaches on the next render */ }
    }
  }, [ready, layers.imagery, layers.shade, layers.terrain, focus]);

  // ---------------------------------------------------------------- GIBS + grid choropleth + selected-company footprint
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const L = meta?.layers || {};
    for (const key of ["no2", "dnb"] as const) {
      const id = `gibs-${key}`;
      if (layers[key] && L[key] && !m.getSource(id)) {
        m.addSource(id, { type: "raster", tiles: [L[key].template], tileSize: 256, maxzoom: L[key].max_zoom, attribution: `NASA GIBS ${L[key].date}` });
        m.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": key === "no2" ? 0.72 : 0.85 } }, "ref");
      }
      if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", layers[key] ? "visible" : "none");
    }
    if (regions && grid) {
      const last = (r: string) => { const s = grid.series[r] || []; for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return s[i] as number; return null; };
      const vals = Object.keys(REGION_LABEL).map(last).filter((v): v is number => v != null);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      const color = (r: string) => { const v = last(r); return v == null ? INTENSITY_RAMP[0] : INTENSITY_RAMP[Math.min(4, Math.floor(((v - lo) / (hi - lo || 1)) * 4.999))]; };
      const expr = ["match", ["get", "region"], ...Object.keys(REGION_LABEL).flatMap((r) => [r, color(r)]), INTENSITY_RAMP[0]];
      if (!m.getSource("regions")) {
        m.addSource("regions", { type: "geojson", data: regions });
        m.addLayer({ id: "regions-fill", type: "fill", source: "regions", paint: { "fill-color": expr as never, "fill-opacity": 0.6 } }, "ref");
        m.addLayer({ id: "regions-line", type: "line", source: "regions", paint: { "line-color": "#ffffff", "line-width": 0.8, "line-opacity": 0.9 } }, "ref");
      }
      for (const id of ["regions-fill", "regions-line"]) m.setLayoutProperty(id, "visibility", layers.grid ? "visible" : "none");
    }
    // dashed footprint of the selected company's Indian plants
    const pts = (app.assetsBy[selected] || []).filter((a) => a.ct && isIndia(a) && a.lat != null);
    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    if (pts.length) {
      const pd = 0.6;
      const [w, e] = [Math.min(...pts.map((a) => a.lon)) - pd, Math.max(...pts.map((a) => a.lon)) + pd];
      const [s, n] = [Math.min(...pts.map((a) => a.lat)) - pd, Math.max(...pts.map((a) => a.lat)) + pd];
      fc.features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[w, s], [e, s], [e, n], [w, n], [w, s]] } });
    }
    const src = m.getSource("footprint") as GeoJSONSource | undefined;
    if (src) src.setData(fc);
    else {
      m.addSource("footprint", { type: "geojson", data: fc });
      m.addLayer({ id: "footprint", type: "line", source: "footprint", paint: { "line-color": "#2f6b55", "line-width": 1.5, "line-opacity": 0.6, "line-dasharray": [2, 3] } });
    }
    m.setLayoutProperty("footprint", "visibility", focus ? "none" : "visible");
  }, [ready, layers.no2, layers.dnb, layers.grid, meta, regions, grid, selected, app.assetsBy, focus]);

  // ---------------------------------------------------------------- theatre chips: grid regions + companies (HTML markers)
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || focus || !grid) return;
    const markers: maplibregl.Marker[] = [];
    if (layers.grid) {
      for (const [r, { name, at }] of Object.entries(REGION_LABEL)) {
        const s = grid.series[r] || [];
        const v = [...s].reverse().find((x) => x != null) as number | undefined;
        const node = document.createElement("div");
        node.className = "pointer-events-none select-none rounded-full bg-white/85 px-2.5 py-1 text-[11px] text-[#4a4740] shadow-sm backdrop-blur";
        node.innerHTML = `${name}${v != null ? ` <b class="font-medium text-[#1c1b18]">${v.toFixed(2)}</b> t/MWh` : ""}`;
        markers.push(new maplibregl.Marker({ element: node }).setLngLat(at).addTo(m));
      }
    }
    for (const sym of Object.keys(app.assetsBy)) {
      const pts = app.assetsBy[sym].filter((a) => a.ct && isIndia(a) && a.lat != null);
      const tot = pts.reduce((t, a) => t + (E(a) || 0), 0);
      const sc = scorecards[sym];
      if (!pts.length || !tot || !sc) continue;
      const lon = pts.reduce((t, a) => t + a.lon * (E(a) || 0), 0) / tot;
      const lat = pts.reduce((t, a) => t + a.lat * (E(a) || 0), 0) / tot;
      const z = sc.scopes.S1.z;
      const tone = sc.scopes.S1.verdict.tone;
      const active = sym === selected;
      const node = document.createElement("button");
      node.className = `flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-[12px] shadow-[0_6px_18px_-6px_rgba(0,0,0,0.35)] transition hover:-translate-y-0.5 ${active ? "bg-[#1c1b18] text-white" : "bg-white text-[#1c1b18]"}`;
      const dot = tone === "red" ? "#b4413a" : tone === "amber" ? "#b7791f" : tone === "green" ? "#2f7d4f" : "#a6a196";
      node.innerHTML = `<span class="grid h-5 w-5 place-items-center rounded-full text-[9px] font-semibold ${active ? "bg-white/15" : "bg-[#f0eee8]"}">${sc.short.slice(0, 2).toUpperCase()}</span>${sc.short}<span class="ml-0.5 inline-flex items-center gap-1 ${active ? "text-white/70" : "text-[#77736a]"}"><span class="h-1.5 w-1.5 rounded-full" style="background:${dot}"></span>${z != null ? signed(z, 1) : "no filing"}</span>`;
      node.onclick = (e) => { e.stopPropagation(); select(sym); };
      markers.push(new maplibregl.Marker({ element: node, anchor: "bottom", offset: [0, -14] }).setLngLat([lon, lat]).addTo(m));
    }
    return () => markers.forEach((k) => k.remove());
  }, [ready, focus, grid, layers.grid, app.assetsBy, scorecards, selected]);

  // ---------------------------------------------------------------- focus mode: terrain-pinned plant markers
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !focusAsset) return;
    const near = assets.filter((a) => a.lat != null && Math.hypot(a.lat - focusAsset.lat, (a.lon - focusAsset.lon) * Math.cos((a.lat * Math.PI) / 180)) < 0.7);
    const markers = near.map((a) => {
      const me = a.asset_id === focusAsset.asset_id;
      const node = document.createElement("button");
      node.className = "flex flex-col items-center";
      node.innerHTML = `<span class="mb-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] shadow-[0_8px_22px_-8px_rgba(0,0,0,0.45)] transition hover:-translate-y-0.5 ${me ? "bg-[#1c1b18] text-white" : "bg-white text-[#1c1b18]"}">${short(a.name)}${a.ct ? ` <b class="font-medium ${me ? "text-[#a8d5c2]" : "text-[#2f6b55]"}">${mt(E(a))} Mt</b>` : ` <span class="text-[#a6a196]">no estimate</span>`}</span>
        <span class="h-6 w-px ${me ? "bg-white" : "bg-white/80"}"></span><span class="relative block h-2.5 w-2.5 rounded-full border-2 border-white ${me ? "bg-[#2f6b55] text-[#2f6b55] ping" : "bg-[#1c1b18]"}"></span>`;
      node.onclick = (e) => { e.stopPropagation(); openPlant(a.asset_id); };
      return new maplibregl.Marker({ element: node, anchor: "bottom" }).setLngLat([a.lon, a.lat]).addTo(m);
    });
    return () => markers.forEach((k) => k.remove());
  }, [ready, focusAsset, assets]);

  // ---------------------------------------------------------------- deck.gl analytics layers (theatre view)
  const pulsing = !focus && (highlight.length > 0 || alertIds.length > 0);
  useEffect(() => {
    if (!pulsing) return;
    let raf = 0;
    const loop = () => { setTick(performance.now()); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pulsing]);

  const zBy = useMemo(() => Object.fromEntries(Object.values(scorecards).map((s) => [s.symbol, { z: s.scopes.S1.z, rho: s.coverage.rho_effective }])), [scorecards]);
  yearRef.current = app.year;
  const maxE = useMemo(() => Math.max(1, ...assets.filter((a) => a.ct).map((a) => E(a) || 0)), [assets, app.year]);
  const ct = useMemo(() => assets.filter((a) => a.ct && a.lat != null), [assets]);
  const gemOnly = useMemo(() => assets.filter((a) => !a.ct && a.lat != null && a.gem?.status === "operating"), [assets]);
  const hl = useMemo(() => ct.filter((a) => highlight.includes(a.asset_id)), [ct, highlight]);
  const al = useMemo(() => ct.filter((a) => alertIds.includes(a.asset_id)), [ct, alertIds]);
  const fill = (a: Asset): RGB => {
    if (layers.colorBy === "fuel") return PAL[FUEL_GROUP(a.fuel, a.sector)];
    const z = zBy[a.company]?.z;
    if (z == null) return PAL.mid;
    const t = Math.max(-1, Math.min(1, z / 3));
    return t >= 0 ? mix(PAL.mid, PAL.pos, t) : mix(PAL.mid, PAL.neg, -t);
  };
  const alpha = (a: Asset) => (excluded.has(a.asset_id) ? 28 : a.company === selected ? 225 : 70);

  useEffect(() => {
    const ov = overlay.current;
    if (!ov || !ready) return;
    if (focus) { ov.setProps({ layers: [] }); setHover(null); return; }
    const phase = (tick / 900) % 1;
    const r = (a: Asset) => Math.sqrt((E(a) || 0) / maxE);
    const L = [
      layers.gemOnly && new ScatterplotLayer<Asset>({
        id: "gem-only", data: gemOnly, getPosition: (a) => [a.lon, a.lat], getRadius: 4.5, radiusUnits: "pixels", filled: false, stroked: true,
        getLineColor: (a) => rgba(PAL.ink, a.company === selected ? 170 : 45), lineWidthUnits: "pixels", getLineWidth: 1.2, pickable: true, updateTriggers: { getLineColor: [selected] },
      }),
      layers.plants && !layers.columns && new ScatterplotLayer<Asset>({
        id: "plants", data: ct, getPosition: (a) => [a.lon, a.lat], radiusUnits: "pixels", getRadius: (a) => 3 + r(a) * 17,
        getFillColor: (a) => rgba(fill(a), alpha(a)), stroked: true, lineWidthUnits: "pixels", getLineWidth: (a) => 0.5 + 2 * (zBy[a.company]?.rho ?? 0),
        getLineColor: (a) => rgba(PAL.ring, a.company === selected ? 255 : 120), pickable: true, autoHighlight: true, highlightColor: rgba(PAL.accent, 255),
        transitions: { getRadius: 600, getFillColor: 500 }, updateTriggers: { getFillColor: [layers.colorBy, selected, zBy, excluded], getLineColor: [selected], getLineWidth: [zBy], getRadius: [app.year] },
      }),
      layers.plants && layers.columns && new ColumnLayer<Asset>({
        id: "columns", data: ct, diskResolution: 12, radius: 9000, extruded: true, getPosition: (a) => [a.lon, a.lat],
        getElevation: (a) => (E(a) || 0) * (a.company === selected ? 1 : 0.25), elevationScale: 0.012,
        getFillColor: (a) => rgba(fill(a), alpha(a)), pickable: true, material: { ambient: 0.5, diffuse: 0.6, shininess: 32 },
        transitions: { getElevation: 900 }, updateTriggers: { getFillColor: [layers.colorBy, selected, zBy, excluded], getElevation: [selected, app.year] },
      }),
      hl.length > 0 && new ScatterplotLayer<Asset>({
        id: "pulse", data: hl, getPosition: (a) => [a.lon, a.lat], radiusUnits: "pixels", filled: false, stroked: true, lineWidthUnits: "pixels",
        getRadius: (a) => 6 + r(a) * 17 + phase * 18, getLineWidth: 1.5, getLineColor: rgba(PAL.accent, Math.round(255 * (1 - phase))), updateTriggers: { getRadius: tick, getLineColor: tick },
      }),
      al.length > 0 && new ScatterplotLayer<Asset>({
        id: "alert", data: al, getPosition: (a) => [a.lon, a.lat], radiusUnits: "pixels", filled: false, stroked: true, lineWidthUnits: "pixels",
        getRadius: (a) => 8 + r(a) * 17 + ((phase + 0.5) % 1) * 14, getLineWidth: 2, getLineColor: rgba(PAL.alert, Math.round(255 * (1 - ((phase + 0.5) % 1)))), updateTriggers: { getRadius: tick, getLineColor: tick },
      }),
    ].filter(Boolean);
    ov.setProps({
      layers: L as never,
      onHover: (info: PickingInfo<Asset>) => setHover(info.object ? { x: info.x, y: info.y, a: info.object } : null),
      onClick: (info: PickingInfo<Asset>) => { if (info.object) openPlant(info.object.asset_id); },
      getCursor: ({ isHovering }) => (isHovering ? "pointer" : "grab"),
    });
  }, [ready, focus, ct, gemOnly, hl, al, tick, layers, selected, zBy, maxE, excluded]);

  // ---------------------------------------------------------------- camera
  const pad = () => {
    const wide = innerWidth >= 1024;
    return { top: 130, bottom: wide ? 60 : 320, left: wide ? 310 : 30, right: wide ? 420 : 30 };
  };
  const fitTo = (rows: Asset[], maxZoom = 6.2) => {
    const m = map.current;
    const use = rows.filter((a) => a.lat != null && isIndia(a) && a.ct);
    if (!m || !use.length) return;
    const b = new maplibregl.LngLatBounds();
    use.forEach((a) => b.extend([a.lon, a.lat]));
    m.fitBounds(b, { padding: pad(), maxZoom, duration: 1400, pitch: layers.columns ? 50 : 0, bearing: layers.columns ? -12 : 0 });
  };
  useEffect(() => {
    if (!ready || !mapCmd) return;
    const m = map.current!;
    if (mapCmd.kind === "fly_company" && !plant) fitTo(app.assetsBy[selected] || []);
    if (mapCmd.kind === "fit_ids" && mapCmd.ids && !plant) fitTo(assets.filter((a) => mapCmd.ids!.includes(a.asset_id)), 6.5);
    if (mapCmd.kind === "fly_to" && mapCmd.lon != null && !plant) m.flyTo({ center: [mapCmd.lon, mapCmd.lat!], zoom: mapCmd.zoom || 9, pitch: 45, speed: 0.9, curve: 1.6, essential: true });
  }, [mapCmd, ready]);
  useEffect(() => { if (ready && app.assetsBy[selected] && !plant) fitTo(app.assetsBy[selected]); }, [ready, Object.keys(app.assetsBy).length]);
  useEffect(() => { if (ready && !plant) map.current?.easeTo({ pitch: layers.columns ? 50 : 0, bearing: layers.columns ? -12 : 0, duration: 900 }); }, [layers.columns, ready]);
  // fly into the plant: ground-level 3D with imagery; leaving focus returns to the company footprint
  const wasFocus = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (focusAsset) {
      if (!wasFocus.current) setLayers((l) => ({ ...l, imagery: true }));
      m.flyTo({ center: [focusAsset.lon, focusAsset.lat], zoom: 12.6, pitch: 64, bearing: -24, speed: 0.75, curve: 1.7, essential: true, padding: pad() });
      wasFocus.current = true;
    } else if (wasFocus.current) {
      wasFocus.current = false;
      setLayers((l) => ({ ...l, imagery: false }));
      fitTo(app.assetsBy[selected] || []);
    }
  }, [focusAsset, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={el} style={{ width: "100%", height: "100%" }} aria-label="Map of company-owned energy assets" role="region" />
      {hover && (
        <div className="pointer-events-none absolute z-20 max-w-64 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[12px] shadow-[var(--shadow)]" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="font-medium text-ink">{hover.a.name}</div>
          <div className="text-[11.5px] text-muted">{scorecards[hover.a.company]?.short} · {hover.a.state || hover.a.country}</div>
          {hover.a.ct ? (
            <div className="tnum mt-1 text-ink-2">{mt(E(hover.a), 2)} Mt CO₂e ({app.year}) · w {hover.a.ownership_weight.toFixed(2)} · {FUEL_LABEL[FUEL_GROUP(hover.a.fuel, hover.a.sector)]}</div>
          ) : (
            <div className="mt-1 text-sun">Owned, but no independent estimate yet</div>
          )}
        </div>
      )}
    </div>
  );
}
