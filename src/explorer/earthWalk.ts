import { bearingDeg, greatCircleKm, lonDelta, MARS_RADIUS_KM, wrapLon } from "./geo.ts";
import type { LatLon } from "./geo.ts";

const radians = Math.PI / 180;
const earthRadiusM = 6_371_008.8;
const marsMetresPerDegree = MARS_RADIUS_KM * 1000 * radians;
export type WalkMode = "Outdoor" | "Indoor Steps" | "Recorded Walk";
export type WalkPose = { point: LatLon; heading: number; moving: boolean; tilt: number };
export type EarthFix = LatLon & { timestamp: number; accuracy: number };
export type RoutePoint = { point: LatLon; elevation: number | null };

export function marsFromEarth(anchor: EarthFix, fix: EarthFix, lander: LatLon): LatLon {
  const north = (fix.lat - anchor.lat) * radians * earthRadiusM;
  const east = lonDelta(anchor.lon, fix.lon) * radians * earthRadiusM * Math.cos(anchor.lat * radians);
  return { lat: lander.lat + north / marsMetresPerDegree,
    lon: wrapLon(lander.lon + east / (marsMetresPerDegree * Math.cos(lander.lat * radians))) };
}

export function usableFix(fix: EarthFix, now: number, previous: number) {
  return [fix.lat, fix.lon, fix.accuracy, fix.timestamp].every(Number.isFinite) &&
    Math.abs(fix.lat) <= 90 && Math.abs(fix.lon) <= 180 &&
    fix.accuracy >= 0 && fix.accuracy <= 12 && now - fix.timestamp <= 5000 &&
    fix.timestamp <= now + 1000 && fix.timestamp > previous;
}

export function deviationTracker() {
  let fixes = 0, since = 0, last = 0;
  return (distance: number, accuracy: number, timestamp: number) => {
    if (distance <= Math.max(8, accuracy + 4) || !Number.isFinite(distance)) {
      fixes = 0;
      return false;
    }
    if (!fixes || timestamp - last > 5000) { fixes = 0; since = timestamp; }
    last = timestamp;
    fixes++;
    return fixes >= 3 && timestamp - since >= 2500;
  };
}

export function shorterFromSamePosition(newDistance: number, verifiedRejoinDistance: number | null) {
  return verifiedRejoinDistance !== null && newDistance + 1 < verifiedRejoinDistance;
}

export function buildWalkTrack(points: readonly RoutePoint[]) {
  let metres = 0;
  return points.flatMap((entry, index) => {
    if (!index) return [{ ...entry, metres }];
    const length = greatCircleKm(points[index - 1].point, entry.point) * 1000;
    if (length < 0.001) return [];
    metres += length;
    return [{ ...entry, metres }];
  });
}

export type WalkTrack = ReturnType<typeof buildWalkTrack>;

export function sampleWalk(track: WalkTrack, metres: number) {
  const last = track.length - 1;
  let end = track.findIndex((entry, index) => index > 0 && entry.metres >= metres);
  if (end < 0) end = last;
  const a = track[end - 1], b = track[end];
  const t = Math.max(0, Math.min(1, (metres - a.metres) / (b.metres - a.metres)));
  const point = t === 0 ? a.point : t === 1 ? b.point : { lat: a.point.lat + (b.point.lat - a.point.lat) * t,
    lon: wrapLon(a.point.lon + lonDelta(a.point.lon, b.point.lon) * t) };
  return { point, heading: bearingDeg(a.point, b.point), end };
}

export function locateOnWalk(track: WalkTrack, point: LatLon, minimumMetres = 0, maximumMetres = Infinity) {
  const x = (p: LatLon) => lonDelta(point.lon, p.lon) * marsMetresPerDegree * Math.cos(point.lat * radians);
  const y = (p: LatLon) => (p.lat - point.lat) * marsMetresPerDegree;
  let best = { distance: Infinity, metres: minimumMetres, point };
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i];
    if (b.metres < minimumMetres || a.metres > maximumMetres) continue;
    const ax = x(a.point), ay = y(a.point), dx = x(b.point) - ax, dy = y(b.point) - ay;
    const min = Math.max(0, (minimumMetres - a.metres) / (b.metres - a.metres));
    const max = Math.min(1, (maximumMetres - a.metres) / (b.metres - a.metres));
    const t = Math.max(min, Math.min(max, -(ax * dx + ay * dy) / (dx * dx + dy * dy)));
    const distance = Math.hypot(ax + t * dx, ay + t * dy);
    if (distance < best.distance) {
      const metres = a.metres + t * (b.metres - a.metres);
      best = { distance, metres, point: { lat: a.point.lat + (b.point.lat - a.point.lat) * t,
        lon: wrapLon(a.point.lon + lonDelta(a.point.lon, b.point.lon) * t) } };
    }
  }
  return best;
}

export function orderedStopDistances(track: WalkTrack, stops: readonly LatLon[]) {
  let minimum = 0;
  return stops.map((stop) => {
    minimum = locateOnWalk(track, stop, minimum).metres;
    return minimum;
  });
}

export function stepDetector() {
  let gravity = 0, last = 0, peak = false, lastStep = -Infinity;
  return (linear: number | null, withGravity: number | null, now: number) => {
    if (linear === null && withGravity === null) return false;
    if (!last || now - last > 500) { gravity = withGravity ?? 0; peak = false; }
    const dt = Math.max(1, now - last);
    last = now;
    if (withGravity !== null) gravity += (withGravity - gravity) * (1 - Math.exp(-dt / 450));
    const signal = linear ?? Math.abs(withGravity! - gravity);
    if (signal < 0.65) peak = false;
    if (signal < 1.35 || peak) return false;
    peak = true;
    if (now - lastStep < 270) return false;
    lastStep = now;
    return true;
  };
}

export function routeCue(track: WalkTrack, metres: number): "left" | "right" | "slope" | "terrain" | null {
  const near = sampleWalk(track, metres);
  const ahead = sampleWalk(track, metres + 12);
  const elevations = track.slice(near.end - 1, ahead.end + 1);
  if (elevations.some((entry) => entry.elevation === null)) return "terrain";
  if (elevations.some((entry, i) => i > 0 &&
    Math.abs(entry.elevation! - elevations[i - 1].elevation!) / (entry.metres - elevations[i - 1].metres)
      >= Math.tan(10 * radians))) return "slope";
  const turn = lonDelta(near.heading, ahead.heading);
  return Math.abs(turn) >= 50 ? turn > 0 ? "right" : "left" : null;
}
