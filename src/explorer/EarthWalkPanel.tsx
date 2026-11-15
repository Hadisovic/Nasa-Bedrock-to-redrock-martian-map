import { useEffect, useRef, useState } from "react";
import { earthGpsScales } from "./earthWalk.ts";
import type { nextManeuver, WalkMode } from "./earthWalk.ts";
import { notificationsSupported, noticePreference, saveNoticePreference } from "./deviceNotifications.ts";
import { formatLatLon } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import { NavigationIcon, RoverIcon } from "./icons.tsx";
import { marsAt } from "./marsTime.ts";
import type { useEarthWalk } from "./useEarthWalk.ts";

type Walk = ReturnType<typeof useEarthWalk>;
const modeLabel: Record<WalkMode, string> = {
  Outdoor: "Earth GPS Demo",
  "Indoor Steps": "Step-powered preview",
  "Recorded Walk": "Recorded preview",
};
const scaleLabel: Record<(typeof earthGpsScales)[number], string> = {
  1: "1 m becomes 1 m",
  10: "1 m becomes 10 m",
  100: "10 m becomes 1 km",
  1000: "1 m becomes 1 km",
};

function RouteMetrics({ metres, speed, utc, scienceMinutes, destination, paused }: {
  metres: number; speed: number | null; utc: number; scienceMinutes: number; destination?: LatLon | null; paused: boolean;
}) {
  const seconds = speed !== null && Number.isFinite(speed) && speed > 0 ? Math.ceil(metres / speed) : null;
  const minutes = seconds === null ? null : Math.ceil(seconds / 60);
  const duration = seconds === null || minutes === null ? "Unavailable" : seconds < 60 ? `${seconds} sec` : minutes >= 60
    ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`;
  const distance = metres >= 1000 ? `${(metres / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km` : `${Math.round(metres)} m`;
  const arrival = seconds === null || paused ? null : utc + seconds * 1000 + scienceMinutes * 60_000;
  const mars = arrival !== null && destination ? marsAt(arrival, destination) : null;
  return <dl className="route-metrics">
    <div><dt>Distance left</dt><dd>{distance}</dd></div>
    {seconds !== null && <div><dt>Est. travel</dt><dd>{duration}</dd></div>}
    {arrival !== null && <div className="route-metrics__arrival"><dt>Est. arrival</dt>
      <dd><time dateTime={new Date(arrival).toISOString()}>{new Date(arrival).toLocaleString([], {
        month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
      })}</time>{mars && <small>Sol {mars.sol} · {mars.time} LTST</small>}</dd></div>}
  </dl>;
}

export function EarthWalkSetup({ walk, open, close, started, comparison, pathSelected }: {
  walk: Walk; open: boolean; close: () => void; started: () => void; comparison: React.ReactNode; pathSelected: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const gpsIssue = !walk.gpsAvailable ? "Live Earth GPS is available on a phone or tablet."
    : !isSecureContext ? "Open the app over HTTPS to use live location."
    : !navigator.geolocation ? "This browser does not provide live location."
    : !walk.liveEligible ? "Earth GPS needs a route that starts at the lander." : null;
  const canNotify = notificationsSupported();
  const [tilt, setTilt] = useState(true);
  const [scale, setScale] = useState(1);
  const [notices, setNotices] = useState(noticePreference);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  const launch = async (mode: WalkMode, rover?: boolean) => {
    if (await walk.start({ mode, tilt: tilt && mode === "Outdoor", scale, deviceNotices: notices, rover })) started();
  };
  const disabled = !pathSelected || !walk.eligible || walk.starting || !!walk.session;
  return <dialog ref={dialog} className="project-dialog earth-walk-setup" aria-labelledby="earth-walk-title"
    onCancel={(event) => { if (walk.starting) event.preventDefault(); }} onClose={close}>
    <header><h2 id="earth-walk-title">Start route</h2>
      <button type="button" className="navigation-icon-button" aria-label="Close route setup" disabled={walk.starting} onClick={close}><NavigationIcon kind="close" /></button></header>
    <div className="route-start-path">
      {!pathSelected && <p className="small">Choose a path to continue.</p>}
      {comparison}
    </div>
    <section className={`route-start-card${gpsIssue ? " route-start-card--unavailable" : ""}`}>
      <h3><NavigationIcon kind="gps" /> Earth GPS Demo</h3>
      <p id="earth-gps-availability">{gpsIssue ?? "Use your movement to follow the route. Allow precise location and start in an open area."}</p>
      <button type="button" className="btn btn--primary" disabled={disabled || !!gpsIssue} aria-describedby="earth-gps-availability"
        onClick={() => void launch("Outdoor")}>Start GPS demo</button>
      <details>
        <summary>GPS options</summary>
        <fieldset disabled={!!gpsIssue}>
          <legend className="sr-only">Earth GPS settings</legend>
          <label>Earth to Mars distance <select value={scale} onChange={(event) => setScale(Number(event.target.value))}>
            {earthGpsScales.map((ratio) => <option key={ratio} value={ratio}>{ratio}× · {scaleLabel[ratio]}</option>)}
          </select></label>
          {scale > 1 && <p>The demo scales GPS uncertainty as well. Use 1× for short routes on detailed terrain.</p>}
          <label><input type="checkbox" checked={tilt} onChange={(event) => setTilt(event.target.checked)} /> Tilt the 3D camera with this device</label>
          {canNotify
            ? <label><input type="checkbox" checked={notices} onChange={(event) => {
              setNotices(event.target.checked);
              saveNoticePreference(event.target.checked);
            }} /> Device notifications</label>
            : <p>On iPhone or iPad, open the app from your Home Screen to receive notifications.</p>}
          {canNotify && Notification.permission === "denied" && <p>Notifications are blocked in this site's settings.</p>}
          <p>Live GPS and voice need the map open. If you switch away, the notification can show your last confirmed instruction.</p>
        </fieldset>
      </details>
    </section>
    <section className="route-start-card">
      <h3>Recorded preview</h3>
      <p>Replay the selected path without location access.</p>
      <div className="route-start-card__previews">
        <button type="button" className={`btn${gpsIssue ? " btn--primary" : ""}`} disabled={disabled}
          onClick={() => void launch("Recorded Walk", false)}><NavigationIcon kind="astronaut" /> Astronaut preview</button>
        <button type="button" className="btn" disabled={disabled}
          onClick={() => void launch("Recorded Walk", true)}><RoverIcon /> Rover preview</button>
      </div>
    </section>
    {!walk.session && walk.message && <p role="status" className="small">{walk.message}</p>}
  </dialog>;
}

export function EarthWalkControls({ walk, speed, utc, recenter, exit }: {
  walk: Walk; speed: number | null; utc: number; recenter: () => void; exit: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { if (!walk.session) setCollapsed(false); }, [walk.session]);
  if (!walk.session) return null;
  const preview = walk.session.mode !== "Outdoor";
  const imminent = walk.guidance && walk.guidance.metres <= 12
    ? walk.guidance.kind : null;
  return <section aria-label="Earth Walk controls" className="earth-walk-controls">
    <header className="navigation-hud__headline">
      {walk.guidance ? <div className="gps-maneuver" aria-label="Next maneuver">
        {imminent === "left" || imminent === "right" ? <NavigationIcon kind={imminent} />
          : <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${walk.guidance.bearing}deg)` }}>
            <path d="M12 3 5 12l5-1v9h4v-9l5 1z" fill="currentColor" />
          </svg>}
        <div><strong>{walk.guidance.distance}</strong><span>{walk.guidance.action}</span></div>
      </div> : walk.maneuver ? <NextManeuver maneuver={walk.maneuver} stop={walk.nextStop} /> : <strong>{walk.arrived ? "Arrived" : walk.session.mode === "Outdoor" ? "Earth GPS" : "Route preview"}</strong>}
      <button type="button" className="navigation-icon-button" aria-label={walk.muted ? "Unmute GPS voice" : "Mute GPS voice"}
        onClick={walk.toggleMute}><NavigationIcon kind={walk.muted ? "mute" : "sound"} /></button>
      <button type="button" className="navigation-icon-button" aria-label={collapsed ? "Show" : "Hide"} aria-expanded={!collapsed} aria-controls="navigation-steps"
        onClick={() => setCollapsed(!collapsed)}><NavigationIcon kind={collapsed ? "expand" : "collapse"} /></button>
    </header>
    {(walk.message || walk.cue) && <div role="status" className="navigation-hud__alert">
      {walk.message && <div>{walk.message}</div>}
      {walk.cue && (!collapsed || walk.cue !== walk.guidance?.text) && <div>Mission Control · {walk.cue}</div>}
    </div>}
    <div className="navigation-hud__details" id="navigation-steps" hidden={collapsed}>
    {walk.nextStop && !walk.arrived && <strong>{walk.nextStop}</strong>}
    <span className="small">{preview && walk.rover ? "Rover preview" : modeLabel[walk.session.mode]}
      {!preview && walk.rover ? " · Rover" : ""}{walk.paused && !walk.arrived ? " · Paused" : ""}</span>
    {!walk.detailed && <span className="small">Regional estimate · arrival needs finer terrain</span>}
    {walk.session.mode === "Outdoor" && walk.accuracy !== null && <span className="small">GPS accuracy · ±{Math.round(walk.accuracy)} m</span>}
    {walk.session.mode === "Outdoor" && walk.pose && <span className="small">Simulated Mars position · {formatLatLon(walk.pose.point, 5)}</span>}
    {walk.remaining !== null && !walk.arrived && <RouteMetrics metres={walk.remaining} speed={speed} utc={utc}
      scienceMinutes={walk.remainingScienceMinutes} destination={walk.arrivalPoint} paused={walk.paused} />}
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
    </div>
    </div>
  </section>;
}

function NextManeuver({ maneuver, stop }: { maneuver: ReturnType<typeof nextManeuver>; stop: string | null }) {
  const { kind, metres } = maneuver;
  const distance = metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
  return <div className="gps-maneuver" aria-label="Next maneuver">
    <NavigationIcon kind={kind === "stop" ? "ahead" : kind} />
    <div><strong>{distance}</strong><span>{kind === "stop" ? `Toward ${stop ?? "destination"}` : kind === "left" ? "Turn left" : "Turn right"}</span></div>
  </div>;
}
