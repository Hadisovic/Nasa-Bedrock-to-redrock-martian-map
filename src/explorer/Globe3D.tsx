import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { bearingDeg, clusterScreen, formatLatLon, greatCircleKm, latLonToUnit, lonDelta, MARS_RADIUS_KM, unitToLatLon, wrapLon } from "./geo.ts";
import { createRocket, createRouteFlag, disposeMarker, setMarkerSelected } from "./markers.ts";
import type { GlobeMarker, GlobeOverlay, GlobeView, RouteMapPoint, TileSource } from "./types.ts";
import type { LatLon } from "./geo.ts";
import type { MapLeg } from "./itinerary.ts";
import { globeSurface, loadGaleTerrain, loadWildcatTerrain, nearWildcat } from "./galeTerrain.ts";
import type { SurfaceTerrain } from "./galeTerrain.ts";
import { nearGale } from "./galeLayout.ts";
import { MarkerButton } from "./MarkerButton.tsx";
import { MapControls } from "./MapControls.tsx";
import { imageBounds } from "./catalog.ts";
import { DroneControls, droneMoveForKey } from "./DroneControls.tsx";
import type { DroneMove } from "./DroneControls.tsx";
import { containsTerrain, globalSource, regionalOnlineSources } from "./marsTrekTerrain.ts";
import { loadBundledDroneTerrain, loadOnlineTerrain } from "./onlineTerrain.ts";
import { saveDroneWindow } from "./dronePacks.ts";
import type { OnlineTerrain } from "./onlineTerrain.ts";
import { createAtmosphere, createStarfield } from "./globeAtmosphere.ts";
import { globeTileWindow, makeGlobeTileTexture } from "./globeTiles.ts";
import { discreteOverlay } from "./overlaySampling.ts";

export interface Globe3DProps {
  basemap: HTMLImageElement;
  droneBasemap: HTMLImageElement | null;
  overlays: readonly GlobeOverlay[];
  markers: readonly GlobeMarker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRoute: (id: string) => void;
  view: GlobeView;
  onViewChange: (view: GlobeView) => void;
  flySignal: number;
  flyTarget?: GlobeView | null;
  naturalColor: boolean;
  tiles: TileSource | null;
  onUnavailable: (detail: string) => void;
  onFlightStart: () => void;
  paths: readonly MapLeg[];
  switchView: () => void;
  replayPoints: readonly LatLon[];
  onRouteClick?: (point: RouteMapPoint | null) => void;
  onRouteHover?: (point: RouteMapPoint | null) => void;
  onPick?: (point: LatLon) => void;
  sunPoint?: LatLon | null;
  elevationAt?: ((lat: number, lon: number) => number | null) | null;
}

