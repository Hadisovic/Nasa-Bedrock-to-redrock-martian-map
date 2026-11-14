import type { LatLon } from "./geo.ts";
import type { DirectionalRoute, GlobalRouteLeg } from "./globalRouting.ts";
import { estimateLegMinutes } from "./routeAssessment.ts";
import type { Endpoint, MissionOptions, RouteChoice, Stop } from "./missionPlan.ts";
import { validMission, validStop } from "./missionPlan.ts";
import { lonDelta } from "./geo.ts";

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
  { id: "balanced", label: "Balanced · recommended", color: "#69d5ff" },
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
  const remaining = !progress && travel != null && science != null && legs.at(-1)?.returning ? mission.budget - mission.reserve - science - travel : null;
  return { complete, regional, distanceKm, science, travel, remaining };
}
