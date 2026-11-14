import assert from "node:assert/strict";
import { test } from "node:test";
import { elevationAt } from "../../src/contracts/index.ts";
import { missionFixture, routeFixtures } from "../../src/fixtures/marswalk.ts";

test("usable fixtures carry two different complete round trips and separate mission timing", () => {
  const { request, result } = routeFixtures.usable;
  const { shortest, alternative } = result;
  const gentler = alternative.terrainWeighted;
  for (const trip of [shortest, gentler]) {
    assert.deepEqual(trip.outbound.geometry[0], request.habitat);
    assert.deepEqual(trip.outbound.geometry.at(-1), request.destination);
    assert.deepEqual(trip.return.geometry[0], request.destination);
    assert.deepEqual(trip.return.geometry.at(-1), request.habitat);
  }
  assert.ok(shortest.outbound.horizontalDistanceM < gentler.outbound.horizontalDistanceM);
  assert.ok(shortest.outbound.maxAbsSlopeDeg > gentler.outbound.maxAbsSlopeDeg);
  assert.ok(missionFixture.status === "assessed");
  const { assumptions, shortest: estimate } = missionFixture;
  assert.equal(estimate.outboundS, shortest.outbound.horizontalDistanceM / assumptions.walkingSpeedMps);
  assert.equal(estimate.returnMarginS, assumptions.timeBudgetS - estimate.elapsedS - assumptions.reserveS);
  assert.ok(estimate.returnMarginS > missionFixture.terrainWeighted!.returnMarginS);
});

test("missing terrain, no route and coincident candidates are distinguishable", () => {
  const { missingTerrain, noRoute, coincident } = routeFixtures;
  assert.equal(elevationAt(missingTerrain.request.terrain, missingTerrain.request.destination), undefined);
  assert.equal(missingTerrain.result.status, "unavailable");
  assert.equal(missingTerrain.result.reason, "missing-terrain");
  assert.equal(elevationAt(noRoute.request.terrain, noRoute.request.destination), 0);
  assert.equal(noRoute.result.status, "no-route");
  assert.equal(coincident.result.alternative.status, "coincident");
  assert.ok(!("terrainWeighted" in coincident.result.alternative));
});
