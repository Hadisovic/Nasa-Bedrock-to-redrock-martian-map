import { useState } from "react";
import elevationUrl from "../../data/mars/jezero/elevation.tif?url";
import { decodeJezeroRaster, jezeroWaypoint } from "../contracts/jezero.ts";
import type { ProjectedPoint, TerrainGrid } from "../contracts/index.ts";
import { planRoundTrip } from "../analysis/routing.ts";
import { createRoutePlanner } from "../analysis/routeClient.ts";
import { habitatPresets } from "../data/sites.ts";

/**
 * In-browser routing benchmark (#/bench). It times the planner on the real Wildcat Ridge grid
 * for representative, long and no-route searches, then measures how long the main thread is
 * blocked during a burst of rapid endpoint changes, on the main thread versus in a worker.
 */

interface Case { name: string; habitat: ProjectedPoint; destination: ProjectedPoint; maxSlope: number }

const CASES: Case[] = [
  { name: "Representative: habitat A → Wildcat Ridge, 15°", habitat: habitatPresets[0].location, destination: jezeroWaypoint.location, maxSlope: 15 },
  { name: "Long: habitat B (west edge) → Wildcat Ridge, 15°", habitat: habitatPresets[1].location, destination: jezeroWaypoint.location, maxSlope: 15 },
  { name: "Long: habitat C (north) → Wildcat Ridge, 15°", habitat: habitatPresets[2].location, destination: jezeroWaypoint.location, maxSlope: 15 },
  { name: "Corner to corner, 25°", habitat: { xM: 4_588_016.5, yM: 1_094_319.5 }, destination: { xM: 4_588_399.5, yM: 1_093_936.5 }, maxSlope: 25 },
  { name: "No route: habitat C, 4°", habitat: habitatPresets[2].location, destination: jezeroWaypoint.location, maxSlope: 4 },
];

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
const max = (v: number[]) => Math.max(...v);

/** Longest gap between animation frames while `work` runs: a proxy for UI responsiveness. */
async function longestFrameGap(work: () => Promise<void>): Promise<number> {
  let last = performance.now(), worst = 0, running = true;
  const tick = (now: number) => { worst = Math.max(worst, now - last); last = now; if (running) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  await work();
  await new Promise((r) => setTimeout(r, 50));
  running = false;
  return worst;
}

export function Bench() {
  const [log, setLog] = useState<string[]>([]);
  const [rows, setRows] = useState<{ name: string; status: string; median: number; max: number }[]>([]);
  const [burst, setBurst] = useState<{ where: string; worstGapMs: number; totalMs: number }[]>([]);
  const [running, setRunning] = useState(false);
  const say = (line: string) => setLog((l) => [...l, line]);

  const run = async () => {
    setRunning(true); setRows([]); setBurst([]); setLog([]);
    const bytes = await (await fetch(elevationUrl)).arrayBuffer();
    const { terrain } = await decodeJezeroRaster(bytes, "elevation") as { terrain: TerrainGrid };
    say(`Terrain ${terrain.layout.width} × ${terrain.layout.height} cells loaded.`);
    const out: typeof rows = [];
    for (const c of CASES) {
      const times: number[] = [];
      let status = "";
      for (let i = 0; i < 9; i++) {
        const t0 = performance.now();
        status = planRoundTrip({ habitat: c.habitat, destination: c.destination, terrain, maxAbsSlopeDeg: c.maxSlope, slopePenaltyWeight: 4 }).result.status;
        times.push(performance.now() - t0);
        await new Promise((r) => setTimeout(r, 0));
      }
      out.push({ name: c.name, status, median: median(times), max: max(times) });
      setRows([...out]);
    }

    // Rapid endpoint changes: 12 requests 40 ms apart, as when dragging through destinations.
    const endpoints = Array.from({ length: 12 }, (_, i) => ({ xM: 4_588_100 + i * 20, yM: 1_094_000 + (i % 4) * 60 }));
    const results: typeof burst = [];
    for (const where of ["main", "worker"] as const) {
      const planner = where === "main" ? createRoutePlanner(null) : createRoutePlanner(terrain);
      const mainPlanner = where === "main";
      const t0 = performance.now();
      const gap = await longestFrameGap(async () => {
        const pending: Promise<unknown>[] = [];
        for (const destination of endpoints) {
          pending.push(mainPlanner
            ? new Promise((r) => setTimeout(() => { planRoundTrip({ habitat: habitatPresets[2].location, destination, terrain, maxAbsSlopeDeg: 15, slopePenaltyWeight: 4 }); r(null); }, 0))
            : planner.plan({ habitat: habitatPresets[2].location, destination, maxAbsSlopeDeg: 15, slopePenaltyWeight: 4 }));
          await new Promise((r) => setTimeout(r, 40));
        }
        await Promise.all(pending);
      });
      results.push({ where, worstGapMs: gap, totalMs: performance.now() - t0 });
      planner.dispose();
      setBurst([...results]);
    }
    say(`Browser: ${navigator.userAgent}`);
    say(`Logical cores: ${navigator.hardwareConcurrency}`);
    setRunning(false);
  };

  return (
    <main className="fatal bench">
      <h1>Routing benchmark</h1>
      <p className="muted">Times the deterministic A* planner (four searches per round trip: shortest and slope-weighted, out and back) on the real 384 × 384 Wildcat Ridge grid.</p>
      <button type="button" className="btn btn--primary" onClick={run} disabled={running}>{running ? "Running…" : "Run benchmark"}</button>
      {rows.length > 0 && (
        <table><thead><tr><th>Case</th><th>Result</th><th>Median ms</th><th>Max ms</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}</td><td>{r.status}</td><td>{r.median.toFixed(1)}</td><td>{r.max.toFixed(1)}</td></tr>)}</tbody></table>
      )}
      {burst.length > 0 && (
        <>
          <h2>Rapid endpoint changes (12 requests, 40 ms apart)</h2>
          <table><thead><tr><th>Where</th><th>Longest frame gap (ms)</th><th>Total (ms)</th></tr></thead>
            <tbody>{burst.map((b) => <tr key={b.where}><td>{b.where === "main" ? "Main thread" : "Web worker"}</td><td>{b.worstGapMs.toFixed(0)}</td><td>{b.totalMs.toFixed(0)}</td></tr>)}</tbody></table>
        </>
      )}
      <pre className="small" id="bench-log">{log.join("\n")}</pre>
      <pre className="sr-only" id="bench-json">{JSON.stringify({ rows, burst })}</pre>
    </main>
  );
}
