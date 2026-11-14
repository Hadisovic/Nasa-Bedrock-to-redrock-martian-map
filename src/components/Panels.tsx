import { useEffect, useId, useRef, useState } from "react";
import { unprojectMars } from "../contracts/index.ts";
import type { MissionAssessment, MissionAssumptions, ProjectedPoint, Provenance, RouteResult, TerrainGrid } from "../contracts/index.ts";
import { climbAlong } from "../analysis/routing.ts";
import { formatDuration } from "../analysis/mission.ts";
import { SLOPE_CLASSES } from "../render/compose.ts";
import type { ImageryTreatment, LayerVisibility } from "../render/compose.ts";
import { stories } from "../data/sites.ts";
import type { Habitat } from "../data/sites.ts";
import { PIN_KIND_LABEL } from "./Pin.tsx";
import { DEMOS } from "./demos.ts";
import type { MissionInputs } from "./demos.ts";

export { DEFAULT_INPUTS, DEMOS } from "./demos.ts";
export type { MissionInputs } from "./demos.ts";
import type { MapPin } from "./Pin.tsx";

/** Field limits shared by the form and its inline validation. */
export const FIELD_LIMITS = {
  "max-slope": { min: 1, max: 45, label: "Max slope", unit: "°" },
  penalty: { min: 0, max: 20, label: "Slope penalty", unit: "×" },
  speed: { min: 0.1, max: 2, label: "Walking speed", unit: "m/s" },
  stop: { min: 0, max: 240, label: "Science stop", unit: "min" },
  budget: { min: 1, max: 480, label: "Time budget", unit: "min" },
  reserve: { min: 0, max: 240, label: "Reserve", unit: "min" },
} as const;

/** Inline errors by field id; an empty object means every field is valid. */
export function inputErrors(inputs: MissionInputs): Record<string, string> {
  const values: Record<keyof typeof FIELD_LIMITS, number> = {
    "max-slope": inputs.maxAbsSlopeDeg, penalty: inputs.slopePenaltyWeight,
    speed: inputs.assumptions.walkingSpeedMps, stop: inputs.assumptions.scienceStopS / 60,
    budget: inputs.assumptions.timeBudgetS / 60, reserve: inputs.assumptions.reserveS / 60,
  };
  const errors: Record<string, string> = {};
  for (const [id, limit] of Object.entries(FIELD_LIMITS) as [keyof typeof FIELD_LIMITS, (typeof FIELD_LIMITS)[keyof typeof FIELD_LIMITS]][]) {
    const v = values[id];
    if (!Number.isFinite(v)) errors[id] = `Enter a number for ${limit.label.toLowerCase()}.`;
    else if (v < limit.min || v > limit.max) errors[id] = `${limit.label} must be between ${limit.min} and ${limit.max} ${limit.unit}.`;
  }
  return errors;
}

export function SourceLinks({ provenance }: { provenance: Provenance }) {
  return (
    <details className="source">
      <summary>Source: {provenance.mission} · {provenance.instrument}</summary>
      {provenance.observationPeriod && <p>{provenance.observationPeriod}</p>}
      <ul>{provenance.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
      {provenance.limitations.length > 0 && <ul className="limits">{provenance.limitations.map((l) => <li key={l}>{l}</li>)}</ul>}
    </details>
  );
}

function Toggle({ checked, onChange, label, hint, tag }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string; tag: "Observed" | "Calculated" }) {
  const id = useId();
  return (
    <div className="toggle">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>
        <span className="toggle__label">{label} <span className={`tag tag--${tag.toLowerCase()}`}>{tag}</span></span>
        <span className="toggle__hint">{hint}</span>
      </label>
    </div>
  );
}

export interface LayerStatus {
  imagery: { ok: true; provenance: Provenance } | { ok: false; detail: string };
  elevation: { ok: true; provenance: Provenance; minM: number; maxM: number } | { ok: false; detail: string };
}

