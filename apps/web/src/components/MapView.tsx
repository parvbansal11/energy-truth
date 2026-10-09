import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as GLMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ColumnLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { api, type Asset, type Grid } from "../lib/api";
import { FUEL_GROUP, FUEL_LABEL, mt } from "../lib/format";
import { useApp } from "../lib/store";

maplibregl.setWorkerUrl(workerUrl);

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;

const PAL = {
  dark: { neg: hex("#3987e5"), mid: hex("#8f8f88"), pos: hex("#e66767"), coal: hex("#3987e5"), gas: hex("#d95926"), steel: hex("#199e70"), other: hex("#c98500"), ring: hex("#f4f6f3"), accent: hex("#34d39e"), alert: hex("#fab219") },
  light: { neg: hex("#2a78d6"), mid: hex("#a3a29b"), pos: hex("#e34948"), coal: hex("#2a78d6"), gas: hex("#eb6834"), steel: hex("#1baf7a"), other: hex("#eda100"), ring: hex("#0b0b0b"), accent: hex("#0d8a63"), alert: hex("#d08a00") },
};
// Sequential (one hue) ramp for grid carbon intensity, light -> dark in light mode, dim -> bright in dark mode
const INTENSITY_RAMP = { dark: ["#3a2512", "#6b3d17", "#a35a1c", "#d9802a", "#f6b25c"], light: ["#fde7cf", "#f8c48e", "#ee9a52", "#cf6d24", "#9a4712"] };

function basemap(theme: "dark" | "light", satellite: boolean): StyleSpecification {
  const key = import.meta.env.VITE_LOCATION_API_KEY as string | undefined;
  const esri = satellite
    ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
    : `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${theme === "dark" ? "Dark" : "Light"}_Gray_Base/MapServer/tile/{z}/{y}/{x}`;
  return {
    version: 8,
    sources: {
      base: { type: "raster", tiles: [esri], tileSize: 256, maxzoom: satellite ? 18 : 16, attribution: satellite ? "Imagery © Esri, Maxar, Earthstar Geographics" : "Basemap © Esri" + (key ? "" : "") },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": theme === "dark" ? "#0a0d0c" : "#eef0ea" } },
      { id: "base", type: "raster", source: "base", paint: { "raster-opacity": satellite ? 0.9 : 1 } },
    ],
  };
}

