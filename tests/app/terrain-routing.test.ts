import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { writeArrayBuffer } from "geotiff";
import { cellAt, cellCenter, projectMars, unprojectMars } from "../../src/contracts/index.ts";
import type { TerrainGrid } from "../../src/contracts/index.ts";
import { decodeJezeroRaster, jezeroWaypoint } from "../../src/contracts/jezero.ts";
import { habitatPresets } from "../../src/data/sites.ts";
import { calculate, localRoute } from "../../src/explorer/globalRoute.worker.ts";
import type { LegRequest } from "../../src/explorer/globalRoute.worker.ts";
import type { DirectionalRoute, GlobalRouteLeg } from "../../src/explorer/globalRouting.ts";
import { galeLayout } from "../../src/explorer/galeLayout.ts";
import { greatCircleKm } from "../../src/explorer/geo.ts";
import { availableChoices, itineraryLegs, legsForChoice, mapLegsForChoices } from "../../src/explorer/itinerary.ts";
import { loadTrekRouting } from "../../src/explorer/trekRouting.ts";
import { trackFor } from "../../src/explorer/earthWalk.ts";
import { routeGlobalLeg } from "../../src/explorer/globalRouting.ts";
import { defaultMission } from "../../src/explorer/missionPlan.ts";
import { summarizeItinerary } from "../../src/explorer/itinerary.ts";

const unproject = (point: { xM: number; yM: number }) => {
  const { latitudePlanetocentricDeg: lat, longitudeEastDeg: lon } = unprojectMars(point);
  return { lat, lon };
};
const localInfo = { label: "Wildcat Ridge HiRISE", spacingM: 1, regional: false };
function verifyGeometry(result: DirectionalRoute, terrain: TerrainGrid, limit: number) {
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  for (const leg of [result.shortest, result.balanced, result.alternative].filter((leg): leg is GlobalRouteLeg => !!leg)) {
    assert.equal(leg.points.length, leg.elevationsM.length);
    assert.ok(leg.maxSlopeDeg <= limit + 1e-7);
    let distance = 0, ascent = 0, descent = 0;
    for (let i = 0; i < leg.points.length; i++) {
      const point = projectMars({ latitudePlanetocentricDeg: leg.points[i].lat, longitudeEastDeg: leg.points[i].lon });
      const cell = cellAt(terrain.layout, point)!;
      assert.ok(cell);
      assert.ok(Number.isFinite(terrain.elevationsM[cell.row * terrain.layout.width + cell.column]));
      if (!i) continue;
      const before = leg.points[i - 1], after = leg.points[i];
      distance += greatCircleKm(before, after);
      const rise = leg.elevationsM[i]! - leg.elevationsM[i - 1]!;
      ascent += Math.max(0, rise); descent += Math.max(0, -rise);
      // Check the displayed segment, including endpoint connectors, against unknown cells.
      for (let j = 0; j <= 8; j++) {
        const sample = projectMars({ latitudePlanetocentricDeg: before.lat + (after.lat - before.lat) * j / 8,
          longitudeEastDeg: before.lon + (after.lon - before.lon) * j / 8 });
        const through = cellAt(terrain.layout, sample)!;
        assert.ok(through && Number.isFinite(terrain.elevationsM[through.row * terrain.layout.width + through.column]));
      }
    }
    assert.equal(leg.distanceKm, distance);
    assert.equal(leg.climbM, ascent);
    assert.equal(leg.assessment!.descentM, descent);
    assert.equal(leg.assessment!.equivalentDistanceKm, distance + leg.assessment!.terrainCostKm);
    assert.ok(leg.distanceKm <= result.shortest.distanceKm * 1.25);
  }
}

