import type { StyleSpecification } from "maplibre-gl";

// Terrain: AWS Open Data "Terrain Tiles" (Mapzen terrarium encoding, SRTM/GMTED/NED blend), no key.
export const DEM_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

export type StyleOpts = { imagery?: boolean; labels?: boolean; hillshade?: boolean; tone?: "console" | "sand" };

/** One style with every base layer present; visibility is toggled at runtime so terrain survives switches. */
export function consoleStyle(o: StyleOpts = {}): StyleSpecification {
  const sand = o.tone === "sand";
  return {
    version: 8,
    sources: {
      base: { type: "raster", tiles: [`${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 16, attribution: "Basemap © Esri" },
      ref: { type: "raster", tiles: [`${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 16 },
      imagery: { type: "raster", tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" },
      dem: { type: "raster-dem", tiles: [DEM_TILES], tileSize: 256, maxzoom: 14, encoding: "terrarium", attribution: "Terrain: AWS Open Data Terrain Tiles" },
      demShade: { type: "raster-dem", tiles: [DEM_TILES], tileSize: 256, maxzoom: 14, encoding: "terrarium" },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": sand ? "#14110c" : "#07090a" } },
      { id: "base", type: "raster", source: "base", layout: { visibility: sand ? "none" : "visible" }, paint: { "raster-opacity": 0.9, "raster-saturation": -0.4 } },
      {
        id: "imagery", type: "raster", source: "imagery", layout: { visibility: o.imagery || sand ? "visible" : "none" },
        paint: sand
          ? { "raster-saturation": -1, "raster-contrast": 0.25, "raster-brightness-min": 0.04, "raster-brightness-max": 0.78 }
          : { "raster-saturation": -0.15, "raster-contrast": 0.05, "raster-brightness-max": 0.9 },
      },
      ...(sand ? [{ id: "tone", type: "background", paint: { "background-color": "#b8915a", "background-opacity": 0.2 } } as const] : []),
      {
        id: "hillshade", type: "hillshade", source: "demShade", layout: { visibility: o.hillshade || sand ? "visible" : "none" },
        paint: sand
          ? { "hillshade-shadow-color": "rgba(10,7,3,0.85)", "hillshade-highlight-color": "rgba(240,222,188,0.55)", "hillshade-accent-color": "rgba(90,70,40,0.4)", "hillshade-exaggeration": 1, "hillshade-illumination-direction": 300 }
          : { "hillshade-shadow-color": "#000000", "hillshade-highlight-color": "#9aa39d", "hillshade-accent-color": "#2b3330", "hillshade-exaggeration": 0.55 },
      },
      { id: "ref", type: "raster", source: "ref", layout: { visibility: o.labels === false || sand ? "none" : "visible" }, paint: { "raster-opacity": 0.75 } },
    ],
    sky: sand
      ? { "sky-color": "#07090a", "horizon-color": "#2a2217", "fog-color": "#07090a", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.5, "fog-ground-blend": 0.35 }
      : { "sky-color": "#07090a", "horizon-color": "#121a1c", "fog-color": "#07090a", "sky-horizon-blend": 0.5, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.4 },
  } as StyleSpecification;
}
