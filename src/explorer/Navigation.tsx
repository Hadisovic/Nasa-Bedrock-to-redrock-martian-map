import { useEffect, useMemo, useState } from "react";
import { bearingDeg, formatLatLon, greatCircleKm, lonDelta } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import type { GlobalRouteLeg } from "./globalRouting.ts";

export type Position = { point: LatLon; source: "manual" | "simulated" | "recorded"; timestamp: number; uncertaintyM?: number };
export function makePosition(point: LatLon, source: Position["source"]): Position {
  return { point: { lat: point.lat, lon: point.lon }, source, timestamp: Date.now() };
}
function readFixes(raw: string): Position[] {
  const input: unknown = JSON.parse(raw);
  if (!Array.isArray(input) || !input.length || input.length > 2000) throw Error("Invalid track");
  return input.map((row) => {
    const { lat, lon, timestamp, uncertaintyM } = row ?? {};
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180 ||
        !Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime()) ||
        (uncertaintyM != null && (!Number.isFinite(uncertaintyM) || uncertaintyM < 0))) throw Error("Invalid position");
    return { point: { lat, lon }, timestamp, uncertaintyM, source: "recorded" };
  });
}

export function Navigation({ route, returning, local, fix, report, block, clear, position, recorded, earthWalk }: {
  route: readonly GlobalRouteLeg[]; returning: boolean; local: boolean; fix: () => void; report: () => void; block: LatLon | null; clear: () => void;
  position: (value: Position | null) => void;
  recorded: (value: Position) => void;
  earthWalk: React.ReactNode;
}) {
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [rate, setRate] = useState(450);
  const [track, setTrack] = useState<Position[]>([]);
  const [trackIndex, setTrackIndex] = useState(0);
  const [trackStatus, setTrackStatus] = useState("");
  const points = useMemo(() => route.flatMap((leg) => leg.points.map((point, i) => ({ point, z: leg.elevationsM[i] })))
    .filter((p, i, all) => !i || greatCircleKm(p.point, all[i - 1].point) > 1e-8), [route]);
  const last = points.length - 1;
  const current = points[Math.min(step, last)];
  const next = points[step + 1];
  const before = points[step - 1];
  const bearing = current && next ? bearingDeg(current.point, next.point) : 0;
  const turn = before && current ? lonDelta(bearingDeg(before.point, current.point), bearing) : 0;
  const rise = next && current && next.z != null && current.z != null ? next.z - current.z : null;
  const remaining = points.slice(step + 1).reduce((km, p, i) => km + greatCircleKm(points[step + i].point, p.point), 0);
  useEffect(() => { setStep(0); setRunning(false); }, [points]);
  useEffect(() => {
    if (!running || step >= last) return;
    const timer = window.setTimeout(() => {
      const index = Math.min(last, step + Math.max(1, Math.floor(points.length / 100)));
      setStep(index); position(makePosition(points[index].point, "simulated"));
      if (index >= last) setRunning(false);
    }, rate);
    return () => window.clearTimeout(timer);
  }, [running, step, last, points, rate, position]);
  const jump = (index: number) => {
    const nextIndex = Math.max(0, Math.min(last, index));
    if (!points[nextIndex]) return;
    setStep(nextIndex); position(makePosition(points[nextIndex].point, "simulated"));
  };
  return <details><summary>Navigate and replan</summary>
    {earthWalk}
    {current && <>
      <p><strong>Simulated position</strong> · {formatLatLon(current.point, 5)}</p>
      <p>{next ? <>{Math.abs(turn) >= 25 ? (turn > 0 ? "Turn right" : "Turn left") : "Continue"} · {bearing.toFixed(0)}° from north
        {rise !== null && Math.abs(rise) >= 0.1 ? ` · ${rise > 0 ? "Climb" : "Descend"} ${Math.abs(rise).toFixed(1)} m` : ""}</> : returning ? "Arrived back at the lander." : "Arrived at the final stop."}</p>
      <p className="small muted">{remaining < 1 ? `${Math.round(remaining * 1000)} m` : `${remaining.toFixed(1)} km`} remaining</p>
      <div className="mission-row">
        <button className="btn btn--small" onClick={() => jump(step - 1)} disabled={step <= 0}>Previous</button>
        <button className="btn btn--small" onClick={() => jump(step + 1)} disabled={step >= last}>Next</button>
        <button className="btn btn--small" onClick={() => { if (step >= last) jump(0); setRunning(!running); }}>{running ? "Pause replay" : "Play route"}</button>
        <label>Replay speed <select value={rate} onChange={(e) => setRate(Number(e.target.value))}><option value={850}>Slow</option><option value={450}>Normal</option><option value={150}>Fast</option></select></label>
      </div>
    </>}
    <div className="mission-row">
      <button className="btn btn--small" onClick={() => { setRunning(false); fix(); }}>Set crew position</button>
      <button className="btn btn--small" disabled={!local && !block} onClick={() => { setRunning(false); report(); }}>Report blocked cell</button>
      <button className="btn btn--small" onClick={() => { setRunning(false); clear(); }}>Reset navigation inputs</button>
    </div>
    <p className="muted small">Set a known position to replan from there through the ordered stops. Obstacle reports require a local elevation grid.</p>
    <details>
      <summary>Recorded position input</summary>
      <label>Load recorded track <input type="file" accept=".json,application/json" onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        try {
          if (file.size > 260_000) throw Error("Track too large");
          const points = readFixes(await file.text());
          setTrack(points); setTrackIndex(0); setTrackStatus(`${points.length} recorded fixes loaded.`);
        } catch { setTrack([]); setTrackStatus("Invalid or missing fix data."); }
      }} /></label>
      <p className="muted small">JSON list with lat, lon, timestamp in UTC milliseconds, and optional uncertaintyM. Recorded fixes are historical playback, never live positions.</p>
      {!!track.length && <button className="btn btn--small" disabled={trackIndex >= track.length} onClick={() => {
        const item = track[trackIndex];
        setRunning(false); recorded(item); setTrackIndex(trackIndex + 1);
        setTrackStatus(Date.now() - item.timestamp > 60000 ? "Historical fix applied for replay; too old for a live feed." : "Recorded fix applied for replay.");
      }}>Apply next recorded fix</button>}
      <p role="status" className="muted small">{trackStatus}</p>
    </details>
  </details>;
}
