import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { cellAt, cellCenter, elevationAt, groundDistanceM, projectMars, unprojectMars } from "../../src/contracts/index.ts";
import { decodeJezeroRaster, jezeroWaypoint } from "../../src/contracts/jezero.ts";

const readRaster = async (file: string) => {
  const bytes = await readFile(new URL(`../../data/mars/jezero/${file}.tif`, import.meta.url));
  return new Uint8Array(bytes).buffer;
};

test("Jezero rasters align at the verified Sol 502 waypoint", async () => {
  const [elevation, imagery] = await Promise.all([
    decodeJezeroRaster(await readRaster("elevation"), "elevation"),
    decodeJezeroRaster(await readRaster("imagery"), "imagery"),
  ]);
  const { terrain } = elevation;
  const { location } = jezeroWaypoint;
  assert.ok(Math.abs(location.xM - 4_588_212.788) < 0.001);
  assert.ok(Math.abs(location.yM - 1_094_130.734) < 0.001);
  assert.deepEqual(cellAt(terrain.layout, location), { row: 189, column: 196 });
  assert.deepEqual(cellAt(imagery.layout, location), { row: 757, column: 787 });
  assert.equal(elevationAt(terrain, location), -2523.197509765625);
  assert.equal(imagery.grayscaleDn[757 * imagery.layout.width + 787], 164);
  assert.equal(terrain.elevationsM.length, 147_456);
  assert.equal(imagery.grayscaleDn.length, 2_359_296);
  assert.ok(terrain.elevationsM.every(Number.isFinite));
  assert.ok(imagery.grayscaleDn.every((dn) => dn !== imagery.noDataDn));

  const origin = cellCenter(terrain.layout, { row: 189, column: 196 });
  const north = cellCenter(terrain.layout, { row: 188, column: 196 });
  const east = cellCenter(terrain.layout, { row: 189, column: 197 });
  const rise = elevationAt(terrain, north)! - elevationAt(terrain, origin)!;
  assert.equal(groundDistanceM(origin, north), 1);
  assert.ok(Math.abs(groundDistanceM(origin, east) - 0.94855) < 0.0001);
  assert.ok(Math.abs(Math.atan2(rise, groundDistanceM(origin, north)) * 180 / Math.PI - 7.895) < 0.001);
});

test("projection round-trips and raster edges use north-west inclusive indexing", () => {
  const coordinates = { longitudeEastDeg: 77.40592495, latitudePlanetocentricDeg: 18.45864728 };
  const recovered = unprojectMars(projectMars(coordinates));
  assert.ok(Math.abs(recovered.longitudeEastDeg - coordinates.longitudeEastDeg) < 1e-10);
  assert.ok(Math.abs(recovered.latitudePlanetocentricDeg - coordinates.latitudePlanetocentricDeg) < 1e-10);

  const layout = { westM: 4_588_016, northM: 1_094_320, width: 384, height: 384, pixelSizeM: 1 };
  assert.deepEqual(cellAt(layout, { xM: 4_588_016, yM: 1_094_320 }), { row: 0, column: 0 });
  assert.deepEqual(cellAt(layout, cellCenter(layout, { row: 383, column: 383 })), { row: 383, column: 383 });
  assert.equal(cellAt(layout, { xM: 4_588_400, yM: 1_094_320 }), undefined);
  assert.equal(cellAt(layout, { xM: 4_588_016, yM: 1_093_936 }), undefined);
  assert.equal(cellAt(layout, { xM: 4_588_015, yM: 1_094_320 }), undefined);
  assert.equal(cellAt(layout, { xM: 4_588_016, yM: 1_094_321 }), undefined);
  assert.equal(cellAt(layout, { xM: NaN, yM: 1_094_320 }), undefined);
});

test("a different raster is rejected instead of being given the wrong alignment", async () => {
  await assert.rejects(decodeJezeroRaster(await readRaster("imagery"), "elevation"), /metadata/);
});
