import { MARS_RADIUS_KM } from "./geo.ts";
import type { LatLon } from "./geo.ts";

export const galeElevationFile = "./layers/regional/gale-terrain.f32";
export const metresPerDegree = MARS_RADIUS_KM * 1000 * Math.PI / 180;
export const galeLayout = { westM: 8_141_800, northM: -276_200, pixelSizeM: 20, width: 310, height: 310 };
export const galeBounds = {
  west: galeLayout.westM,
  east: galeLayout.westM + galeLayout.width * galeLayout.pixelSizeM,
  north: galeLayout.northM,
  south: galeLayout.northM - galeLayout.height * galeLayout.pixelSizeM,
};

export function nearGale(point: LatLon, padding = 0) {
  const x = point.lon * metresPerDegree, y = point.lat * metresPerDegree;
  const { west, east, north, south } = galeBounds;
  return x >= west - padding && x < east + padding && y > south - padding && y <= north + padding;
}