export function LayersPanel({ visibility, setVisibility, treatment, setTreatment, status, exaggeration, setExaggeration, mode }: {
  visibility: LayerVisibility;
  setVisibility: (v: LayerVisibility) => void;
  treatment: ImageryTreatment;
  setTreatment: (t: ImageryTreatment) => void;
  status: LayerStatus;
  exaggeration: number;
  setExaggeration: (n: number) => void;
  mode: "2d" | "3d";
}) {
  const set = (key: keyof LayerVisibility) => (value: boolean) => setVisibility({ ...visibility, [key]: value });
  return (
    <div className="panel-body">
      <h2>Layers</h2>
      <p className="muted">One 384 m × 384 m area of the western Jezero delta, shown identically in 2D and 3D.</p>

      {status.imagery.ok ? (
        <>
          <Toggle checked={visibility.imagery} onChange={set("imagery")} label="HiRISE optical image" tag="Observed"
            hint="Mars Reconnaissance Orbiter, 0.25 m pixels, 8-bit grayscale." />
          {visibility.imagery && (
            <fieldset className="segmented">
              <legend className="sr-only">Image display</legend>
              <label><input type="radio" name="treatment" checked={treatment === "grayscale"} onChange={() => setTreatment("grayscale")} /> Original grayscale</label>
              <label><input type="radio" name="treatment" checked={treatment === "mars"} onChange={() => setTreatment("mars")} /> Mars-tint (display only)</label>
            </fieldset>
          )}
          <SourceLinks provenance={status.imagery.provenance} />
        </>
      ) : <p className="error" role="alert">Optical image unavailable: {status.imagery.detail}</p>}

      {status.elevation.ok ? (
        <>
          <Toggle checked={visibility.elevation} onChange={set("elevation")} label="Elevation" tag="Observed"
            hint={`HiRISE stereo heights, 1 m cells, ${status.elevation.minM.toFixed(1)} to ${status.elevation.maxM.toFixed(1)} m relative to the source geoid.`} />
          {visibility.elevation && <div className="ramp" aria-hidden="true"><span>Low</span><i /><span>High</span></div>}
          <Toggle checked={visibility.relief} onChange={set("relief")} label="Terrain relief shading" tag="Calculated"
            hint="Hillshade computed from the elevation grid, lit from the north-west." />
          <Toggle checked={visibility.slope} onChange={set("slope")} label="Slope" tag="Calculated"
            hint="Surface slope from each 3 × 3 m neighbourhood of valid heights." />
          {visibility.slope && (
            <ul className="legend">
              {SLOPE_CLASSES.slice(1).map((c) => <li key={c.label}><i style={{ background: `rgba(${c.rgba.join(",")})` }} />{c.label}</li>)}
            </ul>
          )}
          <SourceLinks provenance={status.elevation.provenance} />
        </>
      ) : <p className="error" role="alert">Elevation unavailable: {status.elevation.detail}. Relief, slope, 3D and routing are disabled; the image remains usable.</p>}

          <Toggle checked={visibility.hazard} onChange={set("hazard")} label="Hazards: steeper than your planning limit" tag="Calculated"
            hint="Red hatching marks 1 m cells whose 3 × 3 slope exceeds the Marswalk max-slope input. A planning threshold you choose, not a NASA hazard map." />
      <Toggle checked={visibility.science} onChange={set("science")} label="Science evidence" tag="Observed"
        hint="Perseverance PIXL mineral evidence at Berry Hollow, shown as a point." />
      <Toggle checked={visibility.traverse} onChange={set("traverse")} label="Rover traverse" tag="Observed"
        hint="43 localized Perseverance positions inside this area, sols 436–709." />

      <details className="source credits">
        <summary>About and credits</summary>
        <ul>
          <li>HiRISE orthoimage and elevation model: NASA/JPL/University of Arizona; Mars 2020 terrain products by USGS Astrogeology (DOIs 10.5066/P9QJDP48 and 10.5066/P9REJ9JN).</li>
          <li>Perseverance positions and raw images: NASA/JPL-Caltech; Mastcam-Z images NASA/JPL-Caltech/ASU.</li>
          <li>Berry Hollow mineralogy: Jones et al. (2025), <i>Science Advances</i> 11, eadt3048, CC BY 4.0.</li>
          <li>Fonts: Archivo Black and Inter, SIL Open Font License 1.1. 3D rendering: three.js (MIT).</li>
          <li>Astronaut, team patch, bedrock blocks and provenance flag are original artwork for this project. Not endorsed by NASA; no Minecraft or NASA logo assets are used.</li>
          <li>"Redrock Lander (NASA-inspired)" 3D model: supplied by the team with the project brief (glTF, 75 KB). Its creator and reuse terms are recorded by the team. It marks a hypothetical crew landing only.</li>
        </ul>
      </details>

      {mode === "3d" && status.elevation.ok && (
        <div className="field">
          <label htmlFor="exaggeration">Vertical scale: {exaggeration === 1 ? "true scale (1×)" : `${exaggeration}× exaggerated`}</label>
          <input id="exaggeration" type="range" min={1} max={4} step={1} value={exaggeration} onChange={(e) => setExaggeration(Number(e.target.value))} />
        </div>
      )}
    </div>
  );
}

