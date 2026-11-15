import type { LatLon } from "./geo.ts";
import type { DirectionalRoute, GlobalRouteLeg } from "./globalRouting.ts";
import { estimateLegMinutes } from "./routeAssessment.ts";
import type { Endpoint, MissionOptions, RouteChoice, Stop } from "./missionPlan.ts";
import { validMission, validStop } from "./missionPlan.ts";
import { greatCircleKm, lonDelta, wrapLon } from "./geo.ts";

export interface Leg {
  from: Endpoint;
  to: Endpoint;
  returning: boolean;
  fromStop: number | null;
  toStop: number | null;
}
export type PlannedLeg = Leg & { result: DirectionalRoute | null };
export type NavigationProgress = { nextStop: number; at: number };
export type MapLeg = { points: LatLon[]; returning: boolean; distanceKm: number; preview?: boolean; color?: string;
  choice?: RouteChoice; selected?: boolean };
export const routeChoices = [
  { id: "shortest", label: "Shortest feasible", color: "#ffc184" },
  { id: "balanced", label: "Balanced Â· recommended", color: "#69d5ff" },
  { id: "lower-terrain", label: "Lower terrain cost", color: "#a7f48c" },
] as const;

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

export const selectedLeg = (route: DirectionalRoute | null, choice: RouteChoice | boolean): GlobalRouteLeg | null => {
  if (route?.status !== "ok") return null;
  if (choice === "shortest" || choice === false) return route.shortest;
  if (choice === "lower-terrain" || choice === true) return route.alternative ?? route.balanced ?? route.shortest;
  return route.balanced ?? route.shortest;
};

export function availableChoices(legs: readonly PlannedLeg[]) {
  const distinct: (typeof routeChoices[number])[] = [];
  if (!legs.some(({ result }) => result?.status === "ok")) return distinct;
  for (const option of routeChoices) {
    if (!distinct.some(({ id }) => legs.every(({ result }) =>
      samePath(selectedLeg(result, id), selectedLeg(result, option.id))))) distinct.push(option);
  }
  return distinct;
}

/** Equality is geographic, independent of object identity or the longitude convention. */
export function samePath(a: GlobalRouteLeg | null, b: GlobalRouteLeg | null) {
  if (!a || !b) return a === b;
  return a.points.length === b.points.length && a.points.every((point, index) =>
    Math.abs(point.lat - b.points[index].lat) < 1e-10 && Math.abs(lonDelta(point.lon, b.points[index].lon)) < 1e-10);
}

export function effectiveChoice(legs: readonly PlannedLeg[], requested: RouteChoice): RouteChoice {
  const choices = availableChoices(legs);
  return choices.some(({ id }) => id === requested) ? requested
    : choices.some(({ id }) => id === "balanced") ? "balanced" : "shortest";
}

/** Share one set of original valid vertices between both maps. Collapse shared legs,
 * draw all alternatives first, then emphasize the selected itinerary on top. */
export function mapLegsForChoices(legs: readonly PlannedLeg[], choice: RouteChoice): MapLeg[] {
  const options = availableChoices(legs);
  const selected = effectiveChoice(legs, choice);
  const priority = [...options].sort((a, b) => Number(b.id === selected) - Number(a.id === selected));
  return legs.flatMap((leg) => {
    const paths: MapLeg[] = [];
    for (const option of priority) {
      const path = selectedLeg(leg.result, option.id);
      if (!path || paths.some((existing) => samePath({ ...path, points: existing.points }, path))) continue;
      paths.push({ points: path.points, distanceKm: path.distanceKm, returning: leg.returning,
        choice: option.id, color: option.color, selected: option.id === selected });
    }
    return paths;
  }).sort((a, b) => Number(a.selected) - Number(b.selected));
}

export function legsForChoice(legs: readonly PlannedLeg[], choice: RouteChoice | boolean) {
  return legs.flatMap(({ result }) => selectedLeg(result, choice) ?? []);
}

export function summarizeItinerary(legs: readonly PlannedLeg[], stops: readonly Stop[], mission: MissionOptions, choice: RouteChoice | boolean,
  progress?: NavigationProgress | null) {
  const complete = legs.length > 0 && legs.every(({ result }) => result?.status === "ok");
  const regional = legs.some(({ result }) => result?.status === "ok" && result.terrain.regional);
  const selected = legsForChoice(legs, choice);
  const distanceKm = selected.reduce((sum, leg) => sum + leg.distanceKm, 0);
  const remainingStops = progress ? stops.slice(progress.nextStop) : stops;
  const science = remainingStops.every(validStop) ? remainingStops.reduce((sum, stop) => sum + stop.scienceMinutes, 0) : null;
  const speed = mission.rover ? mission.roverSpeed : mission.speed;
  const travel = complete && !regional && validMission(mission)
    ? selected.reduce((sum, leg) => sum + estimateLegMinutes(leg, speed), 0) : null;
  // Playback and sensor time do not establish mission consumables already spent.
  const remaining = !mission.automatic && !progress && travel != null && science != null && legs.at(-1)?.returning ? mission.budget - mission.reserve - science - travel : null;
  return { complete, regional, distanceKm, science, travel, remaining };
}

export function routeProfile(legs: readonly PlannedLeg[], mission: MissionOptions, weighted: RouteChoice | boolean, walkingSlope: number) {
  const measured = legs.map(({ result }) => selectedLeg(result, weighted));
  if (!legs.length || measured.some((leg) => !leg)) return null;
  const distanceKm = measured.reduce((sum, leg) => sum + (leg?.distanceKm ?? 0), 0);
  const steepest = Math.max(...measured.map((leg) => leg?.maxSlopeDeg ?? 0));
  const regional = legs.some(({ result }) => result?.terrain?.regional);
  const travel = (speed: number, limit: number) => regional || !Number.isFinite(speed) || speed <= 0 || !(limit >= 1 && limit <= 89) || steepest > limit
    ? null : distanceKm * 1000 / speed / 60;
  return { distanceKm, steepest, regional, walk: travel(mission.speed, walkingSlope), rover: travel(mission.roverSpeed, mission.roverSlope) };
}

export function suggestRover(legs: readonly PlannedLeg[], stops: readonly Stop[], mission: MissionOptions, weighted: RouteChoice | boolean) {
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

export function routeElevation(legs: readonly PlannedLeg[], weighted: RouteChoice | boolean) {
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
