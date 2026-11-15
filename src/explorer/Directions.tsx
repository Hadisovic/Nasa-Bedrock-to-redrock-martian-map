import { useState } from "react";
import type { CSSProperties } from "react";
import { formatLatLon } from "./geo.ts";
import { searchEvents } from "./catalog.ts";
import type { CatalogEvent } from "./catalog.ts";
import { MAX_STOPS, validMission, validStop } from "./missionPlan.ts";
import type { Endpoint, MissionOptions, RouteObjective, Stop } from "./missionPlan.ts";
import { routeColors, routeLabels, routeObjectives, routeProfile, selectedLeg, summarizeItinerary } from "./itinerary.ts";
import type { PlannedLeg } from "./itinerary.ts";
import { marsAt } from "./marsTime.ts";
import { RoverIcon } from "./icons.tsx";
import { formatRouteDuration } from "./routeFormat.ts";

export type Pick = "start" | "add" | "position" | "block" | number;
export const routeStartId = "directions-start";
export const stopId = (index: number) => `directions-stop-${index}`;

const distance = (km: number) => km < 1 ? `${Math.round(km * 1000)} m`
  : `${km.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
const minutes = (min: number) => min >= 60 ? `${(min / 60).toFixed(1)} hr` : min < 1 ? `${Math.ceil(min * 60)} sec` : `${Math.ceil(min)} min`;
const labelPoint = (point: Endpoint) => point.name ?? formatLatLon(point, 4);
const terrainName = ({ label, spacingM, regional }: { label: string; spacingM: number; regional: boolean }) =>
  `${label} · ${spacingM < 1000 ? `${Math.round(spacingM)} m` : `~${(spacingM / 1000).toFixed(1)} km`}${regional ? " · regional estimate" : ""}`;

export function RouteChoices({ legs, mission, walkingSlope, choice, choose, compact = false }: {
  legs: readonly PlannedLeg[]; mission: MissionOptions; walkingSlope: number; choice: RouteObjective | null;
  choose: (value: RouteObjective) => void; compact?: boolean;
}) {
  const shortest = routeProfile(legs, mission, "shortest", walkingSlope);
  const coverageNote = !mission.rover && legs.some(({ result }) => result?.terrain?.regional)
    ? <p className="small muted">Energy-efficient routing needs detailed terrain on every leg. This route includes coarse MOLA.</p>
    : null;
  if (!shortest) return coverageNote;
  const hasAlternative = legs.some(({ result }) => result?.status === "ok" && result.alternative);
  return <><div className={compact ? "route-choices route-choices--compact" : "route-choices"} role="group" aria-label="Choose a route">
    {routeObjectives.map((objective) => {
      if (objective === "lowerSlope" && !hasAlternative || objective === "energy" && mission.rover) return null;
      const estimate = objective === "shortest" ? shortest : routeProfile(legs, mission, objective, walkingSlope);
      if (!estimate) return null;
      return <button type="button" className="btn route-choice" key={objective} aria-pressed={choice === objective}
        style={{ "--route-accent": routeColors[objective] } as CSSProperties} onClick={() => choose(objective)}>
        <span className="route-choice__dot" aria-hidden="true" />
        <strong>{routeLabels[objective]}</strong><span className="route-choice__distance">{distance(estimate.distanceKm)}</span>
        {!compact && (estimate.regional || estimate.walk !== null || estimate.rover !== null) && <small>{estimate.regional ? "Regional estimate" : <>
          {estimate.walk !== null && <span aria-label={`Walking time ${formatRouteDuration(estimate.walk)}`}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="13" cy="4.5" r="1.8" /><path d="m7 22 4-6 2-7m-2 7 5 2 1 4m-9-9 5-4 3 5h4" />
          </svg> {formatRouteDuration(estimate.walk)}</span>}
          {estimate.rover !== null && <span aria-label={`Rover time ${formatRouteDuration(estimate.rover)}`}><RoverIcon /> {formatRouteDuration(estimate.rover)}</span>}
        </>}</small>}</button>;
    })}
  </div>
    {coverageNote}
  </>;
}

export function MapRouteControls({ pick, legs, summary, onCancel, onDetails, onFit, onStart, onClear, comparison }: {
  pick: Pick | null; legs: readonly PlannedLeg[]; summary: ReturnType<typeof summarizeItinerary>;
  onCancel: () => void; onDetails: () => void; onFit: () => void; onStart?: () => void; onClear: () => void;
  comparison: React.ReactNode;
}) {
  if (pick === null && !legs.length) return null;
  const picking = pick !== null;
  const pending = legs.some((leg) => !leg.result);
  const hasRoute = legs.some((leg) => leg.result?.status === "ok");
  const title = pick === "start" ? "Tap Mars to place the lander" : pick === "position" ? "Set crew position on Mars"
    : pick === "block" ? "Mark a blocked terrain cell" : typeof pick === "number" ? `Place stop ${pick + 1}` : "Choose a stop";
  return <div className={`map-route${!picking && summary.complete ? " map-route--ready" : ""}`}>
    {picking ? <div role="status" className="map-route__status"><strong>{title}</strong><span>Use the map, a site flag, or search.</span></div>
      : <button type="button" className="map-route__status map-route__summary" aria-label="Route details" onClick={onDetails}>
        <strong>{summary.complete ? `${distance(summary.distanceKm)} ${legs.at(-1)?.returning ? "round trip" : "one way"}`
          : pending ? "Calculating legs…" : "Itinerary incomplete"}</strong>
        {summary.regional && <span>Includes coarse MOLA terrain</span>}
        <span>Route details ›</span>
      </button>}
    {!picking && comparison}
    <div className="map-route__actions">
      {picking ? <button type="button" className="btn btn--small" onClick={onCancel}>Cancel</button> : <>
        {summary.complete && <button type="button" className="btn directions__start" onClick={onStart} disabled={!onStart}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 11 16-7-7 16-2-7z" /></svg>Start route
        </button>}
        <div className="map-route__secondary">
          {hasRoute && <button type="button" className="btn btn--small" onClick={onFit}>Fit route</button>}
          <button type="button" className="btn btn--small" onClick={onClear}>Clear route</button>
        </div>
      </>}
    </div>
  </div>;
}

export function RouteSettings({ legs, stops, mission, setMission, slope, setSlope, objective, utc }: {
  legs: readonly PlannedLeg[]; stops: Stop[]; mission: MissionOptions; setMission: (value: MissionOptions) => void;
  slope: number; setSlope: (value: number) => void; objective: RouteObjective; utc: number;
}) {
  const estimate = routeProfile(legs, mission, objective, slope);
  const number = (label: string, field: "speed" | "budget" | "reserve" | "roverSpeed" | "roverSlope", min: number, max: number, step = 1) =>
    <label>{label}<input type="number" min={min} max={max} step={step} value={Number.isFinite(mission[field]) ? mission[field] : ""}
      onChange={(event) => setMission({ ...mission, [field]: event.target.valueAsNumber })} /></label>;
  const arrival = (profile: "walk" | "rover") => {
    if (!estimate || estimate[profile] === null) return null;
    const speed = profile === "walk" ? mission.speed : mission.roverSpeed;
    let time = utc;
    return legs.map((leg) => {
      time += selectedLeg(leg.result, objective)!.distanceKm * 1_000_000 / speed;
      const mars = marsAt(time, leg.to);
      const value = { time, mars, point: leg.to, returning: leg.returning };
      if (leg.toStop !== null) time += stops[leg.toStop].scienceMinutes * 60_000;
      return value;
    });
  };
  const arrivals = validMission(mission) && stops.every(validStop)
    ? [["Walk", arrival("walk")], ["Rover", arrival("rover")]] as const : [];
  return <>
    <fieldset className="directions__options"><legend>Travel assumptions</legend>
      <label>Travel mode<select value={mission.rover ? "rover" : "walk"}
        onChange={(event) => setMission({ ...mission, rover: event.target.value === "rover" })}>
        <option value="walk">Walk</option><option value="rover">Rover</option>
      </select></label>
      {number("Walking speed (m/s)", "speed", 0.1, 2, 0.1)}
      <label>Walking slope limit (°)<input type="number" min={1} max={89} value={Number.isFinite(slope) ? slope : ""}
        onChange={(event) => setSlope(event.target.valueAsNumber)} /></label>
      {number("Rover speed (m/s)", "roverSpeed", 0.1, 20, 0.1)}
      {number("Rover slope limit (°)", "roverSlope", 1, 89)}
      {number("Available time (min)", "budget", 1, 10080)}
      {number("Return reserve (min)", "reserve", 0, mission.budget)}
    </fieldset>
    {arrivals.some(([, values]) => values) && <details open><summary>Arrivals if leaving now</summary>
      {arrivals.map(([profile, values]) => values && <section key={profile}><h3>{profile}</h3><ol>
        {values.map(({ time, mars, point, returning }, index) => <li key={index}>
          <strong>{returning ? "Lander" : labelPoint(point)}</strong> · <time dateTime={new Date(time).toISOString()}>{new Date(time).toLocaleString()}</time>
          <br />Sol {mars.sol} · {mars.time} LTST · {mars.daylight}
        </li>)}
      </ol></section>)}
    </details>}
    {estimate?.regional && <p className="small">Coarse MOLA supports a regional distance estimate.</p>}
    <p className="small muted">Travel times use the selected speeds and measured terrain. Arrival times include earlier science stops.</p>
  </>;
}

function EndpointField({ label, point, active, events, onPick, onSelect }: {
  label: string; point?: Endpoint | null; active: boolean; events: readonly CatalogEvent[];
  onPick: () => void; onSelect: (point: Endpoint) => void;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const results = editing && query.trim() ? searchEvents(events, query, 5) : [];
  return <div className="directions__endpoint" onBlur={(event) => {
    if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;
    setEditing(false); setQuery("");
  }}>
    <div className="directions__endpoint-input">
      <label><span>{label}</span>
        <input type="search" value={editing ? query : point ? labelPoint(point) : ""} placeholder="Search Mars sites"
          onFocus={(event) => { setEditing(true); setQuery(point?.name ?? ""); event.target.select(); }}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !results[0]?.location) return;
            event.preventDefault();
            onSelect({ ...results[0].location, name: results[0].title });
            setEditing(false);
            event.currentTarget.blur();
          }} />
      </label>
      <button type="button" className="btn btn--small" aria-label={`Choose ${label.toLowerCase()} on map`} aria-pressed={active} onClick={onPick}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 10-8 10s-8-5-8-10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
      </button>
    </div>
    {editing && query.trim() && <div className="directions__suggestions">
      {results.length ? results.map((event) => <button type="button" key={event.id} onClick={() => {
        if (!event.location) return;
        onSelect({ ...event.location, name: event.title }); setEditing(false); setQuery("");
      }}>{event.title}</button>) : <span>No matching sites</span>}
    </div>}
  </div>;
}

export function Directions({ start, stops, returning, setReturning, pick, setPick, clearStart, clearRoute, remove, move, swap, setScience,
  legs, slope, fit, objective, choice, chooseRoute, mission, accept, preview, setPreview, retry, extra,
  events, selectEndpoint, onDemo, onSave, walking, liveEligible }: {
  start: Endpoint | null; stops: Stop[]; returning: boolean; setReturning: (value: boolean) => void;
  pick: Pick | null; setPick: (pick: Pick | null) => void; clearStart: () => void; clearRoute: () => void; remove: (index: number) => void;
  move: (index: number, offset: number) => void; swap: () => void; setScience: (index: number, minutes: number) => void;
  legs: PlannedLeg[]; slope: number; fit: () => void;
  objective: RouteObjective; choice: RouteObjective | null; chooseRoute: (value: RouteObjective) => void; mission: MissionOptions;
  accept: (index: number, endpoint: "start" | "end", point: Endpoint) => void;
  preview: number | null; setPreview: (index: number | null) => void; retry: () => void; extra: React.ReactNode;
  events: readonly CatalogEvent[]; selectEndpoint: (target: "start" | "add" | number, point: Endpoint) => void;
  onDemo: () => void; onSave: () => void; walking: boolean;
  liveEligible: boolean;
}) {
  const totals = summarizeItinerary(legs, stops, mission, objective);
  const hasResult = legs.some(({ result }) => result?.status === "ok");
  const started = legs.length > 0;
  const [addingAt, setAddingAt] = useState<number | null>(null);
  const adding = addingAt === stops.length;
  const availableEvents = events.filter((event) => event.location);
  return <div className="panel-body directions">
    <h2>Directions</h2>
    <div className="directions__fields">
      <div className="directions__waypoint directions__waypoint--start">
        <span aria-hidden="true" className="directions__dot" />
        <EndpointField label="Start" point={start} active={pick === "start"} events={availableEvents}
          onPick={() => setPick("start")} onSelect={(point) => selectEndpoint("start", point)} />
      </div>
      <ol className="itinerary-stops" aria-label="Stops in visit order">
        {stops.map(({ point, scienceMinutes }, index) => <li key={index}>
          <div className="directions__waypoint">
            <span className="directions__dot directions__dot--stop" aria-hidden="true" />
            <EndpointField label={stops.length === 1 ? "Destination" : `Stop ${index + 1}`} point={point}
              active={pick === index} events={availableEvents} onPick={() => setPick(index)}
              onSelect={(value) => selectEndpoint(index, value)} />
          </div>
          <details className="itinerary-stop__actions">
            <summary aria-label={`Edit stop ${index + 1}`}>Edit <span>· {Number.isFinite(scienceMinutes) ? minutes(scienceMinutes) + " science" : "Set science time"}</span></summary>
            <label className="itinerary-science">Science at stop {index + 1} (min)
              <input type="number" min={0} max={240} value={Number.isFinite(scienceMinutes) ? scienceMinutes : ""}
                onChange={(event) => setScience(index, event.target.valueAsNumber)} />
            </label>
            <div className="mission-row">
              <button className="btn btn--small" type="button" disabled={!index} aria-label={`Move stop ${index + 1} up`} onClick={() => move(index, -1)}>↑</button>
              <button className="btn btn--small" type="button" disabled={index === stops.length - 1} aria-label={`Move stop ${index + 1} down`} onClick={() => move(index, 1)}>↓</button>
              <button className="btn btn--small" type="button" onClick={() => remove(index)}>Remove stop {index + 1}</button>
            </div>
          </details>
        </li>)}
      </ol>
      {(!stops.length || adding) && <div className="directions__waypoint">
        <span className="directions__dot directions__dot--stop" aria-hidden="true" />
        <EndpointField label={stops.length ? `Stop ${stops.length + 1}` : "Destination"} active={pick === "add"}
          events={availableEvents} onPick={() => setPick("add")}
          onSelect={(point) => { selectEndpoint("add", point); setAddingAt(null); }} />
      </div>}
      <div className="directions__field-actions">
        {!!stops.length && <button type="button" className="btn btn--small" disabled={stops.length >= MAX_STOPS || adding}
          onClick={() => setAddingAt(stops.length)}>+ Add stop</button>}
        {adding && <button type="button" className="btn btn--small" onClick={() => { setAddingAt(null); if (pick === "add") setPick(null); }}>Cancel add stop</button>}
        {start && stops.length === 1 && <button type="button" className="btn btn--small" onClick={swap}>Swap</button>}
        {(start || stops.length > 0) && <button type="button" className="btn btn--small" onClick={() => { setAddingAt(null); clearRoute(); }}>Clear route</button>}
      </div>
    </div>
    {started && <section className="directions__result" aria-label="Itinerary results" aria-live="polite">
      <div className="directions__route-summary">
        <div><h3>{totals.complete ? totals.travel !== null ? formatRouteDuration(totals.travel) : distance(totals.distanceKm)
          : legs.some(({ result }) => result && !selectedLeg(result, objective)) ? "Route unavailable" : "Finding route…"}</h3>
          {totals.complete && <span className="small">{totals.travel !== null ? `${distance(totals.distanceKm)} · ` : ""}{returning ? "Round trip" : "One way"}</span>}</div>
      </div>
      {totals.regional && <p className="small muted">Regional estimate. Earth GPS can show your movement. Turn, slope, and walking detour guidance require detailed terrain.</p>}
      <RouteChoices legs={legs} mission={mission} walkingSlope={slope} choice={choice} choose={chooseRoute} />
      {hasResult && <div className="mission-row">
        <button type="button" className="btn btn--small" onClick={fit}>Fit route</button>
        <button type="button" className="btn btn--small" onClick={onSave}>Save</button>
      </div>}
      {!totals.complete && hasResult && <p className="small muted">The map shows the legs with resolved terrain.</p>}
      <details open={totals.complete ? undefined : true} className="itinerary-leg-details"><summary>Route legs ({legs.length})</summary>
      <ol className="itinerary-legs">
        {legs.map(({ from, to, returning: home, result }, index) => {
          const leg = selectedLeg(result, objective);
          const suggestion = result && result.status !== "ok" ? result.suggestion : undefined;
          return <li key={index}>
            <strong>Leg {index + 1} · {home ? "Return to lander" : `${labelPoint(from)} → ${labelPoint(to)}`}</strong>
            {result?.terrain && <small>{terrainName(result.terrain)}</small>}
            {!result && <small>Calculating…</small>}
            {leg && <p className="small">{distance(leg.distanceKm)} · {Math.round(leg.climbM)} m ascent · {leg.maxSlopeDeg.toFixed(1)}° steepest step</p>}
            {result && result.status !== "ok" && <p className="small error">{result.detail}</p>}
            {result && result.status !== "ok" && result.retryable && <button className="btn btn--small" onClick={retry}>Retry terrain load</button>}
            {suggestion && <div className="mission-row">
              <small>Reachable point {distance(suggestion.movedKm)} from the selected point.</small>
              <button className="btn btn--small" onClick={() => setPreview(preview === index ? null : index)}>{preview === index ? "Hide preview" : "Preview point"}</button>
              <button className="btn btn--small" onClick={() => accept(index, suggestion.endpoint, suggestion.point)}>Use this point</button>
            </div>}
          </li>;
        })}
      </ol>
      {totals.science !== null && <p className="small">{minutes(totals.science)} science time
        {totals.remaining !== null && ` · ${minutes(Math.abs(totals.remaining))} ${totals.remaining < 0 ? "short" : "left"} after reserve`}</p>}
      </details>
    </section>}
    <details>
      <summary>Route options</summary>
      {!liveEligible && !walking && <button type="button" className="btn btn--small" onClick={onDemo}>Load GPS practice route</button>}
      <label className="itinerary-return"><input type="checkbox" checked={returning} onChange={(event) => setReturning(event.target.checked)} />Return to lander</label>
      {start && !started && <button className="btn btn--small" type="button" onClick={clearStart}>Clear start</button>}
    </details>
    {extra}
  </div>;
}
