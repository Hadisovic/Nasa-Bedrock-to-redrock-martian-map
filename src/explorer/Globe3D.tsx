import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { clusterScreen, formatLatLon, greatCircleKm, latLonToUnit, lonDelta, MARS_RADIUS_KM, unitToLatLon, wrapLon } from "./geo.ts";
import { createRocket, createRouteFlag, disposeMarker, setMarkerSelected } from "./markers.ts";
import type { GlobeMarker, GlobeOverlay, GlobeView, RouteMapPoint, TileSource } from "./types.ts";
import { GLOBE_FOV_DEG as FOV } from "./types.ts";
import type { LatLon } from "./geo.ts";
import { itineraryLegs, selectedLeg } from "./itinerary.ts";
import type { MapLeg } from "./itinerary.ts";
import type { CatalogEvent, EnvironmentObservation, LayerEntry } from "./catalog.ts";
import type { Endpoint, Stop } from "./missionPlan.ts";
import { useEarthWalk } from "./useEarthWalk.ts";
import { useItinerary } from "./useItinerary.ts";
import { droneCenter } from "./droneCoverage.ts";
import type { DroneTour } from "./droneCoverage.ts";
import { globeSurface, loadGaleTerrain, loadWildcatTerrain, nearWildcat } from "./galeTerrain.ts";
import type { SurfaceTerrain } from "./galeTerrain.ts";
import { nearGale } from "./galeLayout.ts";
import { MarkerButton } from "./MarkerButton.tsx";
import { FlightIcon, FlagCluster, NavigationIcon, RoverIcon } from "./icons.tsx";
import { Astronaut } from "../components/Astronaut.tsx";
import { MapControls } from "./MapControls.tsx";
import { imageBounds } from "./catalog.ts";
import { DroneControls } from "./DroneControls.tsx";
import type { FlightInput } from "./DroneControls.tsx";
import { containsTerrain, globalSource, regionalOnlineSources } from "./marsTrekTerrain.ts";
import { loadOnlineTerrain } from "./onlineTerrain.ts";
import type { OnlineTerrain } from "./onlineTerrain.ts";
import { createAtmosphere, createStarfield } from "./globeAtmosphere.ts";
import { globeTileWindow, makeGlobeTileTexture } from "./globeTiles.ts";
import { discreteOverlay } from "./overlaySampling.ts";
import { loadEarthAstronaut } from "./earthAstronaut.ts";
import { preloadRoverModel } from "./crewAssets.ts";
import type { WalkPose } from "./earthWalk.ts";

export interface Globe3DProps {
  basemap: HTMLImageElement;
  overlays: readonly GlobeOverlay[];
  markers: readonly GlobeMarker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRoute: (id: string) => void;
  view: GlobeView;
  onViewChange: (view: GlobeView) => void;
  flySignal: number;
  flyTarget?: GlobeView | null;
  idleOrbit: React.RefObject<boolean>;
  naturalColor: boolean;
  tiles: TileSource | null;
  onUnavailable: (detail: string) => void;
  onFlightStart: () => void;
  paths: readonly MapLeg[];
  tour?: DroneTour | null;
  switchView: () => void;
  mapActions?: React.ReactNode;
  routeGrid?: LayerEntry;
  routeSlope: number;
  routeSpeed: number;
  roverSlope: number;
  roverSpeed: number;
  events: readonly CatalogEvent[];
  observations: EnvironmentObservation[];
  onFlightExit: () => void;
  earthWalkPose?: WalkPose | null;
  roverPreview?: boolean;
  onRouteClick?: (point: RouteMapPoint | null) => void;
  onRouteHover?: (point: RouteMapPoint | null) => void;
  onPick?: (point: LatLon) => void;
  sunPoint?: LatLon | null;
  elevationAt?: ((lat: number, lon: number) => number | null) | null;
}

const MIN_CLEARANCE = 0.000004;
const MIN_DISTANCE = 1 + MIN_CLEARANCE;

/**
 * Map the shared zoom (screen px per degree) to a camera distance from the globe centre
 * (radius 1), so switching modes keeps a comparable scale.
 */
function distanceForZoom(zoom: number, heightPx: number): number {
  const degreesVisible = heightPx / zoom;
  const surfaceSpan = (degreesVisible * Math.PI) / 180; // in globe radii
  const d = surfaceSpan / (2 * Math.tan((FOV * Math.PI) / 360));
  return Math.min(8, Math.max(MIN_DISTANCE, 1 + d));
}
function zoomForDistance(distance: number, heightPx: number): number {
  const surfaceSpan = (distance - 1) * 2 * Math.tan((FOV * Math.PI) / 360);
  return heightPx / ((surfaceSpan * 180) / Math.PI);
}

const vec = (lat: number, lon: number, r = 1) => {
  const [x, y, z] = latLonToUnit({ lat, lon });
  return new THREE.Vector3(x * r, y * r, z * r);
};

