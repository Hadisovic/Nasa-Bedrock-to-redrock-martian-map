import { cellAt, projectMars } from "../contracts/index.ts";
import { ELEVATION_LAYOUT } from "../data/sites.ts";
import type { LatLon } from "./geo.ts";

export type EventType =
  | "landing" | "rover-stop" | "science-observation" | "sample" | "sample-depot"
  | "hardware" | "flight" | "proposed-path" | "end-of-mission";

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  landing: "Landing",
  "rover-stop": "Rover stop",
  "science-observation": "Science observation",
  sample: "Sample collected",
  "sample-depot": "Sample depot",
  hardware: "Mission hardware",
  flight: "Helicopter flight",
  "proposed-path": "Proposed path (not observed)",
  "end-of-mission": "End of mission",
};

export type Precision = "precise" | "approximate" | "regional";

export interface SourceLink { title: string; url: string }

export interface CatalogEvent {
  id: string;
  title: string;
  date: string | null;
  sol: number | null;
  mission: string;
  missionId: string;
  type: EventType;
  observed: boolean;
  summary: string;
  found: string | null;
  scientificValue: string | null;
  region: string | null;
  aliases: string[];
  location: null | {
    lat: number; lon: number; precision: Precision;
    uncertaintyM?: number | null; footprintKm?: number | null;
    coordinateSource: SourceLink & { note?: string };
  };
  path?: LatLon[];
  evidence: SourceLink[];
  media: { url: string; credit: string; caption?: string }[];
  sourceIds: string[];
  reasonUnlocated?: string;
}

export interface Catalog {
  generatedAt: string;
  sources: (SourceLink & { id: string })[];
  events: CatalogEvent[];
  unlocated: CatalogEvent[];
  counts: { bySource: Record<string, { mapped: number; approximate: number; unlocated: number }>; total: { mapped: number; approximate: number; unlocated: number } };
}

export interface EnvironmentObservation {
  id: string;
  kind: string;
  measures: string;
  value?: number; min?: number; max?: number;
  unit: string;
  sol?: number | null; date?: string | null; localTime?: string | null;
  location: { lat: number; lon: number; precision: string };
  instrument: string; mission: string;
  source: SourceLink;
}

export interface LayerLegendStop { value: number | string; color: string; label: string }

export interface LayerEntry {
  id: string;
  title: string;
  group: "terrain" | "materials" | "weather" | "hazards";
  trekLayerId?: string;
  productId?: string | null;
  mission?: string; instrument?: string;
  measures: string;
  units?: string | null;
  verticalDatum?: string | null;
  treatment: string;
  legend?: { type: "gradient" | "categorical" | "none"; stops?: LayerLegendStop[]; note?: string; range?: { label?: string } };
  global: boolean;
  coverage: { west: number; east: number; south: number; north: number };
  /** Image georeference; may extend beyond valid pixels, which preserve their alpha mask. */
  rasterBounds?: LayerEntry["coverage"];
  sourceResolution?: string; shippedResolution?: string;
  observationDates?: string;
  file: string; width: number; height: number;
  /** Optional source vectors (GeoJSON) for point and outline products. */
  featuresFile?: string;
  hasTransparency?: boolean;
  credit: string; terms?: string;
  sourceUrls?: string[];
}

export interface LayerManifest {
  basemap: string;
  onDemandTiles?: { template: string; maxZoom: number; cors?: string; layers?: string[]; tileMatrix?: string; layerDetails?: Record<string, { ext: string; maxZoom: number }> };
  layers: LayerEntry[];
  excluded: { id: string; title: string; reason: string; sourceUrl?: string }[];
}

/** Raster layers that can be drawn as images (the manifest also lists numerical grids). */
export const isImageLayer = (l: LayerEntry) => /\.(jpe?g|png)$/i.test(l.file);
export const imageBounds = (layer: LayerEntry) => layer.rasterBounds ?? layer.coverage;

/** True when a location falls inside the verified 1 m Wildcat Ridge elevation crop. */
export function insideMarswalkCoverage(p: LatLon): boolean {
  return !!cellAt(ELEVATION_LAYOUT, projectMars({ longitudeEastDeg: p.lon, latitudePlanetocentricDeg: p.lat }));
}

const normalise = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Simple ranked search over titles, aliases, missions, regions, types and sols. */
export function searchEvents(events: readonly CatalogEvent[], query: string, limit = 12): CatalogEvent[] {
  const terms = normalise(query).split(/\s+/).filter(Boolean).map((term) => term === "samples" ? "sample" : term);
  if (!terms.length) return [];
  const scored: { event: CatalogEvent; score: number }[] = [];
  for (const event of events) {
    const title = normalise(event.title);
    const haystack = normalise([
      event.title, ...event.aliases, event.mission, event.region ?? "", EVENT_TYPE_LABEL[event.type],
      event.sol != null ? `sol ${event.sol}` : "", event.date ?? "",
    ].join(" | "));
    let score = 0;
    for (const term of terms) {
      if (!haystack.includes(term)) { score = -1; break; }
      score += title.startsWith(term) ? 3 : title.includes(term) ? 2 : 1;
    }
    if (score > 0) scored.push({ event, score });
  }
  scored.sort((a, b) => b.score - a.score || a.event.title.localeCompare(b.event.title));
  return scored.slice(0, limit).map((s) => s.event);
}

export interface CatalogFilter {
  missions: ReadonlySet<string>;
  types: ReadonlySet<EventType>;
  solMin: number | null;
  solMax: number | null;
  yearMin: number | null;
  yearMax: number | null;
}

export function matchesFilter(event: CatalogEvent, filter: CatalogFilter): boolean {
  if (filter.missions.size && !filter.missions.has(event.missionId)) return false;
  if (filter.types.size && !filter.types.has(event.type)) return false;
  if (filter.solMin != null && (event.sol == null || event.sol < filter.solMin)) return false;
  if (filter.solMax != null && (event.sol == null || event.sol > filter.solMax)) return false;
  const year = event.date ? Number(event.date.slice(0, 4)) : null;
  if (filter.yearMin != null && (year == null || year < filter.yearMin)) return false;
  if (filter.yearMax != null && (year == null || year > filter.yearMax)) return false;
  return true;
}

export const PRECISION_LABEL: Record<Precision, string> = {
  precise: "Precise rover or lander position",
  approximate: "Approximate location",
  regional: "Regional footprint only",
};
