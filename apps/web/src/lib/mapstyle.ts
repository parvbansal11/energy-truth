import type { StyleSpecification } from "maplibre-gl";

// Terrain: AWS Open Data "Terrain Tiles" (Mapzen terrarium encoding, SRTM/GMTED/NED blend), no key.
export const DEM_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

export type StyleOpts = { imagery?: boolean; labels?: boolean; hillshade?: boolean; tone?: "console" | "hero" };

/** One style with every base layer present; visibility is toggled at runtime so terrain survives switches. */
export function consoleStyle(o: StyleOpts = {}): StyleSpecification {
  const hero = o.tone === "hero";
  return {
    version: 8,
    sources: {
      base: { type: "raster", tiles: [`${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 16, attribution: "Basemap © Esri" },
      ref: { type: "raster", tiles: [`${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 16 },
      imagery: { type: "raster", tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" },
      dem: { type: "raster-dem", tiles: [DEM_TILES], tileSize: 256, maxzoom: 14, encoding: "terrarium", attribution: "Terrain: AWS Open Data Terrain Tiles" },
      demShade: { type: "raster-dem", tiles: [DEM_TILES], tileSize: 256, maxzoom: 14, encoding: "terrarium" },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#efece4" } },
      { id: "base", type: "raster", source: "base", layout: { visibility: hero ? "none" : "visible" }, paint: { "raster-opacity": 1, "raster-saturation": -0.2, "raster-brightness-min": 0.04 } },
      {
        id: "imagery", type: "raster", source: "imagery", layout: { visibility: o.imagery || hero ? "visible" : "none" },
        paint: hero
          ? { "raster-saturation": -0.25, "raster-contrast": 0.08, "raster-brightness-min": 0.12, "raster-brightness-max": 1 }
          : { "raster-saturation": -0.1, "raster-brightness-min": 0.05 },
      },
      {
        id: "hillshade", type: "hillshade", source: "demShade", layout: { visibility: o.hillshade || hero ? "visible" : "none" },
        paint: hero
          ? { "hillshade-shadow-color": "rgba(60,48,30,0.45)", "hillshade-highlight-color": "rgba(255,248,232,0.35)", "hillshade-accent-color": "rgba(60,48,30,0.2)", "hillshade-exaggeration": 0.7, "hillshade-illumination-direction": 300 }
          : { "hillshade-shadow-color": "rgba(80,74,62,0.35)", "hillshade-highlight-color": "rgba(255,255,255,0.4)", "hillshade-accent-color": "rgba(80,74,62,0.15)", "hillshade-exaggeration": 0.45 },
      },
      { id: "ref", type: "raster", source: "ref", layout: { visibility: o.labels === false || hero ? "none" : "visible" }, paint: { "raster-opacity": 0.85 } },
    ],
    sky: { "sky-color": "#eef1f2", "horizon-color": "#f6f4ef", "fog-color": "#f6f4ef", "sky-horizon-blend": 0.5, "horizon-fog-blend": 0.55, "fog-ground-blend": 0.45 },
  } as StyleSpecification;
}
