import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { CatalogEvent, CatalogFilter } from "./catalog.ts";
import { insideMarswalkCoverage, isImageLayer, matchesFilter } from "./catalog.ts";
import { CREW_LANDING, DEFAULT_BASEMAP, WILDCAT_LATLON, loadExplorerData, loadFeatures, loadMolaElevation, markerFor, publicUrl, tileSourceFrom } from "./data.ts";
import type { ExplorerData } from "./data.ts";
import { CatalogPanel, EMPTY_FILTER, EvidenceCard, GlobalLayersPanel, SearchBox } from "./ExplorerPanels.tsx";
import type { LayerState } from "./ExplorerPanels.tsx";
import { Directions, MapRouteControls, routeStartId, stopId } from "./Directions.tsx";
import type { Pick } from "./Directions.tsx";
import { itineraryLegs, roundRouteCorners, selectedLeg, summarizeItinerary } from "./itinerary.ts";
import type { MapLeg } from "./itinerary.ts";
import { useItinerary } from "./useItinerary.ts";
import { GlobeMap2D } from "./GlobeMap2D.tsx";
import { bearingDeg, formatLatLon, greatCircleKm, lonDelta, relativeToLander, wrapLon } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import type { GlobeMarker, GlobeOverlay, GlobeView, OverlayFeature, RouteMapPoint } from "./types.ts";
import { zoomForPrecision } from "./types.ts";
import { nasaInsignia } from "./nasaMark.ts";
import { nearGale } from "./galeLayout.ts";
import { defaultMission, MAX_STOPS, planReturns, planStops, readPlan, PLAN_DATA_VERSION, validMission, validStop } from "./missionPlan.ts";
import type { Endpoint, Plan, Stop } from "./missionPlan.ts";
import { SavedRoutes } from "./SavedRoutes.tsx";
import { OfflinePacks } from "./OfflinePacks.tsx";
import { makePosition, Navigation } from "./Navigation.tsx";
import type { Position } from "./Navigation.tsx";
import { marsAt, marsSun } from "./marsTime.ts";
import { droneCenter, droneSites } from "./droneCoverage.ts";
import { listSavedDroneWindows } from "./dronePacks.ts";
import type { SavedDronePack } from "./dronePacks.ts";
import { terrainSlopeOverlays } from "./slopeLayer.ts";
import { ExplorerHelp } from "./ExplorerHelp.tsx";
import { useEarthWalk } from "./useEarthWalk.ts";
import { EarthWalkControls, EarthWalkSetup } from "./EarthWalkPanel.tsx";

const Globe3D = lazy(() => import("./Globe3D.tsx").then((m) => ({ default: m.Globe3D })));

type Tab = "catalog" | "card" | "layers" | "marswalk";
const panelTitles: Record<Tab, string> = {
  catalog: "Discoveries", card: "Read about", layers: "Map layers", marswalk: "Directions",
};
const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 640;
const MIN_MAP_WIDTH = 360;
const planetView: GlobeView = { lat: 9, lon: -105, zoom: 8.2 };

function siteEndpoint(event: CatalogEvent): Endpoint | null {
  if (!event.location) return null;
  const { lat, lon, precision, uncertaintyM, footprintKm } = event.location;
  return { lat, lon, precision, uncertaintyM, footprintKm, name: event.title };
}

/** Shareable state lives in the hash: #/explore?site=<id>&mode=3d&layers=a,b */
function readHash() {
  const query = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const rawPlan = query.get("plan");
  const plan = readPlan(rawPlan);
  return {
    plan, invalidPlan: !!rawPlan && !plan,
    site: query.get("site"),
    mode: query.get("mode") === "2d" ? "2d" as const : "3d" as const,
    layers: (query.get("layers") ?? "").split(",").filter(Boolean),
    base: query.get("base"),
    tab: query.get("tab"),
  };
}

function useImage(url: string | null) {
  const [state, setState] = useState<{ url: string; image: HTMLImageElement | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => { if (live) setState({ url, image, error: false }); };
    image.onerror = () => { if (live) setState({ url, image: null, error: true }); };
    image.src = url;
    return () => { live = false; };
  }, [url]);
  return state && state.url === url ? state : null;
}

