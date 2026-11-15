import assert from "node:assert/strict";
import test from "node:test";
import { assessLeg } from "../../src/explorer/routeAssessment.ts";
import { automaticMission, defaultMission, readPlan } from "../../src/explorer/missionPlan.ts";
import { buildTravelTrack, advanceTravel, cyclePlaybackRate, terrainAhead } from "../../src/explorer/travelModel.ts";
import { scienceCandidates, nearestReachable } from "../../src/explorer/destinationScience.ts";
import type { CatalogEvent } from "../../src/explorer/catalog.ts";
import { greatCircleKm } from "../../src/explorer/geo.ts";
import { buildWalkTrack, nextManeuver } from "../../src/explorer/earthWalk.ts";
import { routeAtMapPoint } from "../../src/explorer/mapRouteHit.ts";

const flat = assessLeg([{ lat: 0, lon: 0 }, { lat: 0, lon: .001 }, { lat: 0, lon: .002 }], [0, 0, 0], 15);

test("ETA and simulated movement share the same physical clock for Walk and NASA Rover", () => {
  for (const speed of [.7, .042]) {
    const track = buildTravelTrack([flat], speed, 15);
    assert.ok(Math.abs(track.at(-1)!.seconds - flat.distanceKm * 1000 / speed) < 1e-8);
    const halfway = advanceTravel(track, 0, track.at(-1)!.seconds / 2, 1);
    assert.ok(Math.abs(halfway.metres - flat.distanceKm * 500) < 1e-6);
    const fast = advanceTravel(track, 0, track.at(-1)!.seconds / 8, 4);
    assert.ok(Math.abs(fast.metres - halfway.metres) < 1e-6);
    assert.equal(advanceTravel(track, 0, track.at(-1)!.seconds * 2, 4).metres, track.at(-1)!.metres);
  }
});

test("terrain slows movement consistently without changing route geometry or acceleration distorting mission ETA", () => {
  const rising = assessLeg(flat.points, [0, 10, 20], 15);
  const track = buildTravelTrack([rising], .7, 15);
  assert.ok(Math.abs(track.at(-1)!.seconds - rising.assessment!.equivalentDistanceKm * 1000 / .7) < 1e-8);
  assert.ok(track.at(-1)!.seconds > buildTravelTrack([flat], .7, 15).at(-1)!.seconds);
  assert.deepEqual(track.map(({ point }) => point), rising.points);
  assert.deepEqual([cyclePlaybackRate(1), cyclePlaybackRate(60), cyclePlaybackRate(180), cyclePlaybackRate(600)], [60, 180, 600, 1]);
  assert.match(terrainAhead(track, 0)!.label, /Uphill/);
  assert.equal(terrainAhead(buildTravelTrack([flat], .7, 15), 0), null);
});

test("fast-forward advances mission time and distance together without changing the modeled arrival", () => {
  const track = buildTravelTrack([flat], .042, 15);
  const duration = track.at(-1)!.seconds;
  const departure = Date.UTC(2026, 10, 15, 10);
  let metres = 0, missionSeconds = 0;
  for (const rate of [1, 60, 180, 600] as const) {
    const step = advanceTravel(track, metres, 1, rate);
    missionSeconds += step.advancedSeconds;
    metres = step.metres;
    const remaining = duration - step.seconds;
    assert.ok(Math.abs(departure + missionSeconds * 1000 + remaining * 1000 - (departure + duration * 1000)) < .01);
  }
  assert.ok(metres > advanceTravel(track, 0, 4, 1).metres * 100);
  const arrival = advanceTravel(track, metres, duration, 600);
  assert.ok(Math.abs(missionSeconds + arrival.advancedSeconds - duration) < 1e-8, "clock stops at arrival instead of overshooting");
  assert.equal(arrival.metres, track.at(-1)!.metres);
  assert.equal(advanceTravel(track, metres, 0, 600).advancedSeconds, 0, "paused preview advances neither clock nor traveler");
});

