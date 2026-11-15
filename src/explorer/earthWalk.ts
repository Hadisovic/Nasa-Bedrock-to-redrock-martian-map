import { bearingDeg, greatCircleKm, lonDelta, MARS_RADIUS_KM, wrapLon } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import type { CatalogEvent } from "./catalog.ts";

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
  const bearing = Math.atan2(east, north);
  const step = Math.hypot(north, east) / (MARS_RADIUS_KM * 1000);
  if (!step) return { lat: lander.lat, lon: lander.lon };
  const lat = lander.lat * radians;
  const next = Math.asin(Math.max(-1, Math.min(1, Math.sin(lat) * Math.cos(step) + Math.cos(lat) * Math.sin(step) * Math.cos(bearing))));
  const delta = Math.atan2(Math.sin(bearing) * Math.sin(step) * Math.cos(lat), Math.cos(step) - Math.sin(lat) * Math.sin(next));
  return { lat: next / radians, lon: wrapLon(lander.lon + delta / radians) };
}

export function usableFix(fix: EarthFix, now: number, previous: number) {
  return [fix.lat, fix.lon, fix.accuracy, fix.timestamp].every(Number.isFinite) &&
    Math.abs(fix.lat) <= 90 && Math.abs(fix.lon) <= 180 &&
    fix.accuracy >= 0 && fix.accuracy <= 12 && now - fix.timestamp <= 5000 &&
    fix.timestamp <= now + 1000 && fix.timestamp > previous;
}

export function earthGpsDevice(userAgent: string, touchPoints: number, touchOnly: boolean) {
  return touchPoints > 0 && (/Android|iPhone|iPad|iPod/i.test(userAgent) ||
    (/Macintosh/.test(userAgent) && touchPoints > 1) || (/Windows/.test(userAgent) && touchOnly));
}

