import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { greatCircleKm } from "../../src/explorer/geo.ts";
import { routeAcrossMars, routeGlobalLeg } from "../../src/explorer/globalRouting.ts";

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

test("a sufficiently steep detour earns a distinct recommendation and obeys the slope limit", () => {
  const width = 360, height = 180;
  const start = { lat: -.5, lon: -5.5 }, end = { lat: -.5, lon: 5.5 };
  const elevations = new Float32Array(width * height);
  const grid = { width, height, elevations };
  const flat = routeGlobalLeg(grid, start, end, 15);
  assert.equal(flat.status, "ok");
  assert.equal(flat.balanced, undefined);
  assert.equal(flat.alternative, undefined);
  assert.ok(flat.shortest.points.every(({ lat }) => lat === start.lat));
  for (let row = 90; row <= 92; row++) {
    for (let col = 178; col <= 181; col++) elevations[row * width + col] = row === 92 ? 7000 : 14000;
  }
  const route = routeGlobalLeg(grid, start, end, 15);
  assert.equal(route.status, "ok");
  assert.ok(route.balanced?.assessment);
  assert.ok(route.shortest.assessment);
  assert.ok(route.shortest.distanceKm < route.balanced.distanceKm);
  assert.ok(route.balanced.assessment.equivalentDistanceKm < route.shortest.assessment.equivalentDistanceKm);
  const strict = routeGlobalLeg(grid, start, end, 10);
  assert.equal(strict.status, "ok");
  assert.ok(strict.shortest.maxSlopeDeg <= 10);
  assert.ok(strict.shortest.points.some(({ lat }) => lat !== start.lat));
  const measuredKm = strict.shortest.points.slice(1).reduce((km, point, i) =>
    km + greatCircleKm(strict.shortest.points[i], point), 0);
  assert.equal(strict.shortest.distanceKm, measuredKm);
  const blocked = routeGlobalLeg({ ...grid, elevations: new Float32Array(width * height) }, start, end, 15, { lat: -.5, lon: .5 });
  assert.equal(blocked.status, "ok");
  assert.ok(blocked.shortest.points.every(({ lat, lon }) => lat !== -.5 || lon !== .5));
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
