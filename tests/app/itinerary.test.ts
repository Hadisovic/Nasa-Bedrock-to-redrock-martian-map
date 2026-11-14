import assert from "node:assert/strict";
import test from "node:test";
import { itineraryLegs, legKey, summarizeItinerary } from "../../src/explorer/itinerary.ts";
import type { PlannedLeg } from "../../src/explorer/itinerary.ts";
import { defaultMission, PLAN_DATA_VERSION, planReturns, planStops, readPlan } from "../../src/explorer/missionPlan.ts";
import type { Plan } from "../../src/explorer/missionPlan.ts";
import { planDirectionalLeg, planRoundTrip } from "../../src/analysis/routing.ts";
import { cellCenter } from "../../src/contracts/index.ts";
import type { TerrainGrid } from "../../src/contracts/index.ts";

const start = { lat: 0, lon: 1, name: "Lander" };
const a = { point: { lat: 2, lon: 3, precision: "approximate" as const, uncertaintyM: 140 }, scienceMinutes: 5 };
const b = { point: { lat: 4, lon: 5 }, scienceMinutes: 11 };
const mission = defaultMission();

test("itinerary builds one directional leg per pair, including the optional return", () => {
  const plan = itineraryLegs(start, [a, b], true);
  assert.deepEqual(plan.map(({ from, to }) => [from, to]), [[start, a.point], [a.point, b.point], [b.point, start]]);
  assert.deepEqual(itineraryLegs(start, [a, b], false), plan.slice(0, 2));
  assert.deepEqual(plan.map(({ returning }) => returning), [false, false, true]);

  const key = (leg: typeof plan[number]) => legKey(leg, 15, null);
  const edited = itineraryLegs(start, [a, { ...b, point: { lat: 2, lon: 7 } }], true);
  assert.equal(key(edited[0]), key(plan[0]));
  assert.notEqual(key(edited[1]), key(plan[1]));
  assert.notEqual(key(edited[2]), key(plan[2]));
  assert.deepEqual(itineraryLegs(start, [{ ...a, scienceMinutes: 25 }, b], true).map(key), plan.map(key));
  assert.deepEqual(itineraryLegs(start, [b, a], true).map(({ to }) => to), [b.point, a.point, start]);
  assert.deepEqual(itineraryLegs(start, [b], true).map(({ to }) => to), [b.point, start]);
});

test("a failed middle leg keeps measured legs and suppresses whole-itinerary timing", () => {
  const legs = itineraryLegs(start, [a, b], true);
  const results: PlannedLeg[] = legs.map((leg) => ({ ...leg, result: { status: "ok",
    terrain: { label: "Local", spacingM: 1, regional: false },
    shortest: { points: [leg.from, leg.to], distanceKm: 0.2, climbM: 5, maxSlopeDeg: 7, elevationsM: [5, 10] },
  } }));
  const summary = summarizeItinerary(results, [a, b], mission, false);
  assert.equal(summary.complete, true);
  assert.ok(Math.abs(summary.remaining! - (mission.budget - mission.reserve - 16 - 600 / mission.speed / 60)) < 1e-9);
  assert.ok(summarizeItinerary(results, [a, b], { ...mission, speed: 1 }, false).travel! < summary.travel!);
  assert.equal(summarizeItinerary(results.slice(0, 2), [a, b], mission, false).remaining, null);
  const partial = summarizeItinerary([results[0], { ...legs[1], result: { status: "no-route", detail: "Blocked" } }, results[2]], [a, b], mission, false);
  assert.deepEqual(partial, { complete: false, regional: false, distanceKm: 0.4, science: 16, travel: null, remaining: null });
  const regional = results.map((leg) => ({ ...leg, result: leg.result?.status === "ok"
    ? { ...leg.result, terrain: { label: "MOLA", spacingM: 14_800, regional: true } } : leg.result }));
  const coarse = summarizeItinerary(regional, [a, b], mission, false);
  assert.equal(coarse.complete, true);
  assert.equal(coarse.travel, null);
  assert.equal(coarse.remaining, null);
});

test("one-way share inputs retain order, location uncertainty and per-stop science", () => {
  const settings = { data: PLAN_DATA_VERSION, start, slope: 15, weighted: true, mission };
  const input: Plan = { ...settings, version: 2, stops: [a, b], returnToLander: false };
  const restored = readPlan(JSON.stringify(input));
  assert.deepEqual(restored, input);
  assert.deepEqual(planStops(restored), [a, b]);
  assert.equal(planReturns(restored), false);
  const older = readPlan(JSON.stringify({ ...settings, version: 1, end: a.point }));
  assert.deepEqual(planStops(older), [{ point: a.point, scienceMinutes: mission.stop }]);
  assert.equal(planReturns(older), true);
  assert.equal(readPlan(JSON.stringify({ ...input, stops: [{ ...a, scienceMinutes: -1 }] })), null);
});

test("directional local paths match the proven outbound solver and keep exact endpoints", () => {
  const terrain: TerrainGrid = {
    layout: { westM: 4_588_016, northM: 1_094_320, pixelSizeM: 1, width: 5, height: 3 },
    elevationsM: new Float32Array([0, 0, 0, 0, 0, 0, .8, .8, .8, 0, 0, 0, 0, 0, 0]),
    verticalDatum: "test", provenance: { mission: "test", instrument: "test", sources: [], limitations: [] },
  };
  const habitat = cellCenter(terrain.layout, { row: 1, column: 0 });
  const destination = cellCenter(terrain.layout, { row: 1, column: 4 });
  const request = { terrain, habitat, destination, maxAbsSlopeDeg: 50, slopePenaltyWeight: 50 };
  const leg = planDirectionalLeg(request), roundTrip = planRoundTrip(request).result;
  assert.equal(leg.status, "available");
  assert.equal(roundTrip.status, "available");
  assert.deepEqual(leg.shortest, roundTrip.shortest.outbound);
  assert.ok(leg.alternative);
  assert.deepEqual(leg.shortest.geometry[0], habitat);
  assert.deepEqual(leg.shortest.geometry.at(-1), destination);
});
