import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { cellAt } from "../contracts/index.ts";
import type { ProjectedPoint, TerrainGrid } from "../contracts/index.ts";
import { groundScale } from "../analysis/terrain.ts";
import { Pin } from "./Pin.tsx";
import type { MapPin, RouteOverlay } from "./Pin.tsx";
import { createRocket, createRouteFlag, disposeMarker, setMarkerSelected } from "../explorer/markers.ts";

const PIN_ACCENT: Record<string, string> = { science: "#6FDC9A", rover: "#EAF2FF", hardware: "#A9BBD6", habitat: "#69D5FF" };

export interface Map3DProps {
  image: HTMLCanvasElement;
  imageVersion: number;
  terrain: TerrainGrid;
  pins: readonly MapPin[];
  routes: RouteOverlay | null;
  traverse: readonly ProjectedPoint[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  exaggeration: number;
  resetSignal: number;
  overheadSignal: number;
  onUnavailable: (detail: string) => void;
}

/**
 * Scene axes: +x east and −z north in ground metres from the crop centre; +y up in metres
 * relative to the lowest valid elevation. Vertices sit on elevation cell centres and the
 * texture spans the same outer raster bounds, so u = (column + 0.5) / width.
 */
export function buildTerrainGeometry(terrain: TerrainGrid, stride: number, exaggeration: number, baseM: number) {
  const { layout, elevationsM } = terrain;
  const scale = groundScale(terrain);
  const columns = Math.floor((layout.width - 1) / stride) + 1;
  const rows = Math.floor((layout.height - 1) / stride) + 1;
  const halfW = (layout.width * layout.pixelSizeM) / 2, halfH = (layout.height * layout.pixelSizeM) / 2;
  const positions = new Float32Array(columns * rows * 3);
  const uvs = new Float32Array(columns * rows * 2);
  const known = new Uint8Array(columns * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const row = r * stride, column = c * stride;
      const z = elevationsM[row * layout.width + column];
      const i = r * columns + c;
      known[i] = Number.isFinite(z) ? 1 : 0;
      positions[i * 3] = ((column + 0.5) * layout.pixelSizeM - halfW) * scale.east;
      positions[i * 3 + 1] = known[i] ? (z - baseM) * exaggeration : 0;
      positions[i * 3 + 2] = (row + 0.5) * layout.pixelSizeM - halfH;
      uvs[i * 2] = (column + 0.5) / layout.width;
      uvs[i * 2 + 1] = 1 - (row + 0.5) / layout.height;
    }
  }
  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < columns - 1; c++) {
      const a = r * columns + c, b = a + 1, d = a + columns, e = d + 1;
      // Omit faces that touch unknown elevation so gaps stay visible.
      if (known[a] && known[b] && known[d] && known[e]) indices.push(a, d, b, b, d, e);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function Map3D(props: Map3DProps) {
  const { image, imageVersion, terrain, pins, routes, traverse, selectedId, onSelect, exaggeration, resetSignal, overheadSignal, onUnavailable } = props;
  const host = useRef<HTMLDivElement>(null);
  const pinLayer = useRef<HTMLDivElement>(null);
  const scene = useRef<{
    renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    world: THREE.Scene; mesh: THREE.Mesh; texture: THREE.CanvasTexture; overlays: THREE.Group; markers: THREE.Group;
    toScene: (p: ProjectedPoint, lift?: number) => THREE.Vector3; home: () => void; overhead: () => void;
    pinPositions: Map<string, THREE.Vector3>; render: () => void;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const scale = groundScale(terrain);
  const { layout } = terrain;

  const baseM = useMemo(() => {
    let min = Infinity;
    for (const z of terrain.elevationsM) if (Number.isFinite(z) && z < min) min = z;
    return min;
  }, [terrain]);

  // Set up renderer, camera and terrain once.
  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      onUnavailable("This browser could not start WebGL, so the 3D view is unavailable. The 2D map shows the same data.");
      return;
    }
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.prepend(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      onUnavailable("The 3D graphics context was lost. Switch back to 2D or reload to try again.");
    });

    const world = new THREE.Scene();
    world.background = new THREE.Color("#0B1424");
    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 15;
    controls.maxDistance = 900;

    const texture = new THREE.CanvasTexture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const stride = small ? 2 : 1;
    const geometry = buildTerrainGeometry(terrain, stride, exaggeration, baseM);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide }));
    world.add(mesh);
    world.add(new THREE.AmbientLight(0xffffff, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-200, 300, -200);
    world.add(sun);
    const overlays = new THREE.Group();
    world.add(overlays);
    const markers = new THREE.Group();
    world.add(markers);

    const halfW = (layout.width * layout.pixelSizeM) / 2, halfH = (layout.height * layout.pixelSizeM) / 2;
    const toScene = (p: ProjectedPoint, lift = 0) => {
      const cell = cellAt(layout, p);
      const z = cell ? terrain.elevationsM[cell.row * layout.width + cell.column] : NaN;
      return new THREE.Vector3(
        (p.xM - layout.westM - halfW) * scale.east,
        (Number.isFinite(z) ? (z - baseM) * exaggeration : 0) + lift,
        (layout.northM - p.yM) - halfH,
      );
    };
    const home = () => {
      // Narrow stages need more distance to keep the whole crop in frame.
      const k = Math.min(1.9, Math.max(1, 640 / Math.max(1, element.clientWidth), 1.1 / Math.max(0.1, camera.aspect)));
      camera.position.set(-140 * k, 210 * k, 300 * k);
      controls.target.set(0, 20, 0);
      controls.update();
    };
    const overhead = () => {
      camera.position.set(0, 520, 0.01);
      controls.target.set(0, 0, 0);
      controls.update();
    };

    const pinPositions = new Map<string, THREE.Vector3>();
    const projected = new THREE.Vector3();
    const render = () => {
      // Zoom-aware marker size: near-constant on screen, clamped to 1.5–25 m so a marker never
      // hides the route or neighbouring pins. The DOM hit area follows the marker body.
      const heightPx = Math.max(1, element.clientHeight);
      for (const marker of markers.children) {
        const ground = marker.userData.ground as THREE.Vector3;
        const worldPerPx = (2 * camera.position.distanceTo(ground) * Math.tan((camera.fov * Math.PI) / 360)) / heightPx;
        const size = Math.min(25, Math.max(1.5, worldPerPx * (marker.userData.px as number))) * (marker.userData.selectedBoost ?? 1);
        marker.scale.setScalar(size);
        if (marker.userData.flag) marker.rotation.y = Math.atan2(camera.position.x - ground.x, camera.position.z - ground.z);
        const top = pinPositions.get(marker.userData.pinId as string);
        if (top) top.set(ground.x, ground.y + size * 0.55, ground.z);
      }
      renderer.render(world, camera);
      const layer = pinLayer.current;
      if (!layer) return;
      const width = element.clientWidth, height = element.clientHeight;
      for (const child of Array.from(layer.children) as HTMLElement[]) {
        const position = pinPositions.get(child.dataset.pin ?? "");
        if (!position) continue;
        projected.copy(position).project(camera);
        const visible = projected.z < 1 && Math.abs(projected.x) <= 1.05 && Math.abs(projected.y) <= 1.05;
        child.style.display = visible ? "" : "none";
        child.style.transform = `translate(${(projected.x + 1) / 2 * width + Number(child.dataset.nudge ?? 0)}px, ${(1 - projected.y) / 2 * height}px)`;
      }
    };
    let frame = 0;
    const loop = () => { frame = requestAnimationFrame(loop); controls.update(); render(); };
    const resize = () => {
      const width = element.clientWidth, height = element.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    home();
    loop();
    scene.current = { renderer, camera, controls, world, mesh, texture, overlays, markers, toScene, home, overhead, pinPositions, render };
    setReady(true);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      // Markers share the cached rocket model; dispose them separately, then the rest.
      markers.children.forEach(disposeMarker);
      world.remove(markers);
      world.traverse((object) => {
        const item = object as THREE.Mesh;
        item.geometry?.dispose();
        const material = item.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose()); else material?.dispose();
      });
      texture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.current = null;
      setReady(false);
    };
    // Rebuild only when the terrain or vertical exaggeration changes.
  }, [terrain, exaggeration]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh the shared layer texture.
  useEffect(() => { if (scene.current) scene.current.texture.needsUpdate = true; }, [imageVersion, ready]);

  useEffect(() => { scene.current?.home(); }, [resetSignal]);
  useEffect(() => { if (overheadSignal) scene.current?.overhead(); }, [overheadSignal]);

  // Pins, traverse and routes.
  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    s.overlays.children.slice().forEach((child) => {
      s.overlays.remove(child);
      const item = child as THREE.Mesh;
      item.geometry?.dispose();
      (item.material as THREE.Material | undefined)?.dispose();
    });
    s.pinPositions.clear();
    s.markers.children.slice().forEach((child) => { s.markers.remove(child); disposeMarker(child); });
    for (const pin of pins) {
      const ground = s.toScene(pin.point);
      const top = ground.clone(); top.y += 2;
      s.pinPositions.set(pin.id, top);
      if (pin.kind === "waypoint") continue;
      // Real 3D meshes, base anchored on the terrain and standing upright (+y).
      const marker = pin.kind === "habitat" ? createRocket() : createRouteFlag(PIN_ACCENT[pin.kind], true);
      marker.userData.flag = pin.kind !== "habitat";
      setMarkerSelected(marker, pin.id === selectedId, PIN_ACCENT[pin.kind] ?? "#69D5FF");
      marker.position.copy(ground);
      // Pins that share a coordinate are offset on screen only; mirror that with a small x shift.
      if (pin.nudgePx) marker.position.x += 3;
      marker.userData.ground = marker.position.clone();
      marker.userData.px = pin.kind === "habitat" ? 44 : 32;
      marker.userData.pinId = pin.id;
      s.markers.add(marker);
    }
    const tube = (points: readonly ProjectedPoint[], color: string, radius: number) => {
      if (points.length < 2) return;
      // Densify to about 1 m spacing so long segments follow the terrain instead of cutting through it.
      const dense: ProjectedPoint[] = [points[0]];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const steps = Math.max(1, Math.ceil(Math.hypot(b.xM - a.xM, b.yM - a.yM) / layout.pixelSizeM));
        for (let k = 1; k <= steps; k++) dense.push({ xM: a.xM + (b.xM - a.xM) * k / steps, yM: a.yM + (b.yM - a.yM) * k / steps });
      }
      const path = new THREE.CurvePath<THREE.Vector3>();
      const scenePoints = dense.map((p) => s.toScene(p, 0.6));
      for (let i = 1; i < scenePoints.length; i++) path.add(new THREE.LineCurve3(scenePoints[i - 1], scenePoints[i]));
      s.overlays.add(new THREE.Mesh(new THREE.TubeGeometry(path, Math.min(4000, scenePoints.length), radius, 5, false), new THREE.MeshBasicMaterial({ color })));
    };
    if (traverse) tube(traverse, "#EAF2FF", 0.35);
    if (routes) {
      for (const key of ["shortest", "weighted"] as const) {
        const trip = routes[key];
        if (!trip) continue;
        const color = key === "shortest" ? "#69D5FF" : "#E78759";
        const focused = routes.focus === key;
        tube(trip.outbound.geometry, color, focused ? 0.9 : 0.5);
        tube(trip.return.geometry, color, focused ? 0.6 : 0.35);
      }
    }
  }, [pins, routes, traverse, ready, exaggeration, selectedId]);

  return (
    <div ref={host} className="map3d" role="application"
      aria-label="Three-dimensional terrain of Wildcat Ridge from HiRISE elevation. Drag to orbit, scroll or pinch to zoom, right-drag or two fingers to pan.">
      <div ref={pinLayer} className="map3d__pins">
        {pins.map((pin) => (
          <div key={pin.id} data-pin={pin.id} data-nudge={pin.nudgePx ?? 0} className="map3d__pin">
            <Pin pin={pin} selected={pin.id === selectedId} onSelect={onSelect} style={{}} />
          </div>
        ))}
      </div>
    </div>
  );
}