export function Globe3D(props: Globe3DProps) {
  const { basemap, overlays, markers, selectedId, onSelect, onRoute, view, onViewChange, flySignal, onUnavailable, paths, onPick, elevationAt, sunPoint, naturalColor } = props;
  const host = useRef<HTMLDivElement>(null);
  const hitLayer = useRef<HTMLDivElement>(null);
  const geologyLabels = useRef<HTMLDivElement>(null);
  const crewSprite = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [crewModelReady, setCrewModelReady] = useState(false);
  const earthPose = useRef(props.earthWalkPose);
  const earthAstronaut = useRef<Awaited<ReturnType<typeof loadEarthAstronaut>> | null>(null);
  const [detailImagery, setDetailImagery] = useState(false);
  const [detail, setDetail] = useState<{ region: "gale" | "wildcat"; asset: SurfaceTerrain } | null>(null);
  const [tilted, setTilted] = useState(false);
  const closeRegion = nearWildcat(view, 250) && view.zoom >= 18_000 ? "wildcat"
    : nearGale(view, 2_000) && view.zoom >= 2_000 ? "gale" : null;
  const [zoomTerrain, setZoomTerrain] = useState<{ key: string; asset: OnlineTerrain } | null>(null);
  const zoomSource = regionalOnlineSources.find((source) => containsTerrain(source, view)) ?? globalSource;
  const bucket = zoomSource.span / 4;
  const snap = (amount: number, min: number, max: number) => Math.max(min + 1e-5, Math.min(max - 1e-5, Math.round(amount / bucket) * bucket));
  const zoomKey = !closeRegion && view.zoom >= 900
    ? JSON.stringify([snap(view.lat, zoomSource.south, zoomSource.north), snap(view.lon, zoomSource.west, zoomSource.east)])
    : "";
  const zoomDetail = zoomTerrain?.key === zoomKey ? zoomTerrain.asset : null;
  const activeDetail = detail && detail.region === closeRegion ? detail.asset : zoomDetail;
  const detailRef = useRef(activeDetail);
  const [drone, setDrone] = useState<{ point: LatLon; heading: number; height: number } | null>(null);
  const [flightStart, setFlightStart] = useState<Endpoint | null>(null);
  const [flightStops, setFlightStops] = useState<Stop[]>([]);
  const [flightReturning, setFlightReturning] = useState(true);
  const [flightRover, setFlightRover] = useState(false);
  const [flightPick, setFlightPick] = useState<"start" | "stop" | number | null>(null);
  const [flightFlagDestination, setFlightFlagDestination] = useState<Endpoint | null>(null);
  const flightSlope = flightRover ? props.roverSlope : props.routeSlope;
  const flightRequests = useMemo(() => itineraryLegs(flightStart, flightStops, flightReturning), [flightStart, flightStops, flightReturning]);
  const flightLegs = useItinerary(flightRequests, props.routeGrid, flightSlope, null, 0);
  const flightWalk = useEarthWalk(flightStart, flightStops, flightReturning, flightLegs, props.routeGrid, flightSlope,
    null, false, flightRover ? props.roverSpeed : props.routeSpeed, props.observations, props.events, flightRover, null);
  const crewPose = drone ? flightWalk.pose : props.earthWalkPose;
  const crewIsRover = drone ? flightWalk.rover : !!props.roverPreview;
  earthPose.current = crewPose;
  const flightFailure = flightLegs.find(({ result }) => result && (result.status !== "ok" || result.terrain.regional))?.result;
  const hasFlightTerrain = (point: LatLon) => Number.isFinite(activeDetail?.sample(point));
  const commitFlightStop = (point: Endpoint, index?: number) => {
    setFlightStops((previous) => {
      if (index === undefined && previous.length >= 8) return previous;
      const stop = { point: { ...point, name: point.name ?? formatLatLon(point, 5) }, scienceMinutes: 0 };
      return index === undefined ? [...previous, stop] : previous.map((item, i) => i === index ? stop : item);
    });
    setFlightPick(null);
    setFlightFlagDestination(null);
    setFlightFlagGroup([]);
    setTourStop(null);
    setGeologyUnit(null);
    setTourOpen(true);
    setNotice("");
  };
  const placeFlightPoint = (point: Endpoint, catalogFlag = false) => {
    if (!hasFlightTerrain(point) || (!catalogFlag && !activeDetail?.verifiedImagery?.(point))) {
      setNotice("Choose a point inside this terrain pack."); return;
    }
    if (flightPick === "start") {
      setFlightStart({ ...point, name: "Lander" });
      if (flightFlagDestination) commitFlightStop(flightFlagDestination);
      else setFlightPick("stop");
    } else if (flightPick !== null) {
      commitFlightStop(point, typeof flightPick === "number" ? flightPick : undefined);
    }
    setNotice("");
  };
  const flagEndpoint = (id: string): Endpoint | null => {
    const event = props.events.find((item) => item.id === id);
    return event?.location ? { ...event.location, name: event.title } : null;
  };
  const routeFlightFlag = (id: string) => {
    const point = flagEndpoint(id);
    if (!point || !hasFlightTerrain(point)) { setNotice("This flag is outside the detailed routing coverage."); return; }
    if (flightStops.length >= 8) { setNotice("Remove a stop before adding another flag."); return; }
    if (flightStart) commitFlightStop(point);
    else {
      setFlightFlagDestination(point);
      setFlightPick("start");
      setFlightFlagGroup([]);
      setTourStop(null);
      setTourOpen(false);
      setNotice("");
    }
  };
  const [notice, setNotice] = useState("");
  const [arrivedSignal, setArrivedSignal] = useState<number | null>(null);
  const startedTour = useRef(0);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStop, setTourStop] = useState<string | null>(null);
  const [flightFlagGroup, setFlightFlagGroup] = useState<readonly GlobeMarker[]>([]);
  const [geologyOn, setGeologyOn] = useState(true);
  const [geologyUnit, setGeologyUnit] = useState<number | null>(null);
  const [geologyTexture, setGeologyTexture] = useState<{ region: string; map: THREE.Texture } | null>(null);
  const droneRef = useRef(drone);
  const droneInput = useRef<FlightInput>({ forward: 0, slide: 0, turn: 0, rise: 0 });
  const droneLook = useRef(0.5);
  const [rotationHintDismissed, setRotationHintDismissed] = useState(false);
  const lastDroneReport = useRef(0);
  const sunRef = useRef(sunPoint);
  sunRef.current = sunPoint;
  const naturalColorRef = useRef(naturalColor);
  naturalColorRef.current = naturalColor;
  const compass = useRef<SVGGElement>(null);
  const touchTilt = useRef(0);
  const closeFlight = () => {
    flightWalk.stop();
    droneRef.current = null;
    setDrone(null);
    setTourOpen(false);
    setTourStop(null);
    setFlightFlagGroup([]);
    setFlightStart(null); setFlightStops([]); setFlightPick(null);
    setFlightFlagDestination(null); setFlightRover(false);
    setFlightReturning(true);
    setGeologyUnit(null);
  };
  useEffect(() => {
    if (!zoomKey || drone) return;
    const [lat, lon] = JSON.parse(zoomKey) as number[];
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadOnlineTerrain({ lat, lon }, controller.signal).then((asset) => {
        if (controller.signal.aborted) { asset.geometry.dispose(); asset.texture.dispose(); return; }
        setZoomTerrain({ key: zoomKey, asset });
      }, () => { /* keep the bundled global terrain */ });
    }, 320);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [zoomKey, !!drone]);
  useEffect(() => () => { zoomTerrain?.asset.geometry.dispose(); zoomTerrain?.asset.texture.dispose(); }, [zoomTerrain]);
  useEffect(() => { if (!activeDetail) closeFlight(); }, [activeDetail]);
  const setFlightPosition = (position: NonNullable<typeof drone>) => {
    const start = !droneRef.current;
    droneRef.current = position;
    const now = performance.now();
    if (start || now - lastDroneReport.current >= 80) {
      lastDroneReport.current = now;
      setDrone(position);
    }
  };
  const enterDrone = (point: LatLon, region: "wildcat" | "gale") => {
    props.onFlightStart();
    void preloadRoverModel().catch(() => { /* Rover preview can retry the local asset. */ });
    droneLook.current = region === "wildcat" ? 1.12 : 0.74;
    setRotationHintDismissed(false);
    // Frame the catalogued Mary Anning and Groken drill sites southwest of the Gale start.
    setFlightPosition({ point, heading: region === "gale" ? 226 : 0,
      height: region === "wildcat" ? 225 : 1380 });
    setNotice("");
    setTourOpen(false);
    setGeologyOn(true);
    host.current?.focus();
  };
  useEffect(() => {
    const tour = props.tour;
    if (!tour || arrivedSignal !== flySignal || startedTour.current === flySignal ||
      detail?.region !== tour.site.id || closeRegion !== tour.site.id) return;
    const center = droneCenter(tour.site);
    if (!Number.isFinite(detail.asset.sample(center)) || !detail.asset.verifiedImagery?.(center)) {
      setNotice("This flyover is unavailable at the center of the terrain pack.");
      return;
    }
    startedTour.current = flySignal;
    enterDrone(center, tour.site.id);
  }, [arrivedSignal, flySignal, props.tour, detail, closeRegion]);
  const flyingTour = drone ? props.tour : null;
  const geologyRegion = flyingTour?.site.id;
  useEffect(() => {
    if (!geologyRegion) return;
    let live = true;
    const loader = new THREE.TextureLoader();
    const map = loader.load(`./layers/regional/${geologyRegion}-geology.png`, (texture) => {
      if (!live) return;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      setGeologyTexture({ region: geologyRegion, map: texture });
    });
    return () => { live = false; map.dispose(); setGeologyTexture(null); };
  }, [geologyRegion]);
  const geologyMap = geologyOn && geologyTexture?.region === geologyRegion ? geologyTexture?.map : null;
  const activeUnit = geologyUnit === null ? null : flyingTour?.geology.labels[geologyUnit];
  const flightPaths: readonly MapLeg[] = useMemo(() => drone ? flightLegs.flatMap(({ result, returning }) => {
    if (!result || result.status !== "ok" || result.terrain.regional) return [];
    const path = selectedLeg(result, false)!;
    return [{ points: path.points, distanceKm: path.distanceKm, returning }];
  }) : paths, [!!drone, flightLegs, paths]);
  const selectedStop = flyingTour && tourStop ? props.events.find(({ id }) => id === tourStop) : undefined;
  const changeFlightHeight = (requested: number) => {
    const current = droneRef.current;
    if (!current) return;
    const height = THREE.MathUtils.clamp(requested, 8, closeRegion === "gale" ? 1450 : 350);
    if (height === current.height) return;
    setNotice("");
    setFlightPosition({ ...current, height });
  };
  const changeFlightHeightRef = useRef(changeFlightHeight);
  changeFlightHeightRef.current = changeFlightHeight;
  const moveDrone = (seconds: number) => {
    const current = droneRef.current, terrain = detailRef.current;
    const { forward, slide, turn, rise } = droneInput.current;
    if (!current || !terrain || document.hidden || !(forward || slide || turn || rise)) return;
    const heading = (current.heading + turn * 85 * seconds + 360) % 360;
    const height = THREE.MathUtils.clamp(current.height + rise * (closeRegion === "wildcat" ? 18 : 55) * seconds,
      8, closeRegion === "gale" ? 1450 : 350);
    const magnitude = Math.hypot(forward, slide);
    const distance = (closeRegion === "wildcat" ? 16 : 95) * seconds * Math.min(1, magnitude);
    const a = THREE.MathUtils.degToRad(heading) + Math.atan2(slide, forward);
    const d = THREE.MathUtils.radToDeg(distance / (MARS_RADIUS_KM * 1000));
    const sample = (fraction: number) => ({
      lat: current.point.lat + d * fraction * Math.cos(a),
      lon: wrapLon(current.point.lon + d * fraction * Math.sin(a) / Math.cos(THREE.MathUtils.degToRad(current.point.lat))),
    });
    // Do not step over NoData gaps on the way to an otherwise valid point.
    let point = current.point;
    const checks = Math.ceil(distance / (closeRegion === "wildcat" ? 0.5 : 5));
    let boundary = false;
    for (let i = 1; i <= checks; i++) {
      const next = sample(i / checks);
      if (!Number.isFinite(terrain.sample(next)) || !terrain.verifiedImagery?.(next)) {
        boundary = true;
        break;
      }
      point = next;
    }
    setNotice(boundary ? "Verified imagery or elevation ends here. Turn back to keep flying." : "");
    setFlightPosition({ point, heading, height });
  };
  const moveDroneRef = useRef(moveDrone);
  moveDroneRef.current = moveDrone;
  detailRef.current = activeDetail;
  const tiltRef = useRef(false);
  tiltRef.current = tilted && !!activeDetail;
  const elevationRef = useRef(elevationAt);
  elevationRef.current = elevationAt;
  const surface = (point: LatLon, lift = 0) => {
    const height = detailRef.current?.sample(point);
    // Use the datum-relative elevation for the relief, with a render offset to keep it above the unit sphere.
    return globeSurface(point, (height ?? (elevationRef.current?.(point.lat, point.lon) ?? 0)) + 9_000 + lift);
  };
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  const [clusters, setClusters] = useState<{ id: string; members: GlobeMarker[] }[]>([]);
  const markersRef = useRef(markers);
  markersRef.current = drone ? [
    ...markers.filter((marker) => marker.kind === "flag" && activeDetail?.sample(marker) != null),
    ...(flightStart ? [{ ...flightStart, id: "flight-lander", kind: "rocket" as const, label: "Drone route lander", accent: "#69d5ff", flag: false }] : []),
    ...flightStops.map(({ point }, index) => ({ ...point, id: `flight-stop-${index}`, kind: "destination" as const,
      label: `Drone route stop ${index + 1}`, order: index + 1, accent: "#ffc377", flag: false })),
  ] : markers;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const s = useRef<{
    renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; renderCamera: THREE.PerspectiveCamera; controls: OrbitControls; scene: THREE.Scene;
    overlayGroup: THREE.Group; markerGroup: THREE.Group; routeGroup: THREE.Group; globe: THREE.Mesh; relief: THREE.Group;
    baseTexture: THREE.Texture; anchors: Map<string, THREE.Vector3>;
    tileTexture: { value: THREE.Texture }; tileBounds: { value: THREE.Vector4 };
    fly: (v: GlobeView, animate: boolean, onArrival?: () => void) => void; zoomBy: (factor: number) => void; recluster: () => void;
  } | null>(null);
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const press = useRef<{ x: number; y: number; id: number } | null>(null);
  const landing = useRef<{ key: string; time: number } | null>(null);
  const hasEarthWalk = !!crewPose;
  const showCrewSprite = hasEarthWalk && !crewModelReady;
  useEffect(() => {
    const view = s.current;
    setCrewModelReady(false);
    if (!view || !hasEarthWalk) return;
    let live = true;
    void loadEarthAstronaut(crewIsRover).then((astronaut) => {
      if (!live) { astronaut.dispose(); return; }
      earthAstronaut.current = astronaut;
      view.scene.add(astronaut.model);
      setCrewModelReady(true);
    }, () => { if (live) setNotice(crewIsRover ? "The rover model could not load." : "The astronaut model could not load."); });
    return () => {
      live = false;
      earthAstronaut.current?.dispose();
      earthAstronaut.current = null;
    };
  }, [ready, hasEarthWalk, crewIsRover, !!drone]);

  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true, powerPreference: "high-performance" });
    } catch {
      onUnavailable("This browser could not start WebGL, so the 3D globe is unavailable. The flat map shows the same data.");
      return;
    }
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.domElement.setAttribute("aria-hidden", "true");
    element.prepend(renderer.domElement);
    renderer.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      onUnavailable("The 3D graphics context was lost. Showing the flat map instead.");
    });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#020306");
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.0005, 50);
    const starfield = createStarfield();
    scene.add(starfield);
    const renderCamera = camera.clone();
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.052;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.touches.TWO = null;
    controls.minDistance = MIN_DISTANCE;
    controls.maxDistance = 8;
    controls.rotateSpeed = 0.5;

    const texture = new THREE.Texture(basemap);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    texture.needsUpdate = true;
    const tileTexture = { value: texture as THREE.Texture };
    const tileBounds = { value: new THREE.Vector4(0, 0, 0, 0) };
    const globeMaterial = new THREE.MeshStandardMaterial({ map: texture, bumpMap: texture, bumpScale: .0097, roughness: .95 });
    globeMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.tileTexture = tileTexture;
      shader.uniforms.tileBounds = tileBounds;
      shader.fragmentShader = "uniform sampler2D tileTexture;\nuniform vec4 tileBounds;\n" + shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        if (tileBounds.z > tileBounds.x) {
          vec2 mosaicUv = vec2(tileBounds.x + fract(vMapUv.x - tileBounds.x), vMapUv.y);
          if (all(greaterThanEqual(mosaicUv, tileBounds.xy)) && all(lessThanEqual(mosaicUv, tileBounds.zw))) {
            vec4 detail = texture2D(tileTexture, (mosaicUv - tileBounds.xy) / (tileBounds.zw - tileBounds.xy));
            diffuseColor.rgb = mix(diffuseColor.rgb, detail.rgb, detail.a);
          }
        }`,
      );
    };
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), globeMaterial);
    scene.add(globe);
    const ambient = new THREE.HemisphereLight(0x60463b, 0x24324f, 1.45);
    const sun = new THREE.DirectionalLight(0xfff6eb, 2.7);
    const nightFill = new THREE.DirectionalLight(0x5a75a5, 1.25);
    const atmosphere = createAtmosphere();
    scene.add(ambient, sun, nightFill, atmosphere.group);
    const overlayGroup = new THREE.Group();
    const markerGroup = new THREE.Group();
    // Draw map flags after the translucent science layers.
    markerGroup.renderOrder = 100;
    const routeGroup = new THREE.Group();
    const relief = new THREE.Group();
    scene.add(overlayGroup, markerGroup, routeGroup, relief);
    const anchors = new Map<string, THREE.Vector3>();

    const heightPx = () => Math.max(1, element.clientHeight);
    let lastView: GlobeView | undefined;
    const report = () => {
      const { lat, lon } = unitToLatLon([camera.position.x, camera.position.y, camera.position.z]);
      const surfaceRadius = surfaceRef.current({ lat, lon }).length();
      const zoom = zoomForDistance(1 + Math.max(MIN_CLEARANCE, camera.position.length() - surfaceRadius), heightPx());
      if (lastView && Math.abs(lastView.lat - lat) < 1e-7 && Math.abs(lastView.lon - lon) < 1e-7 &&
          Math.abs(lastView.zoom / zoom - 1) < 0.001) return false;
      lastView = { lat, lon, zoom };
      onViewChangeRef.current(lastView);
      return true;
    };

    let flight: { from: THREE.Vector3; rotation: THREE.Quaternion; h0: number; h1: number; arc: number; duration: number; start: number; onArrival?: () => void } | null = null;
    let targetClearance: number | null = null;
    const fly = (v: GlobeView, animate: boolean, onArrival?: () => void) => {
      targetClearance = null;
      const h1 = distanceForZoom(v.zoom, heightPx()) - 1;
      const to = vec(v.lat, v.lon);
      if (!animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        flight = null;
        camera.position.copy(to.multiplyScalar(surfaceRef.current(v).length() + h1));
        controls.update();
        report();
        onArrival?.();
        return;
      }
      const from = camera.position.clone().normalize();
      const current = unitToLatLon([from.x, from.y, from.z]);
      const h0 = Math.max(MIN_CLEARANCE, camera.position.length() - surfaceRef.current(current).length());
      const turn = from.angleTo(to);
      const arc = Math.max(0, Math.min(.45, turn * .45) - Math.max(h0, h1));
      flight = { from, rotation: new THREE.Quaternion().setFromUnitVectors(from, to), h0, h1, arc,
        duration: THREE.MathUtils.lerp(620, 1800, Math.min(1, turn / 1.8)), start: performance.now(), onArrival };
    };

    // Markers keep a near-constant screen size: scale with distance to the camera.
    const tmp = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const project = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMarkers = (now: number) => {
      const width = element.clientWidth, height = element.clientHeight;
      const worldPerPxAtUnitDepth = (2 * Math.tan((FOV * Math.PI) / 360)) / Math.max(1, height);
      renderCamera.getWorldDirection(camDir).negate();
      for (const child of markerGroup.children) {
        const base = child.userData.anchor as THREE.Vector3;
        tmp.copy(renderCamera.position).sub(base);
        const depth = Math.max(0.00003, tmp.dot(camDir));
        const px = (child.userData.px as number) * (child.userData.selectedBoost ?? 1);
        const scale = Math.max(1e-7, depth * worldPerPxAtUnitDepth * px);
        child.scale.setScalar(scale);
        child.position.copy(base);
        if (child.userData.lands && landing.current && !reduceMotion.matches) {
          const remaining = Math.max(0, 1 - (now - landing.current.time) / 620);
          child.position.setLength(base.length() + scale * 3 * remaining ** 2);
        }
        // Hide markers on the far side and near the limb, where they would stick out sideways.
        child.visible = normal.copy(base).normalize().dot(tmp.normalize()) > 0.15;
        // Keep the cloth readable when looking straight down at its anchor.
        if (child.userData.flag) child.quaternion.copy(renderCamera.quaternion);
      }
      const layer = hitLayer.current;
      if (!layer) return;
      for (const child of layer.children) {
        const node = child as HTMLElement;
        const anchor = anchors.get(node.dataset.id ?? "");
        if (!anchor) { node.style.display = "none"; continue; }
        // Hide far-side markers: the surface normal must face the camera.
        tmp.copy(renderCamera.position).sub(anchor);
        const facing = normal.copy(anchor).normalize().dot(tmp.normalize());
        project.copy(anchor).project(renderCamera);
        const visible = facing > 0.15 && project.z < 1 && Math.abs(project.x) <= 1.05 && Math.abs(project.y) <= 1.05;
        const display = visible ? "" : "none";
        if (node.style.display !== display) node.style.display = display;
        // Centre the hit area on the marker body, which stands above its anchored base.
        if (visible) {
          const x = Math.round((project.x + 1) / 2 * width + Number(node.dataset.shift ?? 0));
          const y = Math.round((1 - project.y) / 2 * height - Number(node.dataset.lift ?? 0));
          const transform = `translate(${x}px, ${y}px)`;
          if (node.style.transform !== transform) node.style.transform = transform;
        }
      }
      for (const child of geologyLabels.current?.children ?? []) {
        const label = child as HTMLElement;
        const anchor = surfaceRef.current({ lat: Number(label.dataset.lat), lon: Number(label.dataset.lon) }, 1.5);
        project.copy(anchor).project(renderCamera);
        const visible = project.z > -1 && project.z < 1 && Math.abs(project.x) <= 0.87 && Math.abs(project.y) <= 0.8;
        label.hidden = !visible;
        if (visible) {
          const transform = `translate(${Math.round((project.x + 1) / 2 * width)}px, ${Math.round((1 - project.y) / 2 * height)}px)`;
          if (label.style.transform !== transform) label.style.transform = transform;
        }
      }
    };

    // Cluster markers in screen space whenever the zoom changes enough.
    let lastClusterKey = "";
    const recluster = () => {
      const width = element.clientWidth, height = element.clientHeight;
      if (!width) return;
      const items = markersRef.current.map((m) => {
        const anchor = surfaceRef.current(m);
        const p = anchor.clone().project(renderCamera);
        return { item: m, x: (p.x + 1) / 2 * width, y: (1 - p.y) / 2 * height, anchor };
      }).filter((e) => {
        return e.x > -48 && e.x < width + 48 && e.y > -48 && e.y < height + 48 &&
          e.anchor.dot(tmp.copy(renderCamera.position).sub(e.anchor).normalize()) > 0.05;
      }).sort((a, b) => a.item.id.localeCompare(b.item.id));
      const separate = (m: GlobeMarker) => m.id === selectedRef.current || m.kind !== "flag";
      const selected = items.filter((e) => separate(e.item));
      const others = items.filter((e) => !separate(e.item));
      const groups = [...clusterScreen(others, 34, (m) => m.id), ...selected.map((e) => ({ id: e.item.id, x: e.x, y: e.y, members: [e.item] }))];
      const key = groups.map((g) => g.members.map((m) => `${m.id}:${m.lat}:${m.lon}:${m.label}`).join(";")).join(",");
      if (key === lastClusterKey) return;
      lastClusterKey = key;
      setClusters(groups.map((g) => ({ id: g.id, members: g.members })));
    };

    let frame = 0;
    let lastReport = 0;
    let previousDetail = detailRef.current;
    let lastFrame = 0;
    let tiltAmount = 0;
    let clusterTilt = 0;
    const cameraUp = new THREE.Vector3();
    const target = new THREE.Vector3();
    const flightDirection = new THREE.Vector3();
    const flightRotation = new THREE.Quaternion();
    const north = new THREE.Vector3();
    const inverseCamera = new THREE.Quaternion();
    const sunPosition = new THREE.Vector3();
    const viewLight = new THREE.Vector3();
    const atlasSky = new THREE.Color(0xd6ad98);
    const solarSky = new THREE.Color(0x60463b);
    const atlasGround = new THREE.Color(0x7688a5);
    const solarGround = new THREE.Color(0x24324f);
    let atlasMix = sunRef.current ? 0 : 1;
    let smoothPoint: LatLon | null = null;
    const orbitAxis = new THREE.Vector3(0, 1, 0);
    const orbitRadiansPerSecond = THREE.MathUtils.degToRad(.32);
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const frameMs = lastFrame ? Math.min(48, now - lastFrame) : 16;
      lastFrame = now;
      moveDroneRef.current(frameMs / 1000);
      if (flight) {
        const t = Math.min(1, (now - flight.start) / flight.duration);
        const e = t * t * (3 - 2 * t);
        flightDirection.copy(flight.from).applyQuaternion(flightRotation.identity().slerp(flight.rotation, e));
        const clearance = Math.exp(THREE.MathUtils.lerp(Math.log(flight.h0), Math.log(flight.h1), e)) + flight.arc * Math.sin(Math.PI * e) ** 2;
        const location = unitToLatLon([flightDirection.x, flightDirection.y, flightDirection.z]);
        camera.position.copy(flightDirection.multiplyScalar(surfaceRef.current(location).length() + clearance));
        if (t >= 1) {
          const onArrival = flight.onArrival;
          flight = null;
          report();
          onArrival?.();
        }
      }
      const pose = earthPose.current;
      const idling = props.idleOrbit.current && !flight && !pose && !droneRef.current && !reduceMotion.matches && !document.hidden;
      if (idling) {
        const seconds = frameMs / 1000;
        camera.position.applyAxisAngle(orbitAxis, orbitRadiansPerSecond * seconds);
        starfield.material.uniforms.twinkleTime.value += seconds;
      }
      if (pose) {
        const factor = reduceMotion.matches ? 1 : 1 - Math.exp(-frameMs / 140);
        if (!smoothPoint) smoothPoint = { ...pose.point };
        smoothPoint.lat = THREE.MathUtils.lerp(smoothPoint.lat, pose.point.lat, factor);
        smoothPoint.lon = wrapLon(smoothPoint.lon + lonDelta(smoothPoint.lon, pose.point.lon) * factor);
        if (!flight && !droneRef.current) {
          const location = unitToLatLon([camera.position.x, camera.position.y, camera.position.z]);
          const altitude = Math.max(MIN_CLEARANCE, camera.position.length() - surfaceRef.current(location).length());
          const anchor = surfaceRef.current(smoothPoint);
          camera.position.copy(anchor).setLength(anchor.length() + altitude);
        }
      } else smoothPoint = null;
      // Rotation slows as the camera gets close, so the surface does not race past.
      const center = unitToLatLon([camera.position.x, camera.position.y, camera.position.z]);
      const surfaceRadius = surfaceRef.current(center).length();
      if (previousDetail !== detailRef.current && !flight) {
        const oldHeight = previousDetail?.sample(center) ?? elevationRef.current?.(center.lat, center.lon) ?? 0;
        const oldRadius = globeSurface(center, oldHeight + 9_000).length();
        camera.position.setLength(surfaceRadius + Math.max(MIN_CLEARANCE, camera.position.length() - oldRadius));
      }
      previousDetail = detailRef.current;
      const canDescend = !!previousDetail || nearWildcat(center, 1000) || nearGale(center, 10_000);
      const floor = canDescend ? MIN_CLEARANCE : 0.00003;
      if (targetClearance !== null && !flight) {
        const current = Math.max(MIN_CLEARANCE, camera.position.length() - surfaceRadius);
        const desired = THREE.MathUtils.clamp(targetClearance, floor, 8 - surfaceRadius);
        const next = reduceMotion.matches ? desired : Math.exp(THREE.MathUtils.lerp(Math.log(current), Math.log(desired), 1 - Math.exp(-frameMs / 70)));
        camera.position.setLength(surfaceRadius + next);
        if (Math.abs(next / desired - 1) < 0.001) targetClearance = null;
      }
      controls.minDistance = surfaceRadius + floor;
      controls.rotateSpeed = Math.min(0.65, Math.max(0.00002, 0.65 * (camera.position.length() - surfaceRadius)));
      controls.enableDamping = !reduceMotion.matches;
      controls.dampingFactor = 1 - Math.pow(1 - 0.052, frameMs / (1000 / 60));
      controls.enabled = !droneRef.current;
      controls.update();
      const targetTilt = detailRef.current ? pose?.tilt ?? ((tiltRef.current ? 0.58 : 0) + touchTilt.current) : 0;
      tiltAmount = reduceMotion.matches ? targetTilt : THREE.MathUtils.lerp(tiltAmount, targetTilt, 0.17);
      const clearance = camera.position.length() - surfaceRadius;
      renderCamera.position.copy(camera.position);
      renderCamera.quaternion.copy(camera.quaternion);
      if (Math.abs(tiltAmount) > 0.001) {
        cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
        target.copy(camera.position).setLength(surfaceRadius);
        renderCamera.position.setLength(surfaceRadius + clearance * Math.cos(tiltAmount))
          .addScaledVector(cameraUp, -clearance * Math.sin(tiltAmount));
        renderCamera.lookAt(target);
      }
      const flying = droneRef.current;
      atmosphere.group.visible = !flying && clearance > .075 && naturalColorRef.current;
      starfield.visible = !!flying || clearance > .035;
      globe.visible = !flying;
      if (flying) {
        const { point, heading, height } = flying;
        const up = vec(point.lat, point.lon);
        const north = vec(point.lat + 0.0001, point.lon).sub(up).normalize();
        const east = vec(point.lat, point.lon + 0.0001).sub(up).normalize();
        const a = THREE.MathUtils.degToRad(heading);
        renderCamera.position.copy(surfaceRef.current(point, height));
        renderCamera.up.copy(up);
        renderCamera.lookAt(north.multiplyScalar(Math.cos(a)).addScaledVector(east, Math.sin(a))
          .addScaledVector(up, -Math.tan(droneLook.current)).add(renderCamera.position));
      } else renderCamera.up.set(0, 1, 0);
      renderCamera.updateMatrixWorld();
      if (pose && smoothPoint) earthAstronaut.current?.update(pose, smoothPoint, frameMs / 1000, renderCamera, heightPx(), surfaceRef.current);
      const crew = crewSprite.current;
      if (crew && smoothPoint && pose) {
        const anchor = surfaceRef.current(smoothPoint, 1);
        project.copy(anchor).project(renderCamera);
        crew.hidden = project.z < -1 || project.z > 1 || Math.abs(project.x) > 1 || Math.abs(project.y) > 1;
        if (!crew.hidden) crew.style.transform = `translate3d(${(project.x + 1) * element.clientWidth / 2}px,${(1 - project.y) * heightPx() / 2}px,0) translate(-50%,-100%)`;
      }
      for (const patch of relief.children) {
        const normal = patch.userData.surfaceNormal as THREE.Vector3;
        patch.visible = normal.dot(renderCamera.position) > .99;
      }
      if (compass.current) {
        const lat = THREE.MathUtils.degToRad(center.lat), lon = THREE.MathUtils.degToRad(center.lon);
        north.set(-Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon))
          .applyQuaternion(inverseCamera.copy(renderCamera.quaternion).invert());
        compass.current.setAttribute("transform", `rotate(${flying ? -flying.heading : Math.atan2(north.x, north.y) * 180 / Math.PI} 36 36)`);
      }
      const solar = sunRef.current;
      const targetLight = solar ? 0 : 1;
      atlasMix = reduceMotion.matches ? targetLight : THREE.MathUtils.lerp(atlasMix, targetLight, 1 - Math.exp(-frameMs / 180));
      viewLight.copy(camera.position).normalize().addScaledVector(camera.up, .45);
      viewLight.x -= .35;
      if (solar) sunPosition.copy(vec(solar.lat, solar.lon));
      else sunPosition.copy(viewLight).normalize();
      sun.position.copy(sunPosition).multiplyScalar(6);
      nightFill.position.copy(sunPosition).multiplyScalar(-5).addScaledVector(camera.up, -.5);
      const atlas = naturalColorRef.current ? atlasMix : 0;
      ambient.intensity = THREE.MathUtils.lerp(1.45, 2.65, atlas);
      ambient.color.lerpColors(solarSky, atlasSky, atlas);
      ambient.groundColor.lerpColors(solarGround, atlasGround, atlas);
      sun.intensity = THREE.MathUtils.lerp(2.7, 2.35, atlas);
      nightFill.intensity = THREE.MathUtils.lerp(1.25, .7, atlas);
      const scientificColor = !naturalColorRef.current && !solar;
      if (globeMaterial.toneMapped === scientificColor) {
        globeMaterial.toneMapped = !scientificColor;
        globeMaterial.needsUpdate = true;
      }
      globeMaterial.bumpScale = naturalColorRef.current && !flying ? .0097 : 0;
      if (scientificColor) {
        ambient.intensity = Math.PI;
        ambient.color.set(0xffffff);
        ambient.groundColor.set(0xffffff);
        sun.intensity = 0;
        nightFill.intensity = 0;
      }
      atmosphere.sunDirection.value.copy(sunPosition);
      atmosphere.atlasLighting.value = atlasMix;
      const near = Math.max(0.0000002, (flying ? flying.height / (MARS_RADIUS_KM * 1000) : clearance) * 0.1);
      if (Math.abs(renderCamera.near / near - 1) > 0.01) { renderCamera.near = near; renderCamera.updateProjectionMatrix(); }
      updateMarkers(now);
      renderer.render(scene, renderCamera);
      if (now - lastReport > (idling ? 350 : 100) && !flight) {
        lastReport = now;
        if (flying || report() || Math.abs(clusterTilt - tiltAmount) > .02) {
          recluster();
          clusterTilt = tiltAmount;
        }
      }
    };
    const zoomBy = (factor: number) => {
      if (droneRef.current) {
        changeFlightHeightRef.current(droneRef.current.height * factor);
        return;
      }
      flight = null;
      const position = camera.position;
      const point = unitToLatLon([position.x, position.y, position.z]);
      const radius = surfaceRef.current(point).length();
      const min = detailRef.current || nearWildcat(point, 1000) || nearGale(point, 10_000) ? MIN_CLEARANCE : 0.00003;
      targetClearance = THREE.MathUtils.clamp((targetClearance ?? Math.max(min, position.length() - radius)) * factor, min, 8 - radius);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? heightPx() : 1);
      zoomBy(Math.exp(THREE.MathUtils.clamp(pixels * 0.0012, -0.65, 0.65)));
    };
    const touches = new Map<number, THREE.Vector2>();
    const touchDy = new Map<number, number>();
    let drag: { id: number; x: number; y: number } | null = null;
    const onTouchStart = (event: PointerEvent) => {
      flight = null;
      targetClearance = null;
      if (event.pointerType === "touch") touches.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
      if (droneRef.current && event.button === 0) {
        if (touches.size < 2) drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        else drag = null;
        canvas.setPointerCapture(event.pointerId);
      }
    };
    const onTouchMove = (event: PointerEvent) => {
      const current = droneRef.current;
      if (current && drag?.id === event.pointerId) {
        const heading = (current.heading - (event.clientX - drag.x) * 0.26 + 360) % 360;
        droneLook.current = THREE.MathUtils.clamp(droneLook.current + (event.clientY - drag.y) * 0.006, -0.2, 1.55);
        drag.x = event.clientX;
        drag.y = event.clientY;
        droneRef.current = { ...current, heading };
        setDrone(droneRef.current);
      }
      const previous = touches.get(event.pointerId);
      if (!previous) return;
      const other = [...touches.entries()].find(([id]) => id !== event.pointerId)?.[1];
      const distance = other?.distanceTo(previous);
      const dy = event.clientY - previous.y;
      const otherDy = [...touchDy.entries()].find(([id]) => id !== event.pointerId)?.[1] ?? 0;
      touchDy.set(event.pointerId, dy);
      previous.set(event.clientX, event.clientY);
      if (other && distance && touches.size === 2) {
        const span = other.distanceTo(previous);
        if (!droneRef.current && detailRef.current && dy * otherDy > 0 && Math.abs(distance - span) < 5)
          touchTilt.current = THREE.MathUtils.clamp(touchTilt.current + dy * 0.005, 0, 0.8);
        else zoomBy(distance / Math.max(1, span));
      }
    };
    const onTouchEnd = (event: PointerEvent) => {
      if (drag?.id === event.pointerId) drag = null;
      touches.delete(event.pointerId);
      touchDy.delete(event.pointerId);
    };
    const canvas = renderer.domElement;
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onTouchStart);
    canvas.addEventListener("pointermove", onTouchMove);
    canvas.addEventListener("pointerup", onTouchEnd);
    canvas.addEventListener("pointercancel", onTouchEnd);
    canvas.addEventListener("lostpointercapture", onTouchEnd);

    const resize = () => {
      const width = element.clientWidth, height = element.clientHeight;
      renderer.setSize(width, height, false);
      renderCamera.aspect = width / Math.max(1, height);
      renderCamera.updateProjectionMatrix();
      recluster();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    fly(view, false);
    frame = requestAnimationFrame(loop);
    s.current = { renderer, camera, renderCamera, controls, scene, overlayGroup, markerGroup, routeGroup, globe, relief, baseTexture: texture, tileTexture, tileBounds, anchors, fly, zoomBy, recluster };
    setReady(true);

    // Keyboard: arrows rotate, +/- zoom.
    const onKey = (event: KeyboardEvent) => {
      if (event.target !== element || droneRef.current) return;
      if (["+", "=", "-"].includes(event.key)) {
        event.preventDefault();
        zoomBy(event.key === "-" ? 1.4 : 1 / 1.4);
        return;
      }
      const { lat, lon } = unitToLatLon([camera.position.x, camera.position.y, camera.position.z]);
      const d = camera.position.length();
      const step = Math.max(0.0003, (d - controls.minDistance) * 12);
      const next: Record<string, [number, number, number]> = {
        ArrowLeft: [lat, lon - step, d], ArrowRight: [lat, lon + step, d],
        ArrowUp: [Math.min(85, lat + step), lon, d], ArrowDown: [Math.max(-85, lat - step), lon, d],
      };
      const n = next[event.key];
      if (!n) return;
      event.preventDefault();
      camera.position.copy(vec(n[0], n[1]).multiplyScalar(Math.max(controls.minDistance, n[2])));
      controls.update();
      recluster();
      report();
    };
    element.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener("keydown", onKey);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onTouchStart);
      canvas.removeEventListener("pointermove", onTouchMove);
      canvas.removeEventListener("pointerup", onTouchEnd);
      canvas.removeEventListener("pointercancel", onTouchEnd);
      canvas.removeEventListener("lostpointercapture", onTouchEnd);
      controls.dispose();
      earthAstronaut.current?.model.removeFromParent();
      if (tileTexture.value !== texture) tileTexture.value.dispose();
      markerGroup.children.forEach(disposeMarker);
      scene.remove(markerGroup);
      scene.remove(relief);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.userData.isRasterOverlay) mesh.geometry?.dispose();
        const m = mesh.material as THREE.Material | undefined;
        if (!mesh.userData.isRasterOverlay) (m as THREE.MeshLambertMaterial | undefined)?.map?.dispose();
        m?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
      s.current = null;
      setReady(false);
    };
  }, []); // The renderer survives basemap changes.

  const tileSource = props.tiles?.cors ? props.tiles : null;
  const tileView = host.current && tileSource && !drone && view.zoom >= 14
    ? globeTileWindow(tileSource, view, host.current.clientWidth, host.current.clientHeight, Math.min(window.devicePixelRatio || 1, 2))
    : null;
  const tileKey = tileView ? JSON.stringify(tileView) : "";
  useEffect(() => {
    const st = s.current;
    if (!st) return;
    const unload = () => {
      if (st.tileTexture.value !== st.baseTexture) st.tileTexture.value.dispose();
      st.tileTexture.value = st.baseTexture;
      st.tileBounds.value.set(0, 0, 0, 0);
    };
    unload();
    setDetailImagery(false);
    return unload;
  }, [ready, tileSource]);
  useEffect(() => {
    const st = s.current;
    if (!st || !tileSource || !tileKey) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void makeGlobeTileTexture(tileSource, JSON.parse(tileKey)).then((detail) => {
        if (!current || !detail) return;
        const texture = new THREE.CanvasTexture(detail.canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(st.renderer.capabilities.getMaxAnisotropy(), 8);
        if (st.tileTexture.value !== st.baseTexture) st.tileTexture.value.dispose();
        st.tileTexture.value = texture;
        st.tileBounds.value.set(...detail.bounds);
        setDetailImagery(true);
      }).catch(() => { /* Retain bundled imagery when the source is unavailable. */ });
    }, 180);
    return () => { current = false; clearTimeout(timer); };
  }, [ready, tileSource, tileKey]);

  useEffect(() => {
    const texture = s.current?.baseTexture;
    if (!texture || texture.image === basemap) return;
    texture.image = basemap;
    texture.needsUpdate = true;
  }, [basemap]);

  useEffect(() => {
    if (!flySignal || !props.flyTarget || !s.current) return;
    closeFlight();
    touchTilt.current = 0;
    setNotice(props.tour ? `Flying to ${props.tour.site.label}…` : "");
    s.current.fly(props.flyTarget, true, () => setArrivedSignal(flySignal));
  }, [flySignal, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const requestDetail = nearWildcat(view, 1_000) && view.zoom >= 4_000 ? "wildcat"
    : nearGale(view, 10_000) && view.zoom >= 850 ? "gale" : null;
  useEffect(() => {
    if (!requestDetail) return;
    let active = true;
    let asset: SurfaceTerrain | undefined;
    (requestDetail === "gale" ? loadGaleTerrain() : loadWildcatTerrain()).then((value) => {
      if (!active) { value.geometry.dispose(); value.texture.dispose(); return; }
      asset = value;
      setDetail({ region: requestDetail, asset: value });
    }, () => { if (active && props.tour?.site.id === requestDetail) setNotice("The flyover terrain could not load."); });
    return () => {
      active = false;
      asset?.geometry.dispose();
      asset?.texture.dispose();
      setDetail(null);
    };
  }, [requestDetail]);

  useEffect(() => {
    const st = s.current;
    if (!st || !elevationAt) return;
    const geometry = st.globe.geometry;
    const positions = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < positions.count; i++) {
      const point = { lat: uv.getY(i) * 180 - 90, lon: uv.getX(i) * 360 - 180 };
      const p = globeSurface(point, (elevationAt(point.lat, point.lon) ?? 0) + 9_000);
      positions.setXYZ(i, p.x, p.y, p.z);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }, [ready, elevationAt]);

  useEffect(() => {
    const st = s.current;
    if (!st || !activeDetail) return;
    const material = new THREE.MeshLambertMaterial({ map: activeDetail.texture, side: THREE.DoubleSide, toneMapped: false,
      depthFunc: THREE.AlwaysDepth, stencilWrite: true, stencilRef: 1, stencilZPass: THREE.ReplaceStencilOp });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.globalImage = { value: st.baseTexture };
      shader.uniforms.patchBounds = { value: activeDetail.uv };
      shader.uniforms.geologyMap = { value: geologyMap ?? activeDetail.texture };
      shader.uniforms.geologyVisible = { value: geologyMap ? 1 : 0 };
      shader.fragmentShader = "uniform sampler2D globalImage;\nuniform vec4 patchBounds;\nuniform sampler2D geologyMap;\nuniform float geologyVisible;\n" + shader.fragmentShader.replace(
        "#include <map_fragment>",
        `vec4 localColor = texture2D(map, vMapUv);
        vec3 globalColor = texture2D(globalImage, mix(patchBounds.xy, patchBounds.zw, vMapUv)).rgb;
        vec3 ground = mix(globalColor, localColor.rgb, localColor.a);
        ground = mix(ground, ground * vec3(1.14, 0.99, 0.86), geologyVisible);
        vec4 geology = texture2D(geologyMap, vMapUv);
        float detail = dot(ground, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb *= mix(ground, geology.rgb * (0.32 + 1.15 * detail), geology.a * geologyVisible * localColor.a);`,
      );
    };
    const patch = new THREE.Mesh(activeDetail.geometry, material);
    // Let real terrain replace the coarse surface only where the terrain mesh has triangles.
    patch.renderOrder = 2;
    const bounds = activeDetail.uv;
    patch.userData.surfaceNormal = vec((bounds.y + bounds.w) * 90 - 90, (bounds.x + bounds.z) * 180 - 180);
    st.relief.add(patch);
    return () => { patch.removeFromParent(); material.dispose(); };
  }, [ready, activeDetail, geologyMap]);

  useEffect(() => {
    const st = s.current;
    if (!st || !flightPaths.length) return;
    const lines = flightPaths.flatMap((leg, index) => {
      const back = leg.returning;
      const localLift = closeRegion === "wildcat" ? 0.7 : 5;
      const positions: number[] = [];
      const bounds = activeDetail?.uv;
      const detailStep = bounds ? Math.min((bounds.z - bounds.x) * 360, (bounds.w - bounds.y) * 180) / 256 : 0.1;
      const drape = (point: LatLon) => {
        const lift = activeDetail?.sample(point) != null ? localLift : 150;
        positions.push(...surfaceRef.current(point, lift * (back ? 1.4 : 1)).toArray());
      };
      for (const [i, to] of leg.points.entries()) {
        const from = leg.points[i - 1];
        if (from) {
          const dLon = lonDelta(from.lon, to.lon), dLat = to.lat - from.lat;
          const local = bounds && [from, to].some(({ lat, lon }) => {
            const u = (lon + 180) / 360, v = (lat + 90) / 180;
            return u >= bounds.x && u <= bounds.z && v >= bounds.y && v <= bounds.w;
          });
          // Add display vertices only. The solver geometry stays unchanged.
          const pieces = Math.min(2048, Math.ceil(Math.max(Math.abs(dLon), Math.abs(dLat)) / (local ? detailStep : 0.1)));
          for (let j = 1; j < pieces; j++) drape({ lat: from.lat + dLat * j / pieces, lon: wrapLon(from.lon + dLon * j / pieces) });
        }
        drape(to);
      }
      const geometry = new LineGeometry().setPositions(positions);
      const dash = Math.max(0.0000008, leg.distanceKm / (MARS_RADIUS_KM * 28));
      return [true, false].map((outline) => {
        const material = new LineMaterial({ color: outline ? "#0b1724" : leg.color ?? (back ? "#fff" : leg.preview ? "#ffe689" : "#69d5ff"),
          linewidth: back ? outline ? 4.4 : 2.6 : leg.selected === false ? outline ? 5 : 3 : outline ? 8 : 5, transparent: true, toneMapped: false,
          dashed: back, dashSize: dash, gapSize: dash * 0.8, depthWrite: false });
        const line = new Line2(geometry, material);
        line.userData.ignoreHit = outline || leg.preview;
        if (back) line.computeLineDistances();
        line.renderOrder = 20 + (back ? flightPaths.length : index) * 2 + (outline ? 0 : 1);
        return line;
      });
    });
    st.routeGroup.add(...lines);
    return () => {
      for (const line of lines) { line.removeFromParent(); line.material.dispose(); }
      for (const geometry of new Set(lines.map((line) => line.geometry))) geometry.dispose();
    };
  }, [ready, flightPaths, elevationAt, activeDetail, closeRegion]);

  // Both passes use the geometry that already drew the ground. Stencil selects the
  // detailed terrain only at pixels where it replaced the coarse globe.
  const overlayMeshes = useRef(new Map<string, {
    image: HTMLImageElement; texture: THREE.Texture;
    meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  }>());
  useEffect(() => {
    const entries = overlayMeshes.current;
    return () => {
      for (const { meshes, texture } of entries.values()) {
        for (const mesh of meshes) { mesh.removeFromParent(); mesh.material.dispose(); }
        texture.dispose();
      }
      entries.clear();
    };
  }, [ready, activeDetail]);

  useEffect(() => {
    const st = s.current;
    if (!st) return;
    const entries = overlayMeshes.current;
    for (const [id, entry] of entries) {
      if (overlays.some((overlay) => overlay.entry.id === id && overlay.image === entry.image)) continue;
      for (const mesh of entry.meshes) { mesh.removeFromParent(); mesh.material.dispose(); }
      entry.texture.dispose();
      entries.delete(id);
    }
    overlays.forEach((overlay, index) => {
      if (!overlay.image) return;
      let entry = entries.get(overlay.entry.id);
      if (!entry) {
        const texture = new THREE.Texture(overlay.image);
        texture.colorSpace = THREE.SRGBColorSpace;
        if (discreteOverlay(overlay.entry)) {
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.generateMipmaps = false;
        } else {
          texture.anisotropy = Math.min(st.renderer.capabilities.getMaxAnisotropy(), 8);
        }
        texture.needsUpdate = true;
        const { west, south, east, north } = imageBounds(overlay.entry);
        const rasterBounds = new THREE.Vector4((west + 180) / 360, (south + 90) / 180, (east + 180) / 360, (north + 90) / 180);
        const surfaces = activeDetail ? [st.globe.geometry, activeDetail.geometry] : [st.globe.geometry];
        const meshes = surfaces.map((geometry, surface) => {
          const frame = surface === 0 ? new THREE.Vector4(0, 0, 1, 1) : activeDetail!.uv;
          const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false,
            side: surface === 0 ? THREE.FrontSide : THREE.DoubleSide, forceSinglePass: true,
            depthWrite: false, depthFunc: THREE.EqualDepth, stencilWrite: true, stencilWriteMask: 0,
            stencilRef: surface, stencilFunc: THREE.EqualStencilFunc });
          material.onBeforeCompile = (shader) => {
            shader.uniforms.surfaceFrame = { value: frame };
            shader.uniforms.rasterBounds = { value: rasterBounds };
            shader.fragmentShader = "uniform vec4 surfaceFrame;\nuniform vec4 rasterBounds;\n" + shader.fragmentShader.replace(
              "#include <map_fragment>",
              `vec2 globalUv = mix(surfaceFrame.xy, surfaceFrame.zw, vMapUv);
              if (any(lessThan(globalUv, rasterBounds.xy)) || any(greaterThan(globalUv, rasterBounds.zw))) discard;
              vec2 rasterUv = (globalUv - rasterBounds.xy) / (rasterBounds.zw - rasterBounds.xy);
              diffuseColor *= texture2D(map, rasterUv);`,
            );
          };
          const mesh = new THREE.Mesh(geometry, material);
          mesh.userData.isRasterOverlay = true;
          st.overlayGroup.add(mesh);
          return mesh;
        });
        entry = { image: overlay.image, texture, meshes };
        entries.set(overlay.entry.id, entry);
      }
      for (const mesh of entry.meshes) {
        mesh.material.opacity = overlay.opacity;
        mesh.renderOrder = 10 + index / 100;
      }
    });
  }, [overlays, ready, activeDetail]);

  // Markers follow the clusters and stay anchored to the globe surface.
  useEffect(() => {
    const st = s.current;
    if (!st) return;
    const prior = new Map(st.markerGroup.children.map((child) => [child.name, child]));
    st.anchors.clear();
    const up = new THREE.Vector3(0, 1, 0);
    for (const cluster of clusters) {
      const first = cluster.members[0];
      let lat = first.lat, lon = first.lon;
      if (cluster.members.length > 1) {
        const sum = cluster.members.reduce((acc, m) => acc.add(vec(m.lat, m.lon)), new THREE.Vector3());
        ({ lat, lon } = unitToLatLon([sum.x, sum.y, sum.z]));
      }
      const anchor = surfaceRef.current({ lat, lon }, first.kind === "rocket" ? 2 : 1);
      st.anchors.set(cluster.id, anchor);
      if (cluster.members.length > 1 || first.order) continue;
      const existing = prior.get(first.id);
      const object = existing ?? (first.kind === "rocket" ? createRocket() : createRouteFlag(first.accent, first.kind === "flag"));
      object.name = first.id;
      prior.delete(first.id);
      const selected = first.id === selectedId;
      if (!existing || object.userData.selected !== selected) {
        setMarkerSelected(object, selected, first.accent);
        object.userData.selected = selected;
      }
      object.userData.px = first.kind === "rocket" ? 52 : first.kind === "flag" ? 44 : 34;
      object.userData.flag = first.kind !== "rocket";
      object.userData.anchor = anchor;
      object.userData.lands = first.kind === "rocket";
      if (object.userData.lands) {
        const key = `${first.lat},${first.lon}`;
        if (landing.current?.key !== key) landing.current = { key, time: performance.now() };
      }
      object.position.copy(anchor);
      object.quaternion.setFromUnitVectors(up, anchor.clone().normalize());
      if (!existing) st.markerGroup.add(object);
    }
    for (const object of prior.values()) { object.removeFromParent(); disposeMarker(object); }
  }, [clusters, selectedId, ready, elevationAt, activeDetail]);

  useEffect(() => { s.current?.recluster(); }, [markers, selectedId, ready]);

  const hitsRoute = (ray: THREE.Raycaster, tolerance: number) => {
    const st = s.current;
    if (!st || !st.routeGroup.children.length) return;
    Object.assign(ray.params, { Line2: { threshold: tolerance } });
    const line = ray.intersectObjects(st.routeGroup.children.filter((line) => !line.userData.ignoreHit), false).find((candidate) => {
      const anchor = candidate.pointOnLine ?? candidate.point;
      return anchor.dot(st.renderCamera.position.clone().sub(anchor)) > 0;
    });
    return line?.object;
  };
  const mapRay = ({ x, y }: RouteMapPoint, bounds: DOMRect) => {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x / bounds.width * 2 - 1, 1 - y / bounds.height * 2), s.current!.renderCamera);
    return ray;
  };

  return (
    <div ref={host} className={`map3d globe3d${drone ? " globe3d--flying" : ""}`} tabIndex={0} role="application"
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && onPick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onPick(view);
        }
      }}
      onPointerDown={(event) => {
        if ((drone && !flyingTour) || event.target !== s.current?.renderer.domElement || event.button !== 0) return;
        if (!event.isPrimary) { press.current = null; return; }
        press.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      }}
      onPointerCancel={() => { press.current = null; }}
      onContextMenu={(event) => { if (drone) event.preventDefault(); }}
      onPointerLeave={() => props.onRouteHover?.(null)}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse" || !props.onRouteHover) return;
        if (drone || onPick || event.buttons || !s.current || event.target !== s.current.renderer.domElement) {
          props.onRouteHover(null);
          return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        props.onRouteHover(hitsRoute(mapRay(point, bounds), 14) ? point : null);
      }}
      onPointerUp={(event) => {
        const start = press.current;
        press.current = null;
        const st = s.current;
        if ((!onPick && !props.onRouteClick && !flyingTour) || !st || !start || start.id !== event.pointerId ||
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        const ray = mapRay(point, bounds);
        if (flyingTour) {
          if (flightPick === null) return;
          const hit = ray.intersectObjects(st.relief.children.filter((surface) => surface.visible))[0]?.point;
          if (hit) placeFlightPoint(unitToLatLon([hit.x, hit.y, hit.z]));
          else setNotice("Tap the terrain to place this point.");
        } else if (onPick) {
          const hit = ray.intersectObjects(st.relief.children.filter((surface) => surface.visible))[0]?.point ?? ray.intersectObject(st.globe)[0]?.point;
          if (hit) onPick(unitToLatLon([hit.x, hit.y, hit.z]));
        } else props.onRouteClick?.(hitsRoute(ray, event.pointerType === "touch" ? 48 : 14) ? point : null);
      }}
      aria-label={drone ? "Drone View. Drag to look. Scroll or pinch to change altitude." : "Rotatable 3D globe of Mars. Drag to rotate, scroll or pinch to zoom, arrow keys rotate and plus or minus zoom."}>
      <div ref={hitLayer} className="map3d__pins">
        {clusters.map((cluster) => (
          <div key={cluster.id} data-id={cluster.id}
            data-shift={cluster.members.length === 1 && cluster.members[0].kind !== "rocket" && !cluster.members[0].order ? 14 : 0}
            data-lift={cluster.members.length > 1 || cluster.members[0].order ? 14 : cluster.members[0].kind === "rocket" ? 17 : 27}
            className={`gpin-wrap${cluster.id === selectedId ? " gpin-wrap--selected" : ""}`} style={{ display: "none" }}>
            {cluster.members.length > 1 ? (
              <button type="button" className="gpin gpin--hit gpin--cluster-hit" aria-label={`${cluster.members.length} nearby locations. ${drone ? "Read about these flags" : "Zoom in to separate them"}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  if (drone) {
                    setFlightFlagGroup(cluster.members); setGeologyUnit(null); setTourStop(null); setTourOpen(true);
                    return;
                  }
                  const st = s.current; if (!st) return;
                  const anchor = st.anchors.get(cluster.id)!;
                  const { lat, lon } = unitToLatLon([anchor.x, anchor.y, anchor.z]);
                  const height = host.current?.clientHeight ?? 600;
                  st.fly({ lat, lon, zoom: zoomForDistance(st.camera.position.length(), height) * 3 }, true);
                }}>
                <FlagCluster count={cluster.members.length} />
              </button>
            ) : (
              <MarkerButton className={`gpin gpin--hit${cluster.members[0].kind === "rocket" ? " gpin--landing" : ""}${cluster.members[0].id === selectedId ? " gpin--selected" : ""}`}
                label={cluster.members[0].label} selected={cluster.members[0].id === selectedId}
                  onSelect={() => {
                    const marker = cluster.members[0];
                    if (!drone) onSelect(marker.id);
                    else if (flightPick !== null && marker.kind === "flag") placeFlightPoint(flagEndpoint(marker.id) ?? marker, true);
                    else if (marker.kind === "flag") {
                      setFlightFlagGroup([]); setTourStop(marker.id); setGeologyUnit(null); setTourOpen(true);
                    }
                  }}
                  onRoute={cluster.members[0].kind === "flag" ? () => {
                    const { id } = cluster.members[0];
                    if (drone) routeFlightFlag(id); else onRoute(id);
                  } : undefined}>
                {cluster.members[0].order && <span className="itinerary-number">{cluster.members[0].order}</span>}
              </MarkerButton>
            )}
          </div>
        ))}
      </div>
      {showCrewSprite && <div ref={crewSprite}
        className={`map-crew-sprite${!crewIsRover && crewPose?.moving ? " map-crew-sprite--moving" : ""}`}
        role="img" aria-label={crewIsRover ? "Simulated rover" : "Simulated astronaut"}>
        {crewIsRover ? <span className="map-crew-rover"><RoverIcon /></span> : <Astronaut decorative />}</div>}
      {geologyMap && flyingTour && <div className="flight-geology-labels" ref={geologyLabels} aria-label="Mapped geology">
        {flyingTour.geology.labels.map((unit, index) => <button key={unit.title} type="button" hidden
          data-lat={unit.lat} data-lon={unit.lon} style={{ "--unit-color": unit.color } as React.CSSProperties}
          onClick={() => { setGeologyUnit(index); setTourStop(null); setTourOpen(true); }}>
          <span>{unit.title}</span>
        </button>)}
      </div>}
      <MapControls switchView={props.switchView} zoomIn={() => s.current?.zoomBy(1 / 1.6)} zoomOut={() => s.current?.zoomBy(1.6)}
        needle={compass} compassTilt={drone ? 0 : props.earthWalkPose?.tilt} flying={!!drone} extras={<>{props.mapActions}
          {activeDetail && !hasEarthWalk && <button type="button" aria-label={tilted ? "Top view" : "Tilt terrain"}
            title={tilted ? "Top view" : "Tilt terrain"} aria-pressed={tilted}
            onClick={() => { touchTilt.current = 0; setTilted(!tilted); }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17h18L15 7l-4 6-3-3-5 7Z" /></svg>
          </button>}</>} resetNorth={() => {
        const state = droneRef.current;
        if (state) setFlightPosition({ ...state, heading: 0 });
        else { setTilted(false); touchTilt.current = 0; s.current?.fly(view, true); }
      }} />
      <div className={`flight-tools${drone ? " flight-tools--flying" : ""}`}>
        {drone && <button type="button" className="btn btn--small" onClick={() => {
          closeFlight(); setNotice(""); props.onFlightExit();
        }}><FlightIcon kind="exit" /> <span>Exit Drone View</span></button>}
        {drone && <>
          {flyingTour && <button type="button" className="btn btn--small" aria-expanded={tourOpen} onClick={() => {
            if (flightFlagGroup.length || tourStop || geologyUnit !== null) {
              setFlightFlagGroup([]); setTourStop(null); setGeologyUnit(null); setTourOpen(true);
            } else setTourOpen(!tourOpen);
          }}>
            <FlightIcon kind="terrain" /> <span>Terrain &amp; route</span>
          </button>}
          {flyingTour && <button type="button" className="btn btn--small" aria-pressed={geologyOn} onClick={() => {
            setGeologyOn(!geologyOn); setGeologyUnit(null);
          }}><FlightIcon kind="geology" /> <span>Geology</span></button>}
        </>}
        {notice && <span className="badge" role="status">{notice}</span>}
      </div>
      {drone && flightPick !== null && !tourOpen && <p className="flight-pick-prompt" role="status">
        <span>{flightPick === "start" ? (flightFlagDestination ? `Place the lander to route to ${flightFlagDestination.name}.` : "Tap terrain to place the lander.")
          : typeof flightPick === "number" ? `Tap terrain or a flag to replace stop ${flightPick + 1}.` : "Tap terrain or a flag to add a stop."}</span>
        <button type="button" className="btn btn--small" onClick={() => { setFlightPick(null); setFlightFlagDestination(null); setTourOpen(true); }}>Cancel</button>
      </p>}
      {flyingTour && tourOpen && <aside className="flight-story" aria-label="Flyover guide">
        <header><h3>{selectedStop?.title ?? activeUnit?.title ?? (flightFlagGroup.length ? "Discoveries at this flag" : flyingTour.title)}</h3>
          <button type="button" className="btn btn--small" aria-label="Close flyover guide" onClick={() => setTourOpen(false)}>×</button>
        </header>
        {(!flightFlagGroup.length || selectedStop) && <p>{selectedStop?.summary ?? activeUnit?.description ?? flyingTour.description}</p>}
        {selectedStop?.found && <p>{selectedStop.found}</p>}
        {selectedStop?.location?.uncertaintyM != null && <p>Catalog location uncertainty · ±{selectedStop.location.uncertaintyM} m</p>}
        {!selectedStop && !!flightFlagGroup.length && <div className="flight-story__links">
          {flightFlagGroup.map((marker) => <button key={marker.id} type="button" className="btn btn--small"
            onClick={() => {
              if (flightPick !== null) placeFlightPoint(flagEndpoint(marker.id) ?? marker, true);
              else setTourStop(marker.id);
            }}>{marker.label}</button>)}
        </div>}
        {!selectedStop && !activeUnit && !flightFlagGroup.length && <div className="flight-story__route">
          <h4>Your route</h4>
          <p>{flightPick === "start" ? "Tap terrain to place the lander." : flightPick !== null ? "Tap terrain or a flag to set the stop."
            : `${flightStart ? "Lander set" : "Place a lander"} · ${flightStops.length} ${flightStops.length === 1 ? "stop" : "stops"}`}</p>
          <div className="mission-row">
            <button type="button" className="btn btn--small" onClick={() => { setFlightFlagDestination(null); setFlightPick("start"); setTourOpen(false); }}>{flightStart ? "Move lander" : "Place lander"}</button>
            <button type="button" className="btn btn--small" disabled={!flightStart || flightStops.length >= 8}
              onClick={() => { setFlightPick("stop"); setTourOpen(false); }}>Add stop</button>
            <button type="button" className="btn btn--small" disabled={!flightStart} onClick={() => {
              setFlightStart(null); setFlightStops([]); setFlightPick(null); setFlightFlagDestination(null);
            }}>Clear route</button>
          </div>
          {!!flightStops.length && <ol className="flight-route-stops" aria-label="Drone route stops">
            {flightStops.map(({ point }, index) => <li key={index}>
              <span>{point.name}</span>
              <div className="mission-row">
                <button type="button" className="btn btn--small" aria-label={`Replace stop ${index + 1}`}
                  onClick={() => { setFlightPick(index); setTourOpen(false); }}>Replace</button>
                <button type="button" className="btn btn--small" aria-label={`Remove stop ${index + 1}`}
                  onClick={() => setFlightStops((previous) => previous.filter((_, i) => i !== index))}>Remove</button>
              </div>
            </li>)}
          </ol>}
          <label className="itinerary-return"><input type="checkbox" checked={flightReturning}
            onChange={(event) => setFlightReturning(event.target.checked)} /> Return to lander</label>
          <div className="mission-row flight-route-modes" role="group" aria-label="Recorded travel mode">
            <button type="button" className="btn btn--small" aria-pressed={!flightRover} onClick={() => setFlightRover(false)}>
              <NavigationIcon kind="astronaut" /> Walk</button>
            <button type="button" className="btn btn--small" aria-pressed={flightRover} onClick={() => setFlightRover(true)}>
              <RoverIcon /> Rover</button>
          </div>
          {flightWalk.eligible && !flightFailure && <p>{Math.round(flightLegs.reduce((metres, { result }) =>
            metres + (selectedLeg(result, false)?.distanceKm ?? 0) * 1000, 0)).toLocaleString()} m · {flightReturning ? "Round trip" : "One way"}</p>}
          {flightLegs.some(({ result }) => !result) && <p role="status">Calculating route…</p>}
          {flightFailure && <p role="status">{flightFailure.status === "ok" ? "Choose a route inside the detailed terrain." : flightFailure.detail}</p>}
          <button type="button" className="btn btn--small" disabled={!flightWalk.eligible || !!flightFailure || !!flightWalk.session}
            onClick={() => { void flightWalk.start({ mode: "Recorded Walk" }).then((started) => { if (started) setTourOpen(false); }); }}>
            {flightRover ? "Preview rover" : "Preview walk"}</button>
        </div>}
        {activeUnit && <button type="button" className="btn btn--small" onClick={() => setGeologyUnit(null)}>Back to guide</button>}
        {selectedStop
          ? <div className="flight-story__links">
            {selectedStop.location && hasFlightTerrain(selectedStop.location) &&
              <button type="button" className="btn btn--small" onClick={() => routeFlightFlag(selectedStop.id)}>Route to this flag</button>}
            <button type="button" className="btn btn--small" onClick={() => setTourStop(null)}>{flightFlagGroup.length ? "Back to flag" : "All science stops"}</button>
            {selectedStop.evidence.slice(0, 2).map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}
          </div>
          : !activeUnit && !flightFlagGroup.length && <>
            <label>Science stop <select value="" onChange={(event) => setTourStop(event.target.value)}>
              <option value="">Choose a stop</option>
              {flyingTour.stops.map((stop) => <option key={stop.id} value={stop.id}>{stop.title}</option>)}
            </select></label>
            <div className="flight-story__links">
              <a href={flyingTour.source} target="_blank" rel="noreferrer">NASA rover traverse source</a>
              {flyingTour.reference && <a href={flyingTour.reference} target="_blank" rel="noreferrer">NASA’s 2019 proposed flyover</a>}
            </div>
          </>}
        {!selectedStop && !flightFlagGroup.length && <details className="flight-geology-info">
          <summary>What geology adds</summary>
          <p>False colors mark mapped geologic units. Tap a label for the observed materials or landforms it describes.</p>
          <div className="flight-legend">
            {geologyOn && !activeUnit && flyingTour.geology.labels.map((unit, index) => <button type="button" key={unit.title}
              onClick={() => setGeologyUnit(index)}><span style={{ background: unit.color }} />{unit.title}</button>)}
            <a href={flyingTour.geology.reference} target="_blank" rel="noreferrer">{flyingTour.geology.credit}</a>
          </div>
        </details>}
      </aside>}
      {drone && flightWalk.session && <div className="flight-walk-status">
        <span>{flightWalk.arrived ? "Arrived" : `${flightWalk.rover ? "Rover" : "Walk"} preview · ${Math.round(flightWalk.remaining ?? 0)} m left`}</span>
        {!flightWalk.arrived && <button type="button" className="btn btn--small" onClick={flightWalk.togglePause}>{flightWalk.paused ? "Resume" : "Pause"}</button>}
        <button type="button" className="btn btn--small" onClick={flightWalk.toggleMute}>{flightWalk.muted ? "Unmute" : "Mute"}</button>
        <button type="button" className="btn btn--small" onClick={flightWalk.stop}>End preview</button>
      </div>}
      {drone && <><DroneControls onInput={(input) => { droneInput.current = input; }} /><div className="flight-readout">
        {!rotationHintDismissed && <div className="flight-orientation">
          <svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <g><rect x="10" y="5" width="12" height="22" rx="2" /><path d="M15 24h2" /></g>
            <path d="M25 4c4 2 5 5 5 8m-3-2 3 2 1-3" />
          </svg>
          <span>Rotate to landscape for more room to fly.</span>
          <button type="button" aria-label="Dismiss rotate hint" onClick={() => setRotationHintDismissed(true)}>×</button>
        </div>}
        <span>Simulated camera · {Math.round(drone.height)} m above ground · {Math.round(drone.heading) % 360}°</span>
        <span>{closeRegion === "wildcat" ? "Wildcat Ridge · 1 m" : "Mount Sharp · 20 m"}</span>
        <span>{formatLatLon(drone.point, 5)}</span>
      </div></>}
      {!drone && <div className="map-hud map-hud--scale">{zoomDetail && activeDetail === zoomDetail
        ? `${zoomDetail.label} · ~${zoomDetail.spacing} m relief`
        : activeDetail ? (closeRegion === "wildcat" ? "HiRISE · Wildcat Ridge" : "Gale relief · 20 m elevation") : "Global MOLA relief"}
        {detailImagery && tileKey && !activeDetail ? " · Trek imagery" : ""} · {formatLatLon(view, 2)}</div>}
    </div>
  );
}
