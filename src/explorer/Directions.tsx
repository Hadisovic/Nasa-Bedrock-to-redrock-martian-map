import { formatLatLon } from "./geo.ts";
import { PRECISION_LABEL } from "./catalog.ts";
import { MAX_STOPS, validMission } from "./missionPlan.ts";
import type { Endpoint, MissionOptions, Stop } from "./missionPlan.ts";
import { selectedLeg, summarizeItinerary } from "./itinerary.ts";
import type { PlannedLeg } from "./itinerary.ts";
import { marsAt } from "./marsTime.ts";

export type Pick = "start" | "add" | "position" | "block" | number;
export const routeStartId = "directions-start";
export const stopId = (index: number) => `directions-stop-${index}`;

const distance = (km: number) => km < 1 ? `${Math.round(km * 1000)} m`
  : `${km.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
const minutes = (min: number) => min >= 60 ? `${(min / 60).toFixed(1)} hr` : `${min.toFixed(1)} min`;
const labelPoint = (point: Endpoint) => point.name ?? formatLatLon(point, 4);
const terrainName = ({ label, spacingM, regional }: { label: string; spacingM: number; regional: boolean }) =>
  `${label} · ${spacingM < 1000 ? `${Math.round(spacingM)} m` : `~${(spacingM / 1000).toFixed(1)} km`}${regional ? " · regional estimate" : ""}`;

export function MapRouteControls({ pick, legs, summary, onCancel, onDetails, onSave, onFit }: {
  pick: Pick | null; legs: readonly PlannedLeg[]; summary: ReturnType<typeof summarizeItinerary>;
  onCancel: () => void; onDetails: () => void; onSave: () => void; onFit: () => void;
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
        {summary.regional && <span>Includes coarse MOLA terrain</span>}
      </>}
    </div>
    <div className="map-route__actions">
      {picking ? <button type="button" className="btn btn--small" onClick={onCancel}>Cancel</button> : <>
        <button type="button" className="btn btn--small" onClick={onDetails}>Open details</button>
        {hasRoute && <><button type="button" className="btn btn--small" onClick={onSave}>Save options</button>
          <button type="button" className="btn btn--small" onClick={onFit}>Fit route</button></>}
      </>}
    </div>
  </div>;
}

export function Directions({ start, stops, returning, setReturning, pick, setPick, clearStart, clearRoute, remove, move, swap, setScience,
  legs, slope, setSlope, fit, weighted, setWeighted, mission, setMission, accept, preview, setPreview, retry, extra }: {
  start: Endpoint | null; stops: Stop[]; returning: boolean; setReturning: (value: boolean) => void;
  pick: Pick | null; setPick: (pick: Pick) => void; clearStart: () => void; clearRoute: () => void; remove: (index: number) => void;
  move: (index: number, offset: number) => void; swap: () => void; setScience: (index: number, minutes: number) => void;
  legs: PlannedLeg[]; slope: number; setSlope: (value: number) => void; fit: () => void;
  weighted: boolean; setWeighted: (value: boolean) => void; mission: MissionOptions; setMission: (value: MissionOptions) => void;
  accept: (index: number, endpoint: "start" | "end", point: Endpoint) => void;
  preview: number | null; setPreview: (index: number | null) => void; retry: () => void; extra: React.ReactNode;
}) {
  const { rover, departure, budget } = mission;
  const totals = summarizeItinerary(legs, stops, mission, weighted);
  const hasResult = legs.some(({ result }) => result?.status === "ok");
  const hasAlternative = legs.some(({ result }) => result?.status === "ok" && result.alternative);
  const started = legs.length > 0;
  const arrivals: { time: number; point: Endpoint; returning: boolean }[] = [];
  if (totals.travel != null && totals.science != null) {
    let time = Date.parse(departure + "Z");
    const speed = rover ? mission.roverSpeed : mission.speed;
    for (const leg of legs) {
      time += selectedLeg(leg.result, weighted)!.distanceKm * 1_000_000 / speed;
      arrivals.push({ time, point: leg.to, returning: leg.returning });
      if (leg.toStop !== null) time += stops[leg.toStop].scienceMinutes * 60_000;
    }
  }
  const number = (label: string, field: "speed" | "budget" | "reserve" | "roverSpeed" | "roverSlope", min: number, max: number, step = 1) =>
    <label>{label} <input type="number" min={min} max={max} step={step} value={Number.isFinite(mission[field]) ? mission[field] : ""}
      onChange={(e) => setMission({ ...mission, [field]: e.target.valueAsNumber })} /></label>;
  return <div className="panel-body directions">
    <div className="directions__fields">
      <div className="directions__row">
        <button type="button" className="btn directions__point" aria-pressed={pick === "start"} onClick={() => setPick("start")}>
          <strong>Rocket / lander</strong><span>{start ? labelPoint(start) : "Choose on the map"}</span>
        </button>
        {start && <button type="button" className="btn" aria-label="Clear lander" onClick={clearStart}>×</button>}
      </div>
      <ol className="itinerary-stops" aria-label="Stops in visit order">
        {stops.map(({ point, scienceMinutes }, index) => <li key={index}>
          <div className="itinerary-stop__heading">
            <span className="itinerary-number" aria-hidden="true">{index + 1}</span>
            <div><strong>{labelPoint(point)}</strong>
              {point.precision && <small>{PRECISION_LABEL[point.precision]}
                {point.uncertaintyM != null ? ` · ±${point.uncertaintyM} m` : ""}
                {point.footprintKm != null ? ` · ${point.footprintKm} km footprint` : ""}</small>}
            </div>
          </div>
          <details className="itinerary-stop__actions">
            <summary aria-label={`Edit stop ${index + 1}`}>Edit <span>· {Number.isFinite(scienceMinutes) ? minutes(scienceMinutes) + " science" : "Set science time"}</span></summary>
            <label className="itinerary-science">Science at stop {index + 1} (min)
              <input type="number" min={0} max={240} value={Number.isFinite(scienceMinutes) ? scienceMinutes : ""}
                onChange={(event) => setScience(index, event.target.valueAsNumber)} />
            </label>
            <div className="mission-row">
              <button className="btn btn--small" type="button" aria-pressed={pick === index} onClick={() => setPick(index)}>Replace stop {index + 1}</button>
              <button className="btn btn--small" type="button" disabled={!index} aria-label={`Move stop ${index + 1} up`} onClick={() => move(index, -1)}>↑</button>
              <button className="btn btn--small" type="button" disabled={index === stops.length - 1} aria-label={`Move stop ${index + 1} down`} onClick={() => move(index, 1)}>↓</button>
              {start && stops.length === 1 && <button className="btn btn--small" type="button" onClick={swap}>Swap with lander</button>}
              <button className="btn btn--small" type="button" onClick={() => remove(index)}>Remove stop {index + 1}</button>
            </div>
          </details>
        </li>)}
      </ol>
      <button type="button" className="btn itinerary-add" disabled={stops.length >= MAX_STOPS} aria-pressed={pick === "add"} onClick={() => setPick("add")}>+ Add stop</button>
      <label className="itinerary-return"><input type="checkbox" checked={returning} onChange={(event) => setReturning(event.target.checked)} />Return to lander</label>
    </div>
    {started && <section className="directions__result" aria-label="Itinerary results" aria-live="polite">
      <h3>{totals.complete ? returning ? "Round trip" : "One-way itinerary" : legs.some(({ result }) => result && result.status !== "ok") ? "Itinerary incomplete" : "Calculating legs…"}</h3>
      {hasResult && <div className="mission-row">
        <button type="button" className="btn btn--small" aria-pressed={!weighted} onClick={() => setWeighted(false)}>Shortest distance</button>
        <button type="button" className="btn btn--small" aria-pressed={weighted} onClick={() => setWeighted(true)}>Lower slope cost</button>
        <button type="button" className="btn btn--small" onClick={fit}>Fit route</button>
      </div>}
      {totals.complete && <>
        <p>{distance(totals.distanceKm)} total{!hasAlternative ? " · Both options follow the same cells" : ""}</p>
        {totals.regional && <p className="small muted">Regional estimate. Walking conditions are unresolved at this scale.</p>}
        {totals.travel != null && <dl>
          <div><dt>{rover ? "Driving time" : "Walking time"}</dt><dd>{minutes(totals.travel)}</dd></div>
          {totals.science != null && <div><dt>Total science time</dt><dd>{minutes(totals.science)}</dd></div>}
          {totals.remaining != null && <div><dt>Time after reserve</dt><dd className={totals.remaining < 0 ? "error" : ""}>{minutes(Math.abs(totals.remaining))} {totals.remaining < 0 ? "short" : "left"}</dd></div>}
        </dl>}
      </>}
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
      </ol></details>
      {arrivals.length > 0 && <details className="itinerary-leg-details"><summary>Arrival times</summary>
        <dl>{arrivals.map(({ time, point, returning: home }, index) => {
          const mars = marsAt(time, point);
          return <div key={index}><dt>{home ? "Return to lander" : `Stop ${index + 1}`}</dt>
            <dd>{new Date(time).toISOString().slice(0, 16).replace("T", " ")} UTC<br />Sol {mars.sol} · {mars.time} LTST</dd></div>;
        })}</dl>
      </details>}
    </section>}
    <details>
      <summary>Route settings</summary>
      <div className="directions__profiles" role="group" aria-label="Travel profile">
        <button type="button" className="btn" aria-pressed={!rover} onClick={() => setMission({ ...mission, rover: false })}>Walk</button>
        <button type="button" className="btn" aria-pressed={rover} onClick={() => setMission({ ...mission, rover: true })}>Rover</button>
      </div>
      <div className="directions__options">
        <label>Departure (UTC) <input type="datetime-local" value={departure} onChange={(e) => setMission({ ...mission, departure: e.target.value })} /></label>
        {rover ? number("Rover speed (m/s)", "roverSpeed", 0.1, 20, 0.1) : number("Walking speed (m/s)", "speed", 0.1, 2, 0.1)}
        {rover ? number("Rover slope limit (°)", "roverSlope", 1, 89) :
          <label>Walking slope limit (°) <input type="number" min={1} max={89} value={Number.isFinite(slope) ? slope : ""} onChange={(e) => setSlope(e.target.valueAsNumber)} /></label>}
        {number("Available time (min)", "budget", 1, 10080)}
        {number("Return reserve (min)", "reserve", 0, budget)}
      </div>
      {(!validMission(mission) || totals.science === null) && <p className="error small">Check the departure, speed, science times, budget and reserve.</p>}
      <p className="small muted">Times assume a constant speed. Mars has about 38% of Earth’s surface gravity. Verify obstacles below grid resolution, traction and power separately.</p>
      <details><summary>Equipment and supplies</summary><p>Check oxygen, CO₂ removal, cooling, water, food, power, communications, science tools and terrain equipment.</p></details>
      {started && <button className="btn btn--small" type="button" onClick={clearRoute}>Clear route</button>}
    </details>
    {extra}
  </div>;
}