test("real Wildcat Habitat A / Sol 502 routes preserve constraints, alternatives and directional return metrics", async (t) => {
  const bytes = await readFile(new URL("../../data/mars/jezero/elevation.tif", import.meta.url));
  const { terrain } = await decodeJezeroRaster(Uint8Array.from(bytes).buffer, "elevation");
  const start = unproject(habitatPresets[0].location), end = unproject(jezeroWaypoint.location);
  const outbound = await localRoute(terrain, start, end, 15, localInfo, null);
  const checkpoint = await localRoute(terrain, start, end, 15, localInfo, null, true);
  assert.equal(checkpoint.status, "ok");
  if (checkpoint.status === "ok" && outbound.status === "ok") {
    assert.deepEqual(checkpoint.shortest.points, outbound.shortest.points, "checkpoint optimization preserves the exact shortest path");
    assert.equal(checkpoint.balanced, undefined);
    assert.equal(checkpoint.alternative, undefined);
  }
  const returning = await localRoute(terrain, end, start, 15, localInfo, null);
  verifyGeometry(outbound, terrain, 15); verifyGeometry(returning, terrain, 15);
  const legs = itineraryLegs(start, [{ point: end, scienceMinutes: 0 }], true)
    .map((leg, i) => ({ ...leg, result: i ? returning : outbound }));
  assert.equal(availableChoices(legs).length, 3);
  assert.equal(mapLegsForChoices(legs, "balanced").length, 5, "the return shares one objective path and must not be duplicated");
  for (const { id } of availableChoices(legs)) {
    const { track } = trackFor(legs, id);
    const measured = legsForChoice(legs, id).reduce((sum, leg) => sum + leg.distanceKm * 1000, 0);
    assert.ok(Math.abs(track.at(-1)!.metres - measured) < 1e-6, "navigation consumes the selected outbound and return geometry");
  }
  t.diagnostic(JSON.stringify(availableChoices(legs).map(({ id }) => {
    const paths = legsForChoice(legs, id);
    return { choice: id, distanceM: paths.reduce((n, leg) => n + leg.distanceKm * 1000, 0),
      allowanceM: paths.reduce((n, leg) => n + leg.assessment!.terrainCostKm * 1000, 0),
      climbM: paths.reduce((n, leg) => n + leg.climbM, 0), descentM: paths.reduce((n, leg) => n + leg.assessment!.descentM, 0),
      maxSlope: Math.max(...paths.map((leg) => leg.maxSlopeDeg)) };
  })));
  const blocked = await localRoute(terrain, start, end, 15, localInfo, start);
  assert.equal(blocked.status, "unavailable");
  assert.equal((await localRoute(terrain, unproject(habitatPresets[2].location), end, 4, localInfo, null)).status, "no-route");
});

test("difficult terrain detours around a steep barrier and unknown cells without cutting corners", async () => {
  const terrain: TerrainGrid = { layout: { westM: 0, northM: 100, pixelSizeM: 1, width: 15, height: 9 },
    elevationsM: new Float32Array(135), verticalDatum: "test",
    provenance: { mission: "deterministic test", instrument: "synthetic", sources: [], limitations: [] } };
  for (let row = 1; row < 9; row++) terrain.elevationsM[row * 15 + 7] = row === 1 ? NaN : 20;
  terrain.elevationsM[4 * 15 + 4] = NaN;
  const start = unproject(cellCenter(terrain.layout, { row: 4, column: 1 }));
  const end = unproject(cellCenter(terrain.layout, { row: 4, column: 13 }));
  const result = await localRoute(terrain, start, end, 15, localInfo, null);
  verifyGeometry(result, terrain, 15);
  if (result.status === "ok") assert.ok(result.shortest.distanceKm > greatCircleKm(start, end));
  for (let row = 0; row < 9; row++) terrain.elevationsM[row * 15 + 7] = NaN;
  assert.equal((await localRoute(terrain, start, end, 15, localInfo, null)).status, "no-route");
});

test("real Gale source is 20 m, cached, and a loaded blocked fine grid never falls back", async (t) => {
  const bytes = await readFile(new URL("../../public/layers/regional/gale-terrain.f32", import.meta.url));
  const terrain: TerrainGrid = { layout: galeLayout, elevationsM: new Float32Array(Uint8Array.from(bytes).buffer),
    verticalDatum: "MOLA", provenance: { mission: "test", instrument: "test", sources: [], limitations: [] } };
  const start = unproject(cellCenter(galeLayout, { row: 80, column: 80 }));
  const end = unproject(cellCenter(galeLayout, { row: 220, column: 220 }));
  const base: LegRequest = { id: 1, start, end, slope: 15, blocked: null, width: 8, height: 4,
    base: "http://terrain.test/gale/", url: "http://terrain.test/mola" };
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input); requests.push(url);
    if (url.includes("missing")) return new Response(null, { status: 404 });
    if (url.includes("blocked")) {
      const blocked = new Float32Array(310 * 310).fill(NaN);
      blocked[80 * 310 + 80] = 0; blocked[220 * 310 + 220] = 0;
      return new Response(blocked.buffer);
    }
    assert.ok(url.includes("gale-terrain.f32"), `Unexpected coarse fallback: ${url}`);
    return new Response(bytes);
  });
  const result = await calculate(base);
  verifyGeometry(result, terrain, 15);
  assert.equal(result.terrain?.spacingM, 20);
  assert.equal(result.terrain?.regional, false);
  if (result.status === "ok") t.diagnostic(JSON.stringify({ scenario: "Gale 20 m", distanceM: result.shortest.distanceKm * 1000,
    allowanceM: result.shortest.assessment!.terrainCostKm * 1000, maxSlope: result.shortest.maxSlopeDeg }));
  await calculate(base);
  assert.equal(requests.length, 1);
  const blocked = await calculate({ ...base, base: "http://terrain.test/blocked/" });
  assert.equal(blocked.status, "no-route");
  assert.equal(blocked.terrain?.spacingM, 20);
  await assert.rejects(calculate({ ...base, base: "http://terrain.test/missing/" }), /unavailable/);
  await assert.rejects(calculate({ ...base, base: "http://terrain.test/missing/" }), /unavailable/);
  assert.equal(requests.filter((url) => url.includes("missing")).length, 2, "failed loads are evicted for retry");
});

