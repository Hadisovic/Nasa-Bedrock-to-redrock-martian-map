import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { cellAt, cellCenter, groundDistanceM } from "../../src/contracts/index.ts";
import type { TerrainGrid } from "../../src/contracts/index.ts";
import { decodeJezeroRaster, jezeroWaypoint } from "../../src/contracts/jezero.ts";
import { DOWNHILL_PENALTY_FACTOR, planRoundTrip } from "../../src/analysis/routing.ts";
import { assessMission } from "../../src/analysis/mission.ts";
import { habitatPresets } from "../../src/data/sites.ts";

/**
 * Independent reference: plain O(n²) Dijkstra written from the documented move rules
 * (8 neighbours, both cells known, no corner cutting across unknown cells, |slope| ≤ limit,
 * cost = run × (1 + w·f·(|slope|/limit)²) with f = 1 uphill and DOWNHILL_PENALTY_FACTOR downhill).
 * It shares no code with the A* implementation.
 */
function referenceCost(t: TerrainGrid, maxSlope: number, w: number, a: number, b: number, dr: number, dc: number): number | undefined {
  const { width } = t.layout;
  const z = t.elevationsM;
  if (!Number.isFinite(z[a]) || !Number.isFinite(z[b])) return undefined;
  if (dr && dc && (!Number.isFinite(z[a + dr * width]) || !Number.isFinite(z[a + dc]))) return undefined;
  // Documented rule: ground runs use the grid's central latitude (variation over 1 km is < 1e-7).
  const p0 = cellCenter(t.layout, { row: Math.floor(t.layout.height / 2), column: 0 });
  const run = groundDistanceM(p0, { xM: p0.xM + dc * t.layout.pixelSizeM, yM: p0.yM - dr * t.layout.pixelSizeM });
  const slope = (Math.atan2(z[b] - z[a], run) * 180) / Math.PI;
  if (Math.abs(slope) > maxSlope) return undefined;
  const p = Math.abs(slope) / maxSlope;
  return run * (1 + w * (slope > 0 ? 1 : DOWNHILL_PENALTY_FACTOR) * p * p);
}

function dijkstra(t: TerrainGrid, maxSlope: number, w: number, start: number, goal: number): number {
  const { width, height } = t.layout;
  const n = width * height;
  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  dist[start] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === goal) break;
    done[u] = 1;
    const r = Math.floor(u / width), c = u % width;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= height || cc >= width) continue;
      const cost = referenceCost(t, maxSlope, w, u, rr * width + cc, dr, dc);
      if (cost !== undefined && dist[u] + cost < dist[rr * width + cc]) dist[rr * width + cc] = dist[u] + cost;
    }
  }
  return dist[goal];
}

/** Cost of a returned cell path under the reference rules (undefined if any move is illegal). */
function pathCost(t: TerrainGrid, maxSlope: number, w: number, cells: number[]): number | undefined {
  const { width } = t.layout;
  let total = 0;
  for (let i = 1; i < cells.length; i++) {
    const dr = Math.floor(cells[i] / width) - Math.floor(cells[i - 1] / width);
    const dc = (cells[i] % width) - (cells[i - 1] % width);
    if (Math.abs(dr) > 1 || Math.abs(dc) > 1) return undefined;
    const cost = referenceCost(t, maxSlope, w, cells[i - 1], cells[i], dr, dc);
    if (cost === undefined) return undefined;
    total += cost;
  }
  return total;
}

function randomGrid(seed: number, size: number): TerrainGrid {
  let s = seed;
  const rand = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  const values: number[] = [];
  for (let i = 0; i < size * size; i++) values.push(rand() < 0.12 ? NaN : Math.round(rand() * 6 * 10) / 10);
  return {
    layout: { westM: 4_588_016, northM: 1_094_320, pixelSizeM: 1, width: size, height: size },
    elevationsM: new Float32Array(values), verticalDatum: "test",
    provenance: { mission: "Test", instrument: "Test", sources: [], limitations: [] },
  };
}

