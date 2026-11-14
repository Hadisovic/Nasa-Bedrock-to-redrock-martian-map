import { cellCenter, groundDistanceM } from "../contracts/index.ts";
import type {
  MapLayer, MissionAssessment, MissionAssumptions, MissionEstimate, ProjectedPoint,
  Provenance, RoundTrip, RouteLeg, RouteRequest, RouteResult, ScienceSite, TerrainGrid,
} from "../contracts/index.ts";

const provenance: Provenance = {
  mission: "Synthetic fixture",
  instrument: "None",
  sources: [],
  limitations: ["Simulated values for contract tests and consumer integration."],
};

const terrain: TerrainGrid = {
  layout: { westM: 4_588_016, northM: 1_094_320, pixelSizeM: 10, width: 4, height: 3 },
  elevationsM: new Float32Array([
    0, 0, 0, 0,
    0, 1, 1, 0,
    0, 1, 1, 0,
  ]),
  verticalDatum: "Synthetic datum",
  provenance,
};

const point = (row: number, column: number) => cellCenter(terrain.layout, { row, column });
const habitat = point(1, 0);
const destination = point(1, 3);

function leg(geometry: readonly ProjectedPoint[], maxAbsSlopeDeg: number): RouteLeg {
  const horizontalDistanceM = geometry.slice(1).reduce(
    (sum, end, index) => sum + groundDistanceM(geometry[index], end), 0,
  );
  return { geometry, horizontalDistanceM, maxAbsSlopeDeg };
}

const directStep = groundDistanceM(habitat, point(1, 1));
const directSlope = Math.atan2(1, directStep) * 180 / Math.PI;
const direct = leg([habitat, point(1, 1), point(1, 2), destination], directSlope);
const gentler = leg([habitat, point(0, 0), point(0, 1), point(0, 2), point(0, 3), destination], 0);

function roundTrip(outbound: RouteLeg): RoundTrip {
  return { outbound, return: { ...outbound, geometry: [...outbound.geometry].reverse() } };
}

const request: RouteRequest = { habitat, destination, terrain, maxAbsSlopeDeg: 25, slopePenaltyWeight: 10 };
const usable = {
  status: "available",
  shortest: roundTrip(direct),
  alternative: { status: "distinct", terrainWeighted: roundTrip(gentler) },
  terrainProvenance: provenance,
  warnings: provenance.limitations,
} satisfies RouteResult;

export const routeFixtures = {
  usable: { request, result: usable },
  missingTerrain: {
    request: { ...request, terrain: { ...terrain, elevationsM: new Float32Array([
      0, 0, 0, 0,
      0, 1, 1, NaN,
      0, 1, 1, 0,
    ]) } },
    result: { status: "unavailable", reason: "missing-terrain", detail: "Destination elevation is missing." },
  },
  noRoute: {
    request: { ...request, terrain: { ...terrain, elevationsM: new Float32Array([
      0, 1000, 1000, 0,
      0, 1000, 1000, 0,
      0, 1000, 1000, 0,
    ]) } },
    result: {
      status: "no-route", reason: "no-traversable-path", detail: "A steep ridge blocks both directions.",
      terrainProvenance: provenance,
    },
  },
  coincident: {
    request: { ...request, slopePenaltyWeight: 0 },
    result: { ...usable, alternative: { status: "coincident" } },
  },
} satisfies Record<string, { request: RouteRequest; result: RouteResult }>;

export const scienceSite: ScienceSite = {
  id: "fixture-site",
  name: "Simulated science destination",
  location: destination,
  locationMethod: "Center of a synthetic terrain cell.",
  observation: "Synthetic observation.",
  objective: "Exercise destination selection and science handoff.",
  provenance,
};

export const layerFixtures: readonly MapLayer[] = [
  { id: "terrain", label: "Synthetic terrain", kind: "elevation", status: "available", terrain, provenance },
  { id: "science", label: "Synthetic science", kind: "science", status: "available", sites: [scienceSite], provenance },
  { id: "imagery", label: "Imagery", kind: "imagery", status: "unavailable", detail: "No imagery in fixture.", provenance },
];

const assumptions: MissionAssumptions = { walkingSpeedMps: 0.5, scienceStopS: 120, timeBudgetS: 600, reserveS: 60 };

function estimate(trip: RoundTrip): MissionEstimate {
  const outboundS = trip.outbound.horizontalDistanceM / assumptions.walkingSpeedMps;
  const returnS = trip.return.horizontalDistanceM / assumptions.walkingSpeedMps;
  const elapsedS = outboundS + returnS + assumptions.scienceStopS;
  return { outboundS, returnS, elapsedS, returnMarginS: assumptions.timeBudgetS - elapsedS - assumptions.reserveS };
}

export const missionFixture: MissionAssessment = {
  status: "assessed",
  assumptions,
  shortest: estimate(usable.shortest),
  terrainWeighted: estimate(usable.alternative.terrainWeighted),
};
