import type { LatLon } from "./geo.ts";
import type { DirectionalRoute, GlobalRouteLeg } from "./globalRouting.ts";
import { estimateLegMinutes } from "./routeAssessment.ts";
import type { Endpoint, MissionOptions, RouteChoice, Stop } from "./missionPlan.ts";
import { validMission, validStop } from "./missionPlan.ts";

export interface Leg {
  from: Endpoint;
  to: Endpoint;
  returning: boolean;
  fromStop: number | null;
  toStop: number | null;
}
export type PlannedLeg = Leg & { result: DirectionalRoute | null };
export type MapLeg = { points: LatLon[]; returning: boolean; distanceKm: number; preview?: boolean; color?: string };
export const routeChoices = [
  { id: "balanced", label: "Balanced · recommended", color: "#69d5ff" },
  { id: "shortest", label: "Shortest feasible", color: "#ffc184" },
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
  return routeChoices.filter(({ id }) => id === "balanced" || legs.some(({ result }) => result?.status === "ok" &&
    (id === "shortest" ? result.balanced : result.alternative)));
}

export function legsForChoice(legs: readonly PlannedLeg[], choice: RouteChoice | boolean) {
  return legs.flatMap(({ result }) => selectedLeg(result, choice) ?? []);
}

export function summarizeItinerary(legs: readonly PlannedLeg[], stops: readonly Stop[], mission: MissionOptions, choice: RouteChoice | boolean) {
  const complete = legs.length > 0 && legs.every(({ result }) => result?.status === "ok");
  const regional = legs.some(({ result }) => result?.status === "ok" && result.terrain.regional);
  const selected = legsForChoice(legs, choice);
  const distanceKm = selected.reduce((sum, leg) => sum + leg.distanceKm, 0);
  const science = stops.every(validStop) ? stops.reduce((sum, stop) => sum + stop.scienceMinutes, 0) : null;
  const speed = mission.rover ? mission.roverSpeed : mission.speed;
  const travel = complete && !regional && validMission(mission)
    ? selected.reduce((sum, leg) => sum + estimateLegMinutes(leg, speed), 0) : null;
  const remaining = travel != null && science != null && legs.at(-1)?.returning ? mission.budget - mission.reserve - science - travel : null;
  return { complete, regional, distanceKm, science, travel, remaining };
}