export function DetailsPanel({ pin, terrain, extra }: { pin: MapPin | null; terrain: TerrainGrid | null; extra?: React.ReactNode }) {
  if (!pin) return <div className="panel-body"><h2>Details</h2><p className="muted">Select a pin on the map to see what was observed there and where the data comes from.</p></div>;
  const coordinate = unprojectMars(pin.point);
  const cellElevation = terrain ? elevationLabel(terrain, pin.point) : "elevation layer unavailable";
  return (
    <div className="panel-body">
      <p className="eyebrow">{PIN_KIND_LABEL[pin.kind]}</p>
      <h2>{pin.label}</h2>
      <dl className="facts">
        <dt>Location</dt><dd>{coordinate.latitudePlanetocentricDeg.toFixed(6)}° N, {coordinate.longitudeEastDeg.toFixed(6)}° E</dd>
        <dt>HiRISE elevation</dt><dd>{cellElevation}</dd>
      </dl>
      {extra}
    </div>
  );
}

export function elevationLabel(terrain: TerrainGrid, point: ProjectedPoint): string {
  const { layout } = terrain;
  const column = Math.floor((point.xM - layout.westM) / layout.pixelSizeM);
  const row = Math.floor((layout.northM - point.yM) / layout.pixelSizeM);
  if (row < 0 || column < 0 || row >= layout.height || column >= layout.width) return "outside the elevation crop";
  const z = terrain.elevationsM[row * layout.width + column];
  return Number.isFinite(z) ? `${z.toFixed(2)} m (cell row ${row}, column ${column})` : "unknown at this cell";
}

