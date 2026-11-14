import { Suspense, lazy, useEffect, useState } from "react";
import { Astronaut } from "./Astronaut.tsx";
import { BrandRocket, Hologram, LayersIllustration, PixelRocket, Planet, RockShelf, RouteIllustration, TerrainIllustration } from "./HeroArt.tsx";
import { loadExplorerData } from "../explorer/data.ts";
import { isImageLayer } from "../explorer/catalog.ts";

const HeroRocket3D = lazy(() => import("./HeroRocket3D.tsx").then((m) => ({ default: m.HeroRocket3D })));

/** Status rows come only from data the app actually loads; nothing here is decorative. */
function useDataStatus() {
  const [status, setStatus] = useState<{ state: "loading" | "ready" | "partial"; events?: number; unlocated?: number; layers?: number } | null>(null);
  useEffect(() => {
    let live = true;
    setStatus({ state: "loading" });
    loadExplorerData().then((d) => {
      if (!live) return;
      setStatus({
        state: d.missing.length ? "partial" : "ready",
        events: d.catalog ? d.catalog.events.length : undefined,
        unlocated: d.catalog?.unlocated.length,
        layers: d.manifest ? d.manifest.layers.filter(isImageLayer).length : undefined,
      });
    }, () => live && setStatus({ state: "partial" }));
    return () => { live = false; };
  }, []);
  return status;
}

function Arrow() {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function MapIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
}
function RouteIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="6" cy="18" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="18" cy="6" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M8 17c6 0 2-9 8-10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="2 3" /></svg>;
}

export function Intro({ onStart, onMarswalk, onLayers }: { onStart: () => void; onMarswalk: () => void; onLayers: () => void }) {
  const status = useDataStatus();
  const online = status?.state === "ready";
  return (
    <div className="home">
      <header className="home__header">
        <a className="wordmark" href="#/" aria-label="Bedrock to Redrock, home">
          <BrandRocket size={30} />
          <span className="wordmark__text">Bedrock <small>to</small> <em>Redrock</em></span>
        </a>
        <nav className="home__nav" aria-label="Main">
          <button type="button" className="navlink navlink--active" onClick={onStart}>Mars explorer</button>
          <button type="button" className="navlink" onClick={onMarswalk}>Marswalk planner</button>
        </nav>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__art" aria-hidden="true">
            <div className="hero__stars" />
            <Planet className="hero__planet" />
            <RockShelf className="hero__shelf" />
            <Astronaut className="hero__astronaut" decorative />
            <Hologram className="hero__holo" />
            <Suspense fallback={<div className="hero__rocket hero-rocket"><PixelRocket className="hero-rocket__fallback" /></div>}>
              <HeroRocket3D className="hero__rocket" />
            </Suspense>
          </div>
          <div className="hero__text">
            <p className="hero__kicker">NASA Space Apps 2026 · Interplanetary Survival Guide</p>
            <h1 id="hero-title" className="hero__title">Bedrock<br />to <em>Redrock</em></h1>
            <span className="hero__rule" aria-hidden="true" />
            <p className="hero__lede">
              Spin the whole of Mars, find where NASA landers and rovers made their discoveries, then
              plan a Marswalk on real ground at Wildcat Ridge in Jezero Crater, where Perseverance found
              salts left by ancient water, and decide whether your crew gets back with time to spare.
            </p>
            <div className="hero__actions">
              <button className="btn btn--hero btn--copper" type="button" onClick={onStart} autoFocus>
                <MapIcon /> Start Website <Arrow />
              </button>
              <button className="btn btn--hero btn--outline" type="button" onClick={onMarswalk}>
                <RouteIcon /> Start Wildcat Ridge Marswalk
              </button>
            </div>
            <p className="hero__note">Real NASA orbiter and rover data. Habitat and crew plans are simulated.</p>
          </div>
        </section>

        <section className="home__cards" aria-label="What you can do">
          <article className="feature">
            <div className="feature__art"><TerrainIllustration /></div>
            <h2>Explore the planet</h2>
            <p>Flat map or 3D globe of the whole of Mars, with every mapped NASA landing, rover stop and sample.</p>
            <button type="button" className="feature__go" onClick={onStart} aria-label="Open the Mars explorer"><Arrow /></button>
          </article>
          <article className="feature">
            <div className="feature__art"><RouteIllustration /></div>
            <h2>Plan a Marswalk</h2>
            <p>Choose a start and a destination at Wildcat Ridge and compare terrain-aware round trips.</p>
            <button type="button" className="feature__go" onClick={onMarswalk} aria-label="Open the Marswalk planner"><Arrow /></button>
          </article>
          <article className="feature">
            <div className="feature__art"><LayersIllustration /></div>
            <h2>Discover layers</h2>
            <p>Toggle NASA terrain, mineral, dust and temperature layers, each with its source and legend.</p>
            <button type="button" className="feature__go" onClick={onLayers} aria-label="Open the map layers"><Arrow /></button>
          </article>
          <aside className="status" aria-label="Data status">
            <h2><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="2" fill="currentColor" /><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg> Data status</h2>
            <p className={`status__main${online ? " status__main--ok" : ""}`} role="status">
              <span className="status__dot" aria-hidden="true" />
              {!status || status.state === "loading" ? "Checking bundled data…" : online ? "All bundled data loaded" : "Some data is missing from this build"}
            </p>
            <dl className="status__rows">
              <div><dt>Historical events</dt><dd>{status?.events != null ? `${status.events} mapped` : "—"}</dd></div>
              <div><dt>Map layers</dt><dd>{status?.layers != null ? `${status.layers} available` : "—"}</dd></div>
              <div><dt>Mars data</dt><dd>NASA and USGS sources</dd></div>
              <div><dt>Route planning</dt><dd>Wildcat Ridge, 1 m terrain</dd></div>
            </dl>
          </aside>
        </section>
      </main>
    </div>
  );
}
