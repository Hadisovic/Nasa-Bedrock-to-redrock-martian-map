import { greatCircleKm, wrapLon } from "./geo.ts";

const DOWNHILL_WEIGHT = 0.5;
import type { LatLon } from "./geo.ts";

export interface ElevationGrid {
  width: number;
  height: number;
  elevations: Float32Array;
}

export interface GlobalRouteLeg {
  points: LatLon[];
  distanceKm: number;
  maxSlopeDeg: number;
  climbM: number;
  elevationsM: (number | null)[];
  effort?: number;
}

export interface RoutePair { outbound: GlobalRouteLeg; returnLeg: GlobalRouteLeg }
export type LegTerrain = { label: string; spacingM: number; regional: boolean };
export type DirectionalRoute =
  | { status: "ok"; shortest: GlobalRouteLeg; alternative?: GlobalRouteLeg; energy?: GlobalRouteLeg; terrain: LegTerrain }
  | { status: "unavailable" | "no-route"; detail: string; terrain?: LegTerrain; retryable?: boolean;
      suggestion?: { point: LatLon; endpoint: "start" | "end"; movedKm: number; preview: GlobalRouteLeg } };
export type AvailableRoute = { status: "ok"; gridStepDeg: number; localSpacingM?: number; alternative?: RoutePair;
  terrain?: { label: string; spacingM: number; regional: boolean } } & RoutePair;
export type RouteSuggestion = {
  point: LatLon; movedKm: number; endpoint: "start" | "end"; preview: AvailableRoute;
};

export type GlobalRoute =
  | AvailableRoute
  | { status: "unavailable" | "no-route"; detail: string; suggestion?: RouteSuggestion; searchRadiusM?: number; retryable?: boolean };

const moves = [[-1, 0], [0, 1], [1, 0], [0, -1], [-1, 1], [1, 1], [1, -1], [-1, -1]] as const;

class Frontier {
  private entries: { node: number; cost: number }[] = [];
  get size() { return this.entries.length; }

  push(node: number, cost: number) {
    const entry = { node, cost };
    let index = this.entries.length;
    this.entries.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.entries[parent].cost <= cost) break;
      this.entries[index] = this.entries[parent];
      index = parent;
    }
    this.entries[index] = entry;
  }

  pop() {
    const root = this.entries[0];
    const end = this.entries.pop()!;
    let index = 0;
    while (index * 2 + 1 < this.entries.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.entries.length && this.entries[child + 1].cost < this.entries[child].cost) child++;
      if (this.entries[child].cost >= end.cost) break;
      this.entries[index] = this.entries[child];
      index = child;
    }
    if (this.entries.length) this.entries[index] = end;
    return root.node;
  }
}

export function elevationAt(grid: ElevationGrid, point: LatLon): number {
  return grid.elevations[cellIndex(grid, point)];
}

function cellIndex({ width, height }: ElevationGrid, { lat, lon }: LatLon) {
  const row = Math.min(height - 1, Math.max(0, Math.floor((90 - lat) / 180 * height)));
  const column = Math.floor((wrapLon(lon) + 180) / 360 * width);
  return row * width + column;
}

function cellCenter({ width, height }: ElevationGrid, index: number): LatLon {
  return {
    lat: 90 - (Math.floor(index / width) + 0.5) * 180 / height,
    lon: -180 + ((index % width) + 0.5) * 360 / width,
  };
}

function validPoint(point: LatLon) {
  return Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 && Number.isFinite(point.lon);
}