const FOV = 40;
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
  const { basemap, overlays, markers, selectedId, onSelect, onRoute, view, onViewChange, flySignal, onUnavailable, paths, replayPoints, onPick, elevationAt, sunPoint, naturalColor } = props;
  const host = useRef<HTMLDivElement>(null);
  const hitLayer = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [detailImagery, setDetailImagery] = useState(false);
  const [detail, setDetail] = useState<{ region: "gale" | "wildcat"; asset: SurfaceTerrain } | null>(null);
  const [tilted, setTilted] = useState(false);
  const closeRegion = nearWildcat(view, 250) && view.zoom >= 18_000 ? "wildcat"
    : nearGale(view, 2_000) && view.zoom >= 2_000 ? "gale" : null;
  const [onlineTerrain, setOnlineTerrain] = useState<OnlineTerrain | null>(null);
  const [zoomTerrain, setZoomTerrain] = useState<{ key: string; asset: OnlineTerrain } | null>(null);
  const onlineRequest = useRef<AbortController | null>(null);
  const [loadingFlight, setLoadingFlight] = useState(false);
  const zoomSource = regionalOnlineSources.find((source) => containsTerrain(source, view)) ?? globalSource;
  const bucket = zoomSource.span / 4;
  const snap = (amount: number, min: number, max: number) => Math.max(min + 1e-5, Math.min(max - 1e-5, Math.round(amount / bucket) * bucket));
  const zoomKey = !closeRegion && view.zoom >= 900
    ? JSON.stringify([snap(view.lat, zoomSource.south, zoomSource.north), snap(view.lon, zoomSource.west, zoomSource.east)])
    : "";
  const zoomDetail = zoomTerrain?.key === zoomKey ? zoomTerrain.asset : null;
  const activeDetail = onlineTerrain ?? (detail && detail.region === closeRegion ? detail.asset : zoomDetail);
  const detailRef = useRef(activeDetail);
  const [drone, setDrone] = useState<{ point: LatLon; heading: number; height: number } | null>(null);
  const [following, setFollowing] = useState(false);
  const progress = useRef<{ index: number; segmentM: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [savingFlight, setSavingFlight] = useState(false);
  const droneRef = useRef(drone);
  droneRef.current = drone;
  const sunRef = useRef(sunPoint);
  sunRef.current = sunPoint;
  const naturalColorRef = useRef(naturalColor);
  naturalColorRef.current = naturalColor;
  const compass = useRef<SVGGElement>(null);
  const touchTilt = useRef(0);
  const deviceAngle = useRef(0);
  const [motion, setMotion] = useState(false);
  const closeFlight = () => {
    onlineRequest.current?.abort();
    onlineRequest.current = null;
    setLoadingFlight(false);
    setOnlineTerrain(null);
    setDrone(null);
  };
  useEffect(() => () => { onlineRequest.current?.abort(); }, []);
  useEffect(() => () => { onlineTerrain?.geometry.dispose(); onlineTerrain?.texture.dispose(); }, [onlineTerrain]);
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
  const loadFlightTerrain = (target: LatLon, position?: NonNullable<typeof drone>) => {
    if (onlineRequest.current) return;
    const request = new AbortController();
    onlineRequest.current = request;
    setLoadingFlight(true);
    setNotice("Loading NASA elevation and imagery…");
    void (async () => {
      try { return await loadOnlineTerrain(target, request.signal, true); }
      catch (error) {
        const elevation = elevationRef.current;
        if (request.signal.aborted || !elevation || !props.droneBasemap) throw error;
        return loadBundledDroneTerrain(target, props.droneBasemap, elevation, request.signal);
      }
    })().then((terrain) => {
      if (request.signal.aborted) { terrain.geometry.dispose(); terrain.texture.dispose(); return; }
      const point = {
        lat: THREE.MathUtils.clamp(target.lat, terrain.bounds.south + 1e-6, terrain.bounds.north - 1e-6),
        lon: THREE.MathUtils.clamp(wrapLon(target.lon), terrain.bounds.west + 1e-6, terrain.bounds.east - 1e-6),
      };
      setOnlineTerrain(terrain);
      setFlightPosition({ point, heading: position?.heading ?? 0, height: THREE.MathUtils.clamp(position?.height ?? terrain.flightHeight,
        terrain.flightHeight / 2, Math.max(terrain.flightHeight * 3, terrain.spacing >= 200 ? 12_000 : 350)) });
      setNotice("");
    }, () => {
      if (!request.signal.aborted) setNotice("NASA terrain is unavailable for this point. Try again or choose a nearby location.");
    }).finally(() => {
      if (onlineRequest.current !== request) return;
      onlineRequest.current = null;
      setLoadingFlight(false);
    });
  };
  useEffect(() => {
    if (!motion) { deviceAngle.current = 0; return; }
    let neutral: number | undefined, received = false;
    const orient = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      const a = THREE.MathUtils.degToRad(screen.orientation?.angle ?? 0);
      const angle = e.beta * Math.cos(a) + e.gamma * Math.sin(a);
      neutral ??= angle;
      deviceAngle.current = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(angle - neutral), -0.65, 0.65);
      if (!received) { received = true; setNotice("Device tilt enabled for detailed terrain."); }
    };
    const calibrate = () => { neutral = undefined; deviceAngle.current = 0; };
    const timer = window.setTimeout(() => { if (!received) setNotice("No orientation data. Use touch or Tilt terrain."); }, 1800);
    window.addEventListener("deviceorientation", orient);
    screen.orientation?.addEventListener("change", calibrate);
    return () => { clearTimeout(timer); window.removeEventListener("deviceorientation", orient); screen.orientation?.removeEventListener("change", calibrate); };
  }, [motion]);
  useEffect(() => { if (!activeDetail) setDrone(null); }, [activeDetail]);
  useEffect(() => { setFollowing(false); progress.current = null; }, [replayPoints, !!drone]);
  const setFlightPosition = (position: NonNullable<typeof drone>) => {
    droneRef.current = position;
    setDrone(position);
  };
  const changeFlightHeight = (requested: number) => {
    const current = droneRef.current;
    if (!current) return;
    const minimum = onlineTerrain ? Math.max(8, onlineTerrain.flightHeight / 2) : 8;
    const maximum = onlineTerrain ? Math.max(onlineTerrain.flightHeight * 3, onlineTerrain.spacing >= 200 ? 12_000 : 350) : 350;
    const height = THREE.MathUtils.clamp(requested, minimum, maximum);
    if (height === current.height) return;
    setNotice("");
    setFlightPosition({ ...current, height });
  };
  const changeFlightHeightRef = useRef(changeFlightHeight);
  changeFlightHeightRef.current = changeFlightHeight;
  const moveDrone = (move: DroneMove, held: boolean) => {
    const current = droneRef.current, terrain = detailRef.current;
    if (!current || !terrain) return;
    const sideways = move === "slideLeft" || move === "slideRight";
    const global = !!onlineTerrain && onlineTerrain.spacing >= 200;
    if (move === "up" || move === "down") {
      const rise = (global ? (held ? 50 : 200) : (held ? 2 : 8)) * (move === "up" ? 1 : -1);
      changeFlightHeight(current.height + rise);
      return;
    }
    setFollowing(false);
    progress.current = null;
    const meters = (global ? (held ? 180 : 600) * Math.max(1, (onlineTerrain?.spacing ?? 200) / 2400)
      : closeRegion === "wildcat" && !onlineTerrain ? (held ? 1.5 : 5) : (held ? 9 : 30))
      * (move === "backward" ? -1 : move === "forward" || sideways ? 1 : 0);
    const turn = (held ? 4 : 12) * (move === "left" ? -1 : move === "right" ? 1 : 0);
    const heading = (current.heading + turn + 360) % 360;
    const a = THREE.MathUtils.degToRad(heading + (move === "slideLeft" ? -90 : move === "slideRight" ? 90 : 0));
    const d = THREE.MathUtils.radToDeg(meters / (MARS_RADIUS_KM * 1000));
    const sample = (fraction: number) => ({
      lat: current.point.lat + d * fraction * Math.cos(a),
      lon: wrapLon(current.point.lon + d * fraction * Math.sin(a) / Math.cos(THREE.MathUtils.degToRad(current.point.lat))),
    });
    // Do not step over NoData gaps on the way to an otherwise valid point.
    const checks = Math.ceil(Math.abs(meters) / (global ? Math.max(100, (onlineTerrain?.spacing ?? 200) / 2) : closeRegion === "wildcat" ? 1 : 5));
    for (let i = 1; i <= checks; i++) {
      const point = sample(i / checks);
      if (onlineTerrain && !containsTerrain(onlineTerrain.bounds, point)) {
        loadFlightTerrain(sample(1), current);
        return;
      }
      if (!Number.isFinite(terrain.sample(point)) || !terrain.verifiedImagery?.(point)) {
        setNotice("Verified imagery or elevation ends here. Turn back to keep flying."); return;
      }
    }
    setNotice("");
    setFlightPosition({ ...current, point: sample(1), heading });
  };
  useEffect(() => {
    if (!following || !replayPoints.length || !activeDetail) return;
    const points = replayPoints;
    const lengths = points.slice(1).map((point, index) => greatCircleKm(points[index], point) * 1000);
    const cursor = progress.current ??= { index: 0, segmentM: 0 };
    let frame = 0, previous = 0;
    const step = (now: number) => {
      const state = droneRef.current;
      if (!state) return;
      const speed = closeRegion === "wildcat" ? 12 : 65;
      let distance = previous ? Math.min(now - previous, 55) * speed / 1000 : 0;
      previous = now;
      const pointAt = (index: number, fraction: number) => {
        const from = points[index], to = points[index + 1];
        return { lat: THREE.MathUtils.lerp(from.lat, to.lat, fraction), lon: wrapLon(from.lon + lonDelta(from.lon, to.lon) * fraction) };
      };
      while (cursor.index < lengths.length) {
        const length = lengths[cursor.index];
        const nextM = Math.min(length, cursor.segmentM + distance);
        const point = pointAt(cursor.index, length ? nextM / length : 1);
        if (!Number.isFinite(activeDetail.sample(point)) || !activeDetail.verifiedImagery?.(point)) {
          progress.current = null;
          setFollowing(false);
          setNotice("This part of the route leaves the verified imagery and terrain.");
          return;
        }
        setFlightPosition({ ...state, point, heading: length > 0.01 ? bearingDeg(points[cursor.index], points[cursor.index + 1]) : state.heading });
        distance -= nextM - cursor.segmentM;
        cursor.segmentM = nextM;
        if (nextM < length) break;
        cursor.index++;
        cursor.segmentM = 0;
      }
      if (cursor.index >= lengths.length) {
        progress.current = null;
        setFollowing(false);
        setNotice("Returned to the lander.");
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [following, replayPoints, activeDetail, closeRegion]);
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
  markersRef.current = markers;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const s = useRef<{
    renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; renderCamera: THREE.PerspectiveCamera; controls: OrbitControls; scene: THREE.Scene;
    overlayGroup: THREE.Group; markerGroup: THREE.Group; routeGroup: THREE.Group; globe: THREE.Mesh; relief: THREE.Group;
    baseTexture: THREE.Texture; anchors: Map<string, THREE.Vector3>;
    tileTexture: { value: THREE.Texture }; tileBounds: { value: THREE.Vector4 };
    fly: (v: GlobeView, animate: boolean) => void; zoomBy: (factor: number) => void; recluster: () => void;
  } | null>(null);
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const press = useRef<{ x: number; y: number; id: number } | null>(null);
  const landing = useRef<{ key: string; time: number } | null>(null);

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

    let flight: { from: THREE.Vector3; rotation: THREE.Quaternion; h0: number; h1: number; arc: number; duration: number; start: number } | null = null;
    let targetClearance: number | null = null;
    const fly = (v: GlobeView, animate: boolean) => {
      targetClearance = null;
      const h1 = distanceForZoom(v.zoom, heightPx()) - 1;
      const to = vec(v.lat, v.lon);
      if (!animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        flight = null;
        camera.position.copy(to.multiplyScalar(surfaceRef.current(v).length() + h1));
        controls.update();
        report();
        return;
      }
      const from = camera.position.clone().normalize();
      const current = unitToLatLon([from.x, from.y, from.z]);
      const h0 = Math.max(MIN_CLEARANCE, camera.position.length() - surfaceRef.current(current).length());
      const turn = from.angleTo(to);
      const arc = Math.max(0, Math.min(.45, turn * .45) - Math.max(h0, h1));
      flight = { from, rotation: new THREE.Quaternion().setFromUnitVectors(from, to), h0, h1, arc,
        duration: THREE.MathUtils.lerp(620, 1800, Math.min(1, turn / 1.8)), start: performance.now() };
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
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const frameMs = lastFrame ? Math.min(48, now - lastFrame) : 16;
      lastFrame = now;
      if (flight) {
        const t = Math.min(1, (now - flight.start) / flight.duration);
        const e = t * t * (3 - 2 * t);
        flightDirection.copy(flight.from).applyQuaternion(flightRotation.identity().slerp(flight.rotation, e));
        const clearance = Math.exp(THREE.MathUtils.lerp(Math.log(flight.h0), Math.log(flight.h1), e)) + flight.arc * Math.sin(Math.PI * e) ** 2;
        const location = unitToLatLon([flightDirection.x, flightDirection.y, flightDirection.z]);
        camera.position.copy(flightDirection.multiplyScalar(surfaceRef.current(location).length() + clearance));
        if (t >= 1) flight = null;
      }
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
      const targetTilt = detailRef.current ? (tiltRef.current ? 0.58 : 0) + touchTilt.current + deviceAngle.current : 0;
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
      starfield.visible = !flying && clearance > .035;
      if (flying) {
        const { point, heading, height } = flying;
        const up = vec(point.lat, point.lon);
        const north = vec(point.lat + 0.0001, point.lon).sub(up).normalize();
        const east = vec(point.lat, point.lon + 0.0001).sub(up).normalize();
        const a = THREE.MathUtils.degToRad(heading);
        renderCamera.position.copy(surfaceRef.current(point, height));
        renderCamera.up.copy(up);
        renderCamera.lookAt(north.multiplyScalar(Math.cos(a)).addScaledVector(east, Math.sin(a)).addScaledVector(up, -0.55).add(renderCamera.position));
      } else renderCamera.up.set(0, 1, 0);
      renderCamera.updateMatrixWorld();
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
      if (now - lastReport > 100 && !flight) {
        lastReport = now;
        if (report() || Math.abs(clusterTilt - tiltAmount) > .02) {
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
    const onTouchStart = (event: PointerEvent) => {
      flight = null;
      targetClearance = null;
      if (event.pointerType === "touch") touches.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
    };
    const onTouchMove = (event: PointerEvent) => {
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
    const onTouchEnd = (event: PointerEvent) => { touches.delete(event.pointerId); touchDy.delete(event.pointerId); };
    const canvas = renderer.domElement;
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onTouchStart);
    canvas.addEventListener("pointermove", onTouchMove);
    canvas.addEventListener("pointerup", onTouchEnd);
    canvas.addEventListener("pointercancel", onTouchEnd);

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
      controls.dispose();
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

  useEffect(() => { if (flySignal && props.flyTarget) { closeFlight(); touchTilt.current = 0; s.current?.fly(props.flyTarget, true); } }, [flySignal, ready]); // eslint-disable-line react-hooks/exhaustive-deps
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
    }, () => { /* the global terrain remains available */ });
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
      shader.fragmentShader = "uniform sampler2D globalImage;\nuniform vec4 patchBounds;\n" + shader.fragmentShader.replace(
        "#include <map_fragment>",
        `vec4 localColor = texture2D(map, vMapUv);
        vec3 globalColor = texture2D(globalImage, mix(patchBounds.xy, patchBounds.zw, vMapUv)).rgb;
        diffuseColor.rgb *= mix(globalColor, localColor.rgb, localColor.a);`,
      );
    };
    const patch = new THREE.Mesh(activeDetail.geometry, material);
    // Let real terrain replace the coarse surface only where the terrain mesh has triangles.
    patch.renderOrder = 2;
    const bounds = activeDetail.uv;
    patch.userData.surfaceNormal = vec((bounds.y + bounds.w) * 90 - 90, (bounds.x + bounds.z) * 180 - 180);
    st.relief.add(patch);
    return () => { patch.removeFromParent(); material.dispose(); };
  }, [ready, activeDetail]);

  useEffect(() => {
    const st = s.current;
    if (!st || !paths.length) return;
    const lines = paths.flatMap((leg, index) => {
      const back = leg.returning;
      const localLift = activeDetail ? (closeRegion === "wildcat" ? 0.7 : 5) : 150;
      const geometry = new LineGeometry().setPositions(leg.points.flatMap((p) => surfaceRef.current(p, localLift * (back ? 1.4 : 1)).toArray()));
      const dash = Math.max(0.0000008, leg.distanceKm / (MARS_RADIUS_KM * 28));
      return [true, false].map((outline) => {
        const material = new LineMaterial({ color: outline ? "#0b1724" : back ? "#fff" : leg.preview ? "#ffe689" : "#69d5ff",
          linewidth: back ? outline ? 4.4 : 2.6 : outline ? 8 : 5, transparent: true, toneMapped: false,
          dashed: back, dashSize: dash, gapSize: dash * 0.8, depthWrite: false });
        const line = new Line2(geometry, material);
        line.userData.ignoreHit = outline || leg.preview;
        if (outline) line.computeLineDistances();
        line.renderOrder = 20 + (back ? paths.length : index) * 2 + (outline ? 0 : 1);
        return line;
      });
    });
    st.routeGroup.add(...lines);
    return () => {
      for (const line of lines) { line.removeFromParent(); line.material.dispose(); }
      for (const geometry of new Set(lines.map((line) => line.geometry))) geometry.dispose();
    };
  }, [ready, paths, elevationAt, activeDetail, closeRegion]);

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
      object.userData.px = first.kind === "rocket" ? 52 : 34;
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
    if (!st || !st.routeGroup.children.length) return false;
    Object.assign(ray.params, { Line2: { threshold: tolerance } });
    const line = ray.intersectObjects(st.routeGroup.children.filter((line) => !line.userData.ignoreHit), false).find((candidate) => {
      const anchor = candidate.pointOnLine ?? candidate.point;
      return anchor.dot(st.renderCamera.position.clone().sub(anchor)) > 0;
    });
    return !!line;
  };
  const mapRay = ({ x, y }: RouteMapPoint, bounds: DOMRect) => {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x / bounds.width * 2 - 1, 1 - y / bounds.height * 2), s.current!.renderCamera);
    return ray;
  };

  return (
    <div ref={host} className={`map3d globe3d${drone ? " globe3d--flying" : ""}`} tabIndex={0} role="application"
      onKeyDown={(event) => {
        if (drone && !event.altKey && !event.ctrlKey && !event.metaKey) {
          const move = droneMoveForKey(event.key, event.shiftKey);
          if (move) { event.preventDefault(); moveDrone(move, event.repeat); return; }
        }
        if (event.target === event.currentTarget && onPick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onPick(view);
        }
      }}
      onPointerDown={(event) => {
        if (drone || event.target !== s.current?.renderer.domElement || event.button !== 0) return;
        if (!event.isPrimary) { press.current = null; return; }
        press.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      }}
      onPointerCancel={() => { press.current = null; }}
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
        if ((!onPick && !props.onRouteClick) || !st || !start || start.id !== event.pointerId ||
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        const ray = mapRay(point, bounds);
        if (onPick) {
          const hit = ray.intersectObjects(st.relief.children.filter((surface) => surface.visible))[0]?.point ?? ray.intersectObject(st.globe)[0]?.point;
          if (hit) onPick(unitToLatLon([hit.x, hit.y, hit.z]));
        } else props.onRouteClick?.(hitsRoute(ray, event.pointerType === "touch" ? 48 : 14) ? point : null);
      }}
      aria-label={drone ? "Drone View. Scroll or pinch to change altitude." : "Rotatable 3D globe of Mars. Drag to rotate, scroll or pinch to zoom, arrow keys rotate and plus or minus zoom."}>
      <div ref={hitLayer} className="map3d__pins">
        {clusters.map((cluster) => (
          <div key={cluster.id} data-id={cluster.id}
            data-shift={cluster.members.length === 1 && cluster.members[0].kind !== "rocket" && !cluster.members[0].order ? 12 : 0}
            data-lift={cluster.members.length > 1 || cluster.members[0].order ? 14 : cluster.members[0].kind === "rocket" ? 17 : 21}
            className={`gpin-wrap${cluster.id === selectedId ? " gpin-wrap--selected" : ""}`} style={{ display: "none" }}>
            {cluster.members.length > 1 ? (
              <button type="button" className="gpin gpin--hit gpin--cluster-hit" aria-label={`${cluster.members.length} nearby locations. Zoom in to separate them`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  const st = s.current; if (!st) return;
                  const anchor = st.anchors.get(cluster.id)!;
                  const { lat, lon } = unitToLatLon([anchor.x, anchor.y, anchor.z]);
                  const height = host.current?.clientHeight ?? 600;
                  st.fly({ lat, lon, zoom: zoomForDistance(st.camera.position.length(), height) * 3 }, true);
                }}>
                <b className="gpin__count">{cluster.members.length}</b>
              </button>
            ) : (
              <MarkerButton className={`gpin gpin--hit${cluster.members[0].kind === "rocket" ? " gpin--landing" : ""}${cluster.members[0].id === selectedId ? " gpin--selected" : ""}`}
                label={cluster.members[0].label} selected={cluster.members[0].id === selectedId}
                onSelect={() => onSelect(cluster.members[0].id)}
                onRoute={cluster.members[0].kind === "flag" ? () => onRoute(cluster.members[0].id) : undefined}>
                {cluster.members[0].order && <span className="itinerary-number">{cluster.members[0].order}</span>}
              </MarkerButton>
            )}
          </div>
        ))}
      </div>
      <MapControls switchView={props.switchView} zoomIn={() => s.current?.zoomBy(1 / 1.6)} zoomOut={() => s.current?.zoomBy(1.6)}
        needle={compass} flying={!!drone} resetNorth={() => {
        const state = droneRef.current;
        if (state) { setFollowing(false); setFlightPosition({ ...state, heading: 0 }); }
        else { setTilted(false); touchTilt.current = 0; deviceAngle.current = 0; s.current?.fly(view, true); }
      }} />
      <div className={`flight-tools${drone ? " flight-tools--flying" : ""}`}>
        <button type="button" className="btn btn--small" aria-pressed={!!drone} onClick={() => {
          if (drone || loadingFlight) { closeFlight(); setNotice(""); return; }
          props.onFlightStart();
          if (!activeDetail || activeDetail === zoomDetail || !Number.isFinite(activeDetail.sample(view)) || !activeDetail.verifiedImagery?.(view)) {
            loadFlightTerrain(view);
            return;
          }
          setDrone({ point: view, heading: 0, height: closeRegion === "wildcat" ? 20 : 110 }); setNotice("");
        }}>{drone ? "Exit Drone View" : loadingFlight ? "Cancel terrain download" : "Drone View"}</button>
        {activeDetail && !drone && <button type="button" className="btn btn--small" aria-pressed={tilted}
          onClick={() => { touchTilt.current = 0; setTilted(!tilted); }}>{tilted ? "Top view" : "Tilt terrain"}</button>}
        {!drone && <button className="btn btn--small" aria-pressed={motion} onClick={async () => {
          if (motion) { setMotion(false); setNotice(""); return; }
          const cls = window.DeviceOrientationEvent as (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }) | undefined;
          try {
            if (!isSecureContext || !cls || (cls.requestPermission && await cls.requestPermission() !== "granted")) {
              setNotice("Device tilt unavailable. Use touch or Tilt terrain."); return;
            }
            setNotice("Waiting for device orientation…"); setMotion(true);
          } catch { setNotice("Device tilt permission denied. Use touch or Tilt terrain."); }
        }}>Device tilt</button>}
        {drone && <>
          {replayPoints.length > 1 && <button className="btn btn--small" onClick={() => {
            setNotice(""); setFollowing(!following);
          }}>{following ? "Pause flight" : progress.current ? "Resume flight" : "Follow route"}</button>}
          {onlineTerrain && !onlineTerrain.saved && <button type="button" className="btn btn--small" disabled={savingFlight} onClick={async () => {
            setSavingFlight(true);
            try {
              await saveDroneWindow(onlineTerrain.pixels);
              setNotice("Area saved offline.");
              window.dispatchEvent(new Event("martian-map:drone-area-saved"));
            }
            catch { setNotice("Could not save this area. Check available browser storage."); }
            finally { setSavingFlight(false); }
          }}>{savingFlight ? "Saving area…" : "Save area offline"}</button>}
        </>}
        {notice && <span className="badge" role="status">{notice}</span>}
      </div>
      {drone && <><DroneControls onMove={moveDrone} /><div className="flight-readout">
        <span>Simulated camera · {Math.round(drone.height)} m above ground · {Math.round(drone.heading) % 360}°</span>
        {onlineTerrain && <a href={onlineTerrain.pixels.source} target="_blank" rel="noreferrer">
          {onlineTerrain.label} · {onlineTerrain.spacing} m elevation · {onlineTerrain.imagery}
        </a>}
        {onlineTerrain?.saved && <span>Saved terrain</span>}
        <span>{formatLatLon(drone.point, 5)}</span>
      </div></>}
      {!drone && <div className="map-hud map-hud--scale">{onlineTerrain?.label ?? (zoomDetail && activeDetail === zoomDetail
        ? `${zoomDetail.label} · ~${zoomDetail.spacing} m relief`
        : activeDetail ? (closeRegion === "wildcat" ? "HiRISE · Wildcat Ridge" : "Gale relief · 20 m elevation") : "Global MOLA relief")}
        {detailImagery && tileKey && !activeDetail ? " · Trek imagery" : ""} · {formatLatLon(view, 2)}</div>}
    </div>
  );
}
