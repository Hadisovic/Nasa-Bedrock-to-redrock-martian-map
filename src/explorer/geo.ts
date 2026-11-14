/**
 * Whole-planet geometry shared by the 2D map, the 3D globe and the tests.
 *
 * Coordinates are planetocentric latitude and east longitude in degrees, −180..180, on the
 * Mars 2000 sphere. The bundled basemaps are equirectangular: column 0 is 180° W and row 0
 * is 90° N, so x = (lon + 180) / 360 × width and y = (90 − lat) / 180 × height.
 */

export interface LatLon { lat: number; lon: number }

export const MARS_RADIUS_KM = 3396.19;

/** Wrap any longitude into [−180, 180). */
export function wrapLon(lon: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return wrapped === 180 ? -180 : wrapped;
}

export const clampLat = (lat: number) => Math.max(-90, Math.min(90, lat));

/** Image-space position on an equirectangular raster of the given size. */
export function toEquirectPixel(p: LatLon, width: number, height: number) {
  return { x: ((wrapLon(p.lon) + 180) / 360) * width, y: ((90 - p.lat) / 180) * height };
}

/**
 * Unit vector for a location on the globe, matching three.js SphereGeometry's default UV
 * layout (u = 0 at 180° W, v = 1 at the north pole). Returned as a plain tuple so this file
 * stays free of three.js and testable in Node.
 */
export function latLonToUnit(p: LatLon): [number, number, number] {
  const phi = ((p.lon + 180) * Math.PI) / 180;
  const lat = (p.lat * Math.PI) / 180;
  return [-Math.cos(phi) * Math.cos(lat), Math.sin(lat), Math.sin(phi) * Math.cos(lat)];
}

export function unitToLatLon([x, y, z]: readonly [number, number, number]): LatLon {
  const r = Math.hypot(x, y, z) || 1;
  const lat = (Math.asin(Math.max(-1, Math.min(1, y / r))) * 180) / Math.PI;
  const phi = Math.atan2(z, -x);
  return { lat, lon: wrapLon((phi * 180) / Math.PI - 180) };
}

/** Great-circle distance on the Mars sphere, in kilometres. */
export function greatCircleKm(a: LatLon, b: LatLon): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad, dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * MARS_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Smallest signed longitude difference b − a, in (−180, 180]. */
export function lonDelta(a: number, b: number): number {
  const d = wrapLon(b - a);
  return d === -180 ? 180 : d;
}

/** Local tangent-frame offsets relative to a Mars surface point, in metres. */
export function relativeToLander(lander: LatLon, point: LatLon, landerM: number | null, pointM: number | null) {
  const distanceM = greatCircleKm(lander, point) * 1000;
  const bearing = bearingDeg(lander, point) * Math.PI / 180;
  return { eastM: Math.sin(bearing) * distanceM, northM: Math.cos(bearing) * distanceM,
    upM: landerM === null || pointM === null ? null : pointM - landerM };
}

export interface ScreenItem<T> { item: T; x: number; y: number }
export interface Cluster<T> { id: string; x: number; y: number; members: T[] }

/**
 * Greedy screen-space clustering. Items are visited in the given order (callers sort them
 * deterministically), and each joins the first cluster whose seed lies within `radiusPx`.
 */
export function clusterScreen<T>(items: readonly ScreenItem<T>[], radiusPx: number, idOf: (item: T) => string): Cluster<T>[] {
  const clusters: (Cluster<T> & { sx: number; sy: number })[] = [];
  const cell = Math.max(1, radiusPx);
  const grid = new Map<string, number[]>();
  for (const entry of items) {
    const gx = Math.floor(entry.x / cell), gy = Math.floor(entry.y / cell);
    let joined = -1;
    for (let dx = -1; dx <= 1 && joined < 0; dx++) {
      for (let dy = -1; dy <= 1 && joined < 0; dy++) {
        for (const index of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
          const c = clusters[index];
          if (Math.hypot(c.sx - entry.x, c.sy - entry.y) <= radiusPx) { joined = index; break; }
        }
      }
    }
    if (joined >= 0) {
      const c = clusters[joined];
      c.members.push(entry.item);
      // Centroid for display; the seed stays fixed for stable membership.
      c.x += (entry.x - c.x) / c.members.length;
      c.y += (entry.y - c.y) / c.members.length;
    } else {
      const index = clusters.length;
      clusters.push({ id: idOf(entry.item), x: entry.x, y: entry.y, sx: entry.x, sy: entry.y, members: [entry.item] });
      const key = `${gx},${gy}`;
      grid.set(key, [...(grid.get(key) ?? []), index]);
    }
  }
  return clusters.map(({ id, x, y, members }) => ({ id: members.length > 1 ? `cluster:${id}` : id, x, y, members }));
}

/** Format a coordinate for display, e.g. "18.4586° N, 77.4059° E". */
export function formatLatLon(p: LatLon, digits = 4): string {
  const lat = `${Math.abs(p.lat).toFixed(digits)}° ${p.lat >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(p.lon).toFixed(digits)}° ${p.lon >= 0 ? "E" : "W"}`;
  return `${lat}, ${lon}`;
}

/** Initial geographic bearing clockwise from Martian north. */
export function bearingDeg(a: LatLon, b: LatLon) {
  const rad = Math.PI / 180, l = lonDelta(a.lon, b.lon) * rad, p = a.lat * rad, q = b.lat * rad;
  return (360 + Math.atan2(Math.sin(l) * Math.cos(q), Math.cos(p) * Math.sin(q) - Math.sin(p) * Math.cos(q) * Math.cos(l)) / rad) % 360;
}
