import { useEffect, useRef, useState } from "react";
import type { nextManeuver, WalkMode } from "./earthWalk.ts";
import { formatLatLon } from "./geo.ts";
import type { useEarthWalk } from "./useEarthWalk.ts";

type Walk = ReturnType<typeof useEarthWalk>;
const modes: WalkMode[] = ["Outdoor", "Indoor Steps", "Recorded Walk"];
const modeLabel: Record<WalkMode, string> = {
  Outdoor: "Earth GPS Demo",
  "Indoor Steps": "Step-powered preview",
  "Recorded Walk": "Recorded preview",
};

function RouteMetrics({ metres, speed, paused = false, recorded = false, beforeStart = false, regional = false }: {
  metres: number; speed: number; paused?: boolean; recorded?: boolean; beforeStart?: boolean; regional?: boolean;
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
    {(!regional || recorded) && <>
    <div><dt>ETA</dt><dd>{paused || seconds === null ? "—" : new Date(now + seconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</dd></div>
    <div><dt>{beforeStart ? recorded ? "Playback time" : "Travel time" : recorded ? "Playback left" : "Time left"}</dt><dd>{duration}</dd></div>
    </>}
    <div><dt>{beforeStart ? "Distance" : "Distance left"}</dt><dd>{distance}</dd></div>
  </dl>;
}

export function EarthWalkSetup({ walk, open, close, started, distanceM, speed, roverSuggestion }: {
  walk: Walk; open: boolean; close: () => void; started: () => void; distanceM: number; speed: number; roverSuggestion: string | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<WalkMode | null>(null);
  const gpsAllowed = !walk.rover && walk.liveEligible && walk.gpsAvailable && isSecureContext;
  const selectedMode = walk.rover || (mode === "Outdoor" && !gpsAllowed) ? "Recorded Walk" : mode ?? (gpsAllowed ? "Outdoor" : "Recorded Walk");
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
      recorded={selectedMode === "Recorded Walk"} beforeStart regional={!walk.detailed} />}
    <label>Mode <select value={selectedMode} disabled={walk.starting || !!walk.session}
      onChange={(event) => setMode(event.target.value as WalkMode)}>
      {modes.filter((value) => walk.rover ? value === "Recorded Walk" : value !== "Outdoor" || gpsAllowed)
        .map((value) => <option key={value} value={value}>{modeLabel[value]}</option>)}
    </select></label>
    <p className="small">{selectedMode === "Outdoor" ? "Your first reliable Earth fix anchors the Mars lander. Walk outdoors to move. Earth coordinates stay in this tab’s memory."
      : selectedMode === "Indoor Steps" ? "Steps animate the astronaut for this preview. Measure a short walk and count your steps to calibrate the animation."
      : walk.rover ? "Replay the solved route with the NASA/JPL-Caltech rover model." : "Watch the astronaut preview the planned route."}</p>
    {!walk.rover && !gpsAllowed && <p className="small">{walk.gpsAvailable && !isSecureContext
      ? "Open the app through HTTPS or on this device’s localhost to give it location access."
      : "Earth GPS Demo is available on phones and tablets when the route starts at the lander."}</p>}
    {!walk.detailed && <p className="small">Regional terrain shows the route and your position at map scale. Use a local terrain pack to hear turns and recalculate walking detours.</p>}
    {roverSuggestion && <p className="small rover-suggestion">{roverSuggestion}</p>}
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
      {walk.starting ? "Waiting for permissions…" : selectedMode === "Outdoor" ? "Start GPS demo" : "Start preview"}
    </button>
    </div>
    {!walk.session && walk.message && <p role="status" className="small">{walk.message}</p>}
  </dialog>;
}

export function EarthWalkControls({ walk, speed, recenter, exit }: { walk: Walk; speed: number; recenter: () => void; exit: () => void }) {
  if (!walk.session) return null;
  const preview = walk.session.mode !== "Outdoor";
  return <section aria-label="Earth Walk controls" className="earth-walk-controls">
    {walk.maneuver && <NextManeuver maneuver={walk.maneuver} stop={walk.nextStop} />}
    <strong>{walk.arrived ? "Arrived" : walk.nextStop ?? "Earth Walk"}</strong>
    <span className="small">{walk.rover ? "Rover preview" : modeLabel[walk.session.mode]}{walk.paused && !walk.arrived ? " · Paused" : ""}</span>
    {!walk.detailed && <span className="small">Regional estimate · map overview</span>}
    {walk.session.mode === "Outdoor" && walk.accuracy !== null && <span className="small">GPS accuracy · ±{Math.round(walk.accuracy)} m</span>}
    {walk.session.mode === "Outdoor" && walk.pose && <span className="small">Simulated Mars position · {formatLatLon(walk.pose.point, 5)}</span>}
    {walk.remaining !== null && !walk.arrived && <RouteMetrics metres={walk.remaining}
      speed={walk.session.mode === "Recorded Walk" ? walk.playbackSpeed : speed} paused={walk.paused} recorded={preview} regional={!walk.detailed} />}
    {(walk.message || walk.cue) && <div role="status" className="small">
      {walk.message && <div>{walk.message}</div>}
      {walk.cue && <div>Mission Control · {walk.cue}</div>}
    </div>}
    <div className="mission-row">
      {!walk.arrived && <button type="button" className="btn btn--small" onClick={walk.togglePause}>{walk.paused ? "Resume" : "Pause"}</button>}
      <button type="button" className="btn btn--small" onClick={recenter}>Recenter</button>
      <button type="button" className="btn btn--small" aria-label={walk.muted ? "Unmute GPS voice" : "Mute GPS voice"}
        onClick={walk.toggleMute}>{walk.muted ? "Unmute" : "Mute"}</button>
      <button type="button" className="btn btn--small" disabled={!walk.cue || walk.muted} onClick={walk.repeat}>Repeat last cue</button>
      <button type="button" className="btn btn--small earth-walk-controls__exit" onClick={exit}>Exit route</button>
    </div>
  </section>;
}

function NextManeuver({ maneuver, stop }: { maneuver: ReturnType<typeof nextManeuver>; stop: string | null }) {
  const { kind, metres } = maneuver;
  const distance = metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
  return <div className="gps-maneuver" aria-label="Next maneuver">
    <b aria-hidden="true">{kind === "left" ? "↰" : kind === "right" ? "↱" : "↑"}</b>
    <div><strong>{distance}</strong><span>{kind === "stop" ? `Toward ${stop ?? "destination"}` : kind === "left" ? "Turn left" : "Turn right"}</span></div>
  </div>;
}
