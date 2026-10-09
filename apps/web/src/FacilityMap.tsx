import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { type Map as GLMap } from "maplibre-gl";
import {
  Crosshair,
  Layers3,
  Minus,
  Plus,
  Maximize2,
  Globe2,
} from "lucide-react";
import type { Asset } from "./model";
import { assetColor, mt } from "./model";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
maplibregl.setWorkerUrl(workerUrl);
export default function FacilityMap({
  assets,
  selected,
  onSelect,
  company,
}: {
  assets: Asset[];
  selected: number | null;
  onSelect: (id: number) => void;
  company: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<GLMap | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const click = useRef(onSelect);
  click.current = onSelect;
  const [ready, setReady] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const [tilt, setTilt] = useState(false);
  const [failed, setFailed] = useState(false);
  const fit = () => {
    const m = map.current;
    if (!m || !assets.length) return;
    const bounds = new maplibregl.LngLatBounds();
    assets.forEach((a) =>
      bounds.extend([a.centroid.longitude, a.centroid.latitude]),
    );
    m.fitBounds(bounds, {
      padding: { top: 70, bottom: 70, left: 70, right: 70 },
      maxZoom: 6,
      duration: 850,
      pitch: tilt ? 35 : 0,
    });
  };
  useEffect(() => {
    if (!container.current) return;
    try {
      const m = new maplibregl.Map({
        container: container.current,
        center: [79, 22],
        zoom: 3.7,
        attributionControl: false,
        style: {
          version: 8,
          sources: {
            land: {
              type: "geojson",
              data: "/data/countries.geojson",
              attribution: "Boundaries: Natural Earth",
            },
            streets: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
            imagery: {
              type: "raster",
              tiles: [
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              ],
              tileSize: 256,
              attribution: "Tiles © Esri — imagery dates vary",
            },
          },
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#dce8ed" },
            },
            {
              id: "land",
              source: "land",
              type: "fill",
              paint: { "fill-color": "#eef0e8" },
            },
            {
              id: "borders",
              source: "land",
              type: "line",
              paint: { "line-color": "#c4cdc6", "line-width": 0.7 },
            },
            {
              id: "streets",
              source: "streets",
              type: "raster",
              paint: { "raster-opacity": 0.72, "raster-saturation": -0.85 },
            },
            {
              id: "imagery",
              source: "imagery",
              type: "raster",
              layout: { visibility: "none" },
            },
          ],
        },
      });
      map.current = m;
      m.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-right",
      );
      m.on("load", () => setReady(true));
      m.on("error", () => {
        /* Cached country boundaries and the facility list remain available when tiles fail. */
      });
      const resize = new ResizeObserver(() => m.resize());
      resize.observe(container.current);
      return () => {
        resize.disconnect();
        markers.current.forEach((marker) => marker.remove());
        m.remove();
        map.current = null;
      };
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    const max = Math.max(...assets.map((a) => a.emissionsQuantity), 1);
    for (const a of assets) {
      const el = document.createElement("button");
      el.className = `plant-marker ${a.id === selected ? "selected" : ""}`;
      el.setAttribute("aria-label", `Inspect ${a.name}`);
      el.title = `${a.name} · ${mt(a.emissionsQuantity)} Mt CO₂e`;
      el.style.setProperty("--marker-color", assetColor(a));
      el.style.width =
        el.style.height = `${12 + Math.sqrt(a.emissionsQuantity / max) * 18}px`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        click.current(a.id);
      });
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([a.centroid.longitude, a.centroid.latitude])
        .addTo(m);
      markers.current.push(marker);
    }
  }, [assets, selected, ready]);
  useEffect(() => {
    if (ready && selected === null) fit();
  }, [company, ready, assets]);
  useEffect(() => {
    if (!ready || !selected) return;
    const a = assets.find((a) => a.id === selected);
    if (a)
      map.current?.flyTo({
        center: [a.centroid.longitude, a.centroid.latitude],
        zoom: 6.7,
        speed: 1.1,
        essential: false,
      });
  }, [selected, ready]);
  useEffect(() => {
    if (ready) {
      map.current?.setLayoutProperty(
        "imagery",
        "visibility",
        satellite ? "visible" : "none",
      );
      map.current?.setLayoutProperty(
        "streets",
        "visibility",
        satellite ? "none" : "visible",
      );
    }
  }, [satellite, ready]);
  return (
    <div className={`map-shell ${satellite ? "satellite" : ""}`}>
      <div
        ref={container}
        className="map-canvas"
        aria-label="Interactive map of company-linked facilities"
      />
      {failed && (
        <div className="map-fallback">
          <Globe2 size={36} />
          <h3>Map rendering unavailable</h3>
          <p>
            Use the facility list below to inspect every location and source.
          </p>
        </div>
      )}
      <div className="map-top">
        <div className="map-segment">
          <button
            className={!satellite ? "active" : ""}
            onClick={() => setSatellite(false)}
          >
            Map
          </button>
          <button
            className={satellite ? "active" : ""}
            onClick={() => setSatellite(true)}
          >
            Satellite
          </button>
        </div>
        <span className="map-location">
          <span className="live-dot" /> {assets.length} matching facilities
        </span>
      </div>
      <div className="map-controls">
        <button aria-label="Zoom in" onClick={() => map.current?.zoomIn()}>
          <Plus size={17} />
        </button>
        <button aria-label="Zoom out" onClick={() => map.current?.zoomOut()}>
          <Minus size={17} />
        </button>
        <button aria-label="Fit all facilities" onClick={fit}>
          <Maximize2 size={16} />
        </button>
        <button
          aria-label="Toggle map tilt"
          aria-pressed={tilt}
          onClick={() => {
            setTilt(!tilt);
            map.current?.easeTo({ pitch: tilt ? 0 : 40, duration: 700 });
          }}
        >
          <Layers3 size={16} />
        </button>
      </div>
      {selected !== null && assets.some((a) => a.id === selected) && (
        <a className="map-selection" href="#facility-inspector">
          {assets.find((a) => a.id === selected)?.name}
          <strong>View facility details ↓</strong>
        </a>
      )}
      <div className="map-legend">
        <span>
          <i style={{ background: "#0f827d" }} /> Coal / power
        </span>
        <span>
          <i style={{ background: "#d49b46" }} /> Gas
        </span>
        <span>
          <i style={{ background: "#6e7bb9" }} /> Steel
        </span>
        <span>
          <i style={{ background: "#a78a76" }} /> Mixed
        </span>
        <span>
          <i style={{ background: "#80a98a" }} /> Other
        </span>
        <small>Size = facility emissions</small>
      </div>
      <button className="map-reset" onClick={fit}>
        <Crosshair size={14} /> Reset view
      </button>
      {satellite && (
        <span className="imagery-note">
          Context imagery · capture dates vary · not an emissions measurement
        </span>
      )}
    </div>
  );
}
