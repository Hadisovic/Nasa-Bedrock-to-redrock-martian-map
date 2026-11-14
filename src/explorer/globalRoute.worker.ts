import { routeGlobalLeg } from "./globalRouting.ts";
import type { DirectionalRoute, ElevationGrid, GlobalRouteLeg, LegTerrain } from "./globalRouting.ts";
import { greatCircleKm, wrapLon } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import { insideMarswalkCoverage } from "./catalog.ts";
import { projectMars, unprojectMars } from "../contracts/coordinates.ts";
import { cellAt } from "../contracts/index.ts";
import type { RouteLeg, TerrainGrid } from "../contracts/index.ts";
import { galeElevationFile, galeLayout, nearGale } from "./galeLayout.ts";

export interface LegRequest {
  id: number; start: LatLon; end: LatLon; slope: number; url: string;
  width: number; height: number; base: string; blocked: LatLon | null;
}
export type LegResponse = { id: number; result: DirectionalRoute };

let jezero: ReturnType<typeof loadJezeroTerrain> | undefined;
const grids = new Map<string, Promise<ElevationGrid>>();

async function loadJezeroTerrain() {
  const [{ decodeJezeroRaster }, { default: url }] = await Promise.all([
    import("../contracts/jezero.ts"), import("../../data/mars/jezero/elevation.tif?url"),
  ]);
  const response = await fetch(new URL(url, self.location.href));
  if (!response.ok) throw new Error("The local elevation file could not be loaded.");
  return (await decodeJezeroRaster(await response.arrayBuffer(), "elevation")).terrain;
}

const project = ({ lat, lon }: LatLon) => projectMars({ latitudePlanetocentricDeg: lat, longitudeEastDeg: lon });
const unproject = (point: ReturnType<typeof project>) => {
  const { latitudePlanetocentricDeg: lat, longitudeEastDeg: lon } = unprojectMars(point);
  return { lat, lon };
};

async function localRoute(source: TerrainGrid, start: LatLon, end: LatLon, slope: number, terrainInfo: LegTerrain,
  blocked: LatLon | null): Promise<DirectionalRoute> {
  const { planDirectionalLeg, climbAlong, nearestConnectedPoint } = await import("../analysis/routing.ts");
  const cell = blocked && cellAt(source.layout, project(blocked));
  const terrain = cell ? { ...source, elevationsM: source.elevationsM.slice() } : source;
  if (cell) terrain.elevationsM[cell.row * terrain.layout.width + cell.column] = NaN;
  const plan = (from: LatLon, to: LatLon) => planDirectionalLeg({
    terrain, habitat: project(from), destination: project(to), maxAbsSlopeDeg: slope, slopePenaltyWeight: 4,
  });
  const leg = (route: RouteLeg, from: LatLon, to: LatLon): GlobalRouteLeg => {
    const points = route.geometry.map(unproject);
    points[0] = from;
    points[points.length - 1] = to;
    return { points, distanceKm: route.horizontalDistanceM / 1000, maxSlopeDeg: route.maxAbsSlopeDeg,
      climbM: climbAlong(terrain, route).gainM, elevationsM: route.geometry.map((point) => {
        const sample = cellAt(terrain.layout, point);
        const z = sample && terrain.elevationsM[sample.row * terrain.layout.width + sample.column];
        return typeof z === "number" && Number.isFinite(z) ? z : null;
      }) };
  };
  const result = plan(start, end);
  if (result.status === "available") {
    return { status: "ok", shortest: leg(result.shortest, start, end),
      alternative: result.alternative && leg(result.alternative, start, end), terrain: terrainInfo };
  }

  const failure = { status: result.status, detail: result.detail, terrain: terrainInfo };
  if (!(slope > 0 && slope < 90)) return failure;
  const radius = Math.max(80, terrain.layout.pixelSizeM * 6);
  const nearEnd = nearestConnectedPoint(terrain, project(start), project(end), slope, radius);
  const candidate = nearEnd ?? nearestConnectedPoint(terrain, project(end), project(start), slope, radius);
  if (!candidate) return failure;
  const point = unproject(candidate);
  const from = nearEnd ? start : point, to = nearEnd ? point : end;
  const preview = plan(from, to);
  if (preview.status !== "available") return failure;
  return { ...failure, suggestion: { point, endpoint: nearEnd ? "end" : "start",
    movedKm: greatCircleKm(nearEnd ? end : start, point), preview: leg(preview.shortest, from, to) } };
}

function loadGrid(url: string, width: number, height: number) {
  const cached = grids.get(url);
  if (cached) return cached;
  const request = fetch(url).then(async (response) => {
    if (!response.ok) throw new Error("Elevation file unavailable.");
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== width * height * 4) throw new Error("Elevation grid dimensions do not match the manifest.");
    return { width, height, elevations: new Float32Array(buffer) };
  });
  grids.set(url, request);
  request.catch(() => grids.delete(url));
  return request;
}

async function calculate({ start, end, slope, url, width, height, base, blocked }: LegRequest): Promise<DirectionalRoute> {
  if (insideMarswalkCoverage(start) && insideMarswalkCoverage(end)) {
    const terrain = await (jezero ??= loadJezeroTerrain().catch((error) => { jezero = undefined; throw error; }));
    return localRoute(terrain, start, end, slope,
      { label: "Wildcat Ridge HiRISE", spacingM: terrain.layout.pixelSizeM, regional: false }, blocked);
  }
  if (nearGale(start) && nearGale(end)) {
    const { elevations } = await loadGrid(new URL(galeElevationFile, base).href, galeLayout.width, galeLayout.height);
    const terrain = { layout: galeLayout, elevationsM: elevations, verticalDatum: "MOLA",
      provenance: { mission: "Mars Reconnaissance Orbiter and Mars Express", instrument: "HiRISE, CTX and HRSC",
        sources: [{ title: "USGS Gale elevation model", url: "https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m" }],
        limitations: ["20 m bilinear sample of a mixed-resolution terrain mosaic via NASA Mars Trek."] } };
    return localRoute(terrain, start, end, slope, { label: "Gale Crater terrain", spacingM: galeLayout.pixelSizeM, regional: false }, blocked);
  }

  const grid = await loadGrid(url, width, height);
  const route = routeGlobalLeg(grid, start, end, slope);
  if (!blocked || route.status !== "ok") return route;
  // Coarse routing cannot evade a reported obstacle within a cell used by this leg.
  const key = ({ lat, lon }: LatLon) => [
    Math.min(height - 1, Math.floor((90 - lat) / 180 * height)), Math.floor((wrapLon(lon) + 180) / 360 * width),
  ].join(":");
  const cell = key(blocked);
  const intersects = (leg: GlobalRouteLeg) => leg.points.some((point) => key(point) === cell);
  if (intersects(route.shortest)) return { status: "unavailable", terrain: route.terrain, detail: "A reported obstacle is on this leg. Coarse MOLA cannot resolve a detour around it." };
  return route.alternative && intersects(route.alternative) ? { ...route, alternative: undefined } : route;
}

self.onmessage = async ({ data }: MessageEvent<LegRequest>) => {
  let result: DirectionalRoute;
  try { result = await calculate(data); }
  catch {
    result = { status: "unavailable", retryable: true, detail: "The required elevation data could not be loaded. Check that this terrain pack is available." };
  }
  self.postMessage({ id: data.id, result } satisfies LegResponse);
};
