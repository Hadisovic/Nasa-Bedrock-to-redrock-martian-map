import { useRef, useState } from "react";
import type { MissionOptions, RouteChoice, Stop } from "./missionPlan.ts";
import { legsForChoice, routeElevation, summarizeItinerary } from "./itinerary.ts";
import type { NavigationProgress, PlannedLeg } from "./itinerary.ts";
import { RouteChoices, TravelModes } from "./Directions.tsx";
import { DestinationScienceCard } from "./DestinationScienceCard.tsx";
import type { DestinationScience } from "./DestinationScienceCard.tsx";

export function RouteInfo({ legs, stops, mission, choice, choose, onMode, slopeLimit, progress, science, close, elevationM, travelledM, remainingM }: {
  legs: PlannedLeg[]; stops: Stop[]; mission: MissionOptions; choice: RouteChoice; choose: (choice: RouteChoice) => void;
  onMode: (rover: boolean) => void; progress: NavigationProgress | null; science: DestinationScience; close: () => void;
  slopeLimit: number;
  elevationM: number | null; travelledM: number; remainingM: number | null;
}) {
  const [tab, setTab] = useState<"overview" | "terrain" | "science">("overview");
  const panel = useRef<HTMLElement>(null);
  const profile = routeElevation(legs, choice);
  const totals = summarizeItinerary(legs, stops, mission, choice, progress);
  const selected = legsForChoice(legs, choice);
  const totalM = travelledM + (remainingM ?? totals.distanceKm * 1000);
  const percent = totalM ? Math.min(100, Math.round(travelledM / totalM * 100)) : 0;
  return <section ref={panel} className="route-info" aria-label="Route information" onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
    <header><div><span className="kicker">MISSION ROUTE</span><h2>Route information</h2></div>
      <button type="button" className="btn btn--small" autoFocus onClick={close} aria-label="Close route information">×</button></header>
    <div className="route-info__tabs" role="tablist" aria-label="Route information views">
      {(["overview", "terrain", "science"] as const).map((id) => <button type="button" role="tab" key={id}
        id={`route-info-tab-${id}`} aria-controls={`route-info-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1}
        onClick={() => setTab(id)} onKeyDown={(event) => {
          const tabs = ["overview", "terrain", "science"] as const;
          const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          if (!offset) return;
          event.preventDefault(); const next = tabs[(tabs.indexOf(id) + offset + 3) % 3]; setTab(next);
          panel.current?.querySelector<HTMLButtonElement>(`#route-info-tab-${next}`)?.focus();
        }}>{id === "overview" ? "Overview" : id === "terrain" ? "Terrain" : "Science"}</button>)}
    </div>
    <div className="route-info__body" role="tabpanel" id={`route-info-${tab}`} aria-labelledby={`route-info-tab-${tab}`}>
      {tab === "overview" && <>
        <TravelModes rover={mission.rover} choose={onMode} />
        <RouteChoices legs={legs} mission={mission} choice={choice} choose={choose} progress={progress} />
        <p className="small">{mission.rover ? "NASA rover: up to 0.042 m/s before the terrain allowance. Autonomous pauses and science operations are not included."
          : "Walk: a modeled 0.7 m/s baseline, reduced by the terrain allowance. This is a scenario estimate for an astronaut."}</p>
        <dl><div><dt>{progress ? "Remaining route" : "Distance"}</dt><dd>{(totals.distanceKm * 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} m</dd></div>
          <div><dt>Estimated movement time</dt><dd>{totals.travel === null ? "Needs finer terrain" : `${Math.ceil(totals.travel)} min`}</dd></div>
          <div><dt>Ascent / descent</dt><dd>{Math.round(profile.ascentM)} m / {Math.round(profile.descentM)} m</dd></div>
          <div><dt>Terrain slope limit</dt><dd>{slopeLimit}°</dd></div></dl>
        <a className="small" href="https://www-robotics.jpl.nasa.gov/what-we-do/flight-projects/mars-2020-rover/m2020mobility/" target="_blank" rel="noreferrer">NASA/JPL rover mobility source ↗</a>
      </>}
      {tab === "terrain" && <>
        <dl><div><dt>Current elevation</dt><dd>{elevationM === null ? "Not navigating" : `${Math.round(elevationM)} m`}</dd></div>
          <div><dt>Steepest measured step</dt><dd>{profile.measured ? `${profile.maxSlope.toFixed(1)}°` : "Unresolved"}</dd></div>
          <div><dt>Terrain effort allowance</dt><dd>{Math.round(selected.reduce((sum, leg) => sum + (leg.assessment?.terrainCostKm ?? 0) * 1000, 0))} equivalent m</dd></div></dl>
        {profile.measured && <figure className="route-info__profile"><figcaption>Elevation along the selected route</figcaption>
          <svg viewBox="0 0 400 100" role="img" aria-label="Route elevation; missing samples break the line">
            {profile.segments.filter((segment) => segment.length > 1).map((segment, i) => <polyline key={i} fill="none" stroke="#69d5ff" strokeWidth="2"
              points={segment.map(({ x, y }) => `${8 + x / Math.max(1, profile.distanceM) * 384},${90 - (y - profile.low) / Math.max(1, profile.high - profile.low) * 80}`).join(" ")} />)}
          </svg></figure>}
        {legs.map(({ result }, i) => result?.terrain && <p className="small" key={i}>{result.terrain.label} · {Number(result.terrain.spacingM.toPrecision(3))} m
          {result.terrain.regional && " · regional estimate"}{result.terrain.source && <> · <a href={result.terrain.source} target="_blank" rel="noreferrer">source ↗</a></>}</p>)}
        <p className="small muted">Elevation-derived planning model. Sub-grid rocks, traction, radiation, temperature and active dust hazards remain unevaluated. Surface dust and historical observations are context.</p>
      </>}
      {tab === "science" && <DestinationScienceCard science={science} expanded />}
    </div>
    {remainingM !== null && <footer className="route-info__progress"><span>{Math.round(travelledM)} m traveled · {Math.round(remainingM)} m left</span><strong>{percent}%</strong>
      <progress aria-label="Current route progress" value={percent} max={100} /></footer>}
  </section>;
}
