import { useState } from "react";
import { formatLatLon } from "./geo.ts";
import { searchEvents } from "./catalog.ts";
import type { CatalogEvent } from "./catalog.ts";
import { MAX_STOPS, validMission, validStop } from "./missionPlan.ts";
import type { Endpoint, MissionOptions, RouteChoice, Stop } from "./missionPlan.ts";
import { availableChoices, selectedLeg, summarizeItinerary } from "./itinerary.ts";
import type { NavigationProgress, PlannedLeg } from "./itinerary.ts";
import { marsAt } from "./marsTime.ts";
import { RoverIcon } from "./icons.tsx";

export type Pick = "start" | "add" | "position" | "block" | number;
export const routeStartId = "directions-start";
export const stopId = (index: number) => `directions-stop-${index}`;

const distance = (km: number) => km < 1 ? `${Math.round(km * 1000)} m`
  : `${km.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
const minutes = (min: number) => min >= 60 ? `${(min / 60).toFixed(1)} hr` : min < 1 ? `${Math.ceil(min * 60)} sec` : `${Math.ceil(min)} min`;
const labelPoint = (point: Endpoint) => point.name ?? formatLatLon(point, 4);
const terrainName = ({ label, spacingM, regional }: { label: string; spacingM: number; regional: boolean }) =>
  `${label} · ${spacingM < 1000 ? `${Math.round(spacingM)} m` : `~${(spacingM / 1000).toFixed(1)} km`}${regional ? " · regional estimate" : ""}`;

export function TravelModes({ rover, choose }: { rover: boolean; choose: (rover: boolean) => void }) {
  return <div className="travel-modes" role="group" aria-label="Travel mode">
    <button type="button" className="btn travel-mode" aria-pressed={!rover} onClick={() => choose(false)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="13" cy="4.5" r="1.8" /><path d="m7 22 4-6 2-7m-2 7 5 2 1 4m-9-9 5-4 3 5h4" /></svg>Walk
    </button>
    <button type="button" className="btn travel-mode" aria-pressed={rover} onClick={() => choose(true)}><RoverIcon />Rover</button>
  </div>;
}

export function RouteChoices({ legs, mission, choice, choose, progress }: {
  legs: readonly PlannedLeg[]; mission: MissionOptions; choice: RouteChoice;
  choose: (value: RouteChoice) => void; progress?: NavigationProgress | null;
}) {
  const choices = availableChoices(legs);
  return <div className="route-choices" role="group" aria-label="Choose a route">
    {choices.map(({ id, label, color }) => {
      const estimate = summarizeItinerary(legs, [], mission, id, progress);
      return <button type="button" className="btn route-choice" key={id} aria-pressed={choice === id}
        title={label} onClick={() => choose(id)} style={{ "--route-color": color } as React.CSSProperties}>
        <span className="route-choice__dot" style={{ background: color }} />
        <strong>{id === "shortest" ? "Shortest" : id === "balanced" ? "Balanced" : "Lower terrain"}</strong>
        <span>{estimate.travel === null ? distance(estimate.distanceKm) : minutes(estimate.travel)}</span>
        <small>{distance(estimate.distanceKm)}{id === "balanced" || (id === "shortest" && !choices.some(x => x.id === "balanced")) ? " · recommended" : ""}</small>
      </button>;
    })}
  </div>;
}

export function MapRouteControls({ pick, legs, summary, onCancel, onDetails, onFit, onStart, onClear, comparison, remainingRoute = false }: {
  pick: Pick | null; legs: readonly PlannedLeg[]; summary: ReturnType<typeof summarizeItinerary>;
  onCancel: () => void; onDetails: () => void; onFit: () => void; onStart?: () => void; onClear: () => void;
  comparison: React.ReactNode; remainingRoute?: boolean;
}) {
  if (pick === null && !legs.length) return null;
  const pending = legs.some((leg) => !leg.result);
  const title = pick === "start" ? "Place the lander" : pick === "position" ? "Set crew position"
    : pick === "block" ? "Mark blocked terrain" : typeof pick === "number" ? `Place stop ${pick + 1}` : "Choose a destination";
  return <div className="map-route">
    {pick !== null ? <div role="status" className="map-route__status"><strong>{title}</strong><span>Tap the map or search a site.</span></div>
      : <>
      <div role="status" className="map-route__status"><strong>{summary.complete ? `${summary.travel === null ? distance(summary.distanceKm) : minutes(summary.travel)} · ${remainingRoute ? "remaining" : legs.at(-1)?.returning ? "round trip" : "one way"}`
        : pending ? "Calculating terrain…" : "Route unavailable"}</strong>{summary.regional && <span>Regional terrain estimate</span>}</div>
      {comparison}
      </>}
    <div className="map-route__actions">
      {pick !== null ? <button type="button" className="btn btn--small" onClick={onCancel}>Cancel</button> : <>
        <button type="button" className="btn btn--small directions__start" onClick={onStart} disabled={!onStart}>Start route</button>
        <button type="button" className="btn btn--small" onClick={onDetails}>Route info</button>
        <button type="button" className="btn btn--small" onClick={onFit}>Fit</button>
        <button type="button" className="btn btn--small" onClick={onClear}>Clear</button>
      </>}
    </div>
  </div>;
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
            onSelect({ ...results[0].location, name: results[0].title, catalogEventId: results[0].id });
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
        onSelect({ ...event.location, name: event.title, catalogEventId: event.id }); setEditing(false); setQuery("");
      }}>{event.title}</button>) : <span>No matching sites</span>}
    </div>}
  </div>;
}

export function Directions({ start, stops, returning, setReturning, pick, setPick, clearStart, clearRoute, remove, move, swap, setScience,
  legs, slope, fit, weighted, choice, setWeighted, mission, onMode, onStart, onInfo, progress, science, accept, preview, setPreview, retry, extra,
  events, selectEndpoint, onDemo, onSave, walking, liveEligible }: {
  start: Endpoint | null; stops: Stop[]; returning: boolean; setReturning: (value: boolean) => void;
  pick: Pick | null; setPick: (pick: Pick | null) => void; clearStart: () => void; clearRoute: () => void; remove: (index: number) => void;
  move: (index: number, offset: number) => void; swap: () => void; setScience: (index: number, minutes: number) => void;
  legs: PlannedLeg[]; slope: number; fit: () => void;
  weighted: RouteChoice; choice: RouteChoice; setWeighted: (value: RouteChoice) => void; mission: MissionOptions;
  accept: (index: number, endpoint: "start" | "end", point: Endpoint) => void;
  preview: number | null; setPreview: (index: number | null) => void; retry: () => void; extra: React.ReactNode;
  events: readonly CatalogEvent[]; selectEndpoint: (target: "start" | "add" | number, point: Endpoint) => void;
  onMode: (rover: boolean) => void; onStart?: () => void; onInfo: () => void; progress?: NavigationProgress | null; science?: React.ReactNode;
  onDemo: () => void; onSave: () => void; walking: boolean;
  liveEligible: boolean;
}) {
  const totals = summarizeItinerary(legs, stops, mission, weighted, progress);
  const hasResult = legs.some(({ result }) => result?.status === "ok");
  const started = legs.length > 0;
  const [addingAt, setAddingAt] = useState<number | null>(null);
  const adding = addingAt === stops.length;
  const availableEvents = events.filter((event) => event.location);
  return <div className="panel-body directions">
    <header className="directions__heading"><h2>Directions</h2><button type="button" className="btn btn--small" onClick={onInfo}>Route info</button></header>
    <TravelModes rover={mission.rover} choose={onMode} />
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
            <summary aria-label={`Edit stop ${index + 1}`}>Edit stop</summary>
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
        <div><h3>{totals.complete ? totals.travel !== null ? minutes(totals.travel) : distance(totals.distanceKm)
          : legs.some(({ result }) => result && result.status !== "ok") ? "Route unavailable" : "Finding route…"}</h3>
          {totals.complete && <span className="small">{totals.travel !== null ? `${distance(totals.distanceKm)} · ` : ""}{progress ? "Remaining route" : returning ? "Round trip" : "One way"}</span>}</div>
      </div>
      {totals.regional && <p className="small muted">Regional estimate. Earth GPS can show your movement. Turn, slope, and walking detour guidance require detailed terrain.</p>}
      {totals.complete && <RouteChoices legs={legs} mission={mission} choice={choice} choose={setWeighted} progress={progress} />}
      {science}
      {hasResult && <div className="mission-row">
        <button type="button" className="btn btn--small directions__start" disabled={!onStart} onClick={onStart}>Start route</button>
        <button type="button" className="btn btn--small" onClick={fit}>Fit route</button>
        <button type="button" className="btn btn--small" onClick={onSave}>Save</button>
      </div>}
      {!totals.complete && hasResult && <p className="small muted">The map shows the legs with resolved terrain.</p>}
      <details open={totals.complete ? undefined : true} className="itinerary-leg-details"><summary>Route legs ({legs.length})</summary>
      <ol className="itinerary-legs">
        {legs.map(({ from, to, returning: home, result }, index) => {
          const leg = selectedLeg(result, weighted);
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
      {!mission.automatic && totals.science !== null && <p className="small">{minutes(totals.science)} science time
        {totals.remaining !== null && ` · ${minutes(Math.abs(totals.remaining))} ${totals.remaining < 0 ? "short" : "left"} after reserve`}</p>}
      </details>
    </section>}
    <div className="directions__footer">
      {!liveEligible && !walking && <button type="button" className="btn btn--small" onClick={onDemo}>Load GPS practice route</button>}
      <label className="itinerary-return"><input type="checkbox" checked={returning} onChange={(event) => setReturning(event.target.checked)} />Return to lander</label>
      {start && !started && <button className="btn btn--small" type="button" onClick={clearStart}>Clear start</button>}
    </div>
    {extra}
  </div>;
}