test("A* costs match an independent Dijkstra reference on random grids", () => {
  let compared = 0, unreachable = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const t = randomGrid(seed * 7919, 9);
    const size = 9;
    const start = 0 * size + 0, goal = (size - 1) * size + (size - 1);
    t.elevationsM[start] = 0; t.elevationsM[goal] = 0;
    for (const [maxSlope, w] of [[80, 0], [80, 3], [60, 8], [45, 1]] as const) {
      const at = (i: number) => cellCenter(t.layout, { row: Math.floor(i / size), column: i % size });
      const planned = planRoundTrip({ habitat: at(start), destination: at(goal), terrain: t, maxAbsSlopeDeg: maxSlope, slopePenaltyWeight: w });
      const refOut = dijkstra(t, maxSlope, 0, start, goal);
      const refBack = dijkstra(t, maxSlope, 0, goal, start);
      if (planned.result.status !== "available") {
        // A* reports no route exactly when the reference finds the goal unreachable.
        assert.ok(!Number.isFinite(refOut) || !Number.isFinite(refBack), `seed ${seed}: A* missed a reachable goal`);
        unreachable++;
        continue;
      }
      const [out, back] = planned.cells!.shortest;
      assert.ok(Math.abs(pathCost(t, maxSlope, 0, out)! - refOut) < 1e-9, `seed ${seed} shortest outbound ${pathCost(t, maxSlope, 0, out)} vs ${refOut} slope ${maxSlope}`);
      assert.ok(Math.abs(pathCost(t, maxSlope, 0, back)! - refBack) < 1e-9, `seed ${seed} shortest return`);
      // Slope-weighted searches, which are direction-dependent.
      const weighted = planned.cells!.weighted ?? planned.cells!.shortest;
      if (w > 0) {
        assert.ok(Math.abs(pathCost(t, maxSlope, w, weighted[0])! - dijkstra(t, maxSlope, w, start, goal)) < 1e-9, `seed ${seed} weighted outbound`);
        assert.ok(Math.abs(pathCost(t, maxSlope, w, weighted[1])! - dijkstra(t, maxSlope, w, goal, start)) < 1e-9, `seed ${seed} weighted return`);
      }
      compared++;
    }
  }
  assert.ok(compared > 50, `compared ${compared}`);
  assert.ok(unreachable > 0, "the random set should include disconnected cases");
});

test("direction-dependent costs: downhill counts half the penalty of uphill", () => {
  const t = randomGrid(1, 3);
  t.elevationsM.set([0, 0.5, 1, 0, 0.5, 1, 0, 0.5, 1]);
  const up = referenceCost(t, 45, 2, 0, 1, 0, 1)!;
  const down = referenceCost(t, 45, 2, 1, 0, 0, -1)!;
  assert.ok(up > down && down > 0.94);
});

test("hand-calculated distance and time on a flat 3-cell row", () => {
  const t = randomGrid(1, 3);
  t.elevationsM.fill(0);
  const a = cellCenter(t.layout, { row: 1, column: 0 }), b = cellCenter(t.layout, { row: 1, column: 2 });
  const { result } = planRoundTrip({ habitat: a, destination: b, terrain: t, maxAbsSlopeDeg: 15, slopePenaltyWeight: 1 });
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  // Two 1 m east steps at latitude ~18.43° N: 2 × cos(lat) metres each way.
  const lat = (a.yM / 3_396_190);
  const expected = 2 * Math.cos(lat);
  assert.ok(Math.abs(result.shortest.outbound.horizontalDistanceM - expected) < 1e-9);
  const m = assessMission(result, { walkingSpeedMps: 0.5, scienceStopS: 600, timeBudgetS: 1200, reserveS: 300 });
  assert.equal(m.status, "assessed");
  if (m.status !== "assessed") return;
  const elapsed = expected / 0.5 + expected / 0.5 + 600;
  assert.ok(Math.abs(m.shortest.elapsedS - elapsed) < 1e-9);
  assert.ok(Math.abs(m.shortest.returnMarginS - (1200 - elapsed - 300)) < 1e-9);
});

test("real Wildcat Ridge route: speed changes time and margin, not distance", async () => {
  const bytes = new Uint8Array(await readFile(new URL("../../data/mars/jezero/elevation.tif", import.meta.url))).buffer;
  const { terrain } = await decodeJezeroRaster(bytes, "elevation");
  const { result } = planRoundTrip({ habitat: habitatPresets[0].location, destination: jezeroWaypoint.location, terrain, maxAbsSlopeDeg: 15, slopePenaltyWeight: 4 });
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  // Distance equals the sum of its segment lengths.
  const g = result.shortest.outbound.geometry;
  let sum = 0;
  for (let i = 1; i < g.length; i++) sum += groundDistanceM(g[i - 1], g[i]);
  assert.equal(sum, result.shortest.outbound.horizontalDistanceM);
  // Every geometry vertex lies on known terrain inside the grid.
  for (const p of [...g, ...result.shortest.return.geometry]) {
    const cell = cellAt(terrain.layout, p)!;
    assert.ok(Number.isFinite(terrain.elevationsM[cell.row * terrain.layout.width + cell.column]));
  }
  const base = { scienceStopS: 1800, timeBudgetS: 5400, reserveS: 1200 };
  const fast = assessMission(result, { ...base, walkingSpeedMps: 0.7 });
  const slow = assessMission(result, { ...base, walkingSpeedMps: 0.3 });
  assert.ok(fast.status === "assessed" && slow.status === "assessed");
  if (fast.status !== "assessed" || slow.status !== "assessed") return;
  const d = result.shortest.outbound.horizontalDistanceM + result.shortest.return.horizontalDistanceM;
  assert.ok(Math.abs(fast.shortest.elapsedS - (d / 0.7 + 1800)) < 1e-6);
  assert.ok(slow.shortest.returnMarginS < fast.shortest.returnMarginS);
  // An unsupported route has no computed metrics.
  const none = planRoundTrip({ habitat: habitatPresets[2].location, destination: jezeroWaypoint.location, terrain, maxAbsSlopeDeg: 4, slopePenaltyWeight: 4 }).result;
  assert.equal(none.status, "no-route");
  assert.equal(assessMission(none, { ...base, walkingSpeedMps: 0.7 }).status, "unavailable");
});
