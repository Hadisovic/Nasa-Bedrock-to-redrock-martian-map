import { greatCircleKm } from "../explorer/geo.ts";
import { edgeRoughness, localRoughness, terrainPenalty } from "./terrainCost.ts";
export { DOWNHILL_PENALTY_FACTOR } from "./terrainCost.ts";
import { cellAt, cellCenter, groundDistanceM, unprojectMars } from "../contracts/index.ts";
import type { ProjectedPoint, RasterCell, RoundTrip, RouteLeg, RouteRequest, RouteResult, TerrainGrid } from "../contracts/index.ts";

/**
 * Deterministic grid routing over the HiRISE elevation cells.
 *
 * Nodes are valid (finite) elevation cells, connected to their 8 neighbours. A move is
 * allowed only when both cells are known, its absolute slope atan(Δh / ground run) does not
 * exceed `maxAbsSlopeDeg`, and a diagonal move does not cut the corner of an unknown cell.
 *
 * - Shortest: minimises horizontal ground distance.
 * - Terrain-weighted: each move costs run × (1 + w × p²), where p = |slope| / maxAbsSlopeDeg.
 *   Downhill moves count half the penalty of uphill moves, so the return leg can differ from
 *   the outbound leg. This is a relative effort model chosen for route comparison, not a
 *   physiological or certified safety model.
 *
 * Ties are broken by lower cell index, so identical inputs always produce identical routes.
 */

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [-1, 0], [0, 1], [1, 0], [0, -1], [-1, 1], [1, 1], [1, -1], [-1, -1],
];

interface Graph {
  terrain: TerrainGrid;
  runEast: number;
  runNorth: number;
  runDiagonal: number;
  runs?: number[][];
}

function buildGraph(terrain: TerrainGrid, exactRuns = false): Graph {
  const { layout } = terrain;
  // Use the grid's central latitude; the variation across 384 m is negligible.
  const mid = cellCenter(layout, { row: Math.floor(layout.height / 2), column: 0 });
  const runEast = groundDistanceM(mid, { xM: mid.xM + layout.pixelSizeM, yM: mid.yM });
  const runNorth = layout.pixelSizeM;
  const runs = exactRuns ? Array.from({ length: layout.height }, (_, row) => {
    const from = cellCenter(layout, { row, column: 0 });
    const point = unprojectMars(from);
    return NEIGHBOURS.map(([dr, dc]) => {
      const next = unprojectMars({ xM: from.xM + dc * layout.pixelSizeM, yM: from.yM - dr * layout.pixelSizeM });
      return greatCircleKm({ lat: point.latitudePlanetocentricDeg, lon: point.longitudeEastDeg },
        { lat: next.latitudePlanetocentricDeg, lon: next.longitudeEastDeg }) * 1000;
    });
  }) : undefined;
  return { terrain, runEast, runNorth, runDiagonal: Math.hypot(runEast, runNorth), runs };
}

function slopeDeg(rise: number, run: number): number {
  return Math.atan2(rise, run) * 180 / Math.PI;
}

