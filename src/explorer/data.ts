import { unprojectMars } from "../contracts/index.ts";
import { habitatPresets, wildcatRidge } from "../data/sites.ts";
import type { Catalog, CatalogEvent, EnvironmentObservation, LayerEntry, LayerManifest } from "./catalog.ts";
import { insideMarswalkCoverage } from "./catalog.ts";
import { TYPE_ACCENT } from "./accents.ts";
import type { GlobeMarker, OverlayFeature, TileSource } from "./types.ts";

// Data files are optional at build time: a missing file yields an empty, clearly reported state.
const catalogFiles = import.meta.glob<Catalog>("../../data/mars/catalog/events.json", { import: "default" });
const environmentFiles = import.meta.glob<{ observations: EnvironmentObservation[] }>("../../data/mars/catalog/environment.json", { import: "default" });
const manifestFiles = import.meta.glob<LayerManifest>("../../data/mars/layers/manifest.json", { import: "default" });

export interface ExplorerData {
  catalog: Catalog | null;
  environment: EnvironmentObservation[];
  manifest: LayerManifest | null;
  missing: string[];
}

async function first<T>(files: Record<string, () => Promise<T>>): Promise<T | null> {
  const loader = Object.values(files)[0];
  return loader ? loader() : null;
}

export async function loadExplorerData(): Promise<ExplorerData> {
  const [catalog, environment, manifest] = await Promise.all([first(catalogFiles), first(environmentFiles), first(manifestFiles)]);
  const missing: string[] = [];
  if (!catalog) missing.push("historical event catalog");
  if (!manifest) missing.push("global layer manifest");
  return { catalog, environment: environment?.observations ?? [], manifest, missing };
}

/** Served path of a bundled public file, relative so the build works in a subdirectory. */
export const publicUrl = (path: string) => `./${path.replace(/^\.?\//, "")}`;

export const DEFAULT_BASEMAP = { file: "layers/global/viking-color.jpg", sharp: "layers/global/viking-color-3840.jpg", small: "layers/global/viking-color-1k.jpg" };

/** The hypothetical crew landing: the default Marswalk habitat, shown with the rocket model. */
export const CREW_LANDING = (() => {
  const h = habitatPresets[0];
  const { latitudePlanetocentricDeg: lat, longitudeEastDeg: lon } = unprojectMars(h.location);
  return { id: "crew-landing-wildcat", habitatId: h.id, title: `Hypothetical crew landing · ${h.name}`, lat, lon };
})();

export const WILDCAT_LATLON = (() => {
  const { latitudePlanetocentricDeg: lat, longitudeEastDeg: lon } = unprojectMars(wildcatRidge.location);
  return { lat, lon };
})();

export function markerFor(event: CatalogEvent): GlobeMarker | null {
  if (!event.location) return null;
  return {
    id: event.id,
    kind: "flag",
    lat: event.location.lat,
    lon: event.location.lon,
    label: `${event.title}. ${event.mission}${event.sol != null ? `, sol ${event.sol}` : ""}${event.observed ? "" : ". Proposed, not observed"}`,
    accent: TYPE_ACCENT[event.type] ?? "#69D5FF",
    flag: true,
    footprintKm: event.location.precision === "regional" ? event.location.footprintKm ?? 20 : null,
    path: event.path,
  };
}

export function crewMarker(): GlobeMarker {
  return {
    id: CREW_LANDING.id, kind: "rocket", lat: CREW_LANDING.lat, lon: CREW_LANDING.lon,
    label: `${CREW_LANDING.title}. Simulated, not a real landing`, accent: "#69D5FF", flag: false,
  };
}

export function routingAvailability(event: CatalogEvent): { available: boolean; text: string } {
  if (!event.location) return { available: false, text: "Marswalk routing unavailable: this record has no defensible location." };
  if (insideMarswalkCoverage(event.location)) return { available: true, text: "Marswalk routing available: inside the verified 1 m Wildcat Ridge elevation grid." };
  return { available: true, text: "Global terrain estimates use coarse MOLA elevation. Walking-scale hazards cannot be resolved here." };
}

/** Finer Trek tiles for the active basemap, when the manifest says that layer is tiled. */
export function tileSourceFrom(manifest: LayerManifest | null, basemap: LayerEntry | undefined): TileSource | null {
  const t = manifest?.onDemandTiles;
  const layer = basemap?.trekLayerId;
  if (!t?.template || !layer || !(t.layers ?? []).includes(layer)) return null;
  const detail = t.layerDetails?.[layer] ?? { ext: "jpg", maxZoom: t.maxZoom };
  if (!(detail.maxZoom > 0)) return null;
  const template = t.template.replace("<layer>", layer).replace(/\.jpg$/, `.${detail.ext}`);
  return {
    url: (level, row, col) => template.replace("{z}", String(level)).replace("{row}", String(row)).replace("{col}", String(col)),
    // Trek equirectangular WMTS: level 0 is 2 × 1 tiles, and each level doubles both.
    colsAt: (level) => 2 ** (level + 1),
    rowsAt: (level) => 2 ** level,
    maxZoom: detail.maxZoom,
    cors: !!t.cors && t.cors !== "none",
  };
}

/** Load a layer's GeoJSON and colour each feature by the legend stop matching one of its properties. */
export async function loadFeatures(entry: LayerEntry): Promise<OverlayFeature[]> {
  const response = await fetch(publicUrl(entry.featuresFile!));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json() as { features: { geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }[] };
  const stops = entry.legend?.stops ?? [];
  const fallback = stops[0]?.color ?? "#EAF2FF";
  const out: OverlayFeature[] = [];
  for (const f of json.features) {
    const values = Object.values(f.properties ?? {}).map(String);
    const color = stops.find((s) => values.includes(String(s.value)))?.color ?? fallback;
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Point") { const [lon, lat] = g.coordinates as number[]; out.push({ kind: "point", lat, lon, color }); }
    else if (g.type === "Polygon") out.push({ kind: "polygon", rings: g.coordinates as [number, number][][], color });
    else if (g.type === "MultiPolygon") for (const p of g.coordinates as [number, number][][][]) out.push({ kind: "polygon", rings: p, color });
  }
  return out;
}

/** Lazily loaded MOLA elevation grid (float32, metres above the MOLA areoid, row 0 = 90° N). */
export async function loadMolaElevation(entry: LayerEntry): Promise<(lat: number, lon: number) => number | null> {
  const response = await fetch(publicUrl(entry.file));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const grid = new Float32Array(await response.arrayBuffer());
  const { width, height } = entry;
  return (lat, lon) => {
    const col = Math.min(width - 1, Math.floor(((lon + 180) / 360) * width));
    const row = Math.min(height - 1, Math.floor(((90 - lat) / 180) * height));
    const v = grid[row * width + col];
    return Number.isFinite(v) ? v : null;
  };
}

export function nearbyObservations(environment: readonly EnvironmentObservation[], event: CatalogEvent, km = 60) {
  if (!event.location) return [];
  const { lat, lon } = event.location;
  return environment.filter((o) => {
    const dLat = (o.location.lat - lat) * 59.27, dLon = (o.location.lon - lon) * 59.27 * Math.cos((lat * Math.PI) / 180);
    return Math.hypot(dLat, dLon) <= km;
  });
}
