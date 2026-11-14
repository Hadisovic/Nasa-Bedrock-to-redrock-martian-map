import type { RouteRequest, RouteResult, TerrainGrid } from "../contracts/index.ts";
import { planRoundTrip } from "./routing.ts";

export interface PlanResponse { result: RouteResult; ms: number; where: "worker" | "main" }

export interface RoutePlanner {
  /** Resolves with the latest request only; superseded requests resolve to null. */
  plan: (request: Omit<RouteRequest, "terrain">) => Promise<PlanResponse | null>;
  dispose: () => void;
  readonly mode: "worker" | "main";
}

/** Main-thread planner: the reference path, and the fallback when workers are unavailable. */
export function mainThreadPlanner(terrain: TerrainGrid | null): RoutePlanner {
  let latest = 0;
  return {
    mode: "main",
    plan: (request) => {
      const id = ++latest;
      return new Promise((resolve) => setTimeout(() => {
        if (id !== latest) return resolve(null);
        const start = performance.now();
        const { result } = planRoundTrip({ ...request, terrain });
        resolve({ result, ms: performance.now() - start, where: "main" });
      }, 0));
    },
    dispose: () => { latest = Number.MAX_SAFE_INTEGER; },
  };
}

/**
 * Worker planner. The worker holds its own copy of the terrain; each request carries only
 * endpoints and limits. Stale responses are dropped so rapid edits never show old results.
 */
export function createRoutePlanner(terrain: TerrainGrid | null): RoutePlanner {
  if (!terrain || typeof Worker === "undefined") return mainThreadPlanner(terrain);
  let worker: Worker;
  try {
    worker = new Worker(new URL("./route.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return mainThreadPlanner(terrain);
  }
  const fallback = mainThreadPlanner(terrain);
  let broken = false;
  let latest = 0;
  let lastRequest: Omit<RouteRequest, "terrain"> | null = null;
  const pending = new Map<number, (r: PlanResponse | null) => void>();
  worker.postMessage({ type: "terrain", terrain });
  worker.onmessage = (event: MessageEvent<{ id: number; result: RouteResult; ms: number }>) => {
    const resolve = pending.get(event.data.id);
    pending.delete(event.data.id);
    resolve?.(event.data.id === latest ? { result: event.data.result, ms: event.data.ms, where: "worker" } : null);
  };
  worker.onerror = () => {
    broken = true;
    // Answer the latest outstanding request on the main thread instead.
    const waiting = pending.get(latest);
    pending.clear();
    if (waiting && lastRequest) fallback.plan(lastRequest).then(waiting);
  };
  return {
    get mode() { return broken ? "main" as const : "worker" as const; },
    plan: (request) => {
      if (broken) return fallback.plan(request);
      const id = ++latest;
      lastRequest = request;
      for (const [key, resolve] of pending) { if (key !== id) { resolve(null); pending.delete(key); } }
      return new Promise((resolve) => {
        pending.set(id, resolve);
        worker.postMessage({ type: "plan", id, request });
      });
    },
    dispose: () => { worker.terminate(); pending.clear(); fallback.dispose(); },
  };
}
