import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import elevationUrl from "../data/mars/jezero/elevation.tif?url";
import imageryUrl from "../data/mars/jezero/imagery.tif?url";
import { decodeJezeroRaster, jezeroWaypoint } from "./contracts/jezero.ts";
import { cellAt } from "./contracts/index.ts";
import type { MapLayer, MissionAssessment, ProjectedPoint, RouteResult, TerrainGrid } from "./contracts/index.ts";
import { elevationStats, hillshade, slopeDegrees } from "./analysis/terrain.ts";
import { createRoutePlanner } from "./analysis/routeClient.ts";
import { assessMission } from "./analysis/mission.ts";
import { composeLayers } from "./render/compose.ts";
import type { ImageryTreatment, LayerVisibility } from "./render/compose.ts";
import { habitatPresets, roverTraverse, roverTraverseProvenance, stories, wildcatRidge } from "./data/sites.ts";
import type { Habitat } from "./data/sites.ts";
import { Map2D } from "./components/Map2D.tsx";
import type { MapPin, RouteOverlay } from "./components/Pin.tsx";
import { BrandRocket } from "./components/HeroArt.tsx";
import { DEFAULT_INPUTS, DEMOS, DetailsPanel, LayersPanel, MissionPanel, SourceLinks, StoriesPanel } from "./components/Panels.tsx";
import type { LayerStatus, MissionInputs } from "./components/Panels.tsx";
import { inputErrors } from "./components/Panels.tsx";
import { loadExplorerData } from "./explorer/data.ts";
import type { CatalogEvent } from "./explorer/catalog.ts";
import { insideMarswalkCoverage } from "./explorer/catalog.ts";
import { projectMars } from "./contracts/index.ts";

const Map3D = lazy(() => import("./components/Map3D.tsx").then((m) => ({ default: m.Map3D })));

type Imagery = Extract<MapLayer, { status: "available"; kind: "imagery" }>;
type Elevation = Extract<MapLayer, { status: "available"; kind: "elevation" }>;

interface Loaded {
  imagery: Imagery | { error: string };
  elevation: Elevation | { error: string };
  slope: Float32Array | null;
  shade: Float32Array | null;
  stats: ReturnType<typeof elevationStats> | null;
}

async function fetchDecode<K extends "imagery" | "elevation">(url: string, kind: K, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`the ${kind} file request failed (HTTP ${response.status})`);
  const bytes = await response.arrayBuffer();
  return kind === "imagery" ? decodeJezeroRaster(bytes, "imagery") : decodeJezeroRaster(bytes, "elevation");
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function load(signal: AbortSignal): Promise<Loaded> {
  const [imagery, elevation] = await Promise.allSettled([
    fetchDecode(imageryUrl, "imagery", signal) as Promise<Imagery>,
    fetchDecode(elevationUrl, "elevation", signal) as Promise<Elevation>,
  ]);
  const terrain = elevation.status === "fulfilled" ? elevation.value.terrain : null;
  return {
    imagery: imagery.status === "fulfilled" ? imagery.value : { error: describe(imagery.reason) },
    elevation: elevation.status === "fulfilled" ? elevation.value : { error: describe(elevation.reason) },
    slope: terrain ? slopeDegrees(terrain) : null,
    shade: terrain ? hillshade(terrain) : null,
    stats: terrain ? elevationStats(terrain) : null,
  };
}

type Tab = "layers" | "details" | "stories" | "mission";

/** Query parameters after #/map?: tab, habitat (current location) and destination. */
function readParams() {
  const query = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  return { tab: query.get("tab"), habitat: query.get("habitat"), destination: query.get("destination") };
}

