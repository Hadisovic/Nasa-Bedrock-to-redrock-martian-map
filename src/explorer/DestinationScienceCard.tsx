import type { useDestinationScience } from "./useDestinationScience.ts";
import { greatCircleKm } from "./geo.ts";

export type DestinationScience = ReturnType<typeof useDestinationScience>;
const distance = (km: number) => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
export function DestinationScienceCard({ science, expanded = false }: { science: DestinationScience; expanded?: boolean }) {
  const { exact, nearest, reachable, pending } = science;
  const same = !!nearest && !!reachable && (nearest.event.id === reachable.event.id ||
    greatCircleKm(nearest.event.location!, reachable.event.location!) < .001);
  return <section className={`destination-science${expanded ? " destination-science--expanded" : ""}`} aria-label="Destination science">
    <h3>Scientific value</h3>
    <p>{exact?.scientificValue ?? (exact?.found ? exact.summary : nearest && nearest.distanceKm <= 1
      ? `Nearby science: ${nearest.event.scientificValue ?? nearest.event.summary}` : "No verified science observation is catalogued at this exact point.")}</p>
    {!exact && nearest && expanded && <p className="small muted">This observation belongs to the nearby discovery site, not the selected point.</p>}
    {exact?.found && <p className="destination-science__finding">{exact.found}</p>}
    {exact?.evidence[0] && <a className="small" href={exact.evidence[0].url} target="_blank" rel="noreferrer">{exact.mission} · source ↗</a>}
    {nearest && <div className="science-checkpoint"><span>{same ? "Nearest & reachable" : "Nearest discovery"}</span>
      <strong>{nearest.event.title}</strong><small>{same ? `${distance(reachable!.routeDistanceKm)} by terrain route` : `${distance(nearest.distanceKm)} straight-line`}</small>
      {expanded && <p>{nearest.event.scientificValue ?? nearest.event.summary}</p>}
      {expanded && nearest.event.evidence[0] && <a href={nearest.event.evidence[0].url} target="_blank" rel="noreferrer">Discovery source ↗</a>}
    </div>}
    {!same && reachable && <div className="science-checkpoint"><span>Closest confirmed reachable</span><strong>{reachable.event.title}</strong>
      <small>{distance(reachable.routeDistanceKm)} by terrain route · {science.scope}</small>
      {expanded && <p>{reachable.event.scientificValue ?? reachable.event.summary}</p>}
      {expanded && reachable.event.evidence[0] && <a href={reachable.event.evidence[0].url} target="_blank" rel="noreferrer">Discovery source ↗</a>}
    </div>}
    {expanded && <p className="small muted">Reachability compares observed science sites within {science.scope}, using this travel mode’s slope limit.
      {science.unresolved && " Some terrain coverage is unresolved; this does not establish the closest reachable site beyond verified coverage."}
      {pending && " Checking terrain connections…"}</p>}
    {!reachable && !pending && <small className="muted">{science.unresolved ? "Reachability needs verified local terrain." : "No reachable science checkpoint confirmed in this detailed terrain area."}</small>}
    {pending && <small role="status" className="muted">Checking nearby terrain connections…</small>}
  </section>;
}
