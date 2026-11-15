import { useEffect, useMemo, useState } from "react";
import type { CatalogEvent, LayerEntry } from "./catalog.ts";
import { insideMarswalkCoverage } from "./catalog.ts";
import { nearGale } from "./galeLayout.ts";
import { publicUrl } from "./data.ts";
import type { Endpoint } from "./missionPlan.ts";
import { greatCircleKm } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import { scienceCandidates } from "./destinationScience.ts";
import type { nearestReachable } from "./destinationScience.ts";
import type { ScienceRequest, ScienceResponse } from "./globalRoute.worker.ts";

export function useDestinationScience(point: Endpoint | null, events: readonly CatalogEvent[], grid: LayerEntry | undefined, slope: number, blocked: LatLon | null = null) {
  const exact = useMemo(() => !point ? null : events.find((event) => event.observed && event.location &&
    (event.id === point.catalogEventId || (event.title === point.name && greatCircleKm(point, event.location) < .001))) ?? null,
  [point, events]);
  const candidates = useMemo(() => point ? scienceCandidates(events, point, exact?.id) : [], [point, events, exact]);
  const scoped = useMemo(() => !point ? [] : candidates.filter(({ event }) =>
    event.location?.precision === "precise" && ((insideMarswalkCoverage(point) && insideMarswalkCoverage(event.location)) ||
      (nearGale(point) && nearGale(event.location)))), [point, candidates]);
  const [answer, setAnswer] = useState<{ key: string; result: Awaited<ReturnType<typeof nearestReachable>> } | null>(null);
  const key = JSON.stringify([point?.lat, point?.lon, slope, blocked, scoped.map(({ event }) => event.id)]);
  useEffect(() => {
    if (!point || !grid || !scoped.length) return;
    let worker: Worker;
    try { worker = new Worker(new URL("./globalRoute.worker.ts", import.meta.url), { type: "module" }); }
    catch { setAnswer({ key, result: { site: null, unresolved: true } }); return; }
    worker.onmessage = ({ data }: MessageEvent<ScienceResponse>) => setAnswer({ key, result: data.result });
    worker.onerror = () => setAnswer({ key, result: { site: null, unresolved: true } });
    const request: ScienceRequest = { kind: "science", id: 1, start: point, end: point, slope, blocked,
      width: grid.width, height: grid.height, url: new URL(publicUrl(grid.file), window.location.href).href,
      base: window.location.href, candidates: scoped };
    worker.postMessage(request);
    return () => worker.terminate();
  }, [key, point, grid, scoped, slope, blocked]);
  const result = answer?.key === key ? answer.result : null;
  return { exact, nearest: candidates[0] ?? null, reachable: result?.site ?? null,
    pending: !!grid && !!scoped.length && !result, unresolved: result?.unresolved ?? (!grid || !scoped.length),
    scope: insideMarswalkCoverage(point ?? { lat: 90, lon: 0 }) ? "Wildcat Ridge" : point && nearGale(point) ? "Gale terrain area" : "detailed mapped terrain" };
}
