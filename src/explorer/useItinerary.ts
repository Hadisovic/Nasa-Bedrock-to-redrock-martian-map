import { useEffect, useMemo, useRef, useState } from "react";
import type { LayerEntry } from "./catalog.ts";
import { publicUrl } from "./data.ts";
import type { LatLon } from "./geo.ts";
import type { LegRequest, LegResponse } from "./globalRoute.worker.ts";
import type { DirectionalRoute } from "./globalRouting.ts";
import { legKey } from "./itinerary.ts";
import type { Leg } from "./itinerary.ts";

export function useItinerary(legs: readonly Leg[], elevation: LayerEntry | undefined, slope: number, blocked: LatLon | null, retry: number) {
  const worker = useRef<Worker | null>(null);
  const jobs = useRef(new Map<string, number>());
  const nextId = useRef(0);
  const [cache, setCache] = useState<Record<string, DirectionalRoute>>({});
  const file = elevation?.file;
  const available = !!elevation;
  const keys = useMemo(() => legs.map((leg) => JSON.stringify([file, legKey(leg, slope, blocked)])), [legs, file, slope, blocked]);
  useEffect(() => () => { worker.current?.terminate(); worker.current = null; jobs.current.clear(); }, []);

  useEffect(() => {
    if (!elevation || !legs.length || !(slope >= 1 && slope <= 89)) return;
    const fail = (key: string) => {
      jobs.current.delete(key);
      setCache((previous) => ({ ...previous, [key]: { status: "unavailable", retryable: true, detail: "The route planner could not complete this leg." } }));
    };
    const onResult = ({ data }: MessageEvent<LegResponse>) => {
      const key = [...jobs.current].find(([, id]) => id === data.id)?.[0];
      if (!key) return;
      jobs.current.delete(key);
      setCache((previous) => {
        const next = { ...previous, [key]: data.result };
        // Keep the cache bounded while favoring legs still on screen.
        for (const old of Object.keys(next)) {
          if (Object.keys(next).length <= 160) break;
          if (!keys.includes(old) && old !== key) delete next[old];
        }
        return next;
      });
    };
    try {
      worker.current ??= new Worker(new URL("./globalRoute.worker.ts", import.meta.url), { type: "module" });
    } catch {
      keys.forEach((key) => { if (!cache[key]) fail(key); });
      return;
    }
    const planner = worker.current;
    planner.onmessage = onResult;
    planner.onerror = () => {
      planner.terminate();
      worker.current = null;
      [...jobs.current.keys()].forEach(fail);
    };
    legs.forEach(({ from, to }, index) => {
      const key = keys[index];
      if (cache[key] || jobs.current.has(key)) return;
      const id = ++nextId.current;
      jobs.current.set(key, id);
      const point = ({ lat, lon }: LatLon) => ({ lat, lon });
      const request: LegRequest = {
        id, start: point(from), end: point(to), slope, blocked,
        url: new URL(publicUrl(elevation.file), window.location.href).href, width: elevation.width, height: elevation.height,
        base: window.location.href,
      };
      planner.postMessage(request);
    });
  }, [keys, legs, elevation, slope, blocked, cache]);

  useEffect(() => {
    if (!retry) return;
    setCache((previous) => Object.fromEntries(Object.entries(previous).filter(([, result]) => result.status === "ok" || !result.retryable)));
  }, [retry]);

  return useMemo(() => legs.map((leg, index) => ({
    ...leg,
    result: !available ? null : !(slope >= 1 && slope <= 89)
      ? { status: "unavailable" as const, detail: "Choose a slope limit between 1° and 89°." } : cache[keys[index]] ?? null,
  })), [cache, keys, legs, available, slope]);
}