class MinHeap {
  private keys: number[] = [];
  private ids: number[] = [];
  get size() { return this.ids.length; }
  push(key: number, id: number) {
    this.keys.push(key); this.ids.push(id);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(p, i)) break;
      this.swap(i, p); i = p;
    }
  }
  pop(): number {
    const top = this.ids[0];
    const lastKey = this.keys.pop()!, lastId = this.ids.pop()!;
    if (this.ids.length) {
      this.keys[0] = lastKey; this.ids[0] = lastId;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.ids.length && this.less(l, m)) m = l;
        if (r < this.ids.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  private less(a: number, b: number) {
    return this.keys[a] < this.keys[b] || (this.keys[a] === this.keys[b] && this.ids[a] < this.ids[b]);
  }
  private swap(a: number, b: number) {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
  }
}

interface SearchOptions {
  maxAbsSlopeDeg: number;
  penaltyWeight: number;
  roughness?: Float32Array;
}

function moveCost(graph: Graph, from: number, to: number, move: number, options: SearchOptions): number | undefined {
  const [dr, dc] = NEIGHBOURS[move];
  const { width } = graph.terrain.layout;
  const z = graph.terrain.elevationsM;
  const zf = z[from], zt = z[to];
  if (!Number.isFinite(zf) || !Number.isFinite(zt)) return undefined;
  if (dr !== 0 && dc !== 0) {
    // No corner cutting across unknown cells.
    if (!Number.isFinite(z[from + dr * width]) || !Number.isFinite(z[from + dc])) return undefined;
  }
  const run = graph.runs?.[Math.floor(from / width)][move] ??
    (dr === 0 ? graph.runEast : dc === 0 ? graph.runNorth : graph.runDiagonal);
  const slope = slopeDeg(zt - zf, run);
  if (Math.abs(slope) > options.maxAbsSlopeDeg) return undefined;
  if (options.penaltyWeight === 0) return run;
  return run * (1 + options.penaltyWeight * terrainPenalty(zt - zf, run, options.maxAbsSlopeDeg,
    edgeRoughness(options.roughness, from, to)));
}

function hasTraversableMove(graph: Graph, index: number, options: SearchOptions): boolean {
  const { width, height } = graph.terrain.layout;
  const row = Math.floor(index / width), column = index % width;
  for (let move = 0; move < NEIGHBOURS.length; move++) {
    const [dr, dc] = NEIGHBOURS[move];
    const r = row + dr, c = column + dc;
    if (r < 0 || c < 0 || r >= height || c >= width) continue;
    if (moveCost(graph, index, r * width + c, move, options) !== undefined) return true;
  }
  return false;
}

/** A* over cells; returns the cell path from start to goal (inclusive) or undefined. */
function search(graph: Graph, start: number, goal: number, options: SearchOptions): number[] | undefined {
  const { width, height } = graph.terrain.layout;
  if (start === goal) return [start];
  const n = width * height;
  const g = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const goalRow = Math.floor(goal / width), goalColumn = goal % width;
  const toLatLon = (index: number) => {
    const { latitudePlanetocentricDeg: lat, longitudeEastDeg: lon } =
      unprojectMars(cellCenter(graph.terrain.layout, { row: Math.floor(index / width), column: index % width }));
    return { lat, lon };
  };
  const target = graph.runs && toLatLon(goal);
  const heuristic = (index: number) => {
    if (target) return greatCircleKm(toLatLon(index), target) * 1000;
    const dr = Math.abs(Math.floor(index / width) - goalRow) * graph.runNorth;
    const dc = Math.abs((index % width) - goalColumn) * graph.runEast;
    return Math.hypot(dr, dc);
  };
  const heap = new MinHeap();
  g[start] = 0;
  heap.push(heuristic(start), start);
  while (heap.size) {
    const current = heap.pop();
    if (closed[current]) continue;
    if (current === goal) break;
    closed[current] = 1;
    const row = Math.floor(current / width), column = current % width;
    for (let move = 0; move < NEIGHBOURS.length; move++) {
      const [dr, dc] = NEIGHBOURS[move];
      const r = row + dr, c = column + dc;
      if (r < 0 || c < 0 || r >= height || c >= width) continue;
      const next = r * width + c;
      if (closed[next]) continue;
      const cost = moveCost(graph, current, next, move, options);
      if (cost === undefined) continue;
      const candidate = g[current] + cost;
      if (candidate < g[next] || (candidate === g[next] && current < parent[next])) {
        g[next] = candidate;
        parent[next] = current;
        heap.push(candidate + heuristic(next), next);
      }
    }
  }
  if (!Number.isFinite(g[goal])) return undefined;
  const path: number[] = [];
  for (let at = goal; at !== -1; at = parent[at]) path.push(at);
  return path.reverse();
}

function toLeg(graph: Graph, from: ProjectedPoint, to: ProjectedPoint, cells: number[]): RouteLeg {
  const { layout } = graph.terrain;
  const z = graph.terrain.elevationsM;
  const centers = cells.map((index) => cellCenter(layout, { row: Math.floor(index / layout.width), column: index % layout.width }));
  // Endpoints in the same cell connect directly, so a zero-length leg has zero distance.
  const geometry = cells.length === 1 ? [from, to] : [from, ...centers, to];
  let horizontalDistanceM = 0;
  for (let i = 1; i < geometry.length; i++) horizontalDistanceM += groundDistanceM(geometry[i - 1], geometry[i]);
  let maxAbsSlopeDeg = 0;
  for (let i = 1; i < cells.length; i++) {
    const run = groundDistanceM(centers[i - 1], centers[i]);
    maxAbsSlopeDeg = Math.max(maxAbsSlopeDeg, Math.abs(slopeDeg(z[cells[i]] - z[cells[i - 1]], run)));
  }
  return { geometry, horizontalDistanceM, maxAbsSlopeDeg };
}

/** Closest cell within the search radius connected to the fixed endpoint by legal moves. */
export function nearestConnectedPoint(terrain: TerrainGrid, fixed: ProjectedPoint, requested: ProjectedPoint,
  maxAbsSlopeDeg: number, radiusM: number, exactRuns = false): ProjectedPoint | null {
  const { width, height } = terrain.layout;
  const cell = cellAt(terrain.layout, fixed);
  if (!cell || !Number.isFinite(terrain.elevationsM[cell.row * width + cell.column]) || !(maxAbsSlopeDeg > 0 && maxAbsSlopeDeg < 90)) return null;
  const graph = buildGraph(terrain, exactRuns);
  const options = { maxAbsSlopeDeg, penaltyWeight: 0 };
  const seen = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  const first = cell.row * width + cell.column;
  let best: ProjectedPoint | null = null, bestM = radiusM, tail = 1;
  seen[first] = 1;
  queue[0] = first;
  for (let head = 0; head < tail; head++) {
    const index = queue[head], row = Math.floor(index / width), column = index % width;
    if (index !== first) {
      const candidate = cellCenter(terrain.layout, { row, column });
      const d = groundDistanceM(requested, candidate);
      if (d < bestM) { best = candidate; bestM = d; }
    }
    for (let move = 0; move < NEIGHBOURS.length; move++) {
      const [dr, dc] = NEIGHBOURS[move];
      const r = row + dr, c = column + dc, next = r * width + c;
      if (r < 0 || c < 0 || r >= height || c >= width || seen[next]) continue;
      if (moveCost(graph, index, next, move, options) === undefined) continue;
      seen[next] = 1; queue[tail++] = next;
    }
  }
  return best;
}

const sameCells = (a: number[], b: number[]) => a.length === b.length && a.every((value, i) => value === b[i]);

function validPoint(point: ProjectedPoint | undefined): point is ProjectedPoint {
  return !!point && Number.isFinite(point.xM) && Number.isFinite(point.yM);
}

export interface PlannedRoute {
  result: RouteResult;
  /** Cell paths, kept for comparing candidates and drawing; not part of the shared contract. */
  cells?: { shortest: [number[], number[]]; weighted?: [number[], number[]] };
}

type Preparation = { graph: Graph; start: number; goal: number; strict: SearchOptions; unknownNote: string; unknownCells: number }
  | { result: Exclude<RouteResult, { status: "available" }> };

function prepareRoute(request: RouteRequest, exactRuns = false): Preparation {
  const { habitat, destination, terrain, maxAbsSlopeDeg, slopePenaltyWeight } = request;
  if (!validPoint(habitat) || !validPoint(destination) ||
      !(maxAbsSlopeDeg > 0 && maxAbsSlopeDeg < 90) ||
      !(Number.isFinite(slopePenaltyWeight) && slopePenaltyWeight >= 0)) {
    return { result: { status: "unavailable", reason: "invalid-request", detail: "Endpoints must be finite, the slope limit must be between 0° and 90°, and the penalty weight must be zero or more." } };
  }
  if (!terrain) {
    return { result: { status: "unavailable", reason: "terrain-unavailable", detail: "Elevation data is not loaded, so no terrain-informed route can be calculated." } };
  }
  const { layout } = terrain;
  const startCell = cellAt(layout, habitat);
  const goalCell = cellAt(layout, destination);
  if (!startCell || !goalCell) {
    return { result: { status: "unavailable", reason: "outside-coverage", detail: `The ${!startCell ? "habitat" : "destination"} is outside this elevation grid.` } };
  }
  const index = (cell: RasterCell) => cell.row * layout.width + cell.column;
  const start = index(startCell), goal = index(goalCell);
  if (!Number.isFinite(terrain.elevationsM[start]) || !Number.isFinite(terrain.elevationsM[goal])) {
    return { result: { status: "unavailable", reason: "missing-terrain", detail: `The ${!Number.isFinite(terrain.elevationsM[start]) ? "habitat" : "destination"} cell has no valid elevation; unknown terrain is never treated as flat.` } };
  }

  const graph = buildGraph(terrain, exactRuns);
  const strict: SearchOptions = { maxAbsSlopeDeg, penaltyWeight: 0 };
  const unknownCells = terrain.elevationsM.reduce((count, value) => count + (Number.isFinite(value) ? 0 : 1), 0);
  const unknownNote = unknownCells ? ` ${unknownCells} unknown cells were excluded, so this describes the known grid only.` : "";

  if (start !== goal) {
    for (const [name, cell] of [["habitat", start], ["destination", goal]] as const) {
      if (!hasTraversableMove(graph, cell, strict)) {
        return { result: { status: "no-route", reason: "blocked-endpoint", detail: `Every move away from the ${name} exceeds ${maxAbsSlopeDeg}° or crosses unknown terrain.${unknownNote}`, terrainProvenance: terrain.provenance } };
      }
    }
  }
  return { graph, start, goal, strict, unknownNote, unknownCells };
}

export function planDirectionalLeg(request: RouteRequest, comparison?: { balancedWeight: number; spacingM: number; shortestOnly?: boolean }) {
  const prepared = prepareRoute(request, !!comparison);
  if ("result" in prepared) return prepared.result;
  const { graph, start, goal, strict, unknownNote } = prepared;
  const path = search(graph, start, goal, strict);
  if (!path) return { status: "no-route" as const, detail: `No connected path stays within ${strict.maxAbsSlopeDeg}° on this leg.${unknownNote}` };
  const roughness = comparison && !comparison.shortestOnly ? localRoughness(graph.terrain.elevationsM, graph.terrain.layout.width,
    graph.terrain.layout.height, comparison.spacingM) : undefined;
  const weighted = (penaltyWeight: number) => ({ ...strict, penaltyWeight, roughness });
  const leg = (cells: number[]) => toLeg(graph, request.habitat, request.destination, cells);
  const lower = !comparison?.shortestOnly && request.slopePenaltyWeight ? search(graph, start, goal, weighted(request.slopePenaltyWeight)) : undefined;
  const balanced = comparison && !comparison.shortestOnly ? search(graph, start, goal, weighted(comparison.balancedWeight)) : undefined;
  return { status: "available" as const, shortest: leg(path),
    balanced: balanced && !sameCells(path, balanced) ? leg(balanced) : undefined,
    alternative: lower && !sameCells(path, lower) ? leg(lower) : undefined,
    roughness };

}

export function planRoundTrip(request: RouteRequest): PlannedRoute {
  const prepared = prepareRoute(request);
  if ("result" in prepared) return prepared;
  const { graph, start, goal, strict, unknownNote, unknownCells } = prepared;
  const { habitat, destination, maxAbsSlopeDeg, slopePenaltyWeight } = request;
  const terrain = graph.terrain;
  const layout = terrain.layout;
  const outbound = search(graph, start, goal, strict);
  const back = outbound && search(graph, goal, start, strict);
  if (!outbound || !back) {
    return { result: { status: "no-route", reason: "no-traversable-path", detail: `No connected path stays within ${maxAbsSlopeDeg}° on the ${outbound ? "return" : "outbound"} leg.${unknownNote}`, terrainProvenance: terrain.provenance } };
  }
  const shortest: RoundTrip = { outbound: toLeg(graph, habitat, destination, outbound), return: toLeg(graph, destination, habitat, back) };

  const warnings = [
    `Routes follow ${Number(layout.pixelSizeM.toFixed(2))} m elevation cells; obstacles smaller than the grid, such as individual rocks, are not resolved.`,
    "Slopes come from measured elevation and are subject to the source's uncertainty. Use these routes for scenario planning.",
  ];
  if (unknownCells) warnings.push(`${unknownCells} unknown elevation cells were excluded from routing.`);

  const weightedOptions: SearchOptions = { maxAbsSlopeDeg, penaltyWeight: slopePenaltyWeight };
  const weightedOut = search(graph, start, goal, weightedOptions);
  const weightedBack = weightedOut && search(graph, goal, start, weightedOptions);
  let alternative: Extract<RouteResult, { status: "available" }>["alternative"];
  let weightedCells: [number[], number[]] | undefined;
  if (!weightedOut || !weightedBack) {
    alternative = { status: "unavailable", detail: "The terrain-weighted search found no path." };
  } else if (sameCells(weightedOut, outbound) && sameCells(weightedBack, back)) {
    alternative = { status: "coincident" };
  } else {
    weightedCells = [weightedOut, weightedBack];
    alternative = {
      status: "distinct",
      terrainWeighted: { outbound: toLeg(graph, habitat, destination, weightedOut), return: toLeg(graph, destination, habitat, weightedBack) },
    };
  }
  return {
    result: { status: "available", shortest, alternative, terrainProvenance: terrain.provenance, warnings },
    cells: { shortest: [outbound, back], weighted: weightedCells },
  };
}

/** Elevation gained and lost along a leg's cell path, for the debrief. */
export function climbAlong(terrain: TerrainGrid, leg: RouteLeg): { gainM: number; lossM: number } {
  let gainM = 0, lossM = 0, previous: number | undefined;
  for (const point of leg.geometry) {
    const cell = cellAt(terrain.layout, point);
    if (!cell) continue;
    const z = terrain.elevationsM[cell.row * terrain.layout.width + cell.column];
    if (!Number.isFinite(z)) continue;
    if (previous !== undefined) {
      if (z > previous) gainM += z - previous; else lossM += previous - z;
    }
    previous = z;
  }
  return { gainM, lossM };
}
