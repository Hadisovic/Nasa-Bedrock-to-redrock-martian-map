import { useMemo, useState } from "react";
import type { Catalog, CatalogEvent, CatalogFilter, EnvironmentObservation, EventType, LayerEntry, LayerManifest } from "./catalog.ts";
import { EVENT_TYPE_LABEL, PRECISION_LABEL, isImageLayer, matchesFilter, searchEvents } from "./catalog.ts";
import { formatLatLon } from "./geo.ts";
import { MapFlag, RocketIcon, SourceFlag } from "./icons.tsx";
import { TYPE_ACCENT } from "./accents.ts";
import { nearbyObservations, publicUrl, routingAvailability } from "./data.ts";

export interface LayerState { visible: boolean; opacity: number }

export const EMPTY_FILTER: CatalogFilter = { missions: new Set(), types: new Set(), solMin: null, solMax: null, yearMin: null, yearMax: null };

const isRemote = (url: string) => /^https?:/.test(url);

/** Search box with ranked results; each result offers Go to location (or the unlocated note). */
export function SearchBox({ events, unlocated, onGo, onRead, onRoute, routeLabel }: {
  events: readonly CatalogEvent[]; unlocated: readonly CatalogEvent[];
  onGo: (event: CatalogEvent) => void; onRead: (event: CatalogEvent) => void;
  onRoute: (id: string) => void; routeLabel: string;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchEvents([...events, ...unlocated], query, 8), [events, unlocated, query]);
  return (
    <div className="search" role="search">
      <label htmlFor="site-search" className="sr-only">Search sites, events, missions or aliases</label>
      <input id="site-search" type="search" placeholder="Search sites, events, missions, sols…" value={query}
        onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
      {query && (
        <ul className="search__results" aria-label="Search results">
          {results.length === 0 && <li className="muted small">No matching records.</li>}
          {results.map((event) => (
            <li key={event.id}>
              <span className="search__title">{event.title}<span className="muted small"> · {event.mission}{event.sol != null ? ` · sol ${event.sol}` : ""}</span></span>
              <span className="search__actions">
                <button type="button" className="btn btn--small" onClick={() => { onRead(event); setQuery(""); }}>Read about</button>
                {event.location
                  ? <><button type="button" className="btn btn--small" onClick={() => { onGo(event); setQuery(""); }}>Go to location</button>
                    <button type="button" className="btn btn--small btn--primary" onClick={() => { onRoute(event.id); setQuery(""); }}>{routeLabel}</button></>
                  : <span className="tag">Location unavailable</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CatalogPanel({ catalog, filter, setFilter, onGo, onRead, visibleCount }: {
  catalog: Catalog; filter: CatalogFilter; setFilter: (f: CatalogFilter) => void;
  onGo: (event: CatalogEvent) => void; onRead: (event: CatalogEvent) => void; visibleCount: number;
}) {
  const missions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of [...catalog.events, ...catalog.unlocated]) map.set(e.missionId, e.mission);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [catalog]);
  const types = useMemo(() => [...new Set(catalog.events.map((e) => e.type))].sort(), [catalog]);
  const [showUnlocated, setShowUnlocated] = useState(false);
  const toggle = <T,>(set: ReadonlySet<T>, value: T) => { const next = new Set(set); if (next.has(value)) next.delete(value); else next.add(value); return next; };
  const list = catalog.events.filter((e) => matchesFilter(e, filter))
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.title.localeCompare(b.title));
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  return (
    <div className="panel-body catalog">
      <h2>Historical events and discoveries</h2>
      <p className="muted small">
        {catalog.counts.total.mapped} precise, {catalog.counts.total.approximate} approximate or regional, {catalog.counts.total.unlocated} without a defensible location.
        Showing {visibleCount} on the map. Every record links to its NASA source.
      </p>
      <details className="filters" open>
        <summary>Filter by mission, type, sol or year</summary>
        <fieldset><legend>Mission</legend>
          {missions.map(([id, name]) => (
            <label key={id} className="chip"><input type="checkbox" checked={filter.missions.has(id)} onChange={() => setFilter({ ...filter, missions: toggle(filter.missions, id) })} /> {name}</label>
          ))}
        </fieldset>
        <fieldset><legend>Type</legend>
          {types.map((t) => (
            <label key={t} className="chip"><input type="checkbox" checked={filter.types.has(t)} onChange={() => setFilter({ ...filter, types: toggle(filter.types, t as EventType) })} />
              <span className="swatch" style={{ background: TYPE_ACCENT[t] }} aria-hidden="true" /> {EVENT_TYPE_LABEL[t as EventType]}</label>
          ))}
        </fieldset>
        <fieldset className="range"><legend>Sol (mission day)</legend>
          <label>From <input type="number" inputMode="numeric" min={0} value={filter.solMin ?? ""} onChange={(e) => setFilter({ ...filter, solMin: num(e.target.value) })} /></label>
          <label>to <input type="number" inputMode="numeric" min={0} value={filter.solMax ?? ""} onChange={(e) => setFilter({ ...filter, solMax: num(e.target.value) })} /></label>
        </fieldset>
        <fieldset className="range"><legend>Earth year</legend>
          <label>From <input type="number" inputMode="numeric" min={1976} value={filter.yearMin ?? ""} onChange={(e) => setFilter({ ...filter, yearMin: num(e.target.value) })} /></label>
          <label>to <input type="number" inputMode="numeric" min={1976} value={filter.yearMax ?? ""} onChange={(e) => setFilter({ ...filter, yearMax: num(e.target.value) })} /></label>
        </fieldset>
        <button type="button" className="btn btn--small btn--ghost" onClick={() => setFilter(EMPTY_FILTER)}>Clear filters</button>
      </details>
      <ul className="event-list">
        {list.map((event) => (
          <li key={event.id} className="event-row">
            <MapFlag size={22} nasaSource />
            <div>
              <strong>{event.title}</strong>
              <span className="muted small"> {event.mission} · {EVENT_TYPE_LABEL[event.type]}{event.sol != null ? ` · sol ${event.sol}` : ""}{event.date ? ` · ${event.date}` : ""}</span>
              <div className="event-row__actions">
                <button type="button" className="btn btn--small" onClick={() => onRead(event)}>Read about</button>
                <button type="button" className="btn btn--small btn--primary" onClick={() => onGo(event)}>Go to location</button>
              </div>
            </div>
          </li>
        ))}
        {list.length === 0 && <li className="muted">No mapped records match these filters.</li>}
      </ul>
      <h3><button type="button" className="linklike" aria-expanded={showUnlocated} onClick={() => setShowUnlocated((v) => !v)}>Location unavailable ({catalog.unlocated.length})</button></h3>
      {showUnlocated && (
        <ul className="event-list">
          {catalog.unlocated.map((event) => (
            <li key={event.id} className="event-row">
              <div>
                <strong>{event.title}</strong> <span className="muted small">{event.mission}{event.sol != null ? ` · sol ${event.sol}` : ""}</span>
                <p className="muted small">{event.reasonUnlocated}</p>
                <button type="button" className="btn btn--small" onClick={() => onRead(event)}>Read about</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <details className="small">
        <summary>Counts by source</summary>
        <table className="counts"><thead><tr><th>Source</th><th>Precise</th><th>Approx.</th><th>Unlocated</th></tr></thead>
          <tbody>{Object.entries(catalog.counts.bySource).map(([id, c]) => {
            const source = catalog.sources.find((s) => s.id === id);
            return <tr key={id}><td>{source ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : id}</td><td>{c.mapped}</td><td>{c.approximate}</td><td>{c.unlocated}</td></tr>;
          })}</tbody></table>
      </details>
    </div>
  );
}

/** "Read about": what happened, mission, when, findings, location precision and sources. */
export function EvidenceCard({ event, environment, onClose }: { event: CatalogEvent; environment: readonly EnvironmentObservation[]; onClose: () => void }) {
  const routing = routingAvailability(event);
  const nearby = nearbyObservations(environment, event);
  return (
    <article className="panel-body evidence" aria-labelledby="evidence-title">
      <header>
        <p className="kicker">{EVENT_TYPE_LABEL[event.type]} · <SourceFlag /></p>
        <h2 id="evidence-title">{event.title}</h2>
        {!event.observed && <p className="tag tag--simulated">Proposed path, not an observed rover position</p>}
      </header>
      <p>{event.summary}</p>
      <dl className="facts">
        <dt>Mission</dt><dd>{event.mission}</dd>
        <dt>When</dt><dd>{[event.date, event.sol != null ? `sol ${event.sol}` : null].filter(Boolean).join(" · ") || "Not stated in the source"}</dd>
        {event.region && (<><dt>Where</dt><dd>{event.region}</dd></>)}
        {event.found && (<><dt>Found</dt><dd>{event.found}</dd></>)}
        {event.scientificValue && (<><dt>Why it matters</dt><dd>{event.scientificValue}</dd></>)}
        <dt>Location</dt>
        <dd>{event.location ? (
          <>
            {formatLatLon(event.location)} <span className="tag">{PRECISION_LABEL[event.location.precision]}</span>
            {event.location.uncertaintyM ? <span className="muted small"> ± about {event.location.uncertaintyM} m</span> : null}
            <br /><span className="muted small">From <a href={event.location.coordinateSource.url} target="_blank" rel="noreferrer">{event.location.coordinateSource.title}</a>{event.location.coordinateSource.note ? `. ${event.location.coordinateSource.note}` : ""}</span>
          </>
        ) : <>Location unavailable. {event.reasonUnlocated}</>}</dd>
        <dt>Marswalk</dt><dd className={routing.available ? "" : "muted"}>{routing.text}</dd>
      </dl>
      {event.media.length > 0 && (
        <div className="evidence__media">
          {event.media.slice(0, 2).map((m) => (
            <figure key={m.url}>
              {isRemote(m.url) ? <a href={m.url} target="_blank" rel="noreferrer">View image</a> : <img src={publicUrl(m.url)} alt={m.caption ?? event.title} loading="lazy" />}
              <figcaption className="small muted">{m.caption} Credit: {m.credit}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {nearby.length > 0 && (
        <section className="observations">
          <h3>Environment observations nearby <span className="tag tag--observed">Observed</span></h3>
          <p className="muted small">Separate measurements near this site, with their own instrument and time.</p>
          <ul>
            {nearby.slice(0, 6).map((o) => (
              <li key={o.id}>
                <strong>{o.measures}:</strong> {o.value != null ? `${o.value} ${o.unit}` : `${o.min} to ${o.max} ${o.unit}`}
                <span className="muted small"> · {o.instrument}, {[o.date, o.sol != null ? `sol ${o.sol}` : null, o.localTime].filter(Boolean).join(", ")} · <a href={o.source.url} target="_blank" rel="noreferrer">source</a></span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <h3>Sources</h3>
      <ul className="sources">{event.evidence.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
      <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>Close card</button>
    </article>
  );
}

function Legend({ entry }: { entry: LayerEntry }) {
  const stops = entry.legend?.stops ?? [];
  if (!stops.length || entry.legend?.type === "none") return <p className="muted small">{entry.treatment === "qualitative" ? "Qualitative display: no verified numeric legend." : "No legend values published."}</p>;
  if (entry.legend?.type === "gradient") {
    return (
      <div className="legend">
        <div className="legend__bar" style={{ background: `linear-gradient(to right, ${stops.map((s) => s.color).join(", ")})` }} />
        <div className="legend__labels small"><span>{stops[0].label}</span><span>{stops[stops.length - 1].label}</span></div>
      </div>
    );
  }
  return <ul className="legend legend--cat small">{stops.map((s) => <li key={s.label}><span className="swatch" style={{ background: s.color }} />{s.label}</li>)}</ul>;
}

const GROUPS: { id: LayerEntry["group"]; title: string }[] = [
  { id: "terrain", title: "Terrain and imagery" },
  { id: "materials", title: "Ground materials and minerals" },
  { id: "weather", title: "Temperature, dust and weather" },
  { id: "hazards", title: "Hazards" },
];

const layerFilters = [
  { name: "All", matches: () => true },
  { name: "Minerals", matches: (layer: LayerEntry) => /^(aqueous-|hydrous-|chloride-|grs-silicon|grs-iron|tes-plagioclase|tes-high-ca|tes-sheet)/.test(layer.id) },
  { name: "Water", matches: (layer: LayerEntry) => /^(grs-water|aqueous-|hydrous-)/.test(layer.id) },
  { name: "Dust & weather", matches: (layer: LayerEntry) => layer.group === "weather" || /^(themis-|tes-thermal)/.test(layer.id) },
] as const;

export function GlobalLayersPanel({ manifest, state, setState, basemapId, setBasemapId, failed, zoomToLayer, retryLayer, localSlope }: {
  manifest: LayerManifest; state: Record<string, LayerState>; setState: (id: string, s: LayerState) => void;
  basemapId: string; setBasemapId: (id: string) => void; failed: ReadonlySet<string>;
  zoomToLayer: (entry: LayerEntry) => void;
  retryLayer: (id: string) => void;
  localSlope: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof layerFilters)[number]["name"]>("All");
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filter = layerFilters.find((item) => item.name === category) ?? layerFilters[0];
  const showOverview = terms.length === 0 && category === "All";
  const search = (value: string) => terms.every((term) => value.toLowerCase().includes(term));
  const showSlope = category === "All" && search("calculated local slope terrain elevation steepness hazards wildcat ridge gale");
  const baseCandidates = manifest.layers.filter((l) => isImageLayer(l) && l.group === "terrain" && l.global && !l.hasTransparency && l.treatment !== "false-color");
  const base = baseCandidates.find((l) => l.id === basemapId);
  const numeric = manifest.layers.filter((l) => !isImageLayer(l));
  const filtered = GROUPS.map((group) => ({ ...group, entries: manifest.layers.filter((layer) =>
    isImageLayer(layer) && layer.group === group.id && !baseCandidates.includes(layer) && filter.matches(layer)
    && search([layer.title, layer.id, layer.mission, layer.instrument, layer.measures, group.title,
      ...(layer.legend?.stops?.map((stop) => stop.label) ?? [])].filter(Boolean).join(" ")),
  ) }));
  return (
    <div className="panel-body layers">
      <h2>Filters</h2>
      <div className="layer-search" role="search" aria-label="Search map layers">
        <label className="sr-only" htmlFor="layer-search">Search layers</label>
        <input type="search" id="layer-search" value={query} placeholder="Find water, minerals, dust…"
          onChange={(event) => { setQuery(event.target.value); setCategory("All"); }} />
        <div className="layer-search__filters" role="group" aria-label="Layer quick filters">
          {layerFilters.map(({ name }) => <button type="button" key={name} className="btn btn--small" aria-pressed={category === name}
            onClick={() => { setQuery(""); setCategory(name); }}>{name}</button>)}
        </div>
      </div>
      {showOverview && baseCandidates.length > 1 && (
        <fieldset><legend>Basemap</legend>
          {baseCandidates.map((l) => (
            <label key={l.id} className="radio"><input type="radio" name="basemap" checked={basemapId === l.id} onChange={() => setBasemapId(l.id)} /> {l.title}</label>
          ))}
        </fieldset>
      )}
      {showOverview && base && (
        <div className="layer">
          <p className="small"><strong>{base.title}</strong> {base.treatment === "false-color" && <span className="tag">False colour</span>} <span className="muted">· {base.credit}</span></p>
          <Legend entry={base} />
          {base.verticalDatum && <p className="muted small">Elevation in metres; vertical datum: {base.verticalDatum}.</p>}
        </div>
      )}
      {showOverview && numeric.length > 0 && <p className="muted small">Numerical data used for readouts, not drawn: {numeric.map((l) => l.title).join(", ")}. Hover the flat map to read MOLA elevation.</p>}
      {showSlope && localSlope}
      {!showSlope && filtered.every(({ entries }) => entries.length === 0) && <p className="muted small" role="status">No matching layers.</p>}
      {filtered.map(({ entries, ...group }) => {
        if (!entries.length) return null;
        return (
          <section key={group.id} className="layer-group">
            <h3>{group.title}</h3>
            {entries.map((l) => {
              const s = state[l.id] ?? { visible: false, opacity: 0.7 };
              const { west, south, east, north } = l.coverage;
              const planetwide = west === -180 && east === 180 && south === -90 && north === 90;
              const extent = l.featuresFile ? "Mapped detections" : planetwide ? "Planetwide"
                : east - west < 30 ? "Regional" : east - west > 350 && north - south < 145 ? "Latitude band" : "With gaps";
              return (
                <div key={l.id} className="layer">
                  <label className="layer__toggle"><input type="checkbox" checked={s.visible} onChange={(e) => setState(l.id, { ...s, visible: e.target.checked })} /> <strong>{l.title}</strong>
                    {l.treatment === "false-color" && <span className="tag">False colour</span>}
                    <span className="tag">{extent}</span>
                  </label>
                  {failed.has(l.id) && <div className="mission-row"><p className="error small">This layer's file did not load.</p>
                    <button className="btn btn--small" onClick={() => retryLayer(l.id)}>Retry layer</button></div>}
                  {s.visible && (
                    <>
                      <label className="layer__opacity small">Opacity <input type="range" min={0} max={1} step={0.05} value={s.opacity}
                        aria-label={`Opacity: ${l.title}`} aria-valuetext={`${Math.round(s.opacity * 100)}%`}
                        onChange={(e) => setState(l.id, { ...s, opacity: Number(e.target.value) })} />
                        <span aria-hidden="true">{Math.round(s.opacity * 100)}%</span></label>
                      <Legend entry={l} />
                      {l.coverage.east - l.coverage.west < 30 && <button className="btn btn--small" onClick={() => zoomToLayer(l)}>Zoom to coverage</button>}
                    </>
                  )}
                  <details className="small muted">
                    <summary>What it measures and source</summary>
                    <p>{l.measures}{l.units ? ` (${l.units})` : ""}.</p>
                    <p>{l.instrument ? `${l.instrument}, ` : ""}{l.mission}. Coverage: {l.featuresFile ? "Recorded locations within the source footprint"
                      : planetwide ? "All longitudes and latitudes" : `Longitude ${west}° to ${east}°, latitude ${south}° to ${north}°`}.
                      {l.hasTransparency && !l.featuresFile ? " Clear areas show where this layer has no data." : ""}
                      {l.sourceResolution ? ` Source resolution ${l.sourceResolution}; shipped at ${l.shippedResolution}.` : ""} {l.observationDates ? `Observed ${l.observationDates}.` : ""}
                      {l.verticalDatum ? ` Vertical datum: ${l.verticalDatum}.` : ""}</p>
                    <p>Credit: {l.credit}. {l.sourceUrls?.[0] && <a href={l.sourceUrls[0]} target="_blank" rel="noreferrer">Metadata</a>}</p>
                  </details>
                </div>
              );
            })}
          </section>
        );
      })}
      {showOverview && manifest.excluded.length > 0 && (
        <details className="small"><summary>Searched but not shipped ({manifest.excluded.length})</summary>
          <ul>{manifest.excluded.map((x) => <li key={x.id}><strong>{x.title}:</strong> {x.reason}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

/** Marswalk entry points from the explorer: every mapped site with its routing availability. */
export function MarswalkSites({ events, onOpenPlanner, onGo }: { events: readonly CatalogEvent[]; onOpenPlanner: (destination?: string) => void; onGo: (event: CatalogEvent) => void }) {
  const rows = events.map((e) => ({ e, r: routingAvailability(e) }));
  const supported = rows.filter((x) => x.r.available);
  return (
    <div className="panel-body catalog">
      <h2>Marswalk planner</h2>
      <p>Plan a round trip from a hypothetical crew landing to a science target and back, on verified 1 m terrain.</p>
      <div className="planner-entry">
        <RocketIcon size={30} />
        <div><strong>Wildcat Ridge, Jezero Crater</strong><p className="muted small">First supported region. The rocket marks a hypothetical crew landing, not a real one.</p></div>
      </div>
      <button type="button" className="btn btn--primary" onClick={() => onOpenPlanner()}>Start Wildcat Ridge Marswalk</button>
      <h3>Sites inside routing coverage ({supported.length})</h3>
      <ul className="event-list">{supported.map(({ e }) => (
        <li key={e.id} className="event-row"><div><strong>{e.title}</strong> <span className="tag tag--calculated">Routing available</span>
          <div className="event-row__actions"><button type="button" className="btn btn--small btn--primary" onClick={() => onOpenPlanner(e.id)}>Plan a Marswalk here</button></div></div></li>
      ))}</ul>
      <h3>Other mapped sites ({rows.length - supported.length})</h3>
      <ul className="event-list">{rows.filter((x) => !x.r.available).map(({ e }) => (
        <li key={e.id} className="event-row"><div><strong>{e.title}</strong><p className="muted small">Marswalk routing unavailable here: no verified 1 m elevation coverage.</p>
          <div className="event-row__actions"><button type="button" className="btn btn--small" onClick={() => onGo(e)}>Go to location</button></div></div></li>
      ))}</ul>
    </div>
  );
}