export function Explorer({ onHome }: { onHome: () => void }) {
  const initial = useMemo(readHash, []);
  const [data, setData] = useState<ExplorerData | null>(null);
  const [mode, setMode] = useState<"2d" | "3d">(initial.mode);
  const [webglIssue, setWebglIssue] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(initial.plan || initial.tab === "layers" || initial.tab === "marswalk" ? (initial.plan ? "marswalk" : initial.tab as Tab) : "catalog");
  const [view, setView] = useState<GlobeView>(planetView);
  const [flySignal, setFlySignal] = useState(0);
  const flyTarget = useRef<GlobeView | null>(null);
  const flyTo = useCallback((target: GlobeView) => {
    flyTarget.current = target;
    setView(target);
    setFlySignal((n) => n + 1);
  }, []);
  const [panelOpen, setPanelOpen] = useState(!!initial.plan || !!initial.tab || !!initial.site);
  const [showFlags, setShowFlags] = useState(true);
  const [showCoverage, setShowCoverage] = useState(false);
  const [savedDronePacks, setSavedDronePacks] = useState<SavedDronePack[]>([]);
  const [showSlope, setShowSlope] = useState(false);
  const [slopeLayers, setSlopeLayers] = useState<GlobeOverlay[]>([]);
  const [slopeLoading, setSlopeLoading] = useState(false);
  const [preferredPanelWidth, setPreferredPanelWidth] = useState(400);
  const [preferredSheetHeight, setPreferredSheetHeight] = useState(310);
  const [panelDragSize, setPanelDragSize] = useState<number | null>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(window.innerWidth);
  const [workspaceHeight, setWorkspaceHeight] = useState(window.innerHeight);
  const workspace = useRef<HTMLElement>(null);
  const panelDrag = useRef<{ id: number; coordinate: number; size: number; next: number; sheet: boolean } | null>(null);
  const collapseButton = useRef<HTMLButtonElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const [start, setStart] = useState<Endpoint | null>(initial.plan?.start ?? null);
  const [stops, setStops] = useState<Stop[]>(() => planStops(initial.plan));
  const [returning, setReturning] = useState(() => planReturns(initial.plan));
  const [pick, setPick] = useState<Pick | null>(null);
  const [slope, setSlope] = useState(initial.plan?.slope ?? 15);
  const [weighted, setWeighted] = useState(initial.plan?.weighted ?? false);
  const [mission, setMission] = useState(() => initial.plan?.mission ?? defaultMission());
  const [savedTerrain, setSavedTerrain] = useState(initial.plan?.data ?? PLAN_DATA_VERSION);
  const [retry, setRetry] = useState(0);
  const [previewLeg, setPreviewLeg] = useState<number | null>(null);
  const [routeToolsOpen, setRouteToolsOpen] = useState(false);
  const routeToolsClose = useRef<HTMLButtonElement>(null);
  const [routeMenu, setRouteMenu] = useState<{ point: RouteMapPoint; pinned: boolean } | null>(null);
  const menuTimer = useRef<number | undefined>(undefined);
  const activeSlope = mission.rover ? mission.roverSlope : slope;
  useEffect(() => {
    if (!showSlope || !Number.isFinite(activeSlope)) return;
    let live = true;
    setSlopeLoading(true);
    const timer = window.setTimeout(() => {
      void terrainSlopeOverlays(activeSlope).then((layers) => {
        if (live) { setSlopeLayers(layers); setSlopeLoading(false); }
      });
    }, 230);
    return () => { live = false; window.clearTimeout(timer); };
  }, [showSlope, activeSlope]);
  const [solar, setSolar] = useState(false);
  const [utc, setUtc] = useState(Date.now);
  const [current, setCurrent] = useState<Position | null>(() => initial.plan?.position ? makePosition(initial.plan.position, "manual") : null);
  const [origin, setOrigin] = useState<Position | null>(current);
  const [blocked, setBlocked] = useState<LatLon | null>(initial.plan?.blocked ?? null);
  const resetNavigation = () => { setCurrent(null); setOrigin(null); setBlocked(null); };
  useEffect(() => {
    const timer = window.setInterval(() => setUtc(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const departure = Date.parse(mission.departure + "Z");
  const subsolar = useMemo(() => solar ? marsSun(Number.isFinite(departure) ? departure : utc).subsolar : null, [solar, departure, utc]);
  const [selectedId, setSelectedId] = useState<string | null>(initial.site);
  const [cardId, setCardId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CatalogFilter>(EMPTY_FILTER);
  const [layerState, setLayerState] = useState<Record<string, LayerState>>(() => Object.fromEntries(initial.layers.map((id) => [id, { visible: true, opacity: 0.7 }])));
  const [basemapId, setBasemapId] = useState<string | null>(initial.base);
  const [overlayImages, setOverlayImages] = useState<Record<string, HTMLImageElement | "error">>({});
  const [overlayFeatures, setOverlayFeatures] = useState<Record<string, OverlayFeature[] | "loading" | "error">>({});
  const [loadVersion, setLoadVersion] = useState(0);
  const requestedImages = useRef(new Set<string>());
  const requestedFeatures = useRef(new Set<string>());

  useEffect(() => {
    const element = workspace.current;
    if (!element) return;
    const observer = new ResizeObserver(() => { setWorkspaceWidth(element.clientWidth); setWorkspaceHeight(element.clientHeight); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const maxPanelWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, workspaceWidth - MIN_MAP_WIDTH));
  const clampPanelWidth = (width: number) => Math.max(MIN_PANEL_WIDTH, Math.min(maxPanelWidth, Math.round(width)));
  const panelWidth = clampPanelWidth(preferredPanelWidth);
  const minSheetHeight = 155;
  const maxSheetHeight = Math.max(minSheetHeight, Math.floor(workspaceHeight * .72));
  const sheetHeight = Math.max(minSheetHeight, Math.min(maxSheetHeight, preferredSheetHeight));

  useEffect(() => { loadExplorerData().then(setData, () => setData({ catalog: null, environment: [], manifest: null, missing: ["catalog and layers"] })); }, []);

  const events = useMemo(() => data?.catalog?.events ?? [], [data]);
  const unlocated = useMemo(() => data?.catalog?.unlocated ?? [], [data]);
  const allEvents = useMemo(() => [...events, ...unlocated], [events, unlocated]);
  const manifest = data?.manifest ?? null;

  // Basemap: the manifest's chosen terrain layer, or the bundled default; a small file on low-memory devices.
  const basemapEntry = manifest?.layers.find((l) => l.id === (basemapId ?? manifest.basemap));
  const lowMemory = typeof navigator !== "undefined" && ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 2;
  const natural = !basemapEntry || basemapEntry.id === "viking-color";
  const basemapUrl = publicUrl(natural ? lowMemory ? DEFAULT_BASEMAP.small : DEFAULT_BASEMAP.sharp : basemapEntry.file);
  const [highDetail, setHighDetail] = useState(false);
  useEffect(() => { if (view.zoom >= 6 || mode === "3d") setHighDetail(true); }, [view.zoom, mode]);
  const fastBasemap = useImage(publicUrl(DEFAULT_BASEMAP.small));
  const fineBasemap = useImage(natural && (lowMemory || !highDetail) ? null : basemapUrl);
  const basemap = fineBasemap?.image ? fineBasemap : fastBasemap ?? fineBasemap;

  // Overlay images load on first use.
  useEffect(() => {
    if (!manifest) return;
    for (const [id, s] of Object.entries(layerState)) {
      if (!s.visible || requestedImages.current.has(id)) continue;
      const entry = manifest.layers.find((l) => l.id === id);
      if (!entry) continue;
      requestedImages.current.add(id);
      const image = new Image();
      image.decoding = "async";
      image.onload = () => setOverlayImages((m) => ({ ...m, [id]: image }));
      image.onerror = () => setOverlayImages((m) => ({ ...m, [id]: "error" }));
      image.src = publicUrl(entry.file);
    }
    for (const [id, s] of Object.entries(layerState)) {
      const entry = manifest.layers.find((l) => l.id === id);
      if (!s.visible || !entry?.featuresFile || requestedFeatures.current.has(id)) continue;
      requestedFeatures.current.add(id);
      setOverlayFeatures((m) => ({ ...m, [id]: "loading" }));
      loadFeatures(entry).then((f) => setOverlayFeatures((m) => ({ ...m, [id]: f })), () => setOverlayFeatures((m) => ({ ...m, [id]: "error" })));
    }
  }, [layerState, manifest, loadVersion]);

  const overlays: GlobeOverlay[] = useMemo(() => [...(manifest?.layers ?? [])
    .filter((l) => isImageLayer(l) && layerState[l.id]?.visible && overlayImages[l.id] && overlayImages[l.id] !== "error" && l.id !== basemapEntry?.id)
    .map((l) => {
      const f = overlayFeatures[l.id];
      return { entry: l, image: overlayImages[l.id] as HTMLImageElement, opacity: layerState[l.id].opacity, features: Array.isArray(f) ? f : undefined };
    }), ...(showSlope ? slopeLayers : [])], [manifest, layerState, overlayImages, overlayFeatures, basemapEntry, showSlope, slopeLayers]);
  const failedLayers = useMemo(() => new Set(Object.entries(overlayImages).filter(([, v]) => v === "error").map(([k]) => k)), [overlayImages]);

  const catalogMarkers: GlobeMarker[] = useMemo(() => {
    const list = events.filter((e) => matchesFilter(e, filter)).map(markerFor).filter((m): m is GlobeMarker => !!m);
    // Keep the selected record visible even when filters would hide it.
    const selected = events.find((e) => e.id === selectedId);
    if (selected && !list.some((m) => m.id === selected.id)) { const m = markerFor(selected); if (m) list.push(m); }
    return list;
  }, [events, filter, selectedId]);
  const grid = manifest?.layers.find((l) => l.id === "mola-elevation");
  const legRequests = useMemo(() => itineraryLegs(start, stops, returning, origin?.point), [start, stops, returning, origin]);
  const legs = useItinerary(legRequests, grid, activeSlope, blocked, retry);
  const [earthWalkSetupOpen, setEarthWalkSetupOpen] = useState(false);
  const earthWalk = useEarthWalk(mission.rover ? null : start, stops, returning, legs, grid, activeSlope, blocked, weighted, mission.speed,
    manifest?.layers.find((layer) => layer.id === "tes-dust-cover"), data?.environment ?? []);
  const routeSummary = summarizeItinerary(legs, stops, mission, weighted);
  const resolvedLegs = useMemo(() => legs.flatMap((leg) => {
    const path = selectedLeg(leg.result, weighted);
    return path ? [path] : [];
  }), [legs, weighted]);
  const visibleLegs = earthWalk.planned ?? legs;
  const paths = useMemo<MapLeg[]>(() => visibleLegs.flatMap((leg) => {
    const path = selectedLeg(leg.result, weighted);
    return path ? [{ points: roundRouteCorners(path.points), returning: leg.returning, distanceKm: path.distanceKm }] : [];
  }), [visibleLegs, weighted]);
  const replayPoints = useMemo(() => routeSummary.complete && !routeSummary.regional
    ? resolvedLegs.flatMap((leg, index) => index ? leg.points.slice(1) : leg.points) : [], [resolvedLegs, routeSummary.complete, routeSummary.regional]);
  const previewResult = previewLeg == null ? null : legs[previewLeg]?.result;
  const suggestion = previewResult && previewResult.status !== "ok" ? previewResult.suggestion : undefined;
  const mapPaths = useMemo(() => suggestion ? [...paths, { points: roundRouteCorners(suggestion.preview.points),
    distanceKm: suggestion.preview.distanceKm, returning: false, preview: true }] : paths, [paths, suggestion]);

  useEffect(() => { if (pick !== null || !paths.length) setRouteMenu(null); }, [pick, paths.length, mode, flySignal]);
  useEffect(() => () => window.clearTimeout(menuTimer.current), []);
  useEffect(() => { if (routeToolsOpen) routeToolsClose.current?.focus(); }, [routeToolsOpen]);
  const cancelMenuClose = () => window.clearTimeout(menuTimer.current);
  const closeMenuSoon = () => {
    cancelMenuClose();
    menuTimer.current = window.setTimeout(() => setRouteMenu((menu) => menu?.pinned ? menu : null), 260);
  };
  const hoverRoute = (point: RouteMapPoint | null) => {
    if (!point) { closeMenuSoon(); return; }
    cancelMenuClose();
    setRouteMenu((menu) => menu ?? { point, pinned: false });
  };
  const tapRoute = (point: RouteMapPoint | null) => {
    cancelMenuClose();
    setRouteMenu(point ? { point, pinned: true } : null);
  };
  const closeRouteTools = () => {
    setRouteToolsOpen(false);
    requestAnimationFrame(() => workspace.current?.querySelector<HTMLElement>(".map2d, .globe3d")?.focus());
  };
  const markers: GlobeMarker[] = useMemo(() => [
    ...(showFlags ? catalogMarkers : []),
    ...(showCoverage ? droneSites.map((site) => ({ ...droneCenter(site), id: "coverage-" + site.id, kind: "coverage" as const,
      label: `Fly over ${site.label} · ${site.spacingM} m elevation`, accent: "#ffe689", flag: false })) : []),
    ...(start ? [{ ...start, id: routeStartId, kind: "rocket" as const, label: "Route start", accent: "#69D5FF", flag: false }] : []),
    ...stops.map(({ point }, index) => ({ ...point, id: stopId(index), kind: "destination" as const, order: index + 1,
      label: `Stop ${index + 1} · ${point.name ?? formatLatLon(point)}`, accent: "#FF9B63", flag: false })),
    ...(current && greatCircleKm(current.point, start ?? current.point) > 1e-7 ? [{ ...current.point, id: "crew-position", kind: "crew" as const, label: `Crew position · ${current.source}`, accent: "#A7F48C", flag: false }] : []),
    ...(blocked ? [{ ...blocked, id: "blocked-cell", kind: "destination" as const, label: "Reported blocked cell", accent: "#FF755A", flag: false }] : []),
    ...(suggestion ? [{ ...suggestion.point, id: "route-suggestion", kind: "destination" as const,
      label: "Suggested reachable point", accent: "#FFE689", flag: false }] : []),
  ], [catalogMarkers, start, stops, current, blocked, showFlags, showCoverage, suggestion]);

  const tiles = useMemo(() => tileSourceFrom(manifest, basemapEntry), [manifest, basemapEntry]);
  const displayedPlan: Plan | null = useMemo(() => start && stops.length && stops.every(validStop) && validMission(mission) && slope >= 1 && slope <= 89
    ? { version: 2, data: PLAN_DATA_VERSION, start, stops, returnToLander: returning, slope, weighted, mission, position: origin?.point, blocked: blocked ?? undefined }
    : null, [start, stops, returning, slope, weighted, mission, origin, blocked]);
  const loadPlan = (plan: Plan) => {
    resetNavigation(); setPick(null); setStart(plan.start); setStops(planStops(plan)); setReturning(planReturns(plan));
    setSlope(plan.slope); setWeighted(plan.weighted); setPreviewLeg(null);
    if (plan.position) {
      const position = makePosition(plan.position, "manual");
      setCurrent(position); setOrigin(position);
    }
    if (plan.blocked) setBlocked(plan.blocked);
    setMission(plan.mission); setSavedTerrain(plan.data); setTab("marswalk"); setPanelOpen(true);
  };
  const loadEarthWalkDemo = () => {
    loadPlan({ version: 2, data: PLAN_DATA_VERSION,
      start: { lat: CREW_LANDING.lat, lon: CREW_LANDING.lon, name: "Wildcat Ridge lander" },
      stops: [{ point: { ...WILDCAT_LATLON, name: "Berry Hollow" }, scienceMinutes: 0 }],
      returnToLander: false, slope: 15, weighted: false, mission: { ...mission, rover: false } });
  };
  const centerEarthWalk = (point: LatLon) => {
    setMode("3d");
    flyTo({ ...point, zoom: earthWalk.liveEligible ? 110_000 : Math.max(8.2, Math.min(view.zoom, 4_000)) });
  };
  const fitPoints = useCallback((points: readonly LatLon[], localView: boolean) => {
    if (!points.length) return;
    const centerLon = points[0].lon;
    let north = -90, south = 90, east = -180, west = 180;
    for (const point of points) {
      const offset = lonDelta(centerLon, point.lon);
      north = Math.max(north, point.lat); south = Math.min(south, point.lat);
      east = Math.max(east, offset); west = Math.min(west, offset);
    }
    const stage = workspace.current?.querySelector(".stage");
    const width = stage?.clientWidth ?? 600, height = stage?.clientHeight ?? 500;
    const sidePanel = workspace.current?.querySelector<HTMLElement>(".explorer__sidebar:not([hidden])");
    const desktop = width > 760;
    const visibleWidth = sidePanel && desktop ? Math.max(width / 2, sidePanel.offsetLeft) : width;
    const topInset = Math.min(125, height * .22);
    const bottomInset = sidePanel && !desktop ? sidePanel.clientHeight : Math.min(95, height * .16);
    const visibleHeight = Math.max(height * .25, height - topInset - bottomInset);
    const minSpan = localView ? 0.0005 : 0.05;
    const zoom = Math.min(localView ? 240_000 : 4_000,
      0.70 * Math.min(visibleWidth / Math.max(minSpan, east - west), visibleHeight / Math.max(minSpan, north - south)));
    const shiftX = (width - visibleWidth) * 0.45 / zoom;
    const shiftY = (topInset - bottomInset) / (2 * zoom);
    flyTo({ lat: Math.max(-89.9, Math.min(89.9, (north + south) / 2 + shiftY)),
      lon: wrapLon(centerLon + (east + west) / 2 + Math.min(65, shiftX)), zoom });
  }, [flyTo]);
  const pointsToFit = useMemo(() => [start, ...stops.map(({ point }) => point)].filter((point): point is Endpoint => !!point),
    [start, stops]);
  const fit = () => fitPoints([...pointsToFit, ...resolvedLegs.flatMap((leg) => leg.points)], !routeSummary.regional);
  // Fit after coordinates change. Science and timing edits keep the current camera.
  const lastFitted = useRef("");
  const fitKey = JSON.stringify(pointsToFit.map(({ lat, lon }) => [lat, lon]));
  useEffect(() => {
    if (pick !== null || !legs.length || legs.some(({ result }) => !result)) return;
    const key = mode + fitKey;
    if (key === lastFitted.current) return;
    lastFitted.current = key;
    fit();
  }, [fitKey, mode, pick, legs]);

  const addStop = (point: Endpoint) => {
    setStops((previous) => {
      const last = previous.at(-1)?.point;
      if (previous.length >= MAX_STOPS || (last && last.lat === point.lat && last.lon === point.lon)) return previous;
      return [...previous, { point, scienceMinutes: mission.stop }];
    });
    setPreviewLeg(null);
  };
  const replaceStop = (index: number, point: Endpoint) => {
    setStops((previous) => previous.map((stop, order) => order === index ? { ...stop, point } : stop));
    setPreviewLeg(null);
  };
  const selectEndpoint = (target: "start" | "add" | number, point: Endpoint) => {
    if (target === "start") { resetNavigation(); setStart(point); }
    else if (target === "add") addStop(point);
    else replaceStop(target, point);
    setPick(null);
  };
  const choosePoint = (point: Endpoint) => {
    if (pick === "position") { const fix = makePosition(point, "manual"); setOrigin(fix); setCurrent(fix); setPick(null); return; }
    if (pick === "block") { setBlocked(point); if (current && start && greatCircleKm(current.point, start) > 1e-6) setOrigin(current); setPick(null); return; }
    if (pick !== null) selectEndpoint(pick, point);
  };
  const showRouteDetails = () => { setRouteMenu(null); setRouteToolsOpen(false); setTab("marswalk"); setPanelOpen(true); };
  const showRouteTools = () => { setRouteMenu(null); setRouteToolsOpen(true); };
  const openPanel = (section: Tab) => {
    const currentSection = tab === "card" ? "catalog" : tab;
    setPanelOpen(!(panelOpen && currentSection === section));
    setTab(section);
  };
  const togglePanel = (open: boolean) => {
    setPanelOpen(open);
    window.requestAnimationFrame(() => (open ? collapseButton : expandButton).current?.focus());
  };
  const beginResize = (event: ReactPointerEvent<HTMLDivElement>, sheet: boolean) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const size = sheet ? sheetHeight : panelWidth;
    panelDrag.current = { id: event.pointerId, coordinate: sheet ? event.clientY : event.clientX, size, next: size, sheet };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const dragResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panelDrag.current;
    if (drag?.id !== event.pointerId) return;
    const minimum = drag.sheet ? minSheetHeight : MIN_PANEL_WIDTH;
    const limit = drag.sheet ? maxSheetHeight : maxPanelWidth;
    const raw = drag.size + drag.coordinate - (drag.sheet ? event.clientY : event.clientX);
    drag.next = Math.max(0, Math.min(limit, raw));
    setPanelDragSize(drag.next >= minimum - 12 ? Math.max(minimum, drag.next) : drag.next);
  };
  const endResize = (event: ReactPointerEvent<HTMLDivElement>, cancel = false) => {
    const drag = panelDrag.current;
    if (drag?.id !== event.pointerId) return;
    panelDrag.current = null;
    setPanelDragSize(null);
    if (cancel) return;
    const minimum = drag.sheet ? minSheetHeight : MIN_PANEL_WIDTH;
    if (drag.next < minimum - 45) { togglePanel(false); return; }
    if (drag.sheet) setPreferredSheetHeight(Math.max(minimum, drag.next));
    else setPreferredPanelWidth(clampPanelWidth(drag.next));
  };
  const handleResize = (sheet: boolean) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => beginResize(event, sheet),
    onPointerMove: dragResize,
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => endResize(event),
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => endResize(event, true),
    onLostPointerCapture: (event: ReactPointerEvent<HTMLDivElement>) => endResize(event, true),
  });
  const chooseOnMap = pick !== null ? (point: LatLon) => choosePoint(point) : undefined;
  const read = useCallback((event: CatalogEvent) => { setCardId(event.id); setTab("card"); setPanelOpen(true); }, []);
  const chooseMarker = (id: string) => {
    if (id === "crew-position" || id === "blocked-cell" || id === "route-suggestion") { showRouteDetails(); return; }
    const site = droneSites.find((item) => "coverage-" + item.id === id);
    if (site) { goToDrone(site); return; }
    const index = stops.findIndex((_, index) => stopId(index) === id);
    if (id === routeStartId || index >= 0) {
      const point = id === routeStartId ? start : stops[index].point;
      if (pick !== null && point) choosePoint(point);
      else showRouteDetails();
      return;
    }
    const event = events.find((candidate) => candidate.id === id);
    if (!event) return;
    const point = siteEndpoint(event);
    if (pick !== null && point) {
      choosePoint(point);
      return;
    }
    setSelectedId(id);
    read(event);
  };
  const planTo = (id: string) => {
    const event = events.find((candidate) => candidate.id === id);
    const point = event && siteEndpoint(event);
    if (!point) return;
    if (pick !== null) choosePoint(point);
    else { addStop(point); setPick(start ? null : "start"); }
    setSelectedId(id);
    showRouteDetails();
  };
  const [elevationAt, setElevationAt] = useState<((lat: number, lon: number) => number | null) | null>(null);
  useEffect(() => {
    const entry = manifest?.layers.find((l) => l.file.endsWith(".f32"));
    if (entry) loadMolaElevation(entry).then((f) => setElevationAt(() => f), () => setElevationAt(null));
  }, [manifest]);
  const position = current?.point ?? start;
  const localOffsets = start && position ? relativeToLander(start, position, elevationAt?.(start.lat, start.lon) ?? null,
    elevationAt?.(position.lat, position.lon) ?? null) : null;

  const goTo = useCallback((event: CatalogEvent) => {
    if (!event.location) return;
    setSelectedId(event.id);
    const zoom = mode === "3d" && insideMarswalkCoverage(event.location) ? 100_000
      : mode === "3d" && nearGale(event.location) ? 6_000
      : zoomForPrecision(event.location.precision, event.location.precision === "regional" ? event.location.footprintKm : null);
    flyTo({ lat: event.location.lat, lon: event.location.lon, zoom });
  }, [mode, flyTo]);
  const goToDrone = (site: typeof droneSites[number]) => {
    setWebglIssue(null); setMode("3d");
    flyTo({ ...droneCenter(site), zoom: site.zoom });
  };
  useEffect(() => {
    if (!showCoverage) return;
    let live = true;
    const refresh = () => {
      void listSavedDroneWindows().then((packs) => { if (live) setSavedDronePacks(packs); }, () => {});
    };
    refresh();
    window.addEventListener("martian-map:drone-area-saved", refresh);
    return () => { live = false; window.removeEventListener("martian-map:drone-area-saved", refresh); };
  }, [showCoverage]);

  // A shared link selects and centres its site once the catalog has loaded.
  useEffect(() => {
    if (initial.plan || !initial.site || !data) return;
    const event = allEvents.find((e) => e.id === initial.site);
    if (event) { if (event.location) goTo(event); setCardId(event.id); setTab("card"); }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the hash shareable without adding history entries.
  useEffect(() => {
    const query = new URLSearchParams();
    if (selectedId) query.set("site", selectedId);
    if (displayedPlan) query.set("plan", JSON.stringify({ ...displayedPlan, data: savedTerrain }));
    if (mode === "2d") query.set("mode", "2d");
    const visible = Object.entries(layerState).filter(([, s]) => s.visible).map(([id]) => id);
    if (visible.length) query.set("layers", visible.join(","));
    if (basemapId) query.set("base", basemapId);
    if (tab === "layers" || tab === "marswalk") query.set("tab", tab);
    const next = `#/explore${query.size ? `?${query}` : ""}`;
    if (window.location.hash !== next) window.history.replaceState(null, "", next);
  }, [selectedId, mode, layerState, basemapId, tab, displayedPlan, savedTerrain]);

  const cardEvent = allEvents.find((e) => e.id === cardId) ?? null;
  const threeD = mode === "3d" && !webglIssue;
  const switchView = () => { setWebglIssue(null); setMode(threeD ? "2d" : "3d"); };
  const clock = marsAt(utc, view);
  return (
    <div className="app explorer" onKeyDown={(event) => {
      if (event.key === "Escape") {
        if (routeToolsOpen) { event.preventDefault(); closeRouteTools(); }
        else if (routeMenu) { event.preventDefault(); setRouteMenu(null); }
        else if (pick !== null) { event.preventDefault(); setPick(null); }
        else if (panelOpen && event.target instanceof Element && event.target.closest("#explorer-panel")) {
          event.preventDefault();
          togglePanel(false);
        }
      }
    }}>
      <header className="topbar explorer__topbar">
        <button type="button" className="brand explorer__brand" onClick={onHome} aria-label="Martian Map, back to the intro page">
          {nasaInsignia ? <img src={nasaInsignia} className="explorer__brand-mark" alt="NASA" /> : <small className="explorer__brand-mark">NASA</small>}
          <div className="explorer__wordmark">
            <strong className="explorer__brand-title" aria-hidden="true">Martian Map</strong>
            <small>Bedrock to Redrock</small>
          </div>
        </button>
        <div className="explorer__search-help">{data && <SearchBox events={events} unlocated={unlocated} onGo={(event) => {
          const point = siteEndpoint(event);
          if (pick !== null && point) choosePoint(point); else goTo(event);
        }} onRead={read} onRoute={planTo} routeLabel={pick === "start" ? "Set lander" : typeof pick === "number" ? "Replace stop"
          : pick === "position" ? "Set crew position" : pick === "block" ? "Mark blocked cell" : "Add stop"} />}
        <ExplorerHelp /></div>
      </header>
      <section className="explorer-toolbar" aria-label="Explorer toolbar">
        <div className="explorer-toolbar__actions" role="group" aria-label="Map tools">
          <button type="button" className="btn" aria-pressed={panelOpen && (tab === "catalog" || tab === "card")}
            onClick={() => openPanel("catalog")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4h14l-3 4 3 4H5" /></svg>Discover</button>
          <button type="button" className="btn" aria-pressed={panelOpen && tab === "layers"}
            onClick={() => openPanel("layers")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></svg>Layers</button>
          <button type="button" className="btn explorer-toolbar__solar" aria-pressed={solar} onClick={() => setSolar(!solar)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>
            {solar ? "Day & night" : "Fully lit"}
          </button>
          <button type="button" className="btn explorer-toolbar__directions" aria-pressed={panelOpen && tab === "marswalk"}
            onClick={() => {
              if (panelOpen && tab === "marswalk") setPick(null);
              openPanel("marswalk");
            }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 18-8-8 18-2-8z" /></svg>
            Directions
          </button>
          <button type="button" className="btn" onClick={() => { setRouteMenu(null); flyTo(planetView); }}>Reset view</button>
        </div>
      </section>
      <main ref={workspace} className={`workspace explorer__workspace${panelOpen ? "" : " explorer__workspace--wide"}`}
        style={{ "--explorer-panel-width": `${panelDrag.current?.sheet === false && panelDragSize !== null ? panelDragSize : panelWidth}px`,
          "--explorer-sheet-height": `${panelDrag.current?.sheet && panelDragSize !== null ? panelDragSize : sheetHeight}px` } as CSSProperties}>
        <section className={`stage${pick !== null ? " stage--picking" : ""}`} aria-label="Mars map">
          {!basemap && <div className="loading" role="status"><span className="spinner" aria-hidden="true" />Loading the Mars basemap…</div>}
          {basemap?.error && <div className="loading" role="alert">The basemap image could not be loaded. Check that the app was started from the project folder, then reload.</div>}
          {fineBasemap?.error && basemap?.image && <p className="map-banner map-banner--warn" role="status">The selected basemap did not load. Showing Viking overview imagery.</p>}
          {basemap?.image && (threeD ? (
            <Suspense fallback={<div className="loading" role="status"><span className="spinner" aria-hidden="true" />Loading the 3D globe…</div>}>
              <Globe3D basemap={basemap.image} droneBasemap={natural ? basemap.image : fastBasemap?.image ?? null} overlays={overlays} markers={markers} selectedId={selectedId} onSelect={chooseMarker}
                paths={mapPaths} switchView={switchView} replayPoints={replayPoints} earthWalkPose={earthWalk.pose}
                sunPoint={subsolar} onPick={chooseOnMap} onRoute={planTo} elevationAt={elevationAt}
                onRouteClick={paths.length ? tapRoute : undefined} onRouteHover={paths.length ? hoverRoute : undefined}
                view={view} onViewChange={setView} flySignal={flySignal} flyTarget={flyTarget.current}
                tiles={tiles} naturalColor={natural}
                onFlightStart={() => { setPanelOpen(false); setRouteMenu(null); setRouteToolsOpen(false); setPick(null); }}
                onUnavailable={(detail) => { earthWalk.stop(); setWebglIssue(detail); setMode("2d"); }} />
            </Suspense>
          ) : (
            <GlobeMap2D basemap={basemap.image} overlays={overlays} markers={markers} selectedId={selectedId} onSelect={chooseMarker}
              paths={mapPaths} switchView={switchView} sunPoint={subsolar} onPick={chooseOnMap} onRoute={planTo}
              onRouteClick={paths.length ? tapRoute : undefined} onRouteHover={paths.length ? hoverRoute : undefined}
              view={view} onViewChange={setView} flySignal={flySignal} flyTarget={flyTarget.current} tiles={tiles} elevationAt={elevationAt} />
          ))}
          <div className="mars-clock" aria-label="Live Mars time at the map center" title="Local true solar time at the map center">
            <strong>{clock.time}</strong>
            <span>SOL {clock.sol} · LTST</span>
            <time dateTime={new Date(utc).toISOString()}>{new Date(utc).toISOString().slice(0, 19).replace("T", " ")} UTC</time>
          </div>
          <p className="explorer-credit">{basemapEntry?.title ?? "Viking Orbiter global color mosaic"} · {basemapEntry?.credit ?? "NASA/JPL-Caltech/USGS"}</p>
          <EarthWalkControls walk={earthWalk} speed={mission.speed} exit={() => { earthWalk.stop(); showRouteDetails(); }} recenter={() => {
            earthWalk.recenter();
            if (earthWalk.pose) centerEarthWalk(earthWalk.pose.point);
          }} />
          {!routeToolsOpen && !earthWalk.session && (pick !== null || !panelOpen || tab !== "marswalk") &&
            <MapRouteControls pick={pick} legs={legs} summary={routeSummary}
              onCancel={() => setPick(null)} onDetails={showRouteDetails} onFit={fit}
              onStart={earthWalk.eligible ? () => setEarthWalkSetupOpen(true) : undefined} />}
          {routeMenu && !routeToolsOpen && <div className="route-quick-menu" role="group" aria-label="Route actions"
            style={{ "--route-menu-x": `${routeMenu.point.x}px`, "--route-menu-y": `${routeMenu.point.y}px` } as CSSProperties}
            onPointerEnter={cancelMenuClose} onPointerLeave={closeMenuSoon}>
            <button className="btn btn--small" type="button" onClick={showRouteDetails}>Open details</button>
            <button className="btn btn--small" type="button" onClick={showRouteTools}>Save options</button>
          </div>}
          {routeToolsOpen && <section className="route-tools" aria-labelledby="route-tools-title">
            <header><h2 id="route-tools-title">Route tools</h2>
              <button className="btn btn--small" ref={routeToolsClose} type="button" aria-label="Close route tools" onClick={closeRouteTools}>×</button>
            </header>
            <SavedRoutes current={displayedPlan} load={loadPlan} />
          </section>}
          {webglIssue && <p className="map-banner map-banner--warn" role="alert">{webglIssue}</p>}
          {initial.invalidPlan && <p className="map-banner" role="status">This route link has invalid or unsupported inputs.</p>}
          {data && data.missing.length > 0 && <p className="map-banner map-banner--warn map-banner--top" role="alert">Not bundled in this build: {data.missing.join(" and ")}. The map still works with the basemap.</p>}
        </section>
        {!panelOpen && <button type="button" ref={expandButton} className="explorer__panel-handle explorer__panel-handle--closed"
          aria-label="Show panel" aria-expanded={false} aria-controls="explorer-panel" onClick={() => togglePanel(true)}>
          <span>{panelTitles[tab === "card" ? "catalog" : tab]}</span><span aria-hidden="true">‹</span>
        </button>}
        <aside className={`sidebar explorer__sidebar${tab === "marswalk" ? " explorer__sidebar--directions" : ""}`} id="explorer-panel" hidden={!panelOpen}>
          <button type="button" ref={collapseButton} className="explorer__panel-handle"
            aria-label="Hide panel" aria-expanded={true} aria-controls="explorer-panel" onClick={() => togglePanel(false)}>
            <span>{panelTitles[tab === "card" ? "catalog" : tab]}</span><span aria-hidden="true">›</span>
          </button>
          <div className="explorer__resize-panel" role="separator" tabIndex={0} aria-label="Resize side panel"
            aria-controls="explorer-panel" aria-orientation="vertical"
            aria-valuemin={0} aria-valuemax={maxPanelWidth} aria-valuenow={panelDragSize ?? panelWidth}
            aria-valuetext={`${panelWidth} pixels wide`}
            title="Drag to resize the side panel"
            {...handleResize(false)}
            onKeyDown={(event) => {
              const widths: Record<string, number> = {
                ArrowLeft: panelWidth + 24,
                ArrowRight: panelWidth - 24,
                Home: 0,
                End: maxPanelWidth,
              };
              if (event.key === "Enter" || event.key === "Home" || (event.key === "ArrowRight" && panelWidth === MIN_PANEL_WIDTH)) {
                event.preventDefault();
                togglePanel(false);
              } else if (Object.hasOwn(widths, event.key)) {
                event.preventDefault();
                setPreferredPanelWidth(clampPanelWidth(widths[event.key]));
              }
            }} />
          <div className="explorer__resize-sheet" role="separator" tabIndex={0} aria-label="Resize bottom panel"
            aria-controls="explorer-panel" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={maxSheetHeight}
            aria-valuenow={panelDragSize ?? sheetHeight} title="Drag up to expand or down to close"
            {...handleResize(true)} onKeyDown={(event) => {
              if (!["Enter", "Home", "End", "ArrowUp", "ArrowDown"].includes(event.key)) return;
              event.preventDefault();
              if (event.key === "Enter" || event.key === "Home" || (event.key === "ArrowDown" && sheetHeight === minSheetHeight)) togglePanel(false);
              else setPreferredSheetHeight(event.key === "End" ? maxSheetHeight
                : Math.max(minSheetHeight, Math.min(maxSheetHeight, sheetHeight + (event.key === "ArrowUp" ? 36 : -36))));
            }} />
          {tab === "card" && <div className="explorer__panel-bar">
            <button type="button" className="btn explorer__back" onClick={() => setTab("catalog")}>‹ Discoveries</button>
          </div>}
          <div className="panel" role="region" aria-label={panelTitles[tab]}>
            {tab === "catalog" && <section className="discover-map-tools" aria-label="Discovery map controls">
              <div className="discover-map-tools__toggles">
                <button type="button" className="btn" aria-pressed={showFlags} onClick={() => setShowFlags(!showFlags)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m0 1c5-5 9 4 14 0v10c-5 4-9-5-14 0" /></svg>Site flags
                  <span aria-hidden="true" className="discovery-toggle-state">{showFlags ? "On" : "Off"}</span>
                </button>
                <button type="button" className="btn" aria-pressed={showCoverage} onClick={() => setShowCoverage(!showCoverage)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M17 12a5 5 0 1 1-5-5m0 5 7-7" /><circle cx="12" cy="12" r=".6" /></svg>Drone coverage
                  <span aria-hidden="true" className="discovery-toggle-state">{showCoverage ? "On" : "Off"}</span>
                </button>
              </div>
              {showCoverage && <div className="drone-coverage">
                <p>Pan to any part of Mars and open Drone View. It searches for detailed terrain at the center and uses the global elevation where available. The links below jump to selected flyovers.</p>
                {savedDronePacks.length > 0 && <details className="drone-coverage__saved">
                  <summary>Saved flyovers ({savedDronePacks.length})</summary>
                  {savedDronePacks.map((pack) => <button key={pack.key} type="button" className="btn" onClick={() => {
                    setWebglIssue(null); setMode("3d");
                    flyTo({ lat: (pack.bounds.north + pack.bounds.south) / 2, lon: (pack.bounds.west + pack.bounds.east) / 2,
                      zoom: 350 / (pack.bounds.north - pack.bounds.south) });
                  }}>{pack.label} · {pack.spacing} m</button>)}
                </details>}
                <details className="drone-coverage__saved"><summary>Flyover shortcuts</summary>
                  {droneSites.map((site) => <button key={site.id} type="button" className="btn" onClick={() => goToDrone(site)}>{site.label} · {site.spacingM} m</button>)}
                </details>
              </div>}
            </section>}
            {tab === "catalog" && (data?.catalog
              ? <CatalogPanel catalog={data.catalog} filter={filter} setFilter={setFilter} onGo={goTo} onRead={read} visibleCount={showFlags ? catalogMarkers.length : 0} />
              : <p className="muted panel-body">{data ? "The historical catalog is not bundled in this build." : "Loading…"}</p>)}
            {tab === "card" && (cardEvent
              ? <>
                  {cardEvent.location && <div className="explorer__site-actions">
                    <button type="button" className="btn btn--small" onClick={() => goTo(cardEvent)}>Go to location</button>
                    <button type="button" className="btn btn--small btn--primary" onClick={() => planTo(cardEvent.id)}>{stops.length ? "Add stop" : "Directions from rocket"}</button>
                  </div>}
                  <EvidenceCard event={cardEvent} environment={data?.environment ?? []} onClose={() => { setSelectedId(null); setCardId(null); setTab("catalog"); }} />
                </>
              : <p className="muted panel-body">Select a flag or search for a site to read about it.</p>)}
            {tab === "layers" && (manifest
              ? <GlobalLayersPanel manifest={manifest} state={layerState} setState={(id, s) => setLayerState((m) => ({ ...m, [id]: s }))}
                    localSlope={<div className="layer slope-summary">
                      <label><input type="checkbox" checked={showSlope} onChange={(e) => setShowSlope(e.target.checked)} /> Calculated local slope</label>
                      {showSlope && <p className="muted small">{slopeLoading ? "Calculating from the terrain grids…" : slopeLayers.length
                        ? `Mount Sharp and Wildcat Ridge. Red: at least one adjoining step over ${activeSlope}°. Amber: approaching that limit. Teal: below it. Gray: no known adjoining step.`
                        : "No local elevation pack is available."} A red cell may still have a shallower approach.</p>}
                    </div>}
                    basemapId={basemapEntry?.id ?? manifest.basemap} setBasemapId={setBasemapId} failed={failedLayers}
                    retryLayer={(id) => {
                      requestedImages.current.delete(id);
                      setOverlayImages((previous) => {
                        const next = { ...previous };
                        delete next[id];
                        return next;
                      });
                      setLoadVersion((version) => version + 1);
                    }}
                    zoomToLayer={({ coverage }) => {
                      const span = Math.max(coverage.east - coverage.west, coverage.north - coverage.south);
                      const height = workspace.current?.querySelector(".stage")?.clientHeight ?? 400;
                      flyTo({ lat: (coverage.north + coverage.south) / 2, lon: (coverage.west + coverage.east) / 2,
                        zoom: Math.max(5, height / span * .7) });
                    }} />
              : <p className="muted panel-body">{data ? "The layer manifest is not bundled in this build; only the default basemap is shown." : "Loading…"}</p>)}
            {tab === "marswalk" && <Directions start={start} stops={stops} returning={returning} setReturning={(value) => { setReturning(value); setPreviewLeg(null); }}
              events={events} selectEndpoint={selectEndpoint} onDemo={loadEarthWalkDemo} onSave={showRouteTools}
              onStart={earthWalk.eligible && !earthWalk.session && pick === null ? () => setEarthWalkSetupOpen(true) : undefined}
              walking={!!earthWalk.session} liveEligible={earthWalk.liveEligible}
              pick={pick} setPick={setPick} clearStart={() => { resetNavigation(); setStart(null); setPick("start"); }}
              clearRoute={() => { resetNavigation(); setStart(null); setStops([]); setPick(null); setRouteMenu(null); setPreviewLeg(null); }}
              remove={(index) => { setStops((previous) => previous.filter((_, order) => index !== order)); setPick(null); setPreviewLeg(null); }}
              move={(index, offset) => {
                setStops((previous) => {
                  const next = [...previous];
                  [next[index], next[index + offset]] = [next[index + offset], next[index]];
                  return next;
                });
                setPick(null); setPreviewLeg(null);
              }}
              swap={() => {
                if (!start || stops.length !== 1) return;
                resetNavigation(); setStart(stops[0].point); replaceStop(0, start); setPick(null);
              }}
              setScience={(index, scienceMinutes) => setStops((previous) => previous.map((stop, order) => index === order ? { ...stop, scienceMinutes } : stop))}
              legs={legs} slope={slope} setSlope={setSlope} fit={fit}
              weighted={weighted} setWeighted={setWeighted} mission={mission} setMission={setMission}
              retry={() => setRetry((n) => n + 1)} preview={previewLeg} setPreview={(index) => {
                setPreviewLeg(index);
                const result = index == null ? null : legs[index]?.result;
                if (result && result.status !== "ok" && result.suggestion) fitPoints(result.suggestion.preview.points, true);
              }}
              accept={(index, endpoint, point) => {
                const leg = legs[index];
                const stop = endpoint === "start" ? leg.fromStop : leg.toStop;
                if (stop !== null) replaceStop(stop, point);
                else if (endpoint === "start" && origin) { const fix = makePosition(point, "manual"); setCurrent(fix); setOrigin(fix); }
                else setStart(point);
                setPick(null); setPreviewLeg(null);
              }}
              extra={<>
                {savedTerrain !== PLAN_DATA_VERSION && <p className="small" role="status">Saved with terrain {savedTerrain}. Recalculating from the same inputs with terrain {PLAN_DATA_VERSION}. The route may change.</p>}
                <Navigation route={routeSummary.complete && !routeSummary.regional ? resolvedLegs : []} returning={returning}
                  local={legs.some(({ result }) => result?.terrain && !result.terrain.regional)} fix={() => setPick("position")}
                  report={() => setPick("block")} clear={resetNavigation} block={blocked} position={setCurrent}
                  recorded={(value) => { setCurrent(value); setOrigin(value); }} />
                {current && <p className="small muted">{current.source} fix · {new Date(current.timestamp).toLocaleTimeString()} · uncertainty {current.uncertaintyM ?? "unknown"}
                  {start ? ` · ${(greatCircleKm(start, current.point) * 1000).toFixed(0)} m from lander, ${bearingDeg(start, current.point).toFixed(0)}°` : ""}</p>}
                {localOffsets && <p className="small muted">From lander · {Math.round(localOffsets.eastM)} m east · {Math.round(localOffsets.northM)} m north
                  {localOffsets.upM !== null ? ` · ${Math.round(localOffsets.upM)} m up (global MOLA)` : " · elevation unavailable"}</p>}
                {!routeToolsOpen && <button className="btn btn--small" type="button" onClick={showRouteTools}>Saved routes</button>}
                <OfflinePacks />
              </>} />}
          </div>
          <p className="sidebar__foot small muted">Centre {formatLatLon(view, 2)} · planetocentric, east longitude</p>
        </aside>
      </main>
      <EarthWalkSetup walk={earthWalk} open={earthWalkSetupOpen} close={() => setEarthWalkSetupOpen(false)}
        distanceM={routeSummary.distanceKm * 1000} speed={mission.speed} started={() => {
        setEarthWalkSetupOpen(false);
        if (start) centerEarthWalk(start);
        setPanelOpen(false); setRouteMenu(null); setRouteToolsOpen(false); setPick(null);
      }} />
    </div>
  );
}
