import { useMemo, useState } from "react";
import type { CatalogEvent, EnvironmentObservation } from "./catalog.ts";
import { greatCircleKm } from "./geo.ts";
import { routeElevation, routeProfile, summarizeItinerary } from "./itinerary.ts";
import type { PlannedLeg } from "./itinerary.ts";
import type { MissionOptions, Stop } from "./missionPlan.ts";
import { NavigationIcon, RoverIcon } from "./icons.tsx";

const tabs = ["Overview", "Terrain", "Science"] as const;
const metres = (value: number) => `${Math.round(value).toLocaleString()} m`;
const distance = (km: number) => km < 1 ? metres(km * 1000) : `${km.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
const time = (minutes: number) => minutes < 1 ? `${Math.ceil(minutes * 60)} sec` : minutes < 60
  ? `${Math.ceil(minutes)} min` : `${(minutes / 60).toFixed(1)} hr`;

export function RouteInformation({ legs, stops, mission, weighted, slope, setRover,
  comparison, options, events, observations, globalSource, crewElevation }: {
  legs: PlannedLeg[]; stops: Stop[]; mission: MissionOptions; weighted: boolean; slope: number; setRover: (value: boolean) => void;
  comparison: React.ReactNode; options: React.ReactNode; events: readonly CatalogEvent[];
  observations: EnvironmentObservation[]; globalSource?: string; crewElevation: number | null;
}) {
  const [tab, setTab] = useState<number>(0);
  const profile = useMemo(() => routeElevation(legs, weighted), [legs, weighted]);
  const totals = summarizeItinerary(legs, stops, mission, weighted);
  const estimate = routeProfile(legs, mission, weighted, slope);
  const travel = estimate?.[mission.rover ? "rover" : "walk"] ?? null;
  const destination = stops.at(-1)?.point;
  const nearest = useMemo(() => {
    if (!destination) return null;
    let match: { event: CatalogEvent; km: number } | null = null;
    for (const event of events) {
      if (!event.observed || !event.location || (!event.found && !event.scientificValue && event.type !== "science-observation")) continue;
      const km = greatCircleKm(destination, event.location);
      if (!match || km < match.km) match = { event, km };
    }
    return match;
  }, [destination, events]);
  const source = nearest?.event.evidence[0] ?? nearest?.event.location?.coordinateSource;
  const radiation = observations.find(({ kind }) => kind === "radiation-dose");
  const terrain = [...new Map(legs.flatMap(({ result }) => result?.terrain
    ? [[result.terrain.label, result.terrain] as const] : [])).values()];
  const range = Math.max(1, profile.high - profile.low);
  const lines = profile.segments.filter((points) => points.length > 1).map((points) => points.map(({ x, y }) =>
    `${7 + x / Math.max(1, profile.distanceM) * 386},${103 - (y - profile.low) / range * 92}`).join(" "));

  return <>
    <div role="tablist" aria-label="Route information" className="route-information__tabs">
      {tabs.map((label, index) => <button type="button" role="tab" key={label} id={`route-info-tab-${index}`}
        aria-controls="route-info-content" aria-selected={tab === index} tabIndex={tab === index ? 0 : -1}
        onClick={() => setTab(index)} onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
            : (index + (event.key === "ArrowLeft" ? -1 : 1) + tabs.length) % tabs.length;
          setTab(next);
          event.currentTarget.parentElement?.querySelectorAll("button")[next]?.focus();
        }}>{label}</button>)}
    </div>
    <div className="route-information__content" role="tabpanel" id="route-info-content" aria-labelledby={`route-info-tab-${tab}`}>
      {tab === 0 && <>
        <div className="route-information__modes" role="group" aria-label="Travel mode">
          <button type="button" aria-pressed={!mission.rover} onClick={() => setRover(false)}><NavigationIcon kind="astronaut" /> Walk</button>
          <button type="button" aria-pressed={mission.rover} onClick={() => setRover(true)}><RoverIcon /> Rover</button>
        </div>
        {totals.complete && comparison}
        <dl className="route-information__metrics">
          <div><dt>Distance</dt><dd>{totals.complete ? distance(totals.distanceKm) : "Route unresolved"}</dd></div>
          <div><dt>Estimated movement time</dt><dd>{travel !== null ? time(travel) : totals.regional ? "Needs finer terrain" : "Unavailable"}</dd></div>
          {profile.measured && totals.complete && <div><dt>Ascent / descent</dt><dd>{metres(profile.ascentM)} / {metres(profile.descentM)}</dd></div>}
          <div><dt>Terrain slope limit</dt><dd>{mission.rover ? mission.roverSlope : slope}°</dd></div>
          {!!totals.science && <div><dt>Science time</dt><dd>{time(totals.science)}</dd></div>}
          {totals.remaining !== null && <div><dt>After return reserve</dt>
            <dd>{time(Math.abs(totals.remaining))} {totals.remaining < 0 ? "short" : "left"}</dd></div>}
        </dl>
        <p className="route-information__note">Movement time uses the configured {mission.rover ? "rover" : "walking"} speed and the measured path. Arrival dates include earlier science stops.</p>
        <details className="route-information__options"><summary>Travel settings and arrivals</summary>{options}</details>
      </>}
      {tab === 1 && <>
        <dl className="route-information__metrics">
          <div><dt>Current elevation</dt><dd>{crewElevation !== null ? metres(crewElevation) : "Unavailable"}</dd></div>
          <div><dt>Steepest measured step</dt><dd>{profile.measured ? `${profile.maxSlope.toFixed(1)}°` : "Unavailable"}</dd></div>
          {profile.sustained !== null && <div><dt>Steepest 20 m section</dt><dd>{profile.sustained.toFixed(1)}°</dd></div>}
        </dl>
        {!!lines.length && <figure className="route-information__chart">
          <figcaption>Elevation along the selected route</figcaption>
          <svg viewBox="0 0 400 110" role="img" aria-label="Measured elevation. Gaps mark missing samples.">
            {lines.map((line, index) => <polyline key={index} points={line} fill="none" stroke="#69d5ff" strokeWidth="2"
              vectorEffect="non-scaling-stroke" />)}
          </svg>
          <small>{metres(profile.low)} to {metres(profile.high)}</small>
        </figure>}
        {terrain.map(({ label, spacingM, regional }) => {
          const href = regional ? globalSource : spacingM === 20
            ? "https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m"
            : "https://doi.org/10.5066/P9REJ9JN";
          return <p key={label}>{label} · {metres(spacingM)}{regional && " · regional estimate"}
            {href && <> · <a href={href} target="_blank" rel="noreferrer">Source</a></>}</p>;
        })}
        {!totals.complete && <p className="route-information__note">Showing terrain for resolved legs.</p>}
        <p className="route-information__note">Elevation supports slope planning at the stated resolution. Rocks smaller than a grid cell, traction, radiation, and active weather remain unmeasured along this route.</p>
      </>}
      {tab === 2 && <>
        <h3>Scientific value</h3>
        {nearest ? <>
          {(nearest.km > .001 || nearest.event.location?.precision !== "precise") && <p className="route-information__note">
            No verified science observation is catalogued at the selected point. The observation below belongs to the catalog site.
          </p>}
          <dl className="route-information__metrics"><div><dt>{nearest.km <= .001 ? "Catalog site" : "Nearest documented discovery"}</dt>
            <dd>{distance(nearest.km)} straight-line</dd></div></dl>
          <strong>{nearest.event.title}</strong>
          <p>{nearest.event.scientificValue ?? nearest.event.found ?? nearest.event.summary}</p>
          {source && <a href={source.url} target="_blank" rel="noreferrer">Discovery source</a>}
          <p className="route-information__note">Distance to this discovery is measured from the final science stop. Reachability depends on a separate route calculation.</p>
        </> : <p>Choose a science stop to see catalog evidence near it.</p>}
        {radiation && <p className="route-information__note">Curiosity RAD provides historical context. <a href={radiation.source.url}
          target="_blank" rel="noreferrer">Radiation observation</a></p>}
      </>}
    </div>
  </>;
}