export function MapView() {
  const app = useApp();
  const { assets, selected, scorecards, layers, highlight, alertIds, mapCmd, plant, openPlant, theme, meta } = app;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<GLMap | null>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const [ready, setReady] = useState(0);
  const [hover, setHover] = useState<{ x: number; y: number; a: Asset } | null>(null);
  const [tick, setTick] = useState(0);
  const [grid, setGrid] = useState<Grid>();
  const [regions, setRegions] = useState<GeoJSON.FeatureCollection>();
  const pal = PAL[theme];

  // ---- init map (re-created when theme/satellite change basemap)
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({ container: el.current, style: basemap(theme, layers.satellite), center: [80, 22.5], zoom: 3.9, attributionControl: false, maxPitch: 70 });
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "Plants: Climate TRACE · GEM | NO₂/VIIRS: NASA GIBS | States: geoBoundaries" }), "bottom-left");
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), "bottom-right");
    const ov = new MapboxOverlay({ interleaved: false, layers: [] });
    m.addControl(ov as unknown as maplibregl.IControl);
    m.on("load", () => setReady((r) => r + 1));
    map.current = m;
    overlay.current = ov;
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; overlay.current = null; };
  }, [theme, layers.satellite]);

  useEffect(() => { api.grid().then(setGrid).catch(() => {}); api.regions().then(setRegions).catch(() => {}); }, []);

  // ---- raster + choropleth layers on the MapLibre side
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const L = meta?.layers || {};
    for (const key of ["no2", "dnb"] as const) {
      const id = `gibs-${key}`;
      const on = layers[key] && L[key];
      if (on && !m.getSource(id)) {
        m.addSource(id, { type: "raster", tiles: [L[key].template], tileSize: 256, maxzoom: L[key].max_zoom, attribution: `NASA GIBS ${L[key].date}` });
        m.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": key === "no2" ? 0.7 : 0.85, "raster-resampling": "linear" } });
      }
      if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    }
    if (regions && grid) {
      const last = (r: string) => {
        const s = grid.series[r] || [];
        for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return s[i] as number;
        return null;
      };
      const vals = ["NR", "WR", "SR", "ER", "NER"].map(last).filter((v): v is number => v != null);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      const ramp = INTENSITY_RAMP[theme];
      const color = (r: string) => {
        const v = last(r);
        if (v == null) return ramp[0];
        return ramp[Math.min(ramp.length - 1, Math.floor(((v - lo) / (hi - lo || 1)) * (ramp.length - 0.001)))];
      };
      const expr = ["match", ["get", "region"], "NR", color("NR"), "WR", color("WR"), "SR", color("SR"), "ER", color("ER"), "NER", color("NER"), ramp[0]];
      if (!m.getSource("regions")) {
        m.addSource("regions", { type: "geojson", data: regions });
        m.addLayer({ id: "regions-fill", type: "fill", source: "regions", paint: { "fill-color": expr as never, "fill-opacity": 0.5 } }, m.getLayer("gibs-no2") ? "gibs-no2" : undefined);
        m.addLayer({ id: "regions-line", type: "line", source: "regions", paint: { "line-color": theme === "dark" ? "#000" : "#fff", "line-width": 0.6, "line-opacity": 0.5 } });
      } else {
        m.setPaintProperty("regions-fill", "fill-color", expr as never);
      }
      for (const id of ["regions-fill", "regions-line"]) m.setLayoutProperty(id, "visibility", layers.grid ? "visible" : "none");
    }
  }, [ready, layers.no2, layers.dnb, layers.grid, meta, regions, grid, theme]);

  // ---- Sentinel-2 preview on plant focus
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const clear = () => { if (m.getLayer("s2")) m.removeLayer("s2"); if (m.getSource("s2")) m.removeSource("s2"); };
    clear();
    if (!layers.s2 || !plant) return;
    let live = true;
    api.sentinel(plant).then(({ scene }) => {
      if (!live || !scene?.thumbnail || !scene.bbox || !map.current) return;
      const [x0, y0, x1, y1] = scene.bbox;
      clear();
      m.addSource("s2", { type: "image", url: scene.thumbnail, coordinates: [[x0, y1], [x1, y1], [x1, y0], [x0, y0]] });
      m.addLayer({ id: "s2", type: "raster", source: "s2", paint: { "raster-opacity": 0.9 } });
    }).catch(() => {});
    return () => { live = false; };
  }, [ready, layers.s2, plant]);

  // ---- pulse animation for agent highlights (CSS can't reach WebGL; a rAF clock drives deck.gl radii)
  const pulsing = highlight.length > 0 || alertIds.length > 0;
  useEffect(() => {
    if (!pulsing) return;
    let raf = 0;
    const loop = () => { setTick(performance.now()); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pulsing]);

  const zBy = useMemo(() => Object.fromEntries(Object.values(scorecards).map((s) => [s.symbol, { z: s.scopes.S1.z, rho: s.coverage.rho_effective }])), [scorecards]);
  const maxE = useMemo(() => Math.max(1, ...assets.filter((a) => a.ct).map((a) => a.ct!.emissions_t["2024"] || 0)), [assets]);
  const ct = useMemo(() => assets.filter((a) => a.ct && a.lat != null), [assets]);
  const gemOnly = useMemo(() => assets.filter((a) => !a.ct && a.lat != null && a.gem?.status === "operating"), [assets]);
  const hl = useMemo(() => ct.filter((a) => highlight.includes(a.asset_id)), [ct, highlight]);
  const al = useMemo(() => ct.filter((a) => alertIds.includes(a.asset_id)), [ct, alertIds]);

  const fill = (a: Asset): RGB => {
    if (layers.colorBy === "fuel") return pal[FUEL_GROUP(a.fuel, a.sector)];
    const z = zBy[a.company]?.z;
    if (z == null) return pal.mid;
    const t = Math.max(-1, Math.min(1, z / 3));
    return t >= 0 ? mix(pal.mid, pal.pos, t) : mix(pal.mid, pal.neg, -t);
  };
  const alpha = (a: Asset) => (a.company === selected ? 235 : 70);

  useEffect(() => {
    const ov = overlay.current;
    if (!ov || !ready) return;
    const phase = (tick / 900) % 1;
    const radius = (a: Asset) => Math.sqrt((a.ct?.emissions_t["2024"] || 0) / maxE);
    const L = [
      layers.gemOnly && new ScatterplotLayer<Asset>({
        id: "gem-only", data: gemOnly, getPosition: (a) => [a.lon, a.lat], getRadius: 5, radiusUnits: "pixels", filled: false, stroked: true,
        getLineColor: (a) => [...pal.ring, a.company === selected ? 170 : 45] as unknown as [number, number, number, number], lineWidthUnits: "pixels", getLineWidth: 1.25, pickable: true,
        updateTriggers: { getLineColor: [selected, theme] },
      }),
      !layers.columns && new ScatterplotLayer<Asset>({
        id: "plants", data: ct, getPosition: (a) => [a.lon, a.lat], radiusUnits: "pixels", getRadius: (a) => 4 + radius(a) * 26,
        getFillColor: (a) => [...fill(a), alpha(a)] as unknown as [number, number, number, number],
        stroked: true, lineWidthUnits: "pixels", getLineWidth: (a) => 0.75 + 2.25 * (zBy[a.company]?.rho ?? 0),
        getLineColor: (a) => [...pal.ring, a.company === selected ? 200 : 40] as unknown as [number, number, number, number],
        pickable: true, autoHighlight: true, highlightColor: [...pal.accent, 255] as unknown as [number, number, number, number],
        transitions: { getRadius: 600, getFillColor: 500 },
        updateTriggers: { getFillColor: [layers.colorBy, selected, theme, zBy], getLineColor: [selected, theme], getLineWidth: [zBy] },
      }),
      layers.columns && new ColumnLayer<Asset>({
        id: "columns", data: ct, diskResolution: 14, radius: 9000, extruded: true, getPosition: (a) => [a.lon, a.lat],
        getElevation: (a) => (a.ct?.emissions_t["2024"] || 0) * (a.company === selected ? 1 : 0.25),
        elevationScale: 0.012, getFillColor: (a) => [...fill(a), alpha(a)] as unknown as [number, number, number, number], pickable: true,
        material: { ambient: 0.5, diffuse: 0.6, shininess: 32 }, transitions: { getElevation: 900 },
        updateTriggers: { getFillColor: [layers.colorBy, selected, theme, zBy], getElevation: [selected] },
      }),
      hl.length > 0 && new ScatterplotLayer<Asset>({
        id: "pulse", data: hl, getPosition: (a) => [a.lon, a.lat], radiusUnits: "pixels", filled: false, stroked: true, lineWidthUnits: "pixels",
        getRadius: (a) => 8 + radius(a) * 26 + phase * 22, getLineWidth: 2, getLineColor: [...pal.accent, Math.round(255 * (1 - phase))] as unknown as [number, number, number, number],
        updateTriggers: { getRadius: tick, getLineColor: tick },
      }),
      al.length > 0 && new ScatterplotLayer<Asset>({
        id: "alert", data: al, getPosition: (a) => [a.lon, a.lat], radiusUnits: "pixels", filled: false, stroked: true, lineWidthUnits: "pixels",
        getRadius: (a) => 10 + radius(a) * 26 + ((phase + 0.5) % 1) * 18, getLineWidth: 2.5, getLineColor: [...pal.alert, Math.round(255 * (1 - ((phase + 0.5) % 1)))] as unknown as [number, number, number, number],
        updateTriggers: { getRadius: tick, getLineColor: tick },
      }),
      plant && new ScatterplotLayer<Asset>({
        id: "selected", data: assets.filter((a) => a.asset_id === plant), getPosition: (a) => [a.lon, a.lat], radiusUnits: "pixels", filled: false, stroked: true,
        getRadius: (a) => 9 + radius(a) * 26, lineWidthUnits: "pixels", getLineWidth: 2.5, getLineColor: [...pal.accent, 255] as unknown as [number, number, number, number],
      }),
    ].filter(Boolean);
    ov.setProps({
      layers: L as never,
      onHover: (info: PickingInfo<Asset>) => setHover(info.object ? { x: info.x, y: info.y, a: info.object } : null),
      onClick: (info: PickingInfo<Asset>) => { if (info.object) openPlant(info.object.asset_id); },
      getCursor: ({ isHovering }) => (isHovering ? "pointer" : "grab"),
    });
  }, [ready, ct, gemOnly, hl, al, tick, layers, selected, theme, zBy, plant, maxE, assets]);

  // ---- 3D pitch with columns
  useEffect(() => { if (ready) map.current?.easeTo({ pitch: layers.columns ? 52 : 0, bearing: layers.columns ? -12 : 0, duration: 900 }); }, [layers.columns, ready]);

  // ---- camera commands
  const fitTo = (rows: Asset[], maxZoom = 6.2) => {
    const m = map.current;
    const pts = rows.filter((a) => a.lat != null && (a.country === "IND" || a.country === "India"));
    const use = pts.length ? pts : rows.filter((a) => a.lat != null);
    if (!m || !use.length) return;
    const b = new maplibregl.LngLatBounds();
    use.forEach((a) => b.extend([a.lon, a.lat]));
    const wide = innerWidth >= 1024;
    m.fitBounds(b, { padding: { top: 90, bottom: wide ? 60 : 280, left: wide ? 440 : 30, right: wide ? (app.audit.open ? 460 : 80) : 30 }, maxZoom, duration: 1100 });
  };
  useEffect(() => {
    if (!ready || !mapCmd) return;
    const m = map.current!;
    if (mapCmd.kind === "fly_company") fitTo(app.assetsBy[selected] || []);
    if (mapCmd.kind === "fit_ids" && mapCmd.ids) fitTo(assets.filter((a) => mapCmd.ids!.includes(a.asset_id)), 6.5);
    if (mapCmd.kind === "fly_to" && mapCmd.lon != null) m.flyTo({ center: [mapCmd.lon, mapCmd.lat!], zoom: mapCmd.zoom || 9, speed: 1.2, essential: true });
  }, [mapCmd, ready]);
  useEffect(() => { if (ready && app.assetsBy[selected]) fitTo(app.assetsBy[selected]); }, [ready, Object.keys(app.assetsBy).length]);
  useEffect(() => {
    if (!ready || !plant) return;
    const a = assets.find((x) => x.asset_id === plant);
    if (a && a.lat != null) map.current?.flyTo({ center: [a.lon, a.lat], zoom: Math.max(map.current.getZoom(), 7.5), speed: 1.3 });
  }, [plant, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={el} style={{ width: "100%", height: "100%" }} aria-label="Map of company-owned energy assets" role="region" />
      {hover && (
        <div className="glass pointer-events-none absolute z-20 max-w-64 rounded-xl px-3 py-2 text-xs animate-fade-up" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="font-semibold text-ink">{hover.a.name}</div>
          <div className="text-muted">{scorecards[hover.a.company]?.short} · {hover.a.state || hover.a.country}</div>
          {hover.a.ct ? (
            <div className="tnum mt-1 text-ink-2">
              {mt(hover.a.ct.emissions_t["2024"], 2)} Mt CO₂e (CY2024) · w {hover.a.ownership_weight.toFixed(2)} · {hover.a.ct.confidence}
              <div className="text-muted">{FUEL_LABEL[FUEL_GROUP(hover.a.fuel, hover.a.sector)]}</div>
            </div>
          ) : (
            <div className="mt-1 text-warn">No Climate TRACE estimate · GEM {hover.a.gem?.asset_type} ({hover.a.gem?.status})</div>
          )}
        </div>
      )}
    </div>
  );
}
