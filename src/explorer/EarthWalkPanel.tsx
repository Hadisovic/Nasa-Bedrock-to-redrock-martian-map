import { useEffect, useRef, useState } from "react";
import type { nextManeuver, WalkMode } from "./earthWalk.ts";
import { formatLatLon } from "./geo.ts";
import { noticePreference, notificationsSupported, saveNoticePreference } from "./deviceNotifications.ts";
import type { useEarthWalk } from "./useEarthWalk.ts";

type Walk = ReturnType<typeof useEarthWalk>;
const modeLabel: Record<WalkMode, string> = {
  Outdoor: "Earth GPS Demo",
  "Indoor Steps": "Step-powered preview",
  "Recorded Walk": "Recorded preview",
};

function RouteMetrics({ metres, speed, paused = false, recorded = false, beforeStart = false, regional = false, movementSeconds, playbackRate = 1, simulationUtc }: {
  metres: number; speed: number; movementSeconds?: number; playbackRate?: number; simulationUtc?: number | null; paused?: boolean; recorded?: boolean; beforeStart?: boolean; regional?: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = movementSeconds !== undefined ? Math.ceil(movementSeconds) : Number.isFinite(speed) && speed > 0 ? Math.ceil(metres / speed) : null;
  const minutes = seconds === null ? null : Math.ceil(seconds / 60);
  const duration = minutes === null ? "—" : minutes >= 60
    ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
    : recorded && seconds !== null && seconds < 60 ? `${seconds} sec` : `${minutes} min`;
  const distance = metres >= 1000 ? `${(metres / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km` : `${Math.round(metres)} m`;
  return <dl className="route-metrics">
    {!regional && <>
    <div><dt>ETA{recorded ? " · mission" : ""}</dt><dd>{seconds === null ? "—" : new Date((simulationUtc ?? now) + seconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</dd></div>
    <div><dt>{beforeStart ? "Travel time" : "Travel left"}</dt><dd>{duration}</dd></div>
    </>}
    {!regional && recorded && playbackRate > 1 && seconds !== null && <div><dt>Preview left · {playbackRate}×</dt><dd>{seconds / playbackRate < 60 ? `${Math.ceil(seconds / playbackRate)} sec` : `${Math.ceil(seconds / playbackRate / 60)} min`}</dd></div>}
    <div><dt>{beforeStart ? "Distance" : "Distance left"}</dt><dd>{distance}</dd></div>
  </dl>;
}

export function EarthWalkSetup({ walk, open, close, started }: {
  walk: Walk; open: boolean; close: () => void; started: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const gpsAllowed = walk.liveEligible && walk.gpsAvailable && isSecureContext;
  const [tilt, setTilt] = useState(true);
  const [scale, setScale] = useState(1);
  const [notify, setNotify] = useState(noticePreference);
  const deviceNotices = notificationsSupported();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  const launch = async (mode: WalkMode) => {
    if (await walk.start(mode, .7, tilt && mode === "Outdoor", scale, deviceNotices && notify)) started();
  };
  const disabled = !walk.eligible || walk.starting || !!walk.session;
  return <dialog ref={dialog} className="project-dialog earth-walk-setup" aria-labelledby="earth-walk-title"
    onCancel={(event) => { if (walk.starting) event.preventDefault(); }} onClose={close}>
    <header><h2 id="earth-walk-title">Start route</h2>
      <button type="button" className="btn btn--small" aria-label="Close route setup" disabled={walk.starting} onClick={close}>×</button></header>
    {gpsAllowed && <section className="route-start-card">
      <h3>Earth GPS Demo</h3>
      <p>Move the astronaut by walking with this device. Allow precise location and start in an open area.</p>
      {deviceNotices && <label className="route-start-card__notifications">
        <input type="checkbox" checked={notify} onChange={(event) => {
          saveNoticePreference(event.target.checked);
          setNotify(event.target.checked);
        }} /> Device notifications
      </label>}
      <button type="button" className="btn btn--primary" disabled={disabled} onClick={() => void launch("Outdoor")}>Start GPS demo</button>
      <details>
        <summary>GPS options</summary>
        <label>Earth to Mars distance <select value={scale} onChange={(event) => setScale(Number(event.target.value))}>
          <option value={1}>1× · 1 m becomes 1 m</option><option value={10}>10× · 1 m becomes 10 m</option>
          <option value={100}>100× · 10 m becomes 1 km</option>
        </select></label>
        {scale > 1 && <p>The demo scales GPS uncertainty as well. Use 1× for short routes on detailed terrain.</p>}
        <label><input type="checkbox" checked={tilt} onChange={(event) => setTilt(event.target.checked)} /> Tilt the 3D camera with this device</label>
        <p>Keep Martian Map open for live GPS. Your phone may pause location and voice in the background. On iPhone and iPad, add Martian Map to the Home Screen for notifications.</p>
        {deviceNotices && Notification.permission === "denied" && <p>Notifications are blocked. You can allow them in your browser’s site settings.</p>}
      </details>
    </section>}
    <section className="route-start-card">
      <h3>Recorded preview</h3>
      <p>Play the route on this device without sharing your location.</p>
      <button type="button" className={`btn${gpsAllowed ? "" : " btn--primary"}`} disabled={disabled}
        onClick={() => void launch("Recorded Walk")}>Start preview</button>
    </section>
    {!walk.session && walk.message && <p role="status" className="small">{walk.message}</p>}
  </dialog>;
}

export function EarthWalkControls({ walk, speed, recenter, exit, report, reporting, clearObstacle, onInfo }: {
  onInfo?: () => void; walk: Walk; speed: number; recenter: () => void; exit: () => void;
  report: () => void; reporting: boolean; clearObstacle?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => { if (!walk.session) setCollapsed(true); }, [walk.session]);
  if (!walk.session) return null;
  const preview = walk.session.mode !== "Outdoor";
  const imminent = walk.guidance && walk.guidance.metres <= 12
    ? walk.guidance.kind : null;
  return <section aria-label="Earth Walk controls" className="earth-walk-controls">
    <header className="navigation-hud__headline">
      {walk.guidance ? <div className="gps-maneuver" aria-label="Next maneuver">
        {imminent === "left" || imminent === "right" ? <b aria-hidden="true">{imminent === "left" ? "↰" : "↱"}</b>
          : <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${walk.guidance.bearing}deg)` }}>
            <path d="M12 3 5 12l5-1v9h4v-9l5 1z" fill="currentColor" />
          </svg>}
        <div><strong>{walk.guidance.distance}</strong><span>{walk.guidance.action}</span></div>
      </div> : walk.maneuver ? <NextManeuver maneuver={walk.maneuver} stop={walk.nextStop} /> : <strong>{walk.arrived ? "Arrived" : "Navigation"}</strong>}
      <button type="button" className="btn btn--small" aria-label={walk.muted ? "Unmute GPS voice" : "Mute GPS voice"}
        onClick={walk.toggleMute}>{walk.muted ? "Unmute" : "Mute"}</button>
      <button type="button" className="btn btn--small" aria-expanded={!collapsed} aria-controls="navigation-steps"
        onClick={() => setCollapsed(!collapsed)}>{collapsed ? "Show" : "Hide"}</button>
    </header>
    {walk.terrain && !walk.arrived && <p className="navigation-hud__terrain">{walk.terrain.label} · {walk.terrain.slopeDeg.toFixed(1)}° measured grade</p>}
    {walk.remaining !== null && !walk.arrived && <RouteMetrics metres={walk.remaining} speed={speed} movementSeconds={walk.travelSecondsRemaining}
      playbackRate={walk.playbackRate} simulationUtc={walk.simulationUtc} paused={walk.paused} recorded={preview} regional={!walk.detailed} />}
    <div className="mission-row navigation-hud__primary">
      {!walk.arrived && <button type="button" className="btn btn--small" disabled={walk.obstacleHold} onClick={walk.togglePause}>{walk.paused ? "Resume" : "Pause"}</button>}
      {preview && !walk.arrived && <button type="button" className="btn btn--small" onClick={walk.cycleRate} title="Fast-forward movement and mission time together" aria-label={`Playback speed ${walk.playbackRate} times; change speed`}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="m3 5 8 7-8 7V5Zm10 0 8 7-8 7V5Z" /></svg> {walk.playbackRate}×</button>}
      {onInfo && <button type="button" className="btn btn--small" onClick={onInfo}>Route info</button>}
      <button type="button" className="btn btn--small earth-walk-controls__exit" onClick={exit}>Exit</button>
    </div>
    <div className="navigation-hud__details" id="navigation-steps" hidden={collapsed}>
    {walk.nextStop && !walk.arrived && <strong>{walk.nextStop}</strong>}
    <span className="small">{walk.rover ? "Rover preview" : modeLabel[walk.session.mode]}{walk.paused && !walk.arrived ? " · Paused" : ""}</span>
    {!walk.detailed && <span className="small">Regional estimate · map overview</span>}
    {walk.session.mode === "Outdoor" && walk.accuracy !== null && <span className="small">GPS accuracy · ±{Math.round(walk.accuracy)} m</span>}
    {walk.session.mode === "Outdoor" && walk.pose && <span className="small">Simulated Mars position · {formatLatLon(walk.pose.point, 5)}</span>}
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
      <button type="button" className="btn btn--small" onClick={recenter}>Recenter</button>
      <button type="button" className="btn btn--small" disabled={!walk.cue || walk.muted} onClick={walk.repeat}>Repeat last cue</button>
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
