import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildItineraryTrack, buildWalkTrack, deviationTracker, earthGpsDevice, gpsMovement, locateOnWalk, marsFromEarth, nearbyLandmark, nextManeuver, orderedStopDistances, routeCue, sampleWalk, shorterFromSamePosition, stepDetector, usableFix } from "../../src/explorer/earthWalk.ts";
import type { Catalog } from "../../src/explorer/catalog.ts";
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
  const scaled = relativeToLander(south, marsFromEarth(start, finish, south, 100), null, null);
  assert.ok(Math.abs(scaled.eastM - 2000) < 1.1);
  assert.ok(Math.abs(scaled.northM - 1000) < 1.1);
});

test("GPS rejects weak, stale and out-of-order fixes", () => {
  const fix = { ...north, accuracy: 4, timestamp: 10000 };
  assert.equal(usableFix(fix, 10200, 9999), true);
  assert.equal(usableFix({ ...fix, accuracy: 13 }, 10200, 9999), false);
  assert.equal(usableFix(fix, 15100, 9999), false);
  assert.equal(usableFix(fix, 10200, 10000), false);
});

test("Earth motion maps across a Martian pole without leaving valid coordinates", () => {
  const origin = { lat: 31, lon: 35, accuracy: 3, timestamp: 1000 };
  const lander = { lat: 89.99999, lon: 20 };
  const fix = { ...origin, lat: origin.lat + 10 / 111_195 };
  const point = marsFromEarth(origin, fix, lander);
  assert.ok(point.lat < 90 && point.lat > 89.99);
  assert.ok(Math.abs(point.lon + 160) < 0.1);
  assert.ok(Math.abs(relativeToLander(lander, point, null, null).northM - 10) < 0.02);
});

test("GPS movement rejects stationary jitter and isolated jumps", () => {
  const fix = { lat: 0, lon: 0, accuracy: 4, timestamp: 1000 };
  const moved = gpsMovement(fix);
  const north = (metres: number, timestamp: number) => ({ ...fix, lat: metres / 111_195, timestamp });
  assert.equal(moved(north(3, 2000)), false);
  assert.equal(moved(north(10, 3000)), false);
  assert.equal(moved(north(1, 4000)), false);
  assert.equal(moved(north(8, 5000)), false);
  assert.equal(moved(north(11, 6000)), true);
  assert.equal(moved(north(13, 7000)), false);
});

test("GPS option is limited to handheld or tablet-class devices", () => {
  assert.equal(earthGpsDevice("Windows NT 10.0", 0, false), false);
  assert.equal(earthGpsDevice("Macintosh", 0, false), false);
  assert.equal(earthGpsDevice("Windows NT 10.0", 10, false), false);
  assert.equal(earthGpsDevice("Macintosh", 5, true), true);
  assert.equal(earthGpsDevice("Android", 5, true), true);
});

test("GPS reacquisition discards an unconfirmed fix from before the interruption", () => {
  const fix = { lat: 0, lon: 0, accuracy: 3, timestamp: 1000 };
  const moved = gpsMovement(fix);
  assert.equal(moved({ ...fix, lat: 0.0001, timestamp: 2000 }), false);
  moved(null);
  assert.equal(moved({ ...fix, lat: 0.00012, timestamp: 3000 }), false);
  assert.equal(moved({ ...fix, lat: 0.00014, timestamp: 4000 }), true);
});

test("itinerary progress uses the leg boundary when a stop has already been crossed", () => {
  const points = (...coords: typeof north[]) => coords.map((point) => ({ point, elevation: 0 }));
  const itinerary = buildItineraryTrack([
    { toStop: 0, points: points(south, north, east, north) },
    { toStop: 1, points: points(north, east) },
    { toStop: null, points: points(east, south) },
  ]);
  assert.equal(itinerary.stopDistances[0], itinerary.track[3].metres);
  assert.equal(itinerary.stopDistances[1], itinerary.track[4].metres);
  assert.ok(itinerary.stopDistances[0] > itinerary.track[1].metres);
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
  assert.equal(routeCue(track, track[1].metres - 3, track[1].metres), null);
});

test("the maneuver arrow and distance follow the routed bend and stop boundary", () => {
  const path = buildWalkTrack([south, north, east].map((point) => ({ point, elevation: 0 })));
  const stop = path[1].metres;
  const right = nextManeuver(path, stop - 35, path.at(-1)!.metres);
  assert.equal(right.kind, "right");
  assert.ok(Math.abs(right.metres - 35) <= 4);
  assert.deepEqual(nextManeuver(path, stop - 35, stop), { kind: "stop", metres: 35 });
  const mirrored = buildWalkTrack([south, north, { lat: north.lat, lon: north.lon - 0.001 }].map((point) => ({ point, elevation: 0 })));
  assert.equal(nextManeuver(mirrored, stop - 35, mirrored.at(-1)!.metres).kind, "left");
});

test("nearby rover landmarks use sourced coordinates and follow the active leg", () => {
  const catalog: Catalog = JSON.parse(readFileSync(new URL("../../data/mars/catalog/events.json", import.meta.url), "utf8"));
  const event = catalog.events.find(({ title }) => title === "Berry Hollow abrasion at Wildcat Ridge")!;
  const { lat, lon } = event.location!;
  const crew = { lat: lat - 0.0005, lon };
  const points = buildWalkTrack([crew, { lat: lat + 0.0005, lon }].map((point) => ({ point, elevation: 0 })));
  const full = points[1].metres;
  const alert = nearbyLandmark([event], crew, points, 0, full, new Set());
  assert.equal(alert?.text, "Nearby: Berry Hollow abrasion at Wildcat Ridge, about 30 metres north.");
  assert.equal(nearbyLandmark([event], crew, points, 0, full, new Set(alert?.ids)), null);
  assert.equal(nearbyLandmark([{ ...event, observed: false }], crew, points, 0, full, new Set()), null);
  assert.equal(nearbyLandmark([{ ...event, location: { ...event.location!, uncertaintyM: 120 } }], crew, points, 0, full, new Set()), null);
  const moved = { lat, lon: lon - 0.0005 };
  assert.match(nearbyLandmark([event], moved, points, 0, full, new Set())?.text ?? "", /about 30 metres east/);
  assert.doesNotMatch(nearbyLandmark([event], { lat, lon }, points, 0, full, new Set())?.text ?? "", /east|west|north|south/);
  const fartherSouth = { lat: lat - 0.0008, lon };
  const anotherLeg = buildWalkTrack([fartherSouth, { lat: fartherSouth.lat - 0.001, lon }].map((point) => ({ point, elevation: 0 })));
  const northOfSite = { lat: lat + 0.0001, lon };
  assert.equal(nearbyLandmark([event], northOfSite, anotherLeg, 1, 20, new Set()), null);
});
