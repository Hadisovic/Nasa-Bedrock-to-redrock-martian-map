import assert from "node:assert/strict";
import test from "node:test";
import { itineraryLegs, legKey, summarizeItinerary } from "../../src/explorer/itinerary.ts";
import * as itinerary from "../../src/explorer/itinerary.ts";
import { assessLeg } from "../../src/explorer/routeAssessment.ts";
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

const flatPath = (via = 0) => assessLeg([{ lat: 0, lon: 0 }, { lat: via, lon: .001 }, { lat: 0, lon: .002 }], [0, 0, 0], 15);
const planned = (balanced = false, lower = false): PlannedLeg[] => [{ ...itineraryLegs(start, [a], false)[0], result: {
  status: "ok", terrain: { label: "Test", spacingM: 1, regional: false }, shortest: flatPath(),
  balanced: balanced ? flatPath(.0001) : undefined, alternative: lower ? flatPath(.0002) : undefined,
} }];

test("shortest stays selectable when only lower terrain is distinct", () => {
  assert.deepEqual(itinerary.availableChoices(planned(false, true)).map(({ id }) => id), ["shortest", "lower-terrain"]);
});

test("coincident objectives give one shortest recommended choice, including cloned geometry", () => {
  const legs = planned();
  assert.equal(legs[0].result?.status, "ok");
  if (legs[0].result?.status !== "ok") return;
  legs[0].result.balanced = structuredClone(legs[0].result.shortest);
  legs[0].result.alternative = structuredClone(legs[0].result.shortest);
  assert.deepEqual(itinerary.availableChoices(legs).map(({ id }) => id), ["shortest"]);
});

test("every distinct solver path is mapped verbatim, with selected path drawn last", () => {
  const legs = planned(true, true);
  const paths = itinerary.mapLegsForChoices(legs, "balanced");
  assert.equal(paths.length, 3);
  assert.deepEqual(paths.map(({ choice }) => choice), ["shortest", "lower-terrain", "balanced"]);
  assert.deepEqual(paths.map(({ selected }) => selected), [false, false, true]);
  for (const path of paths) assert.equal(path.points, itinerary.selectedLeg(legs[0].result, path.choice!)!.points);
  assert.deepEqual(paths.map(({ color }) => color), ["#ffc184", "#a7f48c", "#69d5ff"]);
});

test("shared legs are not duplicated and a distinct return still offers a choice", () => {
  const legs = [...planned(), { ...planned(true, true)[0], returning: true }];
  assert.equal(itinerary.availableChoices(legs).length, 3);
  const paths = itinerary.mapLegsForChoices(legs, "lower-terrain");
  assert.equal(paths.length, 4);
  assert.equal(paths.filter(({ selected }) => selected).length, 2);
  assert.equal(paths.filter(({ returning }) => returning).length, 3);
  assert.deepEqual(itinerary.mapLegsForChoices([{ ...legs[0], result: { status: "no-route", detail: "Blocked" } }], "shortest"), []);
});

test("choice restoration retains the requested objective while calculations use an available choice", () => {
  for (const choice of ["shortest", "balanced", "lower-terrain"] as const) {
    const input: Plan = { version: 2, data: PLAN_DATA_VERSION, start, stops: [a], returnToLander: true,
      slope: 15, weighted: choice !== "shortest", choice, mission };
    assert.equal(readPlan(JSON.stringify(input))?.choice, choice);
    const legs = planned(true, true);
    const summary = summarizeItinerary(legs, [a], mission, choice);
    const selected = itinerary.selectedLeg(legs[0].result, choice)!;
    assert.equal(summary.distanceKm, selected.distanceKm);
    assert.equal(summary.travel, selected.assessment!.equivalentDistanceKm * 1000 / mission.speed / 60);
  }
  assert.equal(itinerary.effectiveChoice(planned(), "balanced"), "shortest");
  assert.equal(itinerary.effectiveChoice(planned(true), "lower-terrain"), "balanced");
});

test("a replanned return counts only unvisited science and does not invent an unused mission budget", () => {
  const leg = { ...planned()[0], returning: true };
  const summary = summarizeItinerary([leg], [a, b], mission, "shortest", { nextStop: 1, at: 1000 });
  assert.equal(summary.science, b.scienceMinutes);
  assert.equal(summary.remaining, null);
  assert.ok(summary.travel! > 0);
  assert.equal(summarizeItinerary([leg], [a, b], mission, "shortest", { nextStop: 2, at: 2000 }).science, 0);
});

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
