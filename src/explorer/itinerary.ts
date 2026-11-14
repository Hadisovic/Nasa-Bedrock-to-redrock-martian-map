import { lonDelta, wrapLon } from "./geo.ts";
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
export type MapLeg = { points: LatLon[]; returning: boolean; distanceKm: number; preview?: boolean };

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
