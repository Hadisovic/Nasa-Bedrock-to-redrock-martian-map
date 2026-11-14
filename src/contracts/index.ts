import { cellAt } from "./coordinates.ts";
import type { ProjectedPoint, RasterLayout } from "./coordinates.ts";

export * from "./coordinates.ts";

export interface Provenance {
  mission: string;
  instrument: string;
  sources: readonly { title: string; url: string }[];
  observationPeriod?: string;
  limitations: readonly string[];
}

export interface TerrainGrid {
  layout: RasterLayout;
  /** Row-major meters above the source geoid. NaN marks no data. */
  elevationsM: Float32Array;
  verticalDatum: string;
  provenance: Provenance;
}

export function elevationAt(terrain: TerrainGrid, point: ProjectedPoint): number | undefined {
  const cell = cellAt(terrain.layout, point);
  if (cell) {
    const elevationM = terrain.elevationsM[cell.row * terrain.layout.width + cell.column];
    if (Number.isFinite(elevationM)) return elevationM;
  }
}

export interface ScienceSite {
  id: string;
  name: string;
  location: ProjectedPoint;
  locationMethod: string;
  observation: string;
  objective: string;
  provenance: Provenance;
}

type LayerData =
  | { kind: "imagery"; layout: RasterLayout; grayscaleDn: Uint8Array; noDataDn: number }
  | { kind: "elevation"; terrain: TerrainGrid }
  | { kind: "science"; sites: readonly ScienceSite[] };

export type MapLayer = { id: string; label: string; provenance: Provenance } & (
  | ({ status: "available" } & LayerData)
  | { status: "unavailable"; kind: LayerData["kind"]; detail: string }
);

export interface RouteRequest {
  habitat: ProjectedPoint;
  destination: ProjectedPoint;
  terrain: TerrainGrid | null;
  maxAbsSlopeDeg: number;
  slopePenaltyWeight: number;
}

export interface RouteLeg {
  geometry: readonly ProjectedPoint[];
  horizontalDistanceM: number;
  maxAbsSlopeDeg: number;
}

export interface RoundTrip {
  outbound: RouteLeg;
  return: RouteLeg;
}

export type RouteResult =
  | {
      status: "available";
      shortest: RoundTrip;
      alternative:
        | { status: "distinct"; terrainWeighted: RoundTrip }
        | { status: "coincident" }
        | { status: "unavailable"; detail: string };
      terrainProvenance: Provenance;
      warnings: readonly string[];
    }
  | {
      status: "unavailable";
      reason: "terrain-unavailable" | "missing-terrain" | "outside-coverage" | "invalid-request";
      detail: string;
    }
  | {
      status: "no-route";
      reason: "blocked-endpoint" | "no-traversable-path";
      detail: string;
      terrainProvenance: Provenance;
    };

export interface MissionAssumptions {
  walkingSpeedMps: number;
  scienceStopS: number;
  timeBudgetS: number;
  reserveS: number;
}

export interface MissionEstimate {
  outboundS: number;
  returnS: number;
  elapsedS: number;
  /** Time budget minus elapsed time and reserve. A negative value means over budget. */
  returnMarginS: number;
}

export type MissionAssessment =
  | {
      status: "assessed";
      assumptions: MissionAssumptions;
      shortest: MissionEstimate;
      terrainWeighted?: MissionEstimate;
    }
  | { status: "unavailable"; reason: "route-unavailable" | "invalid-assumptions"; detail: string };