test("Mars Trek crop loads, preserves effective spacing, caches and falls back offline to regional MOLA", async (t) => {
  let exports = 0, offline = false, blockedCrop = false, globalLoads = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.hostname === "terrain.test") { globalLoads++; return new Response(new Float32Array(8 * 4).buffer); }
    exports++;
    if (offline) throw Error("Offline");
    const [west, south, east, north] = url.searchParams.get("bbox")!.split(",").map(Number);
    const heights = new Float32Array(256 * 256);
    if (blockedCrop) {
      const divide = Math.floor(((41.05 - west) / (east - west)) * 256);
      for (let row = 0; row < 256; row++) for (let col = divide; col < 256; col++) heights[row * 256 + col] = 5000;
    }
    const buffer = writeArrayBuffer(heights, { width: 256, height: 256, BitsPerSample: [32], SampleFormat: [3],
      ModelPixelScale: [(east - west) / 256, (north - south) / 256, 0], ModelTiepoint: [0, 0, 0, west, north, 0],
      GeographicTypeGeoKey: 4326 });
    return new Response(buffer, { headers: { "Content-Type": "image/tiff" } });
  });
  // Fixture TIFF exercises loader georeferencing, not a claim of measured NASA terrain.
  const points = [{ lat: -12, lon: 42 }, { lat: -12.1, lon: 42.1 }];
  const first = await loadTrekRouting(points, AbortSignal.timeout(5000));
  assert.ok(first);
  assert.ok(Math.abs(first.terrainInfo.spacingM - 200.05210414115865) < 1e-8, "effective export spacing exceeds nominal 200 m");
  assert.equal(first.terrainInfo.regional, true);
  assert.equal(await loadTrekRouting(points, AbortSignal.timeout(5000)).then((x) => x!.terrain.elevationsM), first.terrain.elevationsM);
  assert.equal(exports, 1);
  blockedCrop = true;
  const blocked = await calculate({ id: 10, start: { lat: -13, lon: 41 }, end: { lat: -13.1, lon: 41.1 }, slope: 15,
    blocked: null, url: "http://terrain.test/mola", width: 8, height: 4, base: "http://terrain.test/" });
  assert.equal(blocked.status, "no-route");
  assert.ok(blocked.terrain!.spacingM < 201);
  assert.equal(globalLoads, 0, "a genuine crop no-route cannot fall back to coarse MOLA");
  offline = true;
  const result = await calculate({ id: 9, start: { lat: 22.5, lon: 44.9 }, end: { lat: 22.5, lon: 45.1 }, slope: 15,
    blocked: null, url: "http://terrain.test/mola", width: 8, height: 4, base: "http://terrain.test/" });
  assert.equal(result.status, "ok");
  assert.ok(result.terrain?.label.includes("MOLA"));
  assert.equal(result.terrain?.regional, true);
  assert.ok(result.terrain!.spacingM > 2_000_000);
});

test("real global MOLA routes are explicitly regional and suppress detailed travel estimates", async (t) => {
  const bytes = await readFile(new URL("../../public/layers/global/mola-elevation-1440x720.f32", import.meta.url));
  const grid = { width: 1440, height: 720, elevations: new Float32Array(Uint8Array.from(bytes).buffer) };
  const start = { lat: -4.73, lon: 137.38 }, end = { lat: -10.6, lon: 140.1 };
  const result = routeGlobalLeg(grid, start, end, 15);
  assert.equal(result.status, "ok");
  assert.equal(result.terrain?.regional, true);
  assert.ok(Math.abs(result.terrain!.spacingM - 14818.674380826556) < 1e-6);
  const legs = itineraryLegs(start, [{ point: end, scienceMinutes: 0 }], false).map((leg) => ({ ...leg, result }));
  assert.equal(summarizeItinerary(legs, [], defaultMission(), "shortest").travel, null);
  if (result.status === "ok") t.diagnostic(JSON.stringify({ scenario: "Global MOLA", distanceKm: result.shortest.distanceKm,
    maxSlope: result.shortest.maxSlopeDeg, spacingM: result.terrain.spacingM }));
});
