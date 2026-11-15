import assert from "node:assert/strict";
import test from "node:test";
import { assessLeg, compareLegs, estimateLegMinutes } from "../../src/explorer/routeAssessment.ts";
import { edgeRoughness, localRoughness, terrainPenalty } from "../../src/analysis/terrainCost.ts";
import { greatCircleKm } from "../../src/explorer/geo.ts";

const points = [{ lat: 0, lon: 179.999 }, { lat: 0, lon: -179.999 }, { lat: .001, lon: -179.999 }];
const metricLeg = (distanceKm: number, terrainCostKm: number) => ({ ...assessLeg(points, [0, 0, 0], 15), distanceKm,
  assessment: { ...assessLeg(points, [0, 0, 0], 15).assessment!, terrainCostKm, equivalentDistanceKm: distanceKm + terrainCostKm } });

test("assessment sums the actual geometry across the longitude seam and reverses elevation changes", () => {
  const forward = assessLeg(points, [10, 20, 5], 15);
  const reverse = assessLeg([...points].reverse(), [5, 20, 10], 15);
  const first = greatCircleKm(points[0], points[1]), second = greatCircleKm(points[1], points[2]);
  assert.equal(forward.distanceKm, first + second);
  assert.equal(reverse.distanceKm, forward.distanceKm);
  assert.equal(forward.climbM, 10);
  assert.equal(reverse.climbM, 15);
  assert.equal(forward.assessment!.descentM, 15);
  assert.equal(reverse.assessment!.descentM, 10);
  const max = Math.atan2(15, second * 1000) * 180 / Math.PI;
  assert.ok(Math.abs(forward.maxSlopeDeg - max) < 1e-12);
  assert.equal(forward.assessment!.steepDistanceKm, second);
  assert.equal(forward.assessment!.longestSteepRunKm, second);
  const allowance = first * terrainPenalty(10, first * 1000, 15) + second * terrainPenalty(-15, second * 1000, 15);
  assert.equal(forward.assessment!.terrainCostKm, allowance);
  assert.equal(estimateLegMinutes(forward, .7), (first + second + allowance) * 1000 / .7 / 60);
});

test("comparison enforces inclusive 25% detour and strict 1% equivalent-distance improvement", () => {
  const shortest = metricLeg(1, 1);
  assert.equal(compareLegs(shortest, metricLeg(1.25, .5)).balanced?.distanceKm, 1.25);
  assert.equal(compareLegs(shortest, metricLeg(1.250001, .1)).balanced, undefined);
  assert.equal(compareLegs(shortest, metricLeg(1, .98)).balanced, undefined);
  assert.ok(compareLegs(shortest, metricLeg(1, .979999)).balanced);
});

test("lower terrain requires both meaningful thresholds and cannot exceed the detour cap", () => {
  const shortest = metricLeg(1, .1);
  assert.equal(compareLegs(shortest, undefined, metricLeg(1.01, .095)).alternative, undefined);
  assert.ok(compareLegs(shortest, undefined, metricLeg(1.25, .094999)).alternative);
  assert.equal(compareLegs(shortest, undefined, metricLeg(1.250001, 0)).alternative, undefined);
  const high = metricLeg(1, 1);
  assert.equal(compareLegs(high, undefined, metricLeg(1.01, .99)).alternative, undefined);
  assert.ok(compareLegs(high, undefined, metricLeg(1.01, .989999)).alternative);
});

test("roughness removes a plane, is restricted to fine data and reports missing neighborhoods", () => {
  const flat = new Float32Array([0, 1, 2, 1, 2, 3, 2, 3, 4]);
  assert.equal(localRoughness(flat, 3, 3, 1)![4], 0);
  assert.equal(localRoughness(flat, 3, 3, 20), undefined);
  const unknown = localRoughness(new Float32Array([0, NaN, 0, 0, 0, 0, 0, 0, 0]), 3, 3, 1)!;
  assert.ok(Number.isNaN(unknown[4]));
  assert.equal(edgeRoughness(unknown, 4, 4), 1);
  const leg = assessLeg([{ lat: 0, lon: 0 }, { lat: 0, lon: .001 }], [0, 0], 15, { grid: unknown, cells: [4, 4] });
  assert.equal(leg.assessment!.roughnessCoverage, 0);
  assert.equal(leg.assessment!.terrainCostKm, leg.distanceKm * .25);
  assert.equal(terrainPenalty(-10, 100, 15), terrainPenalty(10, 100, 15) * .5);
});
