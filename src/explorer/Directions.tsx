import { useState } from "react";
import { formatLatLon } from "./geo.ts";
import { searchEvents } from "./catalog.ts";
import type { CatalogEvent } from "./catalog.ts";
import { MAX_STOPS, validMission } from "./missionPlan.ts";
import type { Endpoint, MissionOptions, RouteChoice, Stop } from "./missionPlan.ts";
import { availableChoices, legsForChoice, selectedLeg, summarizeItinerary } from "./itinerary.ts";
import type { PlannedLeg } from "./itinerary.ts";
import { marsAt } from "./marsTime.ts";
import { estimateLegMinutes } from "./routeAssessment.ts";
import type { LegTerrain } from "./globalRouting.ts";

export type Pick = "start" | "add" | "position" | "block" | number;
export const routeStartId = "directions-start";
export const stopId = (index: number) => `directions-stop-${index}`;

const distance = (km: number) => km < 1 ? `${Math.round(km * 1000)} m`
  : `${km.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
const minutes = (min: number) => min >= 60 ? `${(min / 60).toFixed(1)} hr` : `${Math.ceil(min)} min`;
const labelPoint = (point: Endpoint) => point.name ?? formatLatLon(point, 4);
const terrainName = ({ label, spacingM, regional }: LegTerrain) =>
  `${label} · ${spacingM < 1000 ? `${Number(spacingM.toPrecision(2))} m` : `~${(spacingM / 1000).toFixed(1)} km`}${regional ? " · regional estimate" : ""}`;

export function MapRouteControls({ pick, legs, summary, onCancel, onDetails, onFit, onStart }: {
  pick: Pick | null; legs: readonly PlannedLeg[]; summary: ReturnType<typeof summarizeItinerary>;
  onCancel: () => void; onDetails: () => void; onFit: () => void; onStart?: () => void;
}) {
  if (pick === null && !legs.length) return null;
  const picking = pick !== null;
  const pending = legs.some((leg) => !leg.result);
  const hasRoute = legs.some((leg) => leg.result?.status === "ok");
  const title = pick === "start" ? "Tap Mars to place the lander" : pick === "position" ? "Set crew position on Mars"
    : pick === "block" ? "Mark a blocked terrain cell" : typeof pick === "number" ? `Place stop ${pick + 1}` : "Choose a stop";
  return <div className="map-route">
    <div role="status" className="map-route__status">
      {picking ? <><strong>{title}</strong><span>Use the map, a site flag, or search.</span></> : <>
        <strong>{summary.complete ? `${distance(summary.distanceKm)} ${legs.at(-1)?.returning ? "round trip" : "one way"}`
          : pending ? "Calculating legs…" : "Itinerary incomplete"}</strong>
        {summary.regional && <span>Includes regional terrain</span>}
      </>}
    </div>
    <div className="map-route__actions">
      {picking ? <button type="button" className="btn btn--small" onClick={onCancel}>Cancel</button> : <>
        {onStart && <button type="button" className="btn btn--small directions__start" onClick={onStart}>Start route</button>}
        <button type="button" className="btn btn--small" onClick={onDetails}>Directions</button>
        {hasRoute && <button type="button" className="btn btn--small" onClick={onFit}>Fit route</button>}
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
  legs, slope, setSlope, fit, choice, setChoice, mission, setMission, accept, preview, setPreview, retry, extra,
  events, selectEndpoint, onDemo, onStart, onSave, walking, liveEligible }: {
  start: Endpoint | null; stops: Stop[]; returning: boolean; setReturning: (value: boolean) => void;
  pick: Pick | null; setPick: (pick: Pick | null) => void; clearStart: () => void; clearRoute: () => void; remove: (index: number) => void;
  move: (index: number, offset: number) => void; swap: () => void; setScience: (index: number, minutes: number) => void;
  legs: PlannedLeg[]; slope: number; setSlope: (value: number) => void; fit: () => void;
  choice: RouteChoice; setChoice: (value: RouteChoice) => void; mission: MissionOptions; setMission: (value: MissionOptions) => void;
  accept: (index: number, endpoint: "start" | "end", point: Endpoint) => void;
  preview: number | null; setPreview: (index: number | null) => void; retry: () => void; extra: React.ReactNode;
  events: readonly CatalogEvent[]; selectEndpoint: (target: "start" | "add" | number, point: Endpoint) => void;
  onDemo: () => void; onStart?: () => void; onSave: () => void; walking: boolean;
  liveEligible: boolean;
}) {
  const { rover, departure, budget } = mission;
  const totals = summarizeItinerary(legs, stops, mission, choice);
  const selected = legsForChoice(legs, choice);
  const hasResult = selected.length > 0;
  const choices = availableChoices(legs);
  const shortest = legsForChoice(legs, "shortest");
  const approach = legs.some(({ result }) => result?.status === "ok" && result.balanced);
  const climb = selected.reduce((sum, leg) => sum + leg.climbM, 0);
  const descent = selected.reduce((sum, leg) => sum + (leg.assessment?.descentM ?? 0), 0);
  const steep = selected.reduce((sum, leg) => sum + (leg.assessment?.steepDistanceKm ?? 0), 0);
  const limit = rover ? mission.roverSlope : slope;
  const started = legs.length > 0;
  const [addingAt, setAddingAt] = useState<number | null>(null);
  const adding = addingAt === stops.length;
  const availableEvents = events.filter((event) => event.location);
  const arrivals: { time: number; point: Endpoint; returning: boolean }[] = [];
  if (totals.travel != null && totals.science != null) {
    let time = Date.parse(departure + "Z");
    const speed = rover ? mission.roverSpeed : mission.speed;
    for (const leg of legs) {
      time += estimateLegMinutes(selectedLeg(leg.result, choice)!, speed) * 60_000;
      arrivals.push({ time, point: leg.to, returning: leg.returning });
      if (leg.toStop !== null) time += stops[leg.toStop].scienceMinutes * 60_000;
    }
  }
  const number = (label: string, field: "speed" | "budget" | "reserve" | "roverSpeed" | "roverSlope", min: number, max: number, step = 1) =>
    <label>{label} <input type="number" min={min} max={max} step={step} value={Number.isFinite(mission[field]) ? mission[field] : ""}
      onChange={(e) => setMission({ ...mission, [field]: e.target.valueAsNumber })} /></label>;
  return <div className="panel-body directions">
    <div className="directions__heading"><h2>Directions</h2>
      <div className="directions__travel" role="group" aria-label="Travel profile">
        <button type="button" className="btn btn--small" aria-pressed={!rover} onClick={() => setMission({ ...mission, rover: false })}>Walk</button>
        <button type="button" className="btn btn--small" aria-pressed={rover} onClick={() => setMission({ ...mission, rover: true })}>Rover</button>
      </div>
    </div>
    <div className="directions__launch">
      <button type="button" className="btn directions__start" disabled={!onStart}
        aria-describedby={!onStart ? "directions-start-hint" : undefined} onClick={onStart}>Start route</button>
      {!liveEligible && !walking && <button type="button" className="btn btn--small" onClick={onDemo}>Try Wildcat Ridge</button>}
    </div>
    {!onStart && <p id="directions-start-hint" className="small directions__start-hint">
      {walking ? "A route is already running." : !start || !stops.length ? "Choose a start and destination to enable Start route."
        : legs.some(({ result }) => !result) ? "Finding your route…"
        : !totals.complete ? "Adjust your stops or check the route details below."
        : rover ? "Switch to Walk to start navigation."
        : pick !== null ? "Finish selecting a point on the map to start."
        : "Choose a destination farther from the start."}
    </p>}
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
      </div>
    </div>
    {started && <section className="directions__result" aria-label="Itinerary results" aria-live="polite">
      <div className="directions__route-summary">
        <div><h3>{totals.complete ? totals.travel !== null ? minutes(totals.travel) : distance(totals.distanceKm)
          : legs.some(({ result }) => result && result.status !== "ok") ? "Route unavailable" : "Finding route…"}</h3>
          {totals.complete && <span className="small">{totals.travel !== null ? `${distance(totals.distanceKm)} · ` : ""}{returning ? "Round trip" : "One way"}</span>}</div>
      </div>
      {totals.regional && <p className="small muted">Regional route · Live Earth Walk is available at Wildcat Ridge.</p>}
      {hasResult && <div className="mission-row">
        {choices.map(({ id, label, color }) => <button key={id} type="button" className="btn btn--small"
          aria-pressed={choice === id} onClick={() => setChoice(id)} style={{ borderColor: color }}>
          {id === "balanced" && !approach ? "Shortest feasible · recommended" : label}
        </button>)}
        <button type="button" className="btn btn--small" onClick={fit}>Fit route</button>
        <button type="button" className="btn btn--small" onClick={onSave}>Save</button>
      </div>}
      {totals.complete && <>
        <h4>Route Assessment</h4>
        <p>{approach
          ? "The recommended itinerary has lower combined distance and modeled terrain effort."
          : "The shortest feasible itinerary is recommended because the other paths did not improve the combined planning estimate enough."}</p>
        {choices.length > 1 && <ul className="itinerary-legs" aria-label="Compare available routes">
          {choices.map(({ id, label }) => {
            const candidate = summarizeItinerary(legs, stops, mission, id);
            const penaltyKm = legsForChoice(legs, id).reduce((sum, leg) => sum + (leg.assessment?.terrainCostKm ?? 0), 0);
            return <li key={id}><strong>{id === "balanced" && !approach ? "Shortest feasible · recommended" : label}</strong>
              <small>{distance(candidate.distanceKm)}{candidate.travel != null && ` · ${minutes(candidate.travel)}`}
                {` · ${distance(penaltyKm)} terrain allowance`}</small></li>;
          })}
        </ul>}
        <dl>
          <div><dt>Distance</dt><dd>{distance(totals.distanceKm)}</dd></div>
          <div><dt>Ascent / descent</dt><dd>{Math.round(climb)} m / {Math.round(descent)} m</dd></div>
          <div><dt>Steepest measured step</dt><dd>{Math.max(...selected.map((leg) => leg.maxSlopeDeg)).toFixed(1)}° of {limit}° limit</dd></div>
          <div><dt>Distance at or above {(limit * 0.55).toFixed(1)}°</dt><dd>{distance(steep)}</dd></div>
          <div><dt>Longest such stretch within a leg</dt>
            <dd>{distance(Math.max(...selected.map((leg) => leg.assessment?.longestSteepRunKm ?? 0)))}</dd></div>
          {choice !== "shortest" && approach && <div><dt>Extra distance over shortest</dt>
            <dd>{distance(Math.max(0, totals.distanceKm - shortest.reduce((sum, leg) => sum + leg.distanceKm, 0)))}</dd></div>}
        </dl>
        {totals.regional && <p className="small muted">Regional terrain cannot resolve walking or driving conditions. Travel time and resource margin require finer coverage.</p>}
        <p className="small muted">Radiation dose, temperature and active dust exposure are unevaluated. Historical infrared, thermal inertia and surface dust layers provide context.</p>
        <details className="itinerary-leg-details">
          <summary>Planning assumptions</summary>
          <p className="small">The slope limit is a mission assumption. Missing elevation and reported cells are excluded. Gravel, boulders and other obstacles below the elevation grid spacing are unresolved.</p>
          <p className="small">The terrain allowance adds distance weighted by squared slope relative to the limit, half weight downhill, and local roughness where measured at 5 m spacing or finer. Scenario travel time uses that equivalent distance at the selected base speed. The lower terrain option weights the allowance four times as heavily. A detour can add up to 25% of the shortest distance. The balanced route must improve equivalent distance by more than 1%. The lower terrain option must reduce the terrain allowance by more than 1% and by more than 0.5% of the shortest distance.</p>
          <p className="small">Terrain effort is an application planning index. Roughness is local elevation relief with the linear slope removed, expressed as a fraction of half the grid spacing and capped at 1. It contributes at most one quarter of the local terrain allowance factor. <a href="https://science.nasa.gov/resource/radiation-measurements-on-mars/" target="_blank" rel="noreferrer">NASA Curiosity RAD measurements</a> describe the rover’s observation sites and times.</p>
        </details>
        {totals.travel != null && <dl>
          <div><dt>{rover ? "Estimated driving time" : "Estimated walking time"}</dt><dd>{minutes(totals.travel)}</dd></div>
          {totals.science != null && <div><dt>Total science time</dt><dd>{minutes(totals.science)}</dd></div>}
          {totals.remaining != null && <div><dt>Time after reserve</dt><dd className={totals.remaining < 0 ? "error" : ""}>{minutes(Math.abs(totals.remaining))} {totals.remaining < 0 ? "short" : "left"}</dd></div>}
        </dl>}
      </>}
      {!totals.complete && hasResult && <p className="small muted">The map shows the legs with resolved terrain.</p>}
      <details open={totals.complete ? undefined : true} className="itinerary-leg-details"><summary>Route legs ({legs.length})</summary>
      <ol className="itinerary-legs">
        {legs.map(({ from, to, returning: home, result }, index) => {
          const leg = selectedLeg(result, choice);
          const suggestion = result && result.status !== "ok" ? result.suggestion : undefined;
          return <li key={index}>
            <strong>Leg {index + 1} · {home ? "Return to lander" : `${labelPoint(from)} → ${labelPoint(to)}`}</strong>
            {result?.terrain && <small>{result.terrain.source
              ? <a href={result.terrain.source} target="_blank" rel="noreferrer">{terrainName(result.terrain)}</a>
              : terrainName(result.terrain)}</small>}
            {result?.terrain?.bounds && <small>Crop from {formatLatLon({ lat: result.terrain.bounds.south, lon: result.terrain.bounds.west }, 3)}
              {" to "}{formatLatLon({ lat: result.terrain.bounds.north, lon: result.terrain.bounds.east }, 3)}</small>}
            {leg?.assessment?.roughnessCoverage != null && <small>Local roughness resolved along {Math.round(leg.assessment.roughnessCoverage * 100)}% of this leg.</small>}
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
      {arrivals.length > 0 && <details className="itinerary-leg-details"><summary>Arrival times</summary>
        <dl>{arrivals.map(({ time, point, returning: home }, index) => {
          const mars = marsAt(time, point);
          return <div key={index}><dt>{home ? "Return to lander" : `Stop ${index + 1}`}</dt>
            <dd>{new Date(time).toISOString().slice(0, 16).replace("T", " ")} UTC<br />Sol {mars.sol} · {mars.time} LTST</dd></div>;
        })}</dl>
      </details>}
    </section>}
    <details>
      <summary>Route options</summary>
      <label className="itinerary-return"><input type="checkbox" checked={returning} onChange={(event) => setReturning(event.target.checked)} />Return to lander</label>
      <div className="directions__options">
        <label>Departure (UTC) <input type="datetime-local" value={departure} onChange={(e) => setMission({ ...mission, departure: e.target.value })} /></label>
        {rover ? number("Rover speed (m/s)", "roverSpeed", 0.1, 20, 0.1) : number("Walking speed (m/s)", "speed", 0.1, 2, 0.1)}
        {rover ? number("Rover slope limit (°)", "roverSlope", 1, 89) :
          <label>Walking slope limit (°) <input type="number" min={1} max={89} value={Number.isFinite(slope) ? slope : ""} onChange={(e) => setSlope(e.target.valueAsNumber)} /></label>}
        {number("Available time (min)", "budget", 1, 10080)}
        {number("Return reserve (min)", "reserve", 0, budget)}
      </div>
      {(!validMission(mission) || totals.science === null) && <p className="error small">Check the departure, speed, science times, budget and reserve.</p>}
      <p className="small muted">Route assessment uses your base speed and a terrain allowance. Verify obstacles below grid resolution, traction and power separately.</p>
      <details><summary>Equipment and supplies</summary><p>Check oxygen, CO₂ removal, cooling, water, food, power, communications, science tools and terrain equipment.</p></details>
      {started && <button className="btn btn--small" type="button" onClick={clearRoute}>Clear route</button>}
      {start && !started && <button className="btn btn--small" type="button" onClick={clearStart}>Clear start</button>}
    </details>
    {extra}
  </div>;
}
