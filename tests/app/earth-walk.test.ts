import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWalkTrack, deviationTracker, locateOnWalk, marsFromEarth, orderedStopDistances, routeCue, sampleWalk, shorterFromSamePosition, stepDetector, usableFix } from "../../src/explorer/earthWalk.ts";
import { relativeToLander } from "../../src/explorer/geo.ts";

const north = { lat: 18.456, lon: 77.406 };
const south = { lat: 18.455, lon: 77.406 };
const east = { lat: 18.456, lon: 77.407 };
const track = buildWalkTrack([
  { point: south, elevation: 0 }, { point: north, elevation: 0 },
  { point: east, elevation: 12 }, { point: north, elevation: 0 }, { point: south, elevation: 0 },
]);

test("Earth offsets are mapped 1:1, including a longitude seam crossing", () => {
  const start = { lat: 30, lon: 179.99995, accuracy: 4, timestamp: 1 };
  const degrees = 180 / Math.PI / 6_371_008.8;
  const finish = { ...start, lat: 30 + 10 * degrees, lon: start.lon + 20 * degrees / Math.cos(Math.PI / 6) - 360 };
  const result = relativeToLander(south, marsFromEarth(start, finish, south), null, null);
  assert.ok(Math.abs(result.eastM - 20) < 0.01);
  assert.ok(Math.abs(result.northM - 10) < 0.01);
});

test("GPS rejects weak, stale and out-of-order fixes", () => {
  const fix = { ...north, accuracy: 4, timestamp: 10000 };
  assert.equal(usableFix(fix, 10200, 9999), true);
  assert.equal(usableFix({ ...fix, accuracy: 13 }, 10200, 9999), false);
  assert.equal(usableFix(fix, 15100, 9999), false);
  assert.equal(usableFix(fix, 10200, 10000), false);
});

test("reroute requires sustained deviation outside accuracy and a fair distance comparison", () => {
  const deviation = deviationTracker();
  assert.equal(deviation(18, 16, 1000), false);
  assert.equal(deviation(18, 4, 2000), false);
  assert.equal(deviation(18, 4, 3500), false);
  assert.equal(deviation(18, 4, 4600), true);
  assert.equal(deviation(18, 4, 9900), false);
  assert.equal(shorterFromSamePosition(70, null), false);
  assert.equal(shorterFromSamePosition(70, 90), true);
});

test("route matching at a return crossing stays within the current leg", () => {
  const [first, second, third] = orderedStopDistances(track, [north, east, north]);
  assert.ok(first < second && second < third);
  assert.equal(locateOnWalk(track, south, 0, first).metres, 0);
  assert.equal(locateOnWalk(track, north, second, third).metres, third);
  assert.deepEqual(sampleWalk(track, track.at(-1)!.metres).point, south);
});

test("step detector ignores constant gravity and debounces peaks", () => {
  const steps = stepDetector();
  assert.equal(steps(null, 9.81, 1000), false);
  assert.equal(steps(null, 9.81, 1100), false);
  assert.equal(steps(2, 9.81, 1200), true);
  assert.equal(steps(0, 9.81, 1300), false);
  assert.equal(steps(2, 9.81, 1400), false);
  assert.equal(steps(0, 9.81, 1500), false);
  assert.equal(steps(null, 12.3, 1580), true);
});

test("terrain cues distinguish a mapped slope from missing elevation", () => {
  assert.equal(routeCue(track, track[1].metres + 1), "slope");
  const missing = buildWalkTrack([{ point: south, elevation: 0 }, { point: north, elevation: null }]);
  assert.equal(routeCue(missing, 0), "terrain");
});
