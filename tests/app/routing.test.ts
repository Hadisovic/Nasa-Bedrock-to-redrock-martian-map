import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { cellCenter } from "../../src/contracts/index.ts";
import type { TerrainGrid } from "../../src/contracts/index.ts";
import { decodeJezeroRaster, jezeroWaypoint } from "../../src/contracts/jezero.ts";
import { climbAlong, planRoundTrip } from "../../src/analysis/routing.ts";
import { habitatPresets } from "../../src/data/sites.ts";

const provenance = { mission: "Test", instrument: "Test", sources: [], limitations: [] };

function grid(rows: number[][], pixelSizeM = 1): TerrainGrid {
  return {
    layout: { westM: 4_588_016, northM: 1_094_320, pixelSizeM, width: rows[0].length, height: rows.length },
    elevationsM: new Float32Array(rows.flat()),
    verticalDatum: "test", provenance,
  };
}
const at = (t: TerrainGrid, row: number, column: number) => cellCenter(t.layout, { row, column });

test("flat ground gives a straight available round trip", () => {
  const t = grid([[0, 0, 0, 0, 0]]);
  const { result } = planRoundTrip({ habitat: at(t, 0, 0), destination: at(t, 0, 4), terrain: t, maxAbsSlopeDeg: 15, slopePenaltyWeight: 4 });
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.equal(result.shortest.outbound.maxAbsSlopeDeg, 0);
  assert.ok(Math.abs(result.shortest.outbound.horizontalDistanceM - 4 * 0.94855) < 0.001);
  assert.equal(result.alternative.status, "coincident");
  // Geometry keeps the original projected endpoints in travel order.
  assert.deepEqual(result.shortest.outbound.geometry[0], at(t, 0, 0));
  assert.deepEqual(result.shortest.return.geometry.at(-1), at(t, 0, 0));
});

test("unknown terrain is excluded and never treated as flat", () => {
  const t = grid([
    [0, NaN, 0],
    [0, NaN, 0],
    [0, 0, 0],
  ]);
  const { result } = planRoundTrip({ habitat: at(t, 0, 0), destination: at(t, 0, 2), terrain: t, maxAbsSlopeDeg: 15, slopePenaltyWeight: 0 });
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  // Must detour south around the unknown column, with no diagonal corner cutting.
  assert.ok(result.shortest.outbound.horizontalDistanceM > 4);
  assert.ok(result.warnings.some((w) => w.includes("2 unknown")));
});

test("missing endpoint elevation, outside coverage and bad input are unavailable", () => {
  const t = grid([[NaN, 0, 0]]);
  const base = { terrain: t, maxAbsSlopeDeg: 15, slopePenaltyWeight: 1 };
  const missing = planRoundTrip({ ...base, habitat: at(t, 0, 0), destination: at(t, 0, 2) }).result;
  assert.equal(missing.status === "unavailable" && missing.reason, "missing-terrain");
  const outside = planRoundTrip({ ...base, habitat: { xM: 0, yM: 0 }, destination: at(t, 0, 2) }).result;
  assert.equal(outside.status === "unavailable" && outside.reason, "outside-coverage");
  const invalid = planRoundTrip({ ...base, habitat: at(t, 0, 1), destination: at(t, 0, 2), maxAbsSlopeDeg: 0 }).result;
  assert.equal(invalid.status === "unavailable" && invalid.reason, "invalid-request");
  const none = planRoundTrip({ ...base, terrain: null, habitat: at(t, 0, 1), destination: at(t, 0, 2) }).result;
  assert.equal(none.status === "unavailable" && none.reason, "terrain-unavailable");
});

