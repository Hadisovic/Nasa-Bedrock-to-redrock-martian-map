import { greatCircleKm, lonDelta, wrapLon } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import type { DirectionalRoute, GlobalRouteLeg } from "./globalRouting.ts";
import type { Endpoint, MissionOptions, Stop } from "./missionPlan.ts";
import { validMission, validStop } from "./missionPlan.ts";

export interface Leg {
  from: Endpoint;
  to: Endpoint;
  returning: boolean;
  fromStop: number | null;
  toStop: number | null;
}
export type PlannedLeg = Leg & { result: DirectionalRoute | null };
export type MapLeg = { points: LatLon[]; returning: boolean; distanceKm: number; preview?: boolean;
  color?: string; selected?: boolean };

export const routeColors = { shortest: "#6bd5ff", lowerSlope: "#ffc377" };

export function routeProfile(legs: readonly PlannedLeg[], mission: MissionOptions, weighted: boolean, walkingSlope: number,
  { regionalEstimate = false } = {}) {
  const measured = legs.map(({ result }) => selectedLeg(result, weighted));
  if (!legs.length || measured.some((leg) => !leg)) return null;
  const distanceKm = measured.reduce((sum, leg) => sum + (leg?.distanceKm ?? 0), 0);
  const steepest = Math.max(...measured.map((leg) => leg?.maxSlopeDeg ?? 0));
  const regional = legs.some(({ result }) => result?.terrain?.regional);
  const travel = (speed: number, limit: number, maxSpeed: number) => (regional && !regionalEstimate) || !(speed >= .1 && speed <= maxSpeed) || !(limit >= 1 && limit <= 89) || steepest > limit
    ? null : distanceKm * 1000 / speed / 60;
  return { distanceKm, steepest, regional, walk: travel(mission.speed, walkingSlope, 2), rover: travel(mission.roverSpeed, mission.roverSlope, 20) };
}

export function previewTravelRecommendation(profile: NonNullable<ReturnType<typeof routeProfile>>, stops: readonly Stop[],
  mission: MissionOptions, returning: boolean) {
  if (!validMission(mission) || !stops.every(validStop)) return null;
  const { walk, rover } = profile;
  const travelBudget = mission.budget - (returning ? mission.reserve : 0) - stops.reduce((sum, stop) => sum + stop.scienceMinutes, 0);
  if (walk !== null && walk <= travelBudget) return { mode: "Walk", withinBudget: true } as const;
  if (rover !== null && (walk === null || rover < walk)) return { mode: "Rover", withinBudget: rover <= travelBudget } as const;
  return { mode: null, withinBudget: false } as const;
}

export function itineraryLegs(start: Endpoint | null, stops: readonly Stop[], returning: boolean, position?: LatLon): Leg[] {
  if (!start || !stops.length) return [];
  const legs: Leg[] = stops.map(({ point }, index) => ({
    from: index ? stops[index - 1].point : position ?? start, to: point, returning: false,
    fromStop: index ? index - 1 : null, toStop: index,
  }));
  if (returning) legs.push({ from: stops[stops.length - 1].point, to: start, returning: true, fromStop: stops.length - 1, toStop: null });
  return legs;
}

export const legKey = (leg: Leg, slope: number, blocked: LatLon | null) =>
  JSON.stringify([leg.from.lat, leg.from.lon, leg.to.lat, leg.to.lon, slope, blocked?.lat ?? null, blocked?.lon ?? null]);

export const selectedLeg = (route: DirectionalRoute | null, weighted: boolean): GlobalRouteLeg | null =>
  route?.status === "ok" ? (weighted ? route.alternative ?? route.shortest : route.shortest) : null;

export function summarizeItinerary(legs: readonly PlannedLeg[], stops: readonly Stop[], mission: MissionOptions, weighted: boolean) {
  const complete = legs.length > 0 && legs.every(({ result }) => result?.status === "ok");
  const regional = legs.some(({ result }) => result?.status === "ok" && result.terrain.regional);
  const distanceKm = legs.reduce((sum, { result }) => sum + (selectedLeg(result, weighted)?.distanceKm ?? 0), 0);
  const science = stops.every(validStop) ? stops.reduce((sum, stop) => sum + stop.scienceMinutes, 0) : null;
  const travel = complete && !regional && validMission(mission) ? distanceKm * 1000 / (mission.rover ? mission.roverSpeed : mission.speed) / 60 : null;
  const remaining = travel != null && science != null && legs.at(-1)?.returning ? mission.budget - mission.reserve - science - travel : null;
  return { complete, regional, distanceKm, science, travel, remaining };
}