export function App({ onHome, onExplore }: { onHome: () => void; onExplore: () => void }) {
  const params = useMemo(readParams, []);
  const [data, setData] = useState<Loaded | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [webglIssue, setWebglIssue] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(params.tab === "mission" ? "mission" : "details");
  const [visibility, setVisibility] = useState<LayerVisibility>({ imagery: true, relief: false, elevation: false, slope: false, traverse: true, science: true, hazard: false });
  const [treatment, setTreatment] = useState<ImageryTreatment>("grayscale");
  const [exaggeration, setExaggeration] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(wildcatRidge.id);
  const [resetSignal, setResetSignal] = useState(0);
  const [overheadSignal, setOverheadSignal] = useState(0);
  const [inputs, setInputsState] = useState<MissionInputs>(() => ({
    ...DEFAULT_INPUTS,
    habitatId: params.habitat && habitatPresets.some((h) => h.id === params.habitat) ? params.habitat : DEFAULT_INPUTS.habitatId,
    destinationId: params.destination ?? DEFAULT_INPUTS.destinationId,
  }));
  const [catalogSites, setCatalogSites] = useState<CatalogEvent[]>([]);
  useEffect(() => {
    // Catalog records inside the 1 m grid become extra, sourced destinations.
    loadExplorerData().then((d) => setCatalogSites((d.catalog?.events ?? []).filter((e) => e.location && insideMarswalkCoverage(e.location))), () => {});
  }, []);
  const [customHabitat, setCustomHabitat] = useState<Habitat | null>(null);
  const [placing, setPlacing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<{ route: RouteResult; assessment: MissionAssessment | null } | null>(null);
  // Any input change invalidates the shown plan, so results never describe other inputs.
  const setInputs = (next: MissionInputs) => { setInputsState(next); setPlan(null); };
  const [focus, setFocus] = useState<"shortest" | "weighted">("shortest");
  const [activeDemo, setActiveDemo] = useState<string | null>(null);
  const [bannerHidden, setBannerHidden] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setFatal(null);
    load(controller.signal).then((loaded) => {
      // Without imagery, show relief so the map stays readable.
      if (!("grayscaleDn" in loaded.imagery) && "terrain" in loaded.elevation) setVisibility((v) => ({ ...v, relief: true }));
      setData(loaded);
    }, (error) => { if (!controller.signal.aborted) setFatal(describe(error)); });
    return () => controller.abort();
  }, [attempt]);

  const terrain: TerrainGrid | null = data && "terrain" in data.elevation ? data.elevation.terrain : null;
  const imagery = data && "grayscaleDn" in data.imagery ? data.imagery : null;

  // One composited canvas feeds both the 2D map and the 3D texture.
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [imageVersion, setImageVersion] = useState(0);
  useEffect(() => {
    if (!data) return;
    const composed = composeLayers({
      imagery,
      elevation: terrain && data.stats ? { layout: terrain.layout, elevationsM: terrain.elevationsM, minM: data.stats.minM, maxM: data.stats.maxM } : null,
      slopeDeg: data.slope, hillshade: data.shade, visibility, treatment,
      hazardSlopeDeg: Number.isFinite(inputs.maxAbsSlopeDeg) ? inputs.maxAbsSlopeDeg : undefined,
    });
    if (!composed) return;
    const element = canvas.current ?? document.createElement("canvas");
    element.width = composed.width; element.height = composed.height;
    element.getContext("2d")!.putImageData(new ImageData(composed.rgba, composed.width, composed.height), 0, 0);
    canvas.current = element;
    setImageVersion((v) => v + 1);
  }, [data, visibility, treatment, visibility.hazard ? inputs.maxAbsSlopeDeg : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const habitats = useMemo(() => (customHabitat ? [...habitatPresets, customHabitat] : habitatPresets), [customHabitat]);
  const habitat = habitats.find((h) => h.id === inputs.habitatId) ?? habitatPresets[0];
  const destinations = useMemo(() => [
    { id: wildcatRidge.id, label: "Wildcat Ridge · Berry Hollow (science target)", point: wildcatRidge.location },
    ...roverTraverse.filter((w) => w.note === "End-of-drive localization" && w.rmc !== jezeroWaypoint.id)
      .map((w) => ({ id: `wp-${w.rmc}`, label: `Rover stop, sol ${w.sol} (no science claim)`, point: w.location })),
    ...catalogSites.map((e) => ({ id: e.id, label: `${e.title} (NASA record)`, point: projectMars({ longitudeEastDeg: e.location!.lon, latitudePlanetocentricDeg: e.location!.lat }) })),
  ], [catalogSites]);
  const destination = destinations.find((d) => d.id === inputs.destinationId) ?? destinations[0];

  const pins: MapPin[] = useMemo(() => {
    const list: MapPin[] = [];
    if (visibility.traverse) {
      for (const w of roverTraverse) if (w.rmc !== jezeroWaypoint.id) list.push({ id: `wp-${w.rmc}`, kind: "waypoint", label: `Sol ${w.sol}, waypoint ${w.rmc}`, point: w.location });
    }
    list.push({ id: "rover-502", kind: "rover", label: `Sol ${jezeroWaypoint.sol} rover stop (${jezeroWaypoint.id})`, point: jezeroWaypoint.location });
    if (visibility.science) list.push({ id: wildcatRidge.id, kind: "science", label: wildcatRidge.name, point: wildcatRidge.location, nudgePx: 22 });
    for (const h of habitats) if (h.id === habitat.id) list.push({ id: h.id, kind: "habitat", label: h.name, point: h.location });
    return list;
  }, [visibility.traverse, visibility.science, habitats, habitat.id]);

  const selectedPin = pins.find((p) => p.id === selectedId) ?? null;

  const routes: RouteOverlay | null = useMemo(() => (plan?.route.status === "available"
    ? { shortest: plan.route.shortest, weighted: plan.route.alternative.status === "distinct" ? plan.route.alternative.terrainWeighted : undefined, focus }
    : null), [plan, focus]);
  const traversePoints = useMemo(() => (visibility.traverse ? roverTraverse.map((w) => w.location) : null), [visibility.traverse]);

  // Routes regenerate automatically, like a directions app, whenever every input is valid.
  const planner = useMemo(() => createRoutePlanner(terrain), [terrain]);
  useEffect(() => () => planner.dispose(), [planner]);
  const errors = useMemo(() => inputErrors(inputs), [inputs]);
  const [lastMs, setLastMs] = useState<{ ms: number; where: string } | null>(null);
  useEffect(() => {
    if (!terrain || Object.keys(errors).length) { setPlanning(false); return; }
    const h = habitats.find((x) => x.id === inputs.habitatId) ?? habitatPresets[0];
    const d = destinations.find((x) => x.id === inputs.destinationId) ?? destinations[0];
    let live = true;
    setPlanning(true);
    const timer = setTimeout(() => {
      planner.plan({ habitat: h.location, destination: d.point, maxAbsSlopeDeg: inputs.maxAbsSlopeDeg, slopePenaltyWeight: inputs.slopePenaltyWeight }).then((response) => {
        if (!live || !response) return;
        setPlan({ route: response.result, assessment: assessMission(response.result, inputs.assumptions) });
        setLastMs({ ms: response.ms, where: response.where });
        setFocus("shortest");
        setPlanning(false);
      });
    }, 150);
    return () => { live = false; clearTimeout(timer); };
  }, [inputs, terrain, planner, habitats, destinations, errors]);

  const onDemo = (id: string) => {
    const demo = DEMOS.find((d) => d.id === id)!;
    setInputs(demo.inputs);
    setActiveDemo(id);
  };

  const onPlace = (point: ProjectedPoint) => {
    setPlacing(false);
    const inside = terrain ? cellAt(terrain.layout, point) : undefined;
    const custom: Habitat = {
      id: "habitat-custom", name: "Habitat · placed on map", location: point,
      note: inside ? "Hypothetical, placed by you." : "Placed outside the elevation crop; routing will report it as outside coverage.",
    };
    setCustomHabitat(custom);
    setInputs({ ...inputs, habitatId: custom.id });
    setSelectedId(custom.id);
    setActiveDemo(null);
  };

  const setDestination = (id: string) => { setInputs({ ...inputs, destinationId: id }); setActiveDemo(null); setTab("mission"); };
  const setCurrentAt = (point: ProjectedPoint, name: string) => {
    const custom: Habitat = { id: "habitat-custom", name, location: point, note: "Hypothetical current location chosen by you." };
    setCustomHabitat(custom);
    setInputs({ ...inputs, habitatId: custom.id });
    setActiveDemo(null);
    setTab("mission");
  };

  const showStory = (storyId: string) => {
    const story = stories.find((s) => s.id === storyId);
    setSelectedId(story?.kind === "rover" ? "rover-502" : wildcatRidge.id);
    if (story?.kind === "science") setVisibility((v) => ({ ...v, science: true }));
    setTab("details");
  };

  if (fatal) return <ErrorScreen detail={fatal} onRetry={() => setAttempt((a) => a + 1)} onHome={onHome} />;

  const layerStatus: LayerStatus | null = data && {
    imagery: imagery ? { ok: true, provenance: imagery.provenance } : { ok: false, detail: (data.imagery as { error: string }).error },
    elevation: terrain && data.stats ? { ok: true, provenance: terrain.provenance, minM: data.stats.minM, maxM: data.stats.maxM } : { ok: false, detail: (data.elevation as { error: string }).error },
  };
  const layout = imagery?.layout ?? terrain?.layout;
  const threeD = mode === "3d" && terrain && !webglIssue;

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={onHome} aria-label="Back to the intro page"><BrandRocket size={26} /> <span>Bedrock <small>to</small> <em>Redrock</em></span></button>
        <p className="topbar__place">Wildcat Ridge · Jezero Crater, Mars</p>
        <button type="button" className="btn btn--small" onClick={onExplore}>Mars explorer</button>
        <div className="mode" role="group" aria-label="Map view">
          <button type="button" aria-pressed={mode === "2d"} onClick={() => setMode("2d")}>2D</button>
          <button type="button" aria-pressed={mode === "3d"} onClick={() => { setWebglIssue(null); setMode("3d"); }} disabled={!terrain}>3D</button>
        </div>
      </header>

      <main className="workspace">
        <section className="stage" aria-label="Map">
          {!data && <div className="loading" role="status"><span className="spinner" aria-hidden="true" />Loading HiRISE image and elevation…</div>}
          {data && canvas.current && layout && (threeD ? (
            <Suspense fallback={<div className="loading" role="status"><span className="spinner" aria-hidden="true" />Loading 3D terrain…</div>}>
              <Map3D image={canvas.current} imageVersion={imageVersion} terrain={terrain} pins={pins} routes={routes}
                traverse={traversePoints}
                selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setTab("details"); }}
                exaggeration={exaggeration} resetSignal={resetSignal} overheadSignal={overheadSignal}
                onUnavailable={(detail) => { setWebglIssue(detail); setMode("2d"); }} />
            </Suspense>
          ) : (
            <Map2D image={canvas.current} imageVersion={imageVersion} layout={layout} pins={pins}
              traverse={traversePoints}
              routes={routes} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setTab("details"); }}
              placing={placing} onPlace={onPlace} resetSignal={resetSignal} />
          ))}
          {data && (
            <div className="stage__tools">
              <button type="button" className="btn btn--small" onClick={() => setResetSignal((s) => s + 1)}>Reset view</button>
              {threeD && <button type="button" className="btn btn--small" onClick={() => setOverheadSignal((s) => s + 1)}>Overhead view</button>}
              {threeD && <span className="badge">{exaggeration === 1 ? "True vertical scale" : `Vertical ${exaggeration}× exaggerated`}</span>}
            </div>
          )}
          {data && !layout && <div className="loading" role="alert">Neither the image nor the elevation could be loaded: {layerStatus && !layerStatus.imagery.ok ? layerStatus.imagery.detail : ""}. <button type="button" className="btn btn--small" onClick={() => setAttempt((a) => a + 1)}>Try again</button></div>}
          {layerStatus && layout && !bannerHidden && (!layerStatus.imagery.ok || !layerStatus.elevation.ok) && (
            <p className="map-banner map-banner--warn map-banner--top" role="alert">
              {!layerStatus.imagery.ok && <>HiRISE image unavailable ({layerStatus.imagery.detail}); showing elevation-derived relief. </>}
              {!layerStatus.elevation.ok && <>Elevation unavailable ({layerStatus.elevation.detail}); 3D, slope and routing are disabled. </>}
              <button type="button" className="btn btn--small" onClick={() => setAttempt((a) => a + 1)}>Retry</button>
              <button type="button" className="btn btn--small" onClick={() => setBannerHidden(true)}>Dismiss</button>
            </p>
          )}
          {webglIssue && <p className="map-banner map-banner--warn" role="alert">{webglIssue}</p>}
        </section>

        <aside className="sidebar">
          <nav className="tabs" role="tablist" aria-label="Panels">
            {(["details", "layers", "stories", "mission"] as const).map((t) => (
              <button key={t} type="button" role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`} onClick={() => setTab(t)}>
                {{ details: "Details", layers: "Layers", stories: "Discoveries", mission: "Marswalk" }[t]}
              </button>
            ))}
          </nav>
          <div className="panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === "layers" && layerStatus && <LayersPanel visibility={visibility} setVisibility={setVisibility} treatment={treatment} setTreatment={setTreatment} status={layerStatus} exaggeration={exaggeration} setExaggeration={setExaggeration} mode={mode} />}
            {tab === "details" && <DetailsPanel pin={selectedPin} terrain={terrain} extra={pinExtra(selectedPin)} />}
            {tab === "stories" && <StoriesPanel onShow={showStory} />}
            {tab === "mission" && (
              <MissionPanel inputs={inputs} setInputs={(i) => { setInputs(i); setActiveDemo(null); }} habitats={habitatPresets} destinations={destinations}
                customHabitat={customHabitat} placing={placing} onPlace={() => { setPlacing((p) => !p); setMode("2d"); }}
                errors={errors} lastMs={lastMs} route={plan?.route ?? null} assessment={plan?.assessment ?? null}
                focus={focus} setFocus={setFocus} terrain={terrain} planning={planning} onDemo={onDemo} activeDemo={activeDemo} />
            )}
          </div>
        </aside>
      </main>
    </div>
  );

  function pinExtra(pin: MapPin | null) {
    if (!pin) return null;
    if (pin.id === wildcatRidge.id) {
      return (
        <>
          <p><strong>Observed:</strong> {wildcatRidge.observation}</p>
          <p><strong>Why go:</strong> {wildcatRidge.objective}</p>
          <p className="muted small"><strong>Where exactly:</strong> {wildcatRidge.locationMethod} Its pin is drawn slightly to the right of the rover marker on screen only, so both stay selectable; its coordinates are the rover position.</p>
          <SourceLinks provenance={wildcatRidge.provenance} />
          <button type="button" className="btn btn--primary" onClick={() => setDestination(wildcatRidge.id)}>Set as destination</button>
        </>
      );
    }
    if (pin.id === "rover-502") {
      return (
        <>
          <dl className="facts"><dt>Sol</dt><dd>{jezeroWaypoint.sol} (rover stayed until sol 535)</dd><dt>Waypoint</dt><dd>{jezeroWaypoint.id}</dd></dl>
          <p>Perseverance's localized position while it abraded Berry Hollow and drilled the Hazeltop and Bearwallow cores.</p>
          <SourceLinks provenance={roverTraverseProvenance} />
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={() => setDestination(wildcatRidge.id)}>Set as destination</button>
            <button type="button" className="btn btn--ghost" onClick={() => setTab("stories")}>Read the discoveries</button>
          </div>
        </>
      );
    }
    if (pin.kind === "waypoint") {
      const w = roverTraverse.find((x) => `wp-${x.rmc}` === pin.id);
      return w ? (
        <>
          <dl className="facts"><dt>Sol</dt><dd>{w.sol}</dd><dt>Note</dt><dd>{w.note}</dd><dt>Feed elevation</dt><dd>{w.elevationGeoidM.toFixed(2)} m</dd></dl>
          <SourceLinks provenance={roverTraverseProvenance} />
          <div className="btn-row">
            {destinations.some((d) => d.id === pin.id) && <button type="button" className="btn btn--primary" onClick={() => setDestination(pin.id)}>Set as destination</button>}
            <button type="button" className="btn btn--ghost" onClick={() => setCurrentAt(pin.point, `Current location · sol ${w.sol} rover stop`)}>Set as current location</button>
          </div>
        </>
      ) : null;
    }
    if (pin.kind === "habitat") {
      const h = habitats.find((x) => x.id === pin.id);
      return (
        <>
          <p className="muted"><span className="tag tag--simulated">Hypothetical</span> {h?.note} The rocket marks a simulated crew landing, not a real one.</p>
          <button type="button" className="btn btn--primary" onClick={() => { setInputs({ ...inputs, habitatId: pin.id }); setActiveDemo(null); setTab("mission"); }}>Set as current location</button>
        </>
      );
    }
    return null;
  }
}

function ErrorScreen({ detail, onRetry, onHome }: { detail: string; onRetry: () => void; onHome: () => void }) {
  return (
    <main className="fatal" role="alert">
      <h1>The map could not load</h1>
      <p>{detail}</p>
      <div><button type="button" className="btn btn--primary" onClick={onRetry}>Try again</button> <button type="button" className="btn btn--ghost" onClick={onHome}>Back to intro</button></div>
    </main>
  );
}
