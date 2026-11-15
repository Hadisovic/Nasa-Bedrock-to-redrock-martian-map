import { MARS_EQUIRECTANGULAR } from "../contracts/coordinates.ts";
import type { TerrainGrid } from "../contracts/index.ts";
import { containsTerrain, globalSource, readTrekElevation, regionalOnlineSources, windowBounds } from "./marsTrekTerrain.ts";
import type { LatLon } from "./geo.ts";

const gridSize = 256;
const metresPerDegree = MARS_EQUIRECTANGULAR.radiusM * Math.PI / 180;
const sources = [...regionalOnlineSources, globalSource];
const grids = new Map<string, Promise<Float32Array>>();

export async function loadTrekRouting(points: LatLon[], signal: AbortSignal) {
  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lon);
  const south = Math.min(...latitudes), north = Math.max(...latitudes);
  const west = Math.min(...longitudes), east = Math.max(...longitudes);
  for (const source of sources) {
    if (Math.max(north - south, east - west) > source.span * .78) continue;
    if (!points.every((point) => containsTerrain(source, point))) continue;

    const snap = (value: number) => Math.round(value / (source.span / 8)) * source.span / 8;
    const bounds = windowBounds(source, { lat: snap((north + south) / 2), lon: snap((west + east) / 2) });
    if (!points.every((point) => containsTerrain(bounds, point))) continue;
    const key = JSON.stringify([source.elevation, bounds]);
    try {
      let request = grids.get(key);
      if (!request) {
        request = readTrekElevation(source, bounds, gridSize, signal);
        grids.set(key, request);
        void request.catch(() => { if (grids.get(key) === request) grids.delete(key); });
        if (grids.size > 4) grids.delete(grids.keys().next().value!);
      }
      const elevationsM = await request;
      const pixelSizeM = (bounds.north - bounds.south) * metresPerDegree / gridSize;
      const sourceUrl = source === globalSource
        ? "https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m"
        : `https://trek.nasa.gov/mars/TrekWS/rest/cat/abstract?label=${encodeURIComponent(source.elevation)}`;
      const terrain: TerrainGrid = {
        elevationsM,
        layout: { pixelSizeM, westM: bounds.west * metresPerDegree, northM: bounds.north * metresPerDegree,
          width: gridSize, height: gridSize },
        verticalDatum: "NASA Mars Trek source elevation",
        provenance: { mission: "NASA Mars Trek", instrument: source.label,
          sources: [{ title: source.label, url: sourceUrl }],
          limitations: ["The sampled grid cannot resolve obstacles below the source resolution."] },
      };
      return { terrain, terrainInfo: { label: source.label, spacingM: Math.max(source.spacing, pixelSizeM),
        regional: source === globalSource, source: sourceUrl, bounds } };
    } catch {
      if (signal.aborted) return null;
    }
  }
  return null;
}
