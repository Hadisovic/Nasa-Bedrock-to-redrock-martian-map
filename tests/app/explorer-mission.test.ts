import assert from "node:assert/strict";
import test from "node:test";
import { marsAt, marsSun } from "../../src/explorer/marsTime.ts";
import { nearestConnectedPoint, planRoundTrip } from "../../src/analysis/routing.ts";
import { cellCenter } from "../../src/contracts/index.ts";
import { defaultMission, parsePlan, PLAN_DATA_VERSION } from "../../src/explorer/missionPlan.ts";

test("Mars24 prime meridian matches NASA's worked example and noon follows the subsolar point", () => {
  const utc = Date.parse("2000-01-06T00:00:00Z");
  const atPrime = marsAt(utc, { lat: 0, lon: 0 });
  assert.equal(atPrime.time, "23:38");
  const { subsolar } = marsSun(utc);
  assert.ok(Math.abs(subsolar.lon - -174.726) < 0.002);
  assert.ok(Math.abs(subsolar.lat - -25.22825) < 0.002);
  assert.equal(marsAt(utc, subsolar).time, "12:00");
  assert.equal(marsAt(utc, { lat: 89, lon: 0 }).daylight, "Polar night");
  assert.equal(marsAt(utc, { lat: -89, lon: 0 }).daylight, "Polar day");
  assert.equal(marsAt(utc, { lat: 0, lon: 30 }).time, "01:38");
});

test("the nearest suggestion cannot cross an unknown wall or choose a disconnected point", () => {
  const layout = { westM: 0, northM: 4, pixelSizeM: 1, width: 5, height: 3 };
  const terrain = { layout, elevationsM: new Float32Array([
    0, 0, NaN, 0, 0, 0, 0, NaN, 0, 0, 0, 0, NaN, 0, 0,
  ]), verticalDatum: "test", provenance: { mission: "test", instrument: "test", sources: [], limitations: [] } };
  const at = (row: number, column: number) => cellCenter(layout, { row, column });
  const habitat = at(1, 0), destination = at(1, 3);
  assert.equal(planRoundTrip({ terrain, habitat, destination, maxAbsSlopeDeg: 15, slopePenaltyWeight: 4 }).result.status, "no-route");
  const suggestion = nearestConnectedPoint(terrain, habitat, destination, 15, 4);
  assert.deepEqual(suggestion, at(1, 1));
  assert.equal(planRoundTrip({ terrain, habitat, destination: suggestion!, maxAbsSlopeDeg: 15, slopePenaltyWeight: 4 }).result.status, "available");
  assert.equal(nearestConnectedPoint(terrain, habitat, destination, 15, 1), null);
});

test("shared routes require matching terrain and valid planning limits", () => {
  const plan = { version: 1, data: PLAN_DATA_VERSION, start: { lat: 0, lon: 1 }, end: { lat: 2, lon: 3 },
    slope: 15, weighted: false, mission: defaultMission() };
  assert.deepEqual(parsePlan(JSON.stringify(plan)), plan);
  assert.equal(parsePlan(JSON.stringify({ ...plan, data: "older-terrain" })), null);
  assert.equal(parsePlan(JSON.stringify({ ...plan, mission: { ...plan.mission, reserve: plan.mission.budget + 1 } })), null);
});
