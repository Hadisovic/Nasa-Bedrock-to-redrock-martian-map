/// <reference lib="webworker" />
import type { RouteRequest, TerrainGrid } from "../contracts/index.ts";
import { planRoundTrip } from "./routing.ts";

/** Runs the same deterministic planner off the main thread so typing and panning stay smooth. */
let terrain: TerrainGrid | null = null;

export type WorkerMessage =
  | { type: "terrain"; terrain: TerrainGrid }
  | { type: "plan"; id: number; request: Omit<RouteRequest, "terrain"> };

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (message.type === "terrain") { terrain = message.terrain; return; }
  const start = performance.now();
  const { result } = planRoundTrip({ ...message.request, terrain });
  (self as unknown as Worker).postMessage({ id: message.id, result, ms: performance.now() - start });
};
