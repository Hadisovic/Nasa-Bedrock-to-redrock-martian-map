import { useMemo, useState } from "react";
import type { EnvironmentObservation } from "./catalog.ts";
import { routeElevation, selectedLeg, summarizeItinerary } from "./itinerary.ts";
import type { PlannedLeg } from "./itinerary.ts";
import type { MissionOptions, Stop } from "./missionPlan.ts";
import { marsAt } from "./marsTime.ts";

const signedM = (value: number) => `${Math.round(value)} m`;
const mins = (value: number) => `${Math.round(value)} min`;

export function RouteAnalysis({ legs, stops, mission, weighted, observations }: {
  legs: PlannedLeg[]; stops: Stop[]; mission: MissionOptions; weighted: boolean;
  observations: EnvironmentObservation[];
}) {
  const [tab, setTab] = useState<"profile" | "travel" | "hazards">("profile");
  const profile = useMemo(() => routeElevation(legs, weighted), [legs, weighted]);
  const totals = summarizeItinerary(legs, stops, mission, weighted);
  const departure = Date.parse(mission.departure + "Z");
  const usable = Number.isFinite(departure) && totals.travel !== null && totals.science !== null;
  const endTime = usable ? departure + (totals.travel! + totals.science!) * 60_000 : null;
  const destination = legs.at(-1)?.to;
  const exposures = observations.filter(({ kind }) => kind === "radiation-dose");
  const resolved = legs.flatMap(({ result }) => result?.status === "ok" ? [result.terrain] : []);
  const report = [...new Set(resolved.map(({ label, spacingM }) => `${label} · ${Math.round(spacingM).toLocaleString()} m`))];
  const range = Math.max(1, profile.high - profile.low);
  const lines = profile.segments.filter((points) => points.length > 1).map((points) => points.map(({ x, y }) =>
    `${12 + x / Math.max(1, profile.distanceM) * 376},${102 - (y - profile.low) / range * 90}`).join(" "));

  if (!legs.length) return null;
  return <details className="route-analysis">
    <summary>Route Analysis</summary>
    <div className="mission-row" role="group" aria-label="Route analysis view">
      {([["profile", "Elevation"], ["travel", "Walk vs. Rover"], ["hazards", "Hazards"]] as const).map(([id, label]) =>
        <button type="button" className="btn btn--small" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    {tab === "profile" && <>
      {lines.length > 0 && <figure className="route-analysis__chart">
        <figcaption>Elevation · {signedM(profile.low)} to {signedM(profile.high)}</figcaption>
        <svg viewBox="0 0 400 114" role="img" aria-label="Measured elevation along resolved legs. Missing samples break the line.">
          <path d="M12 12v90h376" fill="none" stroke="currentColor" opacity=".32" />
          {lines.map((points, index) => <polyline key={index} points={points} fill="none" stroke="#69d5ff" strokeWidth="2"
            vectorEffect="non-scaling-stroke" />)}
        </svg>
      </figure>}
      {profile.measured && <p className="small">{signedM(profile.ascentM)} ascent · {signedM(profile.descentM)} descent · {profile.maxSlope.toFixed(1)}° steepest measured step
        {profile.sustained !== null && ` · ${profile.sustained.toFixed(1)}° steepest sustained slope (20 m window, sampled)`}</p>}
      {!totals.complete && <p className="small">Showing resolved legs only.</p>}
      <p className="small">{report.join(" · ") || "Terrain coverage pending"}{totals.regional && " · regional estimate"}</p>
      {destination && endTime !== null && <p className="small">ETA {new Date(endTime).toISOString().slice(0, 16).replace("T", " ")} UTC · {marsAt(endTime, destination).time} Mars solar time</p>}
    </>}
    {tab === "travel" && <>
      <p className="small">Compare travel times on this exact route. Each estimate uses your constant speed and excludes science stops.</p>
      {!totals.complete || totals.regional ? <p className="small">Travel comparison requires a complete route on detailed terrain.</p>
        : <dl>{[false, true].map((rover) => {
          const speed = rover ? mission.roverSpeed : mission.speed;
          const travel = Number.isFinite(speed) && speed > 0 ? totals.distanceKm * 1000 / speed / 60 : null;
          const limit = rover ? mission.roverSlope : null;
          return <div key={String(rover)}><dt>{rover ? "Rover" : "Walk"}</dt><dd>{travel === null ? "Set a speed" : `${mins(travel)} at ${speed} m/s`}
            {limit !== null && profile.maxSlope > limit && " · exceeds selected rover slope limit"}</dd></div>;
        })}</dl>}
      {totals.science !== null && <p className="small">Add {mins(totals.science)} for science{legs.at(-1)?.returning && ` and keep ${mission.reserve} min of reserve`}.</p>}
      <p className="small">Oxygen, battery range and traction need suit or vehicle specifications.</p>
    </>}
    {tab === "hazards" && <>
      <p className="small">{totals.regional ? "Coarse MOLA resolves regional relief. Use detailed terrain for local slope and obstacles."
        : `Steepest measured step on resolved legs: ${profile.measured ? profile.maxSlope.toFixed(1) + "°" : "unavailable"}.`}</p>
      <p className="small">Use the Layers panel to inspect mapped surface dust and local slopes. The dust layer shows surface cover.</p>
      {exposures.length > 0 && <p className="small">Radiation is a historical Curiosity RAD observation. Route-wide exposure is unavailable. <a href={exposures[0].source.url} target="_blank" rel="noreferrer">NASA RAD source</a></p>}
    </>}
  </details>;
}
