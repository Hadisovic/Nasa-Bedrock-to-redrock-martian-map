import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterScreen, greatCircleKm, latLonToUnit, lonDelta, toEquirectPixel, unitToLatLon, wrapLon } from "../../src/explorer/geo.ts";
import { matchesFilter, searchEvents } from "../../src/explorer/catalog.ts";
import type { CatalogEvent } from "../../src/explorer/catalog.ts";
import { clampView } from "../../src/explorer/types.ts";

test("longitudes wrap at the 180° seam", () => {
  assert.equal(wrapLon(180), -180);
  assert.equal(wrapLon(190), -170);
  assert.equal(wrapLon(-190), 170);
  assert.equal(wrapLon(540), -180);
  assert.equal(lonDelta(179, -179), 2);
  assert.equal(lonDelta(-179, 179), -2);
});

test("globe vectors round-trip and agree with the equirectangular basemap", () => {
  for (const p of [{ lat: 18.4586, lon: 77.4059 }, { lat: -4.59, lon: 137.44 }, { lat: 0, lon: 179.999 }, { lat: 0, lon: -179.999 }, { lat: -60, lon: -45 }]) {
    const back = unitToLatLon(latLonToUnit(p));
    assert.ok(Math.abs(back.lat - p.lat) < 1e-9 && Math.abs(lonDelta(back.lon, p.lon)) < 1e-9, JSON.stringify(p));
  }
  // Points either side of the seam are neighbours on the globe and at opposite image edges.
  const east = latLonToUnit({ lat: 0, lon: 179.9 }), west = latLonToUnit({ lat: 0, lon: -179.9 });
  assert.ok(Math.hypot(east[0] - west[0], east[1] - west[1], east[2] - west[2]) < 0.004);
  assert.ok(toEquirectPixel({ lat: 0, lon: 179.9 }, 4096, 2048).x > 4094);
  assert.ok(toEquirectPixel({ lat: 0, lon: -179.9 }, 4096, 2048).x < 2);
  // Jezero lands where the basemap puts it.
  const px = toEquirectPixel({ lat: 18.4586, lon: 77.4059 }, 4096, 2048);
  assert.equal(Math.round(px.x), 2929);
  assert.equal(Math.round(px.y), 814);
  assert.ok(Math.abs(greatCircleKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 59.27) < 0.01);
});

test("clustering groups nearby markers and keeps distant ones apart", () => {
  const items = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 5 }, { id: "c", x: 200, y: 0 }].map((m) => ({ item: m, x: m.x, y: m.y }));
  const clusters = clusterScreen(items, 34, (m) => m.id);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].members.length, 2);
  assert.equal(clusters[0].id, "cluster:a");
  assert.equal(clusters[1].id, "c");
});

test("view clamps to the poles and wraps longitude", () => {
  const v = clampView({ lat: 89, lon: 200, zoom: 10 }, 600);
  assert.equal(v.lon, -160);
  assert.equal(v.lat, 60);
});

const event = (over: Partial<CatalogEvent>): CatalogEvent => ({
  id: "x", title: "Hazeltop sample", date: "2022-07-07", sol: 490, mission: "Mars 2020 Perseverance", missionId: "m2020",
  type: "sample", observed: true, summary: "", found: null, scientificValue: null, region: "Jezero Crater", aliases: ["Sample 12"],
  location: null, evidence: [], media: [], sourceIds: [], ...over,
});

test("search matches titles, aliases, missions and sols", () => {
  const list = [event({}), event({ id: "y", title: "Curiosity landing", missionId: "msl", mission: "MSL Curiosity", aliases: ["Bradbury Landing"], sol: 0, type: "landing" })];
  assert.equal(searchEvents(list, "sample 12")[0].id, "x");
  assert.equal(searchEvents(list, "bradbury")[0].id, "y");
  assert.equal(searchEvents(list, "sol 490")[0].id, "x");
  assert.equal(searchEvents(list, "nothing-here").length, 0);
  const filter = { missions: new Set(["msl"]), types: new Set<CatalogEvent["type"]>(), solMin: null, solMax: null, yearMin: null, yearMax: null };
  assert.equal(list.filter((e) => matchesFilter(e, filter)).length, 1);
});
