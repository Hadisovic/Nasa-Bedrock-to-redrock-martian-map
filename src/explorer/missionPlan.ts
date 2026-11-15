import type { Precision } from "./catalog.ts";
import type { LatLon } from "./geo.ts";

export type Endpoint = LatLon & { name?: string; catalogEventId?: string; precision?: Precision; uncertaintyM?: number | null; footprintKm?: number | null };
export type Stop = { point: Endpoint; scienceMinutes: number };
export const MAX_STOPS = 12;

export const PLAN_DATA_VERSION = "mars-navigation-auto-6";
export type RouteChoice = "shortest" | "balanced" | "lower-terrain";
export interface MissionOptions { speed: number; stop: number; budget: number; reserve: number; departure: string; rover: boolean; roverSpeed: number; roverSlope: number; automatic?: boolean; }
interface PlanSettings {
  data: string; start: Endpoint; slope: number; weighted: boolean; mission: MissionOptions;
  position?: Endpoint; blocked?: Endpoint; choice?: RouteChoice;
}
export type Plan = PlanSettings & ({ version: 1; end: Endpoint } | { version: 2; stops: Stop[]; returnToLander: boolean });
export type SavedPlan = { id: string; name: string; plan: Plan };
export const defaultMission = (): MissionOptions => ({
  speed: 0.7, stop: 0, budget: 180, reserve: 30, departure: new Date().toISOString().slice(0, 16), rover: false, roverSpeed: 0.042, roverSlope: 10, automatic: true,
});
export const automaticMission = (mission: MissionOptions): MissionOptions => ({ ...mission, speed: .7, roverSpeed: .042, roverSlope: Math.min(10, mission.roverSlope), automatic: true });
const key = "martian-map:plans:v1";
const bounded = (n: unknown, min: number, max: number) => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
const validPoint = (p: Endpoint) => p && bounded(p.lat, -90, 90) && bounded(p.lon, -180, 180)
  && (p.name === undefined || (typeof p.name === "string" && p.name.length <= 180))
  && (p.catalogEventId === undefined || (typeof p.catalogEventId === "string" && p.catalogEventId.length <= 200))
  && (p.precision === undefined || ["precise", "approximate", "regional"].includes(p.precision))
  && (p.uncertaintyM == null || bounded(p.uncertaintyM, 0, 10_000_000))
  && (p.footprintKm == null || bounded(p.footprintKm, 0, 10_000));
export const validStop = (stop: Stop) => !!stop && validPoint(stop.point) && bounded(stop.scienceMinutes, 0, 240);
export const planStops = (plan: Plan | null): Stop[] => !plan ? [] : plan.version === 2 ? plan.stops
  : [{ point: plan.end, scienceMinutes: plan.mission.stop }];
export const planReturns = (plan: Plan | null) => plan?.version === 2 ? plan.returnToLander : true;
export function validMission(m: MissionOptions) {
  return !!m && bounded(m.speed, 0.1, 2) && bounded(m.stop, 0, 240) && bounded(m.budget, 1, 10080)
    && bounded(m.reserve, 0, m.budget) && bounded(m.roverSpeed, Number.MIN_VALUE, 20) && bounded(m.roverSlope, 1, 89)
    && (m.automatic === undefined || typeof m.automatic === "boolean")
    && typeof m.departure === "string" && /^20\d{2}-\d\d-\d\dT\d\d:\d\d$/.test(m.departure)
    && Number.isFinite(Date.parse(m.departure + "Z")) && typeof m.rover === "boolean";
}
/** Read compatible inputs independently of the terrain version they were saved against. */
export function readPlan(raw: string | null): Plan | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Plan;
    return ((p.version === 1 && validPoint(p.end)) || (p.version === 2 && typeof p.returnToLander === "boolean"
      && Array.isArray(p.stops) && p.stops.length > 0 && p.stops.length <= MAX_STOPS && p.stops.every(validStop)))
      && typeof p.data === "string" && p.data.length > 0 && p.data.length <= 80 && validPoint(p.start)
      && bounded(p.slope, 1, 89) && typeof p.weighted === "boolean" && validMission(p.mission)
      && (p.choice === undefined || ["shortest", "balanced", "lower-terrain"].includes(p.choice))
      && (p.position === undefined || validPoint(p.position)) && (p.blocked === undefined || validPoint(p.blocked)) ? p : null;
  } catch { return null; }
}
export function parsePlan(raw: string | null): Plan | null {
  const plan = readPlan(raw);
  return plan?.data === PLAN_DATA_VERSION ? plan : null;
}
export function readPlans(): SavedPlan[] {
  try {
    const entries: SavedPlan[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    return entries.filter((x) => x && typeof x.id === "string" && typeof x.name === "string" && readPlan(JSON.stringify(x.plan)));
  } catch { return []; }
}
export function savePlans(plans: SavedPlan[]) { localStorage.setItem(key, JSON.stringify(plans)); }
export function sharePlan(plan: Plan) {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.hash.split("?")[1]);
  params.set("tab", "marswalk");
  params.set("plan", JSON.stringify(plan));
  url.hash = "/explore?" + params;
  return navigator.clipboard.writeText(url.href);
}
