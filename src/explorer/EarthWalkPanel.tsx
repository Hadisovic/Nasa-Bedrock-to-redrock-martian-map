import { useEffect, useRef, useState } from "react";
import type { WalkMode } from "./earthWalk.ts";
import type { useEarthWalk } from "./useEarthWalk.ts";

type Walk = ReturnType<typeof useEarthWalk>;
const modes: WalkMode[] = ["Outdoor", "Indoor Steps", "Recorded Walk"];

function RouteMetrics({ metres, speed, paused = false, recorded = false, beforeStart = false }: {
  metres: number; speed: number; paused?: boolean; recorded?: boolean; beforeStart?: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Number.isFinite(speed) && speed > 0 ? Math.ceil(metres / speed) : null;
  const minutes = seconds === null ? null : Math.ceil(seconds / 60);
  const duration = minutes === null ? "—" : minutes >= 60
    ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
    : recorded && seconds !== null && seconds < 60 ? `${seconds} sec` : `${minutes} min`;
  const distance = metres >= 1000 ? `${(metres / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km` : `${Math.round(metres)} m`;
  return <dl className="route-metrics">
    <div><dt>ETA</dt><dd>{paused || seconds === null ? "—" : new Date(now + seconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</dd></div>
    <div><dt>{beforeStart ? "Distance" : "Distance left"}</dt><dd>{distance}</dd></div>
    <div><dt>{beforeStart ? recorded ? "Playback time" : "Travel time" : recorded ? "Playback left" : "Time left"}</dt><dd>{duration}</dd></div>
  </dl>;
}

export function EarthWalkSetup({ walk, open, close, started, distanceM, speed }: {
  walk: Walk; open: boolean; close: () => void; started: () => void; distanceM: number; speed: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<WalkMode>("Recorded Walk");
  const selectedMode = walk.liveEligible ? mode : "Recorded Walk";
  const [tilt, setTilt] = useState(false);
  const [calibrationM, setCalibrationM] = useState("10");
  const [calibrationSteps, setCalibrationSteps] = useState("14");
  const stride = Number(calibrationM) / Number(calibrationSteps);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return <dialog ref={dialog} className="project-dialog earth-walk-setup" aria-labelledby="earth-walk-title"
    onCancel={(event) => { if (walk.starting) event.preventDefault(); }} onClose={close}>
    <h2 id="earth-walk-title">Start route</h2>
    {open && <RouteMetrics metres={distanceM} speed={selectedMode === "Recorded Walk" ? walk.playbackSpeed : speed}
      recorded={selectedMode === "Recorded Walk"} beforeStart />}
    <label>Mode <select value={selectedMode} disabled={walk.starting || !!walk.session}
      onChange={(event) => setMode(event.target.value as WalkMode)}>
      {modes.map((value) => <option key={value} disabled={value !== "Recorded Walk" && !walk.liveEligible}>{value}</option>)}
    </select></label>
    <p className="small">{selectedMode === "Outdoor" ? "Start requests precise location. Your first usable fix is the lander. Earth coordinates stay in this tab’s memory."
      : selectedMode === "Indoor Steps" ? "Start requests motion access. Measure a short walk and count your steps to calibrate the estimated distance."
      : "Recorded Walk plays a simulated walk along the route. It uses no GPS or step readings."}</p>
    {selectedMode === "Indoor Steps" && <div className="mission-row">
      <label>Measured metres <input type="number" min="1" max="100" step="0.1" value={calibrationM}
        onChange={(event) => setCalibrationM(event.target.value)} /></label>
      <label>Counted steps <input type="number" min="1" max="250" step="1" value={calibrationSteps}
        onChange={(event) => setCalibrationSteps(event.target.value)} /></label>
      <span className="small">{stride >= 0.2 && stride <= 1.8 ? `${stride.toFixed(2)} m per step` : "Enter a stride between 0.2 and 1.8 m."}</span>
    </div>}
    <label><input type="checkbox" checked={tilt} disabled={walk.starting || !!walk.session}
      onChange={(event) => setTilt(event.target.checked)} /> Use device orientation to tilt the 3D camera</label>
    <p className="small">Mission Control plays cues through this device’s speaker.</p>
    <div className="mission-row">
    <button type="button" className="btn" disabled={walk.starting} onClick={close}>Cancel</button>
    <button type="button" className="btn btn--primary" disabled={!walk.eligible || walk.starting || !!walk.session ||
      (selectedMode === "Indoor Steps" && !(stride >= 0.2 && stride <= 1.8 && Number.isInteger(Number(calibrationSteps))))}
      onClick={async () => { if (await walk.start(selectedMode, stride, tilt)) started(); }}>
      {walk.starting ? "Waiting for permissions…" : selectedMode === "Recorded Walk" ? "Play demo" : "Start walk"}
    </button>
    </div>
    {!walk.session && walk.message && <p role="status" className="small">{walk.message}</p>}
  </dialog>;
}

export function EarthWalkControls({ walk, speed, recenter, exit }: { walk: Walk; speed: number; recenter: () => void; exit: () => void }) {
  if (!walk.session) return null;
  const recorded = walk.session.mode === "Recorded Walk";
  return <section aria-label="Earth Walk controls" className="earth-walk-controls">
    <strong>{walk.arrived ? "Arrived" : walk.nextStop ?? "Earth Walk"}</strong>
    <span className="small">{walk.session.mode}{walk.paused && !walk.arrived ? " · Paused" : ""}</span>
    {walk.session.mode === "Outdoor" && walk.accuracy !== null && <span className="small">GPS accuracy · ±{Math.round(walk.accuracy)} m</span>}
    {walk.remaining !== null && !walk.arrived && <RouteMetrics metres={walk.remaining}
      speed={recorded ? walk.playbackSpeed : speed} paused={walk.paused} recorded={recorded} />}
    {(walk.message || walk.cue) && <div role="status" className="small">
      {walk.message && <div>{walk.message}</div>}
      {walk.cue && <div>Mission Control · {walk.cue}</div>}
    </div>}
    <div className="mission-row">
      {!walk.arrived && <button type="button" className="btn btn--small" onClick={walk.togglePause}>{walk.paused ? "Resume" : "Pause"}</button>}
      <button type="button" className="btn btn--small" onClick={recenter}>Recenter</button>
      <button type="button" className="btn btn--small" disabled={!walk.cue} onClick={walk.repeat}>Repeat last cue</button>
      <button type="button" className="btn btn--small earth-walk-controls__exit" onClick={exit}>Exit route</button>
    </div>
  </section>;
}