test("new automatic profiles and old saved plans remain readable without preserving unrealistic rover timing", () => {
  const mission = automaticMission({ ...defaultMission(), roverSpeed: 1.2, speed: 1.5 });
  assert.equal(mission.roverSpeed, .042);
  assert.equal(mission.speed, .7);
  assert.equal(automaticMission({ ...defaultMission(), roverSlope: 5 }).roverSlope, 5, "automatic timing must preserve a stricter saved constraint");
  const plan = { version: 2, data: "older-data", start: flat.points[0], stops: [{ point: flat.points.at(-1), scienceMinutes: 5 }],
    returnToLander: true, slope: 15, weighted: true, mission: { ...mission, roverSpeed: 1.2, automatic: undefined } };
  assert.ok(readPlan(JSON.stringify(plan)));
  assert.ok(readPlan(JSON.stringify({ ...plan, mission })));
});

const event = (id: string, lon: number): CatalogEvent => ({ id, title: id, date: null, sol: null, mission: "Test", missionId: "test",
  type: "science-observation", observed: true, summary: "Sourced observation", found: "Measured mineral", scientificValue: "Scientific context",
  region: "Test", aliases: [], location: { lat: 0, lon, precision: "precise", coordinateSource: { title: "Test", url: "https://example.com" } },
  evidence: [{ title: "Test", url: "https://example.com" }], media: [], sourceIds: [] });

test("nearest discovery and nearest reachable science can differ; lower-bound search proves the scoped nearest", async () => {
  const origin = { lat: 0, lon: 0 };
  const events = [event("blocked", .001), event("reachable", .002), event("far", .02), { ...event("proposed", .0001), observed: false }];
  const candidates = scienceCandidates(events, origin);
  assert.deepEqual(candidates.map(({ event }) => event.id), ["blocked", "reachable", "far"]);
  const searched: string[] = [];
  const result = await nearestReachable(candidates, async ({ event, distanceKm }) => {
    searched.push(event.id);
    return event.id === "blocked" ? { status: "no-route" } : { status: "ok", distanceKm: distanceKm * 1.1 };
  }, new AbortController().signal);
  assert.equal(result.site?.event.id, "reachable");
  assert.deepEqual(searched, ["blocked", "reachable"]);
  assert.ok(result.site!.routeDistanceKm > greatCircleKm(origin, events[1].location!));
});

test("unknown coverage and cancellation do not invent a reachable checkpoint", async () => {
  const candidates = scienceCandidates([event("unknown", .001)], { lat: 0, lon: 0 });
  const result = await nearestReachable(candidates, async () => ({ status: "unavailable" }), new AbortController().signal);
  assert.equal(result.site, null);
  assert.equal(result.unresolved, true);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(nearestReachable(candidates, async () => ({ status: "no-route" }), controller.signal), /abort/i);
});

test("turn instructions stay anchored to the same maneuver as the traveler advances", () => {
  const unit = .001 / (greatCircleKm({ lat: 0, lon: 0 }, { lat: 0, lon: .001 }) * 1000);
  const track = buildWalkTrack([{ point: { lat: 0, lon: 0 }, elevation: 0 },
    { point: { lat: 0, lon: 20 * unit }, elevation: 0 }, { point: { lat: 20 * unit, lon: 20 * unit }, elevation: 0 }]);
  const first = nextManeuver(track, 0, track.at(-1)!.metres);
  const moved = nextManeuver(track, .2, track.at(-1)!.metres);
  assert.notEqual(first.kind, "stop");
  assert.equal(moved.kind, first.kind);
  assert.ok(Math.abs(first.metres - (moved.metres + .2)) < 1e-7);
});

test("map taps choose the closest real route without connecting across the longitude seam", () => {
  const paths = [{ points: [{ lat: 0, lon: 0 }, { lat: 0, lon: 10 }], choice: "shortest" as const, returning: false, distanceKm: 1 },
    { points: [{ lat: 2, lon: 0 }, { lat: 2, lon: 10 }], choice: "lower-terrain" as const, returning: false, distanceKm: 1 }];
  const project = ({ lat, lon }: { lat: number; lon: number }) => ({ x: lon, y: lat });
  assert.equal(routeAtMapPoint(paths, { x: 5, y: 1.8 }, project, 2)?.choice, "lower-terrain");
  assert.equal(routeAtMapPoint(paths, { x: 5, y: 10 }, project, 2), null);
  assert.equal(routeAtMapPoint([{ ...paths[0], points: [{ lat: 0, lon: -179 }, { lat: 0, lon: 179 }] }], { x: 0, y: 0 }, project, 2, 180), null);
});
