import type { CatalogEvent } from "./catalog.ts";
import { greatCircleKm } from "./geo.ts";
import type { LatLon } from "./geo.ts";

export type ScienceCandidate = { event: CatalogEvent; distanceKm: number };
export function scienceCandidates(events: readonly CatalogEvent[], point: LatLon, excludeId?: string): ScienceCandidate[] {
  return events.filter((event) => event.observed && event.id !== excludeId && event.location && event.location.precision !== "regional"
    && ["science-observation", "sample", "sample-depot"].includes(event.type) && event.evidence.length > 0)
    .map((event) => ({ event, distanceKm: greatCircleKm(point, event.location!) }))
    .filter(({ distanceKm }) => distanceKm > 1e-6)
    .sort((a, b) => a.distanceKm - b.distanceKm || a.event.id.localeCompare(b.event.id));
}

type Reachability = { status: "ok"; distanceKm: number } | { status: "no-route" | "unavailable" };
/** Branch-and-bound over direct-distance lower bounds. The caller supplies the
 * supported-coverage candidates and the actual shortest feasible routing solver. */
export async function nearestReachable(candidates: readonly ScienceCandidate[], solve: (candidate: ScienceCandidate) => Promise<Reachability>, signal: AbortSignal) {
  let site: (ScienceCandidate & { routeDistanceKm: number }) | null = null;
  let unresolved = false;
  for (const candidate of candidates) {
    signal.throwIfAborted();
    if (site && candidate.distanceKm >= site.routeDistanceKm) break;
    const result = await solve(candidate);
    signal.throwIfAborted();
    if (result.status === "unavailable") unresolved = true;
    if (result.status === "ok" && (!site || result.distanceKm < site.routeDistanceKm)) site = { ...candidate, routeDistanceKm: result.distanceKm };
  }
  return { site, unresolved };
}