/** Regional estimates on a periodic planetocentric grid. The slope limit applies at the grid's scale. */
function searchGlobalLeg(grid: ElevationGrid, start: LatLon, end: LatLon, slopeLimit: number, weight: number) {
  const { width, height, elevations } = grid;
  const size = width * height;
  if (width < 3 || height < 2 || size !== elevations.length || !validPoint(start) || !validPoint(end) ||
      !Number.isFinite(slopeLimit) || slopeLimit <= 0 || slopeLimit >= 90) {
    return { status: "unavailable" as const, detail: "Check the endpoints, elevation grid, and slope limit." };
  }
  const first = cellIndex(grid, start), last = cellIndex(grid, end);
  if (!Number.isFinite(elevations[first]) || !Number.isFinite(elevations[last])) {
    return { status: "unavailable" as const, detail: "Elevation data is missing at one of the endpoints." };
  }
  if (first === last && greatCircleKm(start, end) > 1e-9) {
    return { status: "unavailable" as const, detail: "These points fall inside one coarse MOLA cell. Choose points farther apart to resolve this leg." };
  }

  const distanceByRow = Array.from({ length: height }, (_, row) => moves.map(([dy, dx]) => {
    const from = cellCenter(grid, row * width);
    return greatCircleKm(from, { lat: from.lat - dy * 180 / height, lon: from.lon + dx * 360 / width });
  }));
  const slopeRatio = Math.tan(slopeLimit * Math.PI / 180);
  const cost = new Float64Array(size).fill(Infinity);
  const previous = new Int32Array(size).fill(-1);
  const visited = new Uint8Array(size);
  const queue = new Frontier();
  const target = cellCenter(grid, last);
  cost[first] = 0;
  queue.push(first, greatCircleKm(cellCenter(grid, first), target));
  while (queue.size) {
    const current = queue.pop();
    if (current === last) break;
    if (visited[current]) continue;
    visited[current] = 1;
    const row = Math.floor(current / width), column = current % width;
    for (let i = 0; i < moves.length; i++) {
      const [dy, dx] = moves[i];
      const nextRow = row + dy;
      if (nextRow < 0 || nextRow >= height) continue;
      const nextColumn = (column + dx + width) % width;
      const next = nextRow * width + nextColumn;
      if (visited[next] || !Number.isFinite(elevations[next])) continue;
      if (dy && dx && (!Number.isFinite(elevations[nextRow * width + column]) ||
          !Number.isFinite(elevations[row * width + nextColumn]))) continue;
      const distanceKm = distanceByRow[row][i];
      const rise = elevations[next] - elevations[current];
      if (Math.abs(rise) > distanceKm * 1000 * slopeRatio) continue;
      const stepSlope = Math.atan2(Math.abs(rise), distanceKm * 1000) * 180 / Math.PI;
      const penalty = weight * (rise < 0 ? DOWNHILL_WEIGHT : 1) * (stepSlope / slopeLimit) ** 2;
      const nextCost = cost[current] + distanceKm * (1 + penalty);
      if (nextCost >= cost[next]) continue;
      cost[next] = nextCost;
      previous[next] = current;
      queue.push(next, nextCost + greatCircleKm(cellCenter(grid, next), target));
    }
  }
  if (!Number.isFinite(cost[last])) {
    return { status: "no-route" as const, detail: "No connected route stays within this slope limit at the available terrain resolution." };
  }
  const cells: number[] = [];
  for (let node = last; node !== -1; node = previous[node]) cells.push(node);
  cells.reverse();
  const centers = cells.map((node) => cellCenter(grid, node));
  const points = cells.length === 1 ? [start, end] : [start, ...centers, end];
  const profile = points.map((point) => elevationAt(grid, point));
  let distanceKm = 0;
  let maxSlopeDeg = 0;
  let climbM = 0;
  let returnClimbM = 0;
  for (let i = 1; i < points.length; i++) distanceKm += greatCircleKm(points[i - 1], points[i]);
  for (let i = 1; i < cells.length; i++) {
    const rise = elevations[cells[i]] - elevations[cells[i - 1]];
    const run = greatCircleKm(centers[i - 1], centers[i]) * 1000;
    maxSlopeDeg = Math.max(maxSlopeDeg, Math.atan2(Math.abs(rise), run) * 180 / Math.PI);
    climbM += Math.max(0, rise);
    returnClimbM += Math.max(0, -rise);
  }
  return { status: "ok" as const, leg: { points, distanceKm, maxSlopeDeg, climbM, elevationsM: profile }, cells, returnClimbM };
}

export function routeGlobalLeg(grid: ElevationGrid, start: LatLon, end: LatLon, slopeLimit: number, blocked?: LatLon): DirectionalRoute {
  const spacingM = greatCircleKm({ lat: 0, lon: 0 }, { lat: 0, lon: 360 / grid.width }) * 1000;
  const terrain = { label: "Global MOLA (equatorial spacing)", spacingM, regional: true };
  if (blocked && validPoint(blocked)) {
    const cell = cellIndex(grid, blocked);
    if ((validPoint(start) && cellIndex(grid, start) === cell) || (validPoint(end) && cellIndex(grid, end) === cell)) {
      return { status: "unavailable", terrain, detail: "An endpoint and the reported obstacle occupy the same MOLA cell. Choose an endpoint outside that cell." };
    }
    const elevations = grid.elevations.slice();
    // The regional grid cannot locate a reported obstacle within its cell.
    elevations[cell] = NaN;
    grid = { ...grid, elevations };
  }
  const shortest = searchGlobalLeg(grid, start, end, slopeLimit, 0);
  if (shortest.status !== "ok") return { ...shortest, terrain };
  const weighted = searchGlobalLeg(grid, start, end, slopeLimit, 4);
  const distinct = weighted.status === "ok" && (shortest.cells.length !== weighted.cells.length
    || shortest.cells.some((cell, index) => cell !== weighted.cells[index]));
  return { status: "ok", shortest: shortest.leg, alternative: distinct ? weighted.leg : undefined, terrain };
}

export function routeAcrossMars(grid: ElevationGrid, start: LatLon, end: LatLon, slopeLimit: number): GlobalRoute {
  const result = searchGlobalLeg(grid, start, end, slopeLimit, 0);
  if (result.status !== "ok") return result;
  const { leg } = result;
  return { status: "ok", outbound: leg, gridStepDeg: 360 / grid.width,
    returnLeg: { ...leg, points: [...leg.points].reverse(), climbM: result.returnClimbM, elevationsM: [...leg.elevationsM].reverse() } };
}