export function suggestRover(legs: readonly PlannedLeg[], stops: readonly Stop[], mission: MissionOptions, weighted: boolean) {
  if (mission.rover || !legs.at(-1)?.returning) return null;
  const walking = summarizeItinerary(legs, stops, mission, weighted);
  if (walking.remaining === null || walking.remaining >= 0 || walking.science === null) return null;
  if (legs.some(({ result }) => (selectedLeg(result, weighted)?.maxSlopeDeg ?? Infinity) > mission.roverSlope)) return null;
  const roverTravel = walking.distanceKm * 1000 / mission.roverSpeed / 60;
  if (roverTravel + walking.science > mission.budget - mission.reserve) return null;
  const duration = (minutes: number) => minutes < 1 ? `${Math.ceil(minutes * 60)} seconds` : `${Math.round(minutes * 10) / 10} minutes`;
  const distance = walking.distanceKm >= 1 ? `${walking.distanceKm.toFixed(1)} kilometres` : `${Math.round(walking.distanceKm * 1000)} metres`;
  return `Consider a rover for this ${distance} round trip. At your selected speeds, travel takes about ${duration(walking.travel!)} on foot or ${duration(roverTravel)} by rover. The rover estimate fits your time and reserve.`;
}

export function routeElevation(legs: readonly PlannedLeg[], weighted: boolean) {
  let distanceM = 0, ascentM = 0, descentM = 0, maxSlope = 0, low = Infinity, high = -Infinity;
  let sustained = -Infinity;
  const segments: { x: number; y: number }[][] = [];
  for (const { result } of legs) {
    const leg = selectedLeg(result, weighted);
    if (!leg) continue;
    maxSlope = Math.max(maxSlope, leg.maxSlopeDeg);
    let segment: { x: number; y: number }[] = [];
    let left = 0, variation = 0;
    for (const [i, point] of leg.points.entries()) {
      if (i) distanceM += greatCircleKm(leg.points[i - 1], point) * 1000;
      const z = leg.elevationsM[i];
      if (z == null || !Number.isFinite(z)) {
        segment = []; left = 0; variation = 0;
        continue;
      }
      low = Math.min(low, z);
      high = Math.max(high, z);
      const previous = segment.at(-1);
      if (!previous) segments.push(segment);
      else {
        const rise = z - previous.y;
        ascentM += Math.max(0, rise);
        descentM += Math.max(0, -rise);
        variation += Math.abs(rise);
      }
      segment.push({ x: distanceM, y: z });
      if (result?.status !== "ok" || result.terrain.regional || result.terrain.spacingM > 20) continue;
      while (left + 1 < segment.length && distanceM - segment[left + 1].x >= 20) {
        variation -= Math.abs(segment[left + 1].y - segment[left].y);
        left++;
      }
      const run = distanceM - segment[left].x;
      if (run >= 20) sustained = Math.max(sustained, Math.atan2(variation, run) * 180 / Math.PI);
    }
  }
  return { distanceM, ascentM, descentM, maxSlope, low, high, measured: Number.isFinite(low),
    sustained: Number.isFinite(sustained) ? sustained : null, segments };
}

/** Small quadratic fillets for display only. Preserve endpoints and interpolate across the seam. */
export function roundRouteCorners(points: readonly LatLon[]) {
  const interpolate = (a: LatLon, b: LatLon, t: number) => ({
    lat: a.lat + (b.lat - a.lat) * t,
    lon: wrapLon(a.lon + lonDelta(a.lon, b.lon) * t),
  });
  return points.flatMap((point, index) => {
    const before = points[index - 1], after = points[index + 1];
    if (!before || !after || (before.lat === point.lat && before.lon === point.lon)
      || (after.lat === point.lat && after.lon === point.lon)) return [point];
    const a = interpolate(point, before, 0.14), b = interpolate(point, after, 0.14);
    return [a, interpolate(interpolate(a, point, 0.5), interpolate(point, b, 0.5), 0.5), b];
  });
}
