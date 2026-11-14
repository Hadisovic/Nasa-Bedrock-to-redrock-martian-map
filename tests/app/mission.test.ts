import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { assessMission, formatDuration } from "../../src/analysis/mission.ts";
import { slopeDegrees } from "../../src/analysis/terrain.ts";
import { cellAt } from "../../src/contracts/index.ts";
import { decodeJezeroRaster, jezeroWaypoint } from "../../src/contracts/jezero.ts";
import { missionFixture, routeFixtures } from "../../src/fixtures/marswalk.ts";
import { habitatPresets, roverTraverse, stories, wildcatRidge, ELEVATION_LAYOUT } from "../../src/data/sites.ts";
import { DEMOS } from "../../src/components/demos.ts";
import { planRoundTrip } from "../../src/analysis/routing.ts";

const usableRoute = routeFixtures.usable.result;
const timingAssumptions = missionFixture.status === "assessed" ? missionFixture.assumptions : undefined!;

test("routing reproduces the shared fixture outcomes", () => {
  for (const [name, fixture] of Object.entries(routeFixtures)) {
    const { result } = planRoundTrip(fixture.request);
    assert.equal(result.status, fixture.result.status, name);
    if (result.status !== "available" && fixture.result.status !== "available") assert.equal(result.reason, fixture.result.reason, name);
  }
  const coincident = planRoundTrip(routeFixtures.coincident.request).result;
  assert.ok(coincident.status === "available" && coincident.alternative.status === "coincident");
});

test("mission timing follows the shared contract and can go negative", () => {
  assert.deepEqual(assessMission(usableRoute, timingAssumptions), missionFixture);
  const assessment = assessMission(usableRoute, timingAssumptions);
  assert.equal(assessment.status, "assessed");
  if (assessment.status !== "assessed" || usableRoute.status !== "available") return;
  const { shortest } = assessment;
  const expectedOut = usableRoute.shortest.outbound.horizontalDistanceM / timingAssumptions.walkingSpeedMps;
  assert.equal(shortest.outboundS, expectedOut);
  assert.equal(shortest.elapsedS, shortest.outboundS + shortest.returnS + timingAssumptions.scienceStopS);
  assert.equal(shortest.returnMarginS, timingAssumptions.timeBudgetS - shortest.elapsedS - timingAssumptions.reserveS);

  const tight = assessMission(usableRoute, { ...timingAssumptions, timeBudgetS: 0 });
  assert.ok(tight.status === "assessed" && tight.shortest.returnMarginS < 0);
  assert.equal(assessMission(usableRoute, { ...timingAssumptions, walkingSpeedMps: 0 }).status, "unavailable");
  assert.equal(formatDuration(-3660), "−1 h 01 min");
});

test("calculated slope matches the independently verified waypoint step", async () => {
  const bytes = new Uint8Array(await readFile(new URL("../../data/mars/jezero/elevation.tif", import.meta.url))).buffer;
  const { terrain } = await decodeJezeroRaster(bytes, "elevation");
  const slope = slopeDegrees(terrain);
  const cell = cellAt(terrain.layout, jezeroWaypoint.location)!;
  const value = slope[cell.row * terrain.layout.width + cell.column];
  // Horn's 3 × 3 gradient is smoother than the single 7.895° north step but of the same order.
  assert.ok(value > 2 && value < 15, `slope ${value}`);
  assert.ok(Number.isNaN(slope[0]), "edge cells have no full neighbourhood");
});

test("sourced pins sit inside the crop and the depot is out of range", () => {
  assert.equal(cellAt(ELEVATION_LAYOUT, wildcatRidge.location)?.row, 189);
  assert.equal(roverTraverse.length, 43);
  assert.ok(roverTraverse.every((w) => cellAt(ELEVATION_LAYOUT, w.location)));
  assert.ok(habitatPresets.every((h) => cellAt(ELEVATION_LAYOUT, h.location)));
  assert.equal(stories.find((s) => s.id === "three-forks")?.inRange, false);
  assert.ok(stories.every((s) => s.sources.length > 0));
});

test("the three demonstration scenarios produce go, no-go and no-route", async () => {
  const bytes = new Uint8Array(await readFile(new URL("../../data/mars/jezero/elevation.tif", import.meta.url))).buffer;
  const { terrain } = await decodeJezeroRaster(bytes, "elevation");
  const outcome = (id: string) => {
    const { inputs } = DEMOS.find((d) => d.id === id)!;
    const habitat = habitatPresets.find((h) => h.id === inputs.habitatId)!;
    const { result } = planRoundTrip({ habitat: habitat.location, destination: wildcatRidge.location, terrain, maxAbsSlopeDeg: inputs.maxAbsSlopeDeg, slopePenaltyWeight: inputs.slopePenaltyWeight });
    return { result, assessment: assessMission(result, inputs.assumptions) };
  };
  const baseline = outcome("baseline");
  assert.ok(baseline.assessment.status === "assessed" && baseline.assessment.shortest.returnMarginS > 0);
  const changed = outcome("changed");
  assert.ok(changed.assessment.status === "assessed" && changed.assessment.shortest.returnMarginS < 0);
  assert.equal(outcome("blocked").result.status, "no-route");
});