test("a walled endpoint is blocked and a cliff band gives no route", () => {
  const walled = grid([
    [0, 0, 0, 0, 0],
    [0, 9, 9, 9, 0],
    [0, 9, 0, 9, 0],
    [0, 9, 9, 9, 0],
    [0, 0, 0, 0, 0],
  ]);
  const blocked = planRoundTrip({ habitat: at(walled, 0, 0), destination: at(walled, 2, 2), terrain: walled, maxAbsSlopeDeg: 20, slopePenaltyWeight: 1 }).result;
  assert.equal(blocked.status === "no-route" && blocked.reason, "blocked-endpoint");

  // Each 1 m step east rises 1 m over a 0.949 m ground run, about 46.5°.
  const cliff = grid([
    [0, 0, 1, 2, 2],
    [0, 0, 1, 2, 2],
  ]);
  const passable = planRoundTrip({ habitat: at(cliff, 0, 0), destination: at(cliff, 0, 4), terrain: cliff, maxAbsSlopeDeg: 50, slopePenaltyWeight: 1 }).result;
  assert.equal(passable.status, "available");
  const strict = planRoundTrip({ habitat: at(cliff, 0, 0), destination: at(cliff, 0, 4), terrain: cliff, maxAbsSlopeDeg: 30, slopePenaltyWeight: 1 }).result;
  assert.equal(strict.status === "no-route" && strict.reason, "no-traversable-path");
});

test("the slope penalty can choose a distinct, gentler round trip", () => {
  // A low ridge in the middle row: crossing it is shorter, going around is flatter.
  const t = grid([
    [0, 0, 0, 0, 0],
    [0, 0, 0.3, 0, 0],
    [0, 0, 0.6, 0, 0],
    [0, 0, 0.3, 0, 0],
    [0, 0, 0, 0, 0],
  ]);
  const { result } = planRoundTrip({ habitat: at(t, 2, 0), destination: at(t, 2, 4), terrain: t, maxAbsSlopeDeg: 45, slopePenaltyWeight: 50 });
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.equal(result.alternative.status, "distinct");
  if (result.alternative.status !== "distinct") return;
  assert.ok(result.alternative.terrainWeighted.outbound.maxAbsSlopeDeg < result.shortest.outbound.maxAbsSlopeDeg);
  assert.ok(result.alternative.terrainWeighted.outbound.horizontalDistanceM >= result.shortest.outbound.horizontalDistanceM);
});

test("routing is deterministic and the real Wildcat Ridge scenario is reachable", async () => {
  const bytes = new Uint8Array(await readFile(new URL("../../data/mars/jezero/elevation.tif", import.meta.url))).buffer;
  const { terrain } = await decodeJezeroRaster(bytes, "elevation");
  const request = { habitat: habitatPresets[0].location, destination: jezeroWaypoint.location, terrain, maxAbsSlopeDeg: 15, slopePenaltyWeight: 4 };
  const first = planRoundTrip(request);
  const second = planRoundTrip(request);
  assert.deepEqual(first.result, second.result);
  assert.equal(first.result.status, "available");
  if (first.result.status !== "available") return;
  const out = first.result.shortest.outbound;
  assert.ok(out.horizontalDistanceM > 200 && out.horizontalDistanceM < 260, `outbound ${out.horizontalDistanceM}`);
  assert.ok(out.maxAbsSlopeDeg <= 15);
  assert.ok(climbAlong(terrain, out).gainM > 0);

  // The demonstrated failure case: strict 4° limit from habitat C.
  const strict = planRoundTrip({ ...request, habitat: habitatPresets[2].location, maxAbsSlopeDeg: 4 }).result;
  assert.equal(strict.status, "no-route");
});

test("endpoints in the same cell give a zero-length leg", () => {
  const t = grid([[0, 0], [0, 0]]);
  const p = at(t, 0, 0);
  const { result } = planRoundTrip({ habitat: p, destination: p, terrain: t, maxAbsSlopeDeg: 15, slopePenaltyWeight: 1 });
  assert.ok(result.status === "available");
  assert.equal(result.shortest.outbound.horizontalDistanceM, 0);
  assert.equal(result.shortest.outbound.maxAbsSlopeDeg, 0);
});
