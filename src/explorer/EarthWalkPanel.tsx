import { useEffect, useRef, useState } from "react";
import type { nextManeuver, WalkMode } from "./earthWalk.ts";
import { formatLatLon } from "./geo.ts";
import type { useEarthWalk } from "./useEarthWalk.ts";

type Walk = ReturnType<typeof useEarthWalk>;
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

export function EarthWalkSetup({ walk, open, close, started }: {
  walk: Walk; open: boolean; close: () => void; started: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const gpsAllowed = walk.liveEligible && walk.gpsAvailable && isSecureContext;
  const [tilt, setTilt] = useState(false);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  const unavailable = !walk.eligible || walk.starting || !!walk.session;
  const launch = async (mode: WalkMode) => {
    if (await walk.start(mode, .7, tilt && mode === "Outdoor", scale)) started();
  };
  return <dialog ref={dialog} className="project-dialog earth-walk-setup" aria-labelledby="earth-walk-title"
    onCancel={(event) => { if (walk.starting) event.preventDefault(); }} onClose={close}>
    <header><h2 id="earth-walk-title">Start route</h2>
      <button type="button" className="btn btn--small" aria-label="Close route setup" disabled={walk.starting} onClick={close}>×</button></header>
    <div className="earth-walk-setup__modes">
      {walk.liveEligible && walk.gpsAvailable && !isSecureContext && <p className="small muted">Earth GPS Demo requires a secure connection.</p>}
      {gpsAllowed && <section className="earth-walk-setup__mode">
        <h3>Earth GPS Demo</h3>
        <p>Walk outdoors with precise location. Your first fix anchors the lander, and Mission Control calls out each step.</p>
        <details><summary>GPS options</summary>
          <label>Earth to Mars distance <select value={scale} disabled={unavailable} onChange={(event) => setScale(Number(event.target.value))}>
            <option value={1}>1× · 1 m becomes 1 m</option><option value={10}>10× · 1 m becomes 10 m</option>
            <option value={100}>100× · 10 m becomes 1 km</option>
          </select></label>
          {scale > 1 && <p>Scaling also magnifies GPS uncertainty.</p>}
          <label><input type="checkbox" checked={tilt} disabled={unavailable} onChange={(event) => setTilt(event.target.checked)} /> Tilt the 3D camera with this device</label>
        </details>
        <button type="button" className="btn btn--primary" disabled={unavailable} onClick={() => void launch("Outdoor")}>
          {walk.starting ? "Waiting for permissions…" : "Start Earth GPS Demo"}
        </button>
      </section>}
      <section className="earth-walk-setup__mode">
        <h3>Recorded preview</h3>
        <p>Play the route with a simulated {walk.rover ? "rover" : "astronaut"} and Mission Control voice cues.</p>
        <button type="button" className={gpsAllowed ? "btn" : "btn btn--primary"} disabled={unavailable} onClick={() => void launch("Recorded Walk")}>Start preview</button>
      </section>
    </div>
    {!walk.session && walk.message && <p role="status" className="small">{walk.message}</p>}
  </dialog>;
}

export function EarthWalkControls({ walk, speed, recenter, exit, report, reporting, clearObstacle }: {
  walk: Walk; speed: number; recenter: () => void; exit: () => void;
  report: () => void; reporting: boolean; clearObstacle?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { if (!walk.session) setCollapsed(false); }, [walk.session]);
  if (!walk.session) return null;
  const preview = walk.session.mode !== "Outdoor";
  return <section aria-label="Earth Walk controls" className="earth-walk-controls">
    <header className="navigation-hud__headline">
      {walk.recovery && !walk.paused ? <div className="gps-maneuver gps-maneuver--rejoin">
        <b aria-hidden="true" style={{ rotate: `${walk.recovery.bearing}deg` }}>↑</b>
        <div><strong>Rejoin route</strong><span>{walk.recovery.text}</span></div>
      </div> : walk.maneuver ? <NextManeuver maneuver={walk.maneuver} stop={walk.nextStop} /> : <strong>{walk.arrived ? "Arrived" : "Navigation"}</strong>}
      <button type="button" className="btn btn--small" aria-label={walk.muted ? "Unmute GPS voice" : "Mute GPS voice"}
        onClick={walk.toggleMute}>{walk.muted ? "Unmute" : "Mute"}</button>
      <button type="button" className="btn btn--small" aria-expanded={!collapsed} aria-controls="navigation-steps"
        onClick={() => setCollapsed(!collapsed)}>{collapsed ? "Show" : "Hide"}</button>
    </header>
    <div className="navigation-hud__details" id="navigation-steps" hidden={collapsed}>
    {walk.nextStop && !walk.arrived && <strong>{walk.nextStop}</strong>}
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
    {walk.upcoming.length > 1 && <ol className="navigation-hud__steps" aria-label="Upcoming directions">
      {walk.upcoming.map(({ kind, metres }, index) => <li key={index}>
        {metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`} · {kind === "left" ? "Turn left" : kind === "right" ? "Turn right" : `Toward ${walk.nextStop ?? "destination"}`}
      </li>)}
    </ol>}
    <div className="mission-row">
      {!walk.arrived && <button type="button" className="btn btn--small" disabled={walk.obstacleHold} onClick={walk.togglePause}>{walk.paused ? "Resume" : "Pause"}</button>}
      <button type="button" className="btn btn--small" onClick={recenter}>Recenter</button>
      <button type="button" className="btn btn--small" disabled={!walk.cue || walk.muted} onClick={walk.repeat}>Repeat last cue</button>
      <button type="button" className="btn btn--small earth-walk-controls__exit" onClick={exit}>Exit route</button>
      {!walk.arrived && <button type="button" className="btn btn--small" aria-pressed={reporting} onClick={report}>
        {reporting ? "Cancel obstacle report" : "Report obstacle"}</button>}
      {!!clearObstacle && <button type="button" className="btn btn--small" onClick={clearObstacle}>Clear obstacle</button>}
    </div>
    {reporting && <p className="small" role="status">Tap the map to mark a blocked terrain cell.</p>}
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