/** Wait for successive fixes outside the error radius in a consistent direction. */
export function gpsMovement(origin: EarthFix) {
  let accepted = origin;
  let candidate: { fix: EarthFix; heading: number } | null = null;
  return (fix: EarthFix | null) => {
    if (!fix) {
      candidate = null;
      return false;
    }
    const distance = greatCircleKm(accepted, fix) * earthRadiusM / MARS_RADIUS_KM;
    if (distance <= Math.max(2, Math.hypot(accepted.accuracy, fix.accuracy))) {
      candidate = null;
      return false;
    }
    const heading = bearingDeg(accepted, fix);
    if (!candidate || fix.timestamp - candidate.fix.timestamp > 5000 ||
      Math.abs(lonDelta(candidate.heading, heading)) > 45) {
      candidate = { fix, heading };
      return false;
    }
    if (fix.timestamp - candidate.fix.timestamp < 500) return false;
    accepted = fix;
    candidate = null;
    return true;
  };
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

/** Use the solved leg boundaries, including when a route crosses a future stop. */
export function buildItineraryTrack(legs: readonly { points: RoutePoint[]; toStop: number | null }[]) {
  const track: WalkTrack = [];
  const stopDistances: number[] = [];
  for (const { points, toStop } of legs) {
    for (const entry of points) {
      const last = track.at(-1);
      const length = last ? greatCircleKm(last.point, entry.point) * 1000 : 0;
      if (!last || length >= 0.001) track.push({ ...entry, metres: (last?.metres ?? 0) + length });
    }
    if (toStop !== null && track.length) stopDistances[toStop] = track.at(-1)!.metres;
  }
  return { track, stopDistances };
}

export function sampleWalk(track: WalkTrack, metres: number) {
  const last = track.length - 1;
  let end = last, low = 1;
  while (low < end) {
    const middle = (end + low) >> 1;
    if (track[middle].metres < metres) low = middle + 1;
    else end = middle;
  }
  const a = track[end - 1], b = track[end];
  const t = Math.max(0, Math.min(1, (metres - a.metres) / (b.metres - a.metres)));
  const point = t === 0 ? a.point : t === 1 ? b.point : { lat: a.point.lat + (b.point.lat - a.point.lat) * t,
    lon: wrapLon(a.point.lon + lonDelta(a.point.lon, b.point.lon) * t) };
  return { point, heading: bearingDeg(a.point, b.point), end };
}

export function nextManeuver(track: WalkTrack, metres: number, legEnd: number) {
  const end = Math.min(legEnd, track.at(-1)?.metres ?? 0);
  for (let at = metres + 3; at + 6 <= Math.min(end, metres + 250); at += 3) {
    const centre = sampleWalk(track, at).point;
    const before = sampleWalk(track, Math.max(metres, at - 6)).point;
    const after = sampleWalk(track, at + 6).point;
    const angle = lonDelta(bearingDeg(before, centre), bearingDeg(centre, after));
    if (Math.abs(angle) >= 55) return { kind: angle > 0 ? "right" as const : "left" as const, metres: at - metres };
  }
  return { kind: "stop" as const, metres: Math.max(0, end - metres) };
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

const landmarkTypes = new Set(["landing", "rover-stop", "science-observation", "sample", "sample-depot", "hardware"]);
const compassPoints = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

/** Find a sourced, observed landmark near the crew and near the next part of the active leg. */
export function nearbyLandmark(events: readonly CatalogEvent[], point: LatLon, track: WalkTrack,
  metres: number, legEnd: number, seen: ReadonlySet<string>, positionUncertainty = 0) {
  const candidates = events.flatMap((event) => {
    const place = event.location;
    const uncertainty = place?.uncertaintyM;
    if (!place || typeof uncertainty !== "number" || !Number.isFinite(uncertainty) || uncertainty < 0 || uncertainty > 25 ||
      place.precision !== "precise" || !place.coordinateSource.url || !event.observed || !landmarkTypes.has(event.type) || seen.has(event.id)) return [];
    const distance = greatCircleKm(point, place) * 1000;
    if (distance + uncertainty + positionUncertainty > 60 ||
      locateOnWalk(track, place, Math.max(0, metres - 5), Math.min(legEnd, metres + 60)).distance > 30) return [];
    return [{ event, place, distance, uncertainty }];
  });
  candidates.sort((a, b) => a.distance - b.distance || a.event.id.localeCompare(b.event.id));
  const nearest = candidates[0];
  if (!nearest) return null;
  const { event, place, distance, uncertainty } = nearest;
  const direction = distance > Math.max(1, uncertainty + positionUncertainty)
    ? compassPoints[Math.round(bearingDeg(point, place) / 45) % compassPoints.length] : null;
  const rounded = Math.max(5, Math.round(distance / 5) * 5);
  return { text: direction ? `Nearby: ${event.title}, about ${rounded} metres ${direction}.`
    : `Nearby: ${event.title}, within about ${Math.max(5, Math.ceil((distance + uncertainty + positionUncertainty) / 5) * 5)} metres.`,
    ids: candidates.filter((item) => greatCircleKm(place, item.place) * 1000 <= Math.max(5, uncertainty, item.uncertainty))
      .map((item) => item.event.id) };
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

export function routeCue(track: WalkTrack, metres: number, legEnd = Infinity): "left" | "right" | "slope" | "terrain" | null {
  if (metres >= legEnd - 1) return null;
  const near = sampleWalk(track, metres);
  const ahead = sampleWalk(track, Math.min(legEnd, metres + 12));
  const elevations = track.slice(near.end - 1, ahead.end + 1);
  if (elevations.some((entry) => entry.elevation === null)) return "terrain";
  if (elevations.some((entry, i) => i > 0 &&
    Math.abs(entry.elevation! - elevations[i - 1].elevation!) / (entry.metres - elevations[i - 1].metres)
      >= Math.tan(10 * radians))) return "slope";
  const next = nextManeuver(track, metres, legEnd);
  return next.kind !== "stop" && next.metres <= 12 ? next.kind : null;
}
