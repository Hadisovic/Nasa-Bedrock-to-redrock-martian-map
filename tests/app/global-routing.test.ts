import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { greatCircleKm } from "../../src/explorer/geo.ts";
import { routeAcrossMars } from "../../src/explorer/globalRouting.ts";

test("global routes cross the longitude seam by the short edge", () => {
  const elevations = new Float32Array(8 * 4);
  const start = { lat: 22.5, lon: 157.5 }, end = { lat: 22.5, lon: -157.5 };
  const route = routeAcrossMars({ width: 8, height: 4, elevations }, start, end, 15);
  assert.equal(route.status, "ok");
  assert.ok(Math.abs(route.outbound.distanceKm - greatCircleKm(start, end)) < 1e-8);
  assert.deepEqual(route.returnLeg.points, [...route.outbound.points].reverse());
});

test("global routes reject missing elevation and enforce the slope limit", () => {
  const elevations = new Float32Array(32).fill(NaN);
  const start = { lat: 22.5, lon: 157.5 }, end = { lat: 22.5, lon: -157.5 };
  const grid = { width: 8, height: 4, elevations };
  assert.equal(routeAcrossMars(grid, start, end, 15).status, "unavailable");
  elevations[15] = 0;
  elevations[8] = 100_000;
  assert.equal(routeAcrossMars(grid, start, end, 1).status, "no-route");
  const route = routeAcrossMars(grid, start, end, 15);
  assert.equal(route.status, "ok");
  assert.equal(route.outbound.climbM, 100_000);
  assert.equal(route.returnLeg.climbM, 0);
});

test("bundled MOLA data supports finite routes outside Jezero and near the pole", () => {
  const file = readFileSync(new URL("../../public/layers/global/mola-elevation-1440x720.f32", import.meta.url));
  const grid = { width: 1440, height: 720, elevations: new Float32Array(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)) };
  const examples = [
    [{ lat: -4.73, lon: 137.38 }, { lat: -10.6, lon: 140.1 }],
    [{ lat: 83.5, lon: 178.8 }, { lat: 84.2, lon: -177.4 }],
  ];
  for (const [start, end] of examples) {
    const route = routeAcrossMars(grid, start, end, 15);
    assert.equal(route.status, "ok");
    assert.ok(route.outbound.distanceKm >= greatCircleKm(start, end) - 1e-6);
    assert.ok(route.outbound.maxSlopeDeg <= 15);
    assert.equal(route.gridStepDeg, 0.25);
  }
});