export function StoriesPanel({ onShow }: { onShow: (storyId: string) => void }) {
  return (
    <div className="panel-body">
      <h2>Rover discoveries</h2>
      <p className="muted">What Perseverance actually did here, from NASA images and a peer-reviewed study.</p>
      {stories.map((story) => (
        <article key={story.id} className={`story${story.inRange ? "" : " story--out"}`}>
          <p className="eyebrow">{story.when}</p>
          <h3>{story.title}</h3>
          {story.image && (
            <figure>
              <img src={story.image.src} alt={story.image.alt} loading="lazy" width={600} height={450} />
              <figcaption>{story.image.caption} Credit: {story.image.credit}. <a href={story.image.sourceUrl} target="_blank" rel="noreferrer">Raw image page</a></figcaption>
            </figure>
          )}
          <p>{story.body}</p>
          <ul className="links">{story.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
          {story.inRange
            ? <button type="button" className="btn btn--ghost" onClick={() => onShow(story.id)}>Show on map</button>
            : <p className="out-of-range" role="note">Outside this map extent: no pin is shown.</p>}
        </article>
      ))}
    </div>
  );
}

function NumberField({ id, label, value, onChange, min, max, step, unit, error }: { id: string; label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit: string; error?: string }) {
  // Keep the raw text so an empty or partial entry is not overwritten while typing.
  const [text, setText] = useState(Number.isFinite(value) ? String(+value.toFixed(4)) : "");
  useEffect(() => { if (Number(text) !== value && Number.isFinite(value)) setText(String(+value.toFixed(4))); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`field field--number${error ? " field--invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div><input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={text}
        aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => { setText(e.target.value); onChange(e.target.value.trim() === "" ? NaN : Number(e.target.value)); }} /><span>{unit}</span></div>
      {error && <p id={`${id}-error`} className="field__error">{error}</p>}
    </div>
  );
}

export function MissionPanel({ inputs, setInputs, habitats, destinations, customHabitat, placing, onPlace, errors, lastMs, route, assessment, focus, setFocus, terrain, planning, onDemo, activeDemo }: {
  inputs: MissionInputs;
  setInputs: (i: MissionInputs) => void;
  habitats: readonly Habitat[];
  destinations: readonly { id: string; label: string }[];
  customHabitat: Habitat | null;
  placing: boolean;
  onPlace: () => void;
  errors: Record<string, string>;
  lastMs: { ms: number; where: string } | null;
  route: RouteResult | null;
  assessment: MissionAssessment | null;
  focus: "shortest" | "weighted";
  setFocus: (f: "shortest" | "weighted") => void;
  terrain: TerrainGrid | null;
  planning: boolean;
  onDemo: (id: string) => void;
  activeDemo: string | null;
}) {
  const a = inputs.assumptions;
  const setA = (patch: Partial<MissionAssumptions>) => setInputs({ ...inputs, assumptions: { ...a, ...patch } });
  const allHabitats = customHabitat ? [...habitats, customHabitat] : habitats;
  const resultRef = useRef<HTMLDivElement>(null);
  const [destinationQuery, setDestinationQuery] = useState("");
  const shownDestinations = destinations.filter((d) => d.id === inputs.destinationId || d.label.toLowerCase().includes(destinationQuery.trim().toLowerCase()));
  const invalid = Object.keys(errors).length > 0;
  // Scroll to the result only when a demo is chosen, not on every automatic update.
  useEffect(() => { if (route && activeDemo) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [route, activeDemo]);
  return (
    <div className="panel-body">
      <h2>Plan a Marswalk</h2>
      <p className="muted">Could a crew walk from its landing site to Wildcat Ridge, do science and return within its reserve? Pick a current location and a destination; routes update automatically. Landing, habitat and crew values are simulated planning inputs.</p>

      <div className="demos" role="group" aria-label="Demonstration scenarios">
        {DEMOS.map((d) => (
          <button key={d.id} type="button" className={`btn btn--demo${activeDemo === d.id ? " is-active" : ""}`} onClick={() => onDemo(d.id)} aria-describedby={activeDemo === d.id ? "demo-note" : undefined}>
            {d.label}
          </button>
        ))}
      </div>
      {activeDemo && <p id="demo-note" className="muted small">{DEMOS.find((d) => d.id === activeDemo)?.description}</p>}

      <div className="field">
        <label htmlFor="habitat">Current location (hypothetical crew landing)</label>
        <select id="habitat" value={inputs.habitatId} onChange={(e) => setInputs({ ...inputs, habitatId: e.target.value })}>
          {allHabitats.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <button type="button" className="btn btn--ghost" onClick={onPlace} aria-pressed={placing}>{placing ? "Click the map…" : "Place on map"}</button>
      </div>
      <div className="field">
        <label htmlFor="destination">Destination</label>
        <input type="search" className="field__search" placeholder="Search destinations…" aria-label="Search destinations" value={destinationQuery} onChange={(e) => setDestinationQuery(e.target.value)} />
        <select id="destination" value={inputs.destinationId} onChange={(e) => setInputs({ ...inputs, destinationId: e.target.value })}>
          {shownDestinations.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>

      <fieldset className="grid2">
        <legend>Terrain limits</legend>
        <NumberField id="max-slope" error={errors["max-slope"]} label="Max slope" value={inputs.maxAbsSlopeDeg} min={1} max={45} step={1} unit="°" onChange={(v) => setInputs({ ...inputs, maxAbsSlopeDeg: v })} />
        <NumberField id="penalty" error={errors["penalty"]} label="Slope penalty" value={inputs.slopePenaltyWeight} min={0} max={20} step={1} unit="×" onChange={(v) => setInputs({ ...inputs, slopePenaltyWeight: v })} />
      </fieldset>
      <fieldset className="grid2">
        <legend>Crew assumptions (simulated)</legend>
        <NumberField id="speed" error={errors["speed"]} label="Walking speed" value={a.walkingSpeedMps} min={0.1} max={2} step={0.1} unit="m/s" onChange={(v) => setA({ walkingSpeedMps: v })} />
        <NumberField id="stop" error={errors["stop"]} label="Science stop" value={a.scienceStopS / 60} min={0} max={240} step={5} unit="min" onChange={(v) => setA({ scienceStopS: v * 60 })} />
        <NumberField id="budget" error={errors["budget"]} label="Time budget" value={a.timeBudgetS / 60} min={0} max={480} step={5} unit="min" onChange={(v) => setA({ timeBudgetS: v * 60 })} />
        <NumberField id="reserve" error={errors["reserve"]} label="Reserve" value={a.reserveS / 60} min={0} max={240} step={5} unit="min" onChange={(v) => setA({ reserveS: v * 60 })} />
      </fieldset>

      <p className="plan-status" role="status">
        {!terrain ? <span className="error">Marswalk routing unavailable here: the elevation layer did not load.</span>
          : invalid ? <span className="error">Fix the highlighted fields to generate routes.</span>
          : planning ? <><span className="spinner spinner--inline" aria-hidden="true" /> Updating routes…</>
          : lastMs ? <span className="muted small">Routes generated automatically in {lastMs.ms.toFixed(0)} ms ({lastMs.where === "worker" ? "background worker" : "main thread"}).</span> : null}
      </p>

      <div aria-live="polite" ref={resultRef}>
        {route && !invalid && <RouteSummary route={route} assessment={assessment} focus={focus} setFocus={setFocus} terrain={terrain} />}
      </div>
    </div>
  );
}

function RouteSummary({ route, assessment, focus, setFocus, terrain }: { route: RouteResult; assessment: MissionAssessment | null; focus: "shortest" | "weighted"; setFocus: (f: "shortest" | "weighted") => void; terrain: TerrainGrid | null }) {
  if (route.status !== "available") {
    return (
      <div className="result result--fail">
        <h3>{route.status === "no-route" ? "No route" : "Route unavailable"}</h3>
        <p>{route.detail}</p>
        <p className="muted small">Nothing is drawn because no complete round trip exists under these limits. Try a higher slope limit or another habitat.</p>
      </div>
    );
  }
  const assessed = assessment?.status === "assessed" ? assessment : null;
  const columns: { key: "shortest" | "weighted"; title: string; trip: typeof route.shortest; estimate?: NonNullable<typeof assessed>["shortest"] }[] = [
    { key: "shortest", title: "Shortest", trip: route.shortest, estimate: assessed?.shortest },
  ];
  if (route.alternative.status === "distinct") columns.push({ key: "weighted", title: "Gentler effort", trip: route.alternative.terrainWeighted, estimate: assessed?.terrainWeighted });
  const best = columns.find((c) => c.key === focus) ?? columns[0];
  const margin = best.estimate?.returnMarginS;

  return (
    <div className="result">
      <h3>Round-trip comparison</h3>
      {columns[0].estimate && assessed && (
        <p className="recommend">
          <strong>Recommended: shortest traversable round trip.</strong> With one constant walking speed, the shortest
          ground distance is also the fastest modelled route: {(route.shortest.outbound.horizontalDistanceM + route.shortest.return.horizontalDistanceM).toFixed(0)} m
          in total, steepest step {Math.max(route.shortest.outbound.maxAbsSlopeDeg, route.shortest.return.maxAbsSlopeDeg).toFixed(1)}°,
          {" "}{formatDuration(columns[0].estimate.elapsedS - assessed.assumptions.scienceStopS)} walking at {assessed.assumptions.walkingSpeedMps} m/s
          {" "}plus a {formatDuration(assessed.assumptions.scienceStopS)} science stop, leaving {formatDuration(columns[0].estimate.returnMarginS)} after
          the {formatDuration(assessed.assumptions.reserveS)} reserve.
          {columns.length > 1 && " The gentler-effort alternative trades extra distance for smaller slopes."}
        </p>
      )}
      <ul className="route-legend small" aria-label="Route legend">
        <li><i className="route-legend__line route-legend__line--shortest" /> Shortest</li>
        {columns.length > 1 && <li><i className="route-legend__line route-legend__line--weighted" /> Gentler effort</li>}
        <li><i className="route-legend__line route-legend__line--out" /> Outbound (solid)</li>
        <li><i className="route-legend__line route-legend__line--back" /> Return (dashed, drawn on top where the legs overlap)</li>
      </ul>
      <div className="table-wrap">
        <table>
          <thead><tr><th scope="col">Calculated</th>{columns.map((c) => (
            <th key={c.key} scope="col"><button type="button" className={`route-chip route-chip--${c.key}${focus === c.key ? " is-active" : ""}`} onClick={() => setFocus(c.key)} aria-pressed={focus === c.key}>{c.title}</button></th>
          ))}</tr></thead>
          <tbody>
            <tr><th scope="row">Out / back (horizontal ground distance)</th>{columns.map((c) => <td key={c.key}>{c.trip.outbound.horizontalDistanceM.toFixed(0)} / {c.trip.return.horizontalDistanceM.toFixed(0)} m</td>)}</tr>
            <tr><th scope="row">Steepest step</th>{columns.map((c) => <td key={c.key}>{Math.max(c.trip.outbound.maxAbsSlopeDeg, c.trip.return.maxAbsSlopeDeg).toFixed(1)}°</td>)}</tr>
            {terrain && <tr><th scope="row">Climb out / back</th>{columns.map((c) => <td key={c.key}>{climbAlong(terrain, c.trip.outbound).gainM.toFixed(0)} / {climbAlong(terrain, c.trip.return).gainM.toFixed(0)} m</td>)}</tr>}
            {assessed && <tr><th scope="row">Walk + stop</th>{columns.map((c) => <td key={c.key}>{c.estimate ? formatDuration(c.estimate.elapsedS) : "—"}</td>)}</tr>}
            {assessed && <tr><th scope="row">Margin after reserve</th>{columns.map((c) => <td key={c.key} className={c.estimate && c.estimate.returnMarginS < 0 ? "neg" : "pos"}>{c.estimate ? formatDuration(c.estimate.returnMarginS) : "—"}</td>)}</tr>}
          </tbody>
        </table>
      </div>
      {route.alternative.status === "coincident" && <p className="muted small">The gentler-effort search chose the same paths, so only one round trip is shown.</p>}
      {route.alternative.status === "unavailable" && <p className="muted small">No distinct gentler route: {route.alternative.detail}</p>}

      {assessment?.status === "unavailable" && <p className="error" role="alert">{assessment.detail}</p>}
      {margin !== undefined && (
        <div className={`decision ${margin >= 0 ? "decision--go" : "decision--nogo"}`}>
          <strong>{margin >= 0 ? "GO · returns within reserve" : "NO-GO · reserve would be used"}</strong>
          <p>{margin >= 0
            ? `On the ${best.title.toLowerCase()} route the crew is back with ${formatDuration(margin)} to spare beyond the reserve.`
            : best.estimate && assessed && best.estimate.elapsedS > assessed.assumptions.timeBudgetS
              ? `On the ${best.title.toLowerCase()} route the walk and stop take ${formatDuration(best.estimate.elapsedS)}, longer than the whole ${formatDuration(assessed.assumptions.timeBudgetS)} budget, before any reserve. Shorten the stop, walk a shorter route or start from a closer habitat.`
              : `On the ${best.title.toLowerCase()} route the plan overruns into the reserve by ${formatDuration(-margin)}. Shorten the stop, walk a shorter route or start from a closer habitat.`}</p>
        </div>
      )}
      <details className="debrief" open>
        <summary>Debrief: what is real and what is assumed</summary>
        <ul>
          <li><span className="tag tag--observed">Observed</span> HiRISE image and stereo elevation (MRO); Perseverance positions and PIXL sulfate evidence (Mars 2020).</li>
          <li><span className="tag tag--calculated">Calculated</span> Slopes, routes, distances and climb from the 1 m elevation grid. Rocks smaller than a grid cell are not resolved.</li>
          <li><span className="tag tag--simulated">Simulated</span> Habitat location, walking speed, stop time, budget and reserve. Time uses horizontal distance ÷ speed; it is not a physiological or certified safety model.</li>
        </ul>
        <ul className="limits">{route.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      </details>
    </div>
  );
}
