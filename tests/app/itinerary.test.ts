import assert from "node:assert/strict";
import test from "node:test";
import { itineraryLegs, legKey, roundRouteCorners, routeProfile, selectedLeg, suggestRover, summarizeItinerary } from "../../src/explorer/itinerary.ts";
import type { PlannedLeg } from "../../src/explorer/itinerary.ts";
import { defaultMission, PLAN_DATA_VERSION, planObjective, planReturns, planStops, readPlan } from "../../src/explorer/missionPlan.ts";
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
  const summary = summarizeItinerary(results, [a, b], mission, "shortest");
  assert.equal(summary.complete, true);
  assert.ok(Math.abs(summary.remaining! - (mission.budget - mission.reserve - 16 - 600 / mission.speed / 60)) < 1e-9);
  assert.ok(summarizeItinerary(results, [a, b], { ...mission, speed: 1 }, "shortest").travel! < summary.travel!);
  assert.equal(summarizeItinerary(results.slice(0, 2), [a, b], mission, "shortest").remaining, null);
  const partial = summarizeItinerary([results[0], { ...legs[1], result: { status: "no-route", detail: "Blocked" } }, results[2]], [a, b], mission, "shortest");
  assert.deepEqual(partial, { complete: false, regional: false, distanceKm: 0.4, science: 16, travel: null, remaining: null });
  const regional = results.map((leg) => ({ ...leg, result: leg.result?.status === "ok"
    ? { ...leg.result, terrain: { label: "MOLA", spacingM: 14_800, regional: true } } : leg.result }));
  const coarse = summarizeItinerary(regional, [a, b], mission, "shortest");
  assert.equal(coarse.complete, true);
  assert.equal(coarse.travel, null);
  assert.equal(coarse.remaining, null);
  const profile = routeProfile(results, mission, "shortest", 15)!;
  assert.ok(Math.abs(profile.walk! - 600 / mission.speed / 60) < 1e-9);
  assert.ok(Math.abs(profile.rover! - 600 / mission.roverSpeed / 60) < 1e-9);
  assert.equal(routeProfile(results, { ...mission, roverSlope: 6 }, "shortest", 15)?.rover, null);
  assert.equal(routeProfile(regional, mission, "shortest", 15)?.walk, null);
  const tightBudget = { ...mission, budget: 61, reserve: 36 };
  assert.match(suggestRover(results, [a, b], tightBudget, "shortest") ?? "", /600 metres.*14.3 minutes on foot or 8.3 minutes by rover/);
  assert.equal(suggestRover(results, [a, b], { ...tightBudget, reserve: 37 }, "shortest"), null);
  assert.equal(suggestRover(results, [a, b], { ...tightBudget, budget: 62 }, "shortest")?.startsWith("Consider a rover"), true);
  assert.equal(suggestRover(results, [a, b], { ...tightBudget, roverSlope: 6 }, "shortest"), null);
  assert.equal(suggestRover(regional, [a, b], tightBudget, "shortest"), null);
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
  assert.equal(planObjective(older), "lowerSlope");
  assert.equal(planObjective(readPlan(JSON.stringify({ ...input, weighted: false }))), "shortest");
  assert.equal(planObjective(readPlan(JSON.stringify({ ...input, weighted: false, objective: "energy" }))), "energy");
  assert.equal(readPlan(JSON.stringify({ ...input, objective: "unknown" })), null);
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
  assert.deepEqual(leg.shortest.geometry, roundTrip.shortest.outbound.geometry);
  assert.equal(leg.shortest.horizontalDistanceM, roundTrip.shortest.outbound.horizontalDistanceM);
  assert.equal(leg.shortest.maxAbsSlopeDeg, roundTrip.shortest.outbound.maxAbsSlopeDeg);
  assert.ok(leg.alternative);
  assert.ok(leg.energy.horizontalDistanceM > leg.shortest.horizontalDistanceM);
  assert.ok(leg.energy.effort < leg.shortest.effort);
  const geometry = [{ lat: 2, lon: 179 }, { lat: 3, lon: -179 }, { lat: 4, lon: -178 }];
  const rounded = roundRouteCorners(geometry);
  assert.deepEqual(rounded[0], geometry[0]);
  assert.deepEqual(rounded.at(-1), geometry.at(-1));
  assert.equal(geometry.length, 3);
  assert.ok(rounded.every((point) => Math.abs(point.lon) > 175));
});

test("energy itinerary sums directional legs, including the return, and requires detailed coverage", () => {
  const legs: PlannedLeg[] = itineraryLegs(start, [a, b], true).map((leg, index) => {
    const shortest = { points: [leg.from, leg.to], distanceKm: 0.1, climbM: 4, maxSlopeDeg: 6, elevationsM: [5, 9], effort: 130 };
    const energy = { ...shortest, distanceKm: 0.11, climbM: 1, effort: 115 + index };
    return { ...leg, result: { status: "ok", terrain: { label: "Local", spacingM: 1, regional: false }, shortest, energy } };
  });
  const details = routeProfile(legs, mission, "energy", 15)!;
  assert.equal(details.effort, 348);
  assert.equal(details.climbM, 3);
  assert.ok(Math.abs(details.distanceKm - 0.33) < 1e-9);
  const summary = summarizeItinerary(legs, [a, b], mission, "energy");
  assert.ok(Math.abs(summary.remaining! - (mission.budget - mission.reserve - 16 - 330 / mission.speed / 60)) < 1e-9);
  const last = legs[2].result;
  assert.ok(last?.status === "ok");
  const coarse = { status: "ok" as const, shortest: last.shortest, terrain: { label: "MOLA", spacingM: 14_800, regional: true } };
  const mixed = [...legs.slice(0, 2), { ...legs[2], result: coarse }];
  assert.equal(selectedLeg(coarse, "energy"), null);
  assert.equal(routeProfile(mixed, mission, "energy", 15), null);
  assert.equal(summarizeItinerary(mixed, [a, b], mission, "energy").remaining, null);
  assert.ok(summarizeItinerary(mixed, [a, b], mission, "shortest").complete);
});
