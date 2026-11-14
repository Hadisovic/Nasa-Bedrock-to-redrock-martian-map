import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { clampLat, clusterScreen, formatLatLon, lonDelta, wrapLon } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import { MapFlag, RocketIcon } from "./icons.tsx";
import { MarkerButton } from "./MarkerButton.tsx";
import { MapControls } from "./MapControls.tsx";
import { Astronaut } from "../components/Astronaut.tsx";
import { imageBounds, insideMarswalkCoverage } from "./catalog.ts";
import { nearGale } from "./galeLayout.ts";
import { droneSites } from "./droneCoverage.ts";
import type { MapLeg } from "./itinerary.ts";
import type { GlobeMarker, GlobeOverlay, GlobeView, RouteMapPoint, TileSource } from "./types.ts";
import { discreteOverlay } from "./overlaySampling.ts";
import { KM_PER_DEGREE, clampView, markerSizePx } from "./types.ts";

export interface GlobeMap2DProps {
  basemap: HTMLImageElement;
  overlays: readonly GlobeOverlay[];
  markers: readonly GlobeMarker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRoute: (id: string) => void;
  view: GlobeView;
  onViewChange: (view: GlobeView) => void;
  /** Bumped by the parent to animate to `view` instead of jumping. */
  flySignal: number;
  flyTarget?: GlobeView | null;
  tiles: TileSource | null;
  paths: readonly MapLeg[];
  switchView: () => void;
  onRouteClick?: (point: RouteMapPoint | null) => void;
  onRouteHover?: (point: RouteMapPoint | null) => void;
  onPick?: (point: LatLon) => void;
  sunPoint?: LatLon | null;
  /** Numerical MOLA elevation sampler for the cursor readout (metres above the MOLA areoid). */
  elevationAt?: ((lat: number, lon: number) => number | null) | null;
}

const CLUSTER_RADIUS_PX = 34;

function niceKm(km: number): number {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  return steps.reduce((best, s) => (s <= km ? s : best), steps[0]);
}

export function GlobeMap2D(props: GlobeMap2DProps) {
  const { basemap, overlays, markers, selectedId, onSelect, onRoute, view, onViewChange, flySignal, tiles, elevationAt, paths, onPick, sunPoint } = props;
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<LatLon | null>(null);
  const [openCluster, setOpenCluster] = useState<string | null>(null);
  const [tileTick, setTileTick] = useState(0);
  const [wildcat, setWildcat] = useState<HTMLCanvasElement | null>(null);
  const site = droneSites[0];
  const closeToWildcat = view.zoom > 30_000 && view.lat >= site.south - .01 && view.lat <= site.north + .01 &&
    view.lon >= site.west - .01 && view.lon <= site.east + .01;
  useEffect(() => {
    if (!closeToWildcat || wildcat) return;
    let active = true;
    void import("./galeTerrain.ts").then(({ wildcatImage }) => wildcatImage())
      .then(({ canvas }) => { if (active) setWildcat(canvas); }, () => {});
    return () => { active = false; };
  }, [closeToWildcat, wildcat]);
  const tileCache = useRef(new Map<string, HTMLImageElement | "error">());
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ pinch?: number; startX?: number; startY?: number; moved?: boolean }>({});
  const viewRef = useRef(view);
  viewRef.current = view;
  const paintedView = useRef(view);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }));
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);

  const set = useCallback((next: GlobeView) => onViewChange(clampView(next, sizeRef.current.height)), [onViewChange]);

  // Animated "Go to location".
  const target = useRef<GlobeView | null>(null);
  useEffect(() => {
    if (!flySignal || !props.flyTarget) return;
    const from = { ...paintedView.current };
    const to = props.flyTarget;
    target.current = to;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { set(to); return; }
    const start = performance.now();
    const dLon = lonDelta(from.lon, to.lon);
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const zoom = Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * e);
      set({ lat: from.lat + (to.lat - from.lat) * e, lon: wrapLon(from.lon + dLon * e), zoom });
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [flySignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const minZoom = size.height ? Math.min(size.width / 360, size.height / 180) : 1;
  const maxZoom = insideMarswalkCoverage(view) ? 240_000 : nearGale(view) ? 20_000 : tiles ? 4000 : 400;

  const project = useCallback((p: LatLon, v: GlobeView) => ({
    x: size.width / 2 + lonDelta(v.lon, p.lon) * v.zoom,
    y: size.height / 2 - (p.lat - v.lat) * v.zoom,
  }), [size]);

  const unproject = useCallback((x: number, y: number, v: GlobeView): LatLon => ({
    lat: clampLat(v.lat + (size.height / 2 - y) / v.zoom),
    lon: wrapLon(v.lon + (x - size.width / 2) / v.zoom),
  }), [size]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    const v = viewRef.current;
    const zoom = Math.min(maxZoom, Math.max(minZoom, v.zoom * factor));
    // Keep the point under the cursor fixed.
    const anchor = unproject(cx, cy, v);
    set({ zoom, lat: anchor.lat - (size.height / 2 - cy) / zoom, lon: wrapLon(anchor.lon - (cx - size.width / 2) / zoom) });
  }, [maxZoom, minZoom, unproject, set, size]);

  // Draw basemap copies across the seam, on-demand tiles, overlays and footprints.
  useEffect(() => {
    const element = canvas.current;
    if (!element || !size.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(size.width * dpr), height = Math.round(size.height * dpr);
    if (element.width !== width) element.width = width;
    if (element.height !== height) element.height = height;
    const ctx = element.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    const v = view;
    paintedView.current = v;
    const worldW = 360 * v.zoom;
    const left = size.width / 2 + (-180 - v.lon) * v.zoom;
    const top = size.height / 2 - (90 - v.lat) * v.zoom;
    const copies: number[] = [];
    for (let x = left - Math.ceil((left + 1) / worldW) * worldW; x < size.width; x += worldW) copies.push(x);

    ctx.imageSmoothingEnabled = true;
    // Crop in source pixels before drawing so close zoom does not ask the canvas
    // backend to rasterize an entire planet-sized destination rectangle.
    const worldH = 180 * v.zoom;
    const north = Math.max(0, top), south = Math.min(size.height, top + worldH);
    for (const x of copies) {
      const west = Math.max(0, x), east = Math.min(size.width, x + worldW);
      if (east <= west || south <= north) continue;
      const sx = basemap.naturalWidth / worldW, sy = basemap.naturalHeight / worldH;
      ctx.drawImage(basemap, (west - x) * sx, (north - top) * sy, (east - west) * sx, (south - north) * sy,
        west, north, east - west, south - north);
    }

    // Finer imagery on demand once the bundled basemap would be magnified.
    const baseZoom = basemap.naturalWidth / 360;
    if (tiles && v.zoom * dpr > baseZoom * 1.2) {
      let level = 0;
      while (level < tiles.maxZoom && (256 * tiles.colsAt(level)) / 360 < v.zoom * dpr) level++;
      const cols = tiles.colsAt(level), rows = tiles.rowsAt(level);
      const tileDeg = 360 / cols;
      const tilePx = tileDeg * v.zoom;
      const viewWest = v.lon - size.width / 2 / v.zoom, viewEast = v.lon + size.width / 2 / v.zoom;
      const viewNorth = v.lat + size.height / 2 / v.zoom, viewSouth = v.lat - size.height / 2 / v.zoom;
      const r0 = Math.max(0, Math.floor((90 - viewNorth) / tileDeg)), r1 = Math.min(rows - 1, Math.floor((90 - viewSouth) / tileDeg));
      const c0 = Math.floor((viewWest + 180) / tileDeg), c1 = Math.floor((viewEast + 180) / tileDeg);
      if ((r1 - r0 + 1) * (c1 - c0 + 1) <= 80) {
        for (let r = r0; r <= r1; r++) {
          for (let cRaw = c0; cRaw <= c1; cRaw++) {
            const c = ((cRaw % cols) + cols) % cols;
            const url = tiles.url(level, r, c);
            let image = tileCache.current.get(url);
            if (!image) {
              const img = new Image();
              img.decoding = "async";
              img.crossOrigin = "anonymous";
              img.onload = () => { if (tileCache.current.get(url) === img) setTileTick((t) => t + 1); };
              img.onerror = () => { if (tileCache.current.get(url) === img) tileCache.current.set(url, "error"); };
              img.src = url;
              tileCache.current.set(url, img);
              if (tileCache.current.size > 160) {
                const oldest = tileCache.current.keys().next().value;
                if (oldest) tileCache.current.delete(oldest);
              }
              image = img;
            }
            if (image !== "error" && image.complete && image.naturalWidth) {
              const x = size.width / 2 + (cRaw * tileDeg - 180 - v.lon) * v.zoom;
              const y = size.height / 2 - (90 - r * tileDeg - v.lat) * v.zoom;
              ctx.drawImage(image, x, y, tilePx + 0.5, tilePx + 0.5);
            }
          }
        }
      }
    }

    if (closeToWildcat && wildcat) {
      const p = project({ lat: site.north, lon: site.west }, v);
      ctx.drawImage(wildcat, p.x, p.y, (site.east - site.west) * v.zoom, (site.north - site.south) * v.zoom);
    }

    if (sunPoint) {
      const r = Math.PI / 180, sunLat = sunPoint.lat * r;
      ctx.fillStyle = "rgba(1, 5, 18, 0.55)";
      const stride = Math.max(3, Math.floor(Math.min(size.width, size.height) / 120));
      for (let y = Math.max(0, Math.floor(top)); y < Math.min(size.height, top + 180 * v.zoom); y += stride) {
        const lat = (90 - (y - top + stride / 2) / v.zoom) * r;
        const a = Math.sin(lat) * Math.sin(sunLat), b = Math.cos(lat) * Math.cos(sunLat);
        for (let x = 0; x < size.width; x += stride) {
          const lon = (v.lon + (x + stride / 2 - size.width / 2) / v.zoom - sunPoint.lon) * r;
          if (a + b * Math.cos(lon) < 0) ctx.fillRect(x, y, stride, stride);
        }
      }
    }
    for (const overlay of overlays) {
      if (overlay.features) {
        // Source vectors stay crisp at every zoom: detections as dots, deposits as outlines.
        ctx.globalAlpha = overlay.opacity;
        const r = Math.max(2, Math.min(5, v.zoom / 6));
        for (const f of overlay.features) {
          if (f.kind === "point") {
            const p = project(f, v);
            if (p.x < -6 || p.y < -6 || p.x > size.width + 6 || p.y > size.height + 6) continue;
            ctx.fillStyle = f.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1; ctx.stroke();
          } else {
            ctx.beginPath();
            for (const ring of f.rings) {
              if (!ring.length) continue;
              const first = project({ lon: ring[0][0], lat: ring[0][1] }, v);
              for (const shift of [-worldW, 0, worldW]) {
                let x = first.x + shift;
                ctx.moveTo(x, first.y);
                ring.slice(1).forEach(([lon, lat], i) => {
                  x += lonDelta(ring[i][0], lon) * v.zoom;
                  ctx.lineTo(x, size.height / 2 + (v.lat - lat) * v.zoom);
                });
                ctx.closePath();
              }
            }
            ctx.fillStyle = f.color; ctx.globalAlpha = overlay.opacity * 0.45; ctx.fill();
            ctx.globalAlpha = overlay.opacity; ctx.strokeStyle = f.color; ctx.lineWidth = 1.5; ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        continue;
      }
      if (!overlay.image) continue;
      const coverage = imageBounds(overlay.entry);
      ctx.globalAlpha = overlay.opacity;
      ctx.imageSmoothingEnabled = !discreteOverlay(overlay.entry);
      const w = (coverage.east - coverage.west) * v.zoom, h = (coverage.north - coverage.south) * v.zoom;
      for (const x of copies) {
        ctx.drawImage(overlay.image, x + (coverage.west + 180) * v.zoom, top + (90 - coverage.north) * v.zoom, w, h);
      }
      ctx.globalAlpha = 1;
    }

    // Regional footprints and proposed paths (never drawn as observed points).
    for (const marker of markers) {
      const p = project(marker, v);
      if (marker.footprintKm) {
        const r = (marker.footprintKm / KM_PER_DEGREE) * v.zoom;
        if (r > 4) {
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, r / Math.max(0.15, Math.cos((marker.lat * Math.PI) / 180)), r, 0, 0, Math.PI * 2);
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = marker.id === selectedId ? "#EAF2FF" : "rgba(234,242,255,0.6)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      if (marker.path && marker.path.length > 1) {
        ctx.beginPath();
        marker.path.forEach((q, i) => {
          const s = project(q, v);
          if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y);
        });
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = "#E78759";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (paths.length) {
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const { points, returning, preview, color, selected = true } of paths) {
        ctx.globalAlpha = selected ? 1 : 0.8;
        ctx.beginPath();
        let lastX = Infinity;
        for (const point of points) {
          const { x, y } = project(point, v);
          if (Math.abs(x - lastX) > worldW / 2) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          lastX = x;
        }
        const dash = returning ? [7, 7] : [];
        ctx.setLineDash(dash);
        ctx.strokeStyle = "#0b1724";
        ctx.lineWidth = selected ? 8 : 4.5;
        ctx.stroke();
        ctx.strokeStyle = preview ? "#ffe689" : color ?? "#69d5ff";
        ctx.lineWidth = selected ? 5 : 2.5;
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }, [basemap, overlays, markers, view, size, tiles, tileTick, project, selectedId, paths, sunPoint, closeToWildcat, wildcat, site]);

  // Screen-space clusters; the selected marker always stays on its own.
  const clusters = useMemo(() => {
    if (!size.width) return [];
    const items = markers
      .map((m) => ({ item: m, ...project(m, view) }))
      .filter((s) => s.x > -40 && s.y > -40 && s.x < size.width + 40 && s.y < size.height + 40)
      .sort((a, b) => a.item.id.localeCompare(b.item.id));
    const keepSeparate = (m: GlobeMarker) => m.id === selectedId || m.kind !== "flag";
    const selected = items.filter((s) => keepSeparate(s.item));
    const rest = items.filter((s) => !keepSeparate(s.item));
    return [...clusterScreen(rest, CLUSTER_RADIUS_PX, (m) => m.id), ...selected.map((s) => ({ id: s.item.id, x: s.x, y: s.y, members: [s.item] }))];
  }, [markers, view, size, project, selectedId]);

  useEffect(() => { setOpenCluster(null); }, [view.zoom]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    if (pointers.current.size === 0) gesture.current = { startX: event.clientX, startY: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      gesture.current.moved = true;
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const hitsRoute = ({ x, y }: RouteMapPoint, tolerance: number) => {
    if (!paths.length) return false;
    const view = viewRef.current;
    const nearLeg = (points: readonly LatLon[]) => points.some((point, i) => {
      if (!i) return false;
      const a = project(points[i - 1], view), b = project(point, view);
      if (Math.abs(a.x - b.x) > 180 * view.zoom) return false;
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(x - a.x - t * dx, y - a.y - t * dy) <= tolerance;
    });
    return paths.some((path) => !path.preview && nearLeg(path.points));
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const rect = host.current!.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (event.pointerType === "mouse") {
      setHover(unproject(point.x, point.y, viewRef.current));
      const emptyMap = !(event.target instanceof Element && event.target.closest("button"));
      props.onRouteHover?.(!onPick && !event.buttons && emptyMap && hitsRoute(point, 11) ? point : null);
    }
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      gesture.current.moved ||= Math.hypot(event.clientX - (gesture.current.startX ?? event.clientX), event.clientY - (gesture.current.startY ?? event.clientY)) > 5;
      if (onPick && !gesture.current.moved) return;
      const v = viewRef.current;
      set({ ...v, lon: wrapLon(v.lon - (event.clientX - previous.x) / v.zoom), lat: v.lat + (event.clientY - previous.y) / v.zoom });
    } else if (pointers.current.size === 2 && gesture.current.pinch) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(distance / gesture.current.pinch, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      gesture.current.pinch = distance;
    }
  };
  const release = (event: React.PointerEvent) => {
    if (event.type === "pointerup" && pointers.current.has(event.pointerId) && !gesture.current.moved) {
      const rect = host.current!.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const v = viewRef.current;
      if (onPick) {
        const lat = v.lat + (size.height / 2 - y) / v.zoom;
        if (Math.abs(lat) <= 90) onPick(unproject(x, y, v));
      } else props.onRouteClick?.(hitsRoute({ x, y }, event.pointerType === "touch" ? 25 : 11) ? { x, y } : null);
    }
    pointers.current.delete(event.pointerId);
    gesture.current.pinch = undefined;
  };

  useEffect(() => {
    const element = host.current!;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    const v = viewRef.current;
    const step = 80 / v.zoom;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => set({ ...v, lon: wrapLon(v.lon - step) }),
      ArrowRight: () => set({ ...v, lon: wrapLon(v.lon + step) }),
      ArrowUp: () => set({ ...v, lat: v.lat + step }),
      ArrowDown: () => set({ ...v, lat: v.lat - step }),
      "+": () => zoomAt(1.4, size.width / 2, size.height / 2),
      "=": () => zoomAt(1.4, size.width / 2, size.height / 2),
      "-": () => zoomAt(1 / 1.4, size.width / 2, size.height / 2),
      ...(onPick && { Enter: () => onPick(v), " ": () => onPick(v) }),
    };
    const action = actions[event.key];
    if (action) { event.preventDefault(); action(); }
  };

  const kmPerPx = KM_PER_DEGREE / view.zoom;
  const barKm = niceKm(kmPerPx * 110);
  const iconSize = markerSizePx(view.zoom, minZoom);

  return (
    <div ref={host} className="map2d globe2d" tabIndex={0} role="application"
      aria-label="Flat, north-up map of the whole of Mars. Drag or use arrow keys to pan; it wraps at the 180° seam. Scroll, pinch or use plus and minus to zoom."
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={release} onPointerCancel={release}
      onPointerLeave={() => { setHover(null); props.onRouteHover?.(null); }} onKeyDown={onKeyDown}>
      <canvas ref={canvas} className="map2d__canvas" aria-hidden="true" />
      {clusters.map((cluster) => {
        if (cluster.members.length > 1) {
          const open = openCluster === cluster.id;
          return (
            <div key={cluster.id} className="gpin-wrap" style={{ transform: `translate(${cluster.x}px, ${cluster.y}px)` }}>
              <button type="button" className="gpin gpin--cluster" aria-expanded={open}
                aria-label={`${cluster.members.length} nearby locations. ${view.zoom >= maxZoom * 0.9 ? "Show the list" : "Zoom in to separate them"}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  const spread = Math.max(...cluster.members.map((m) => Math.abs(project(m, view).x - cluster.x) + Math.abs(project(m, view).y - cluster.y)));
                  if (view.zoom >= maxZoom * 0.9 || spread < 2) { setOpenCluster(open ? null : cluster.id); return; }
                  const at = { x: cluster.x, y: cluster.y };
                  zoomAt(Math.min(4, Math.max(2, (CLUSTER_RADIUS_PX * 1.5) / Math.max(1, spread))), at.x, at.y);
                }}>
                <span className="flag-cluster">{cluster.members.length}</span>
              </button>
              {open && (
                <ul className="cluster-list" onPointerDown={(e) => e.stopPropagation()}>
                  {cluster.members.map((m) => (
                    <li key={m.id}><button type="button" onClick={() => { setOpenCluster(null); onSelect(m.id); }}>{m.label}</button></li>
                  ))}
                </ul>
              )}
            </div>
          );
        }
        const m = cluster.members[0];
        const selected = m.id === selectedId;
        return (
          <div key={m.id} className={`gpin-wrap${selected ? " gpin-wrap--selected" : ""}`} style={{ transform: `translate(${cluster.x}px, ${cluster.y}px)` }}>
            <MarkerButton className={`gpin gpin--${m.kind}${selected ? " gpin--selected" : ""}`}
              label={m.label} selected={selected} onSelect={() => onSelect(m.id)}
              onRoute={m.kind === "flag" ? () => onRoute(m.id) : undefined}>
              {m.order ? <span className="itinerary-number">{m.order}</span>
                : m.kind === "rocket" ? <span key={`${m.lat},${m.lon}`} className="map-rocket-landing"><RocketIcon size={Math.round(iconSize * 1.15)} /></span> :
                m.kind === "crew" ? <Astronaut decorative className="crew-replay-icon" /> :
                <MapFlag size={m.kind === "flag" ? Math.max(27, iconSize) : iconSize} color={m.accent} nasaSource={m.kind === "flag"} />}
            </MarkerButton>
          </div>
        );
      })}
      <MapControls switchView={props.switchView} zoomIn={() => zoomAt(1.6, size.width / 2, size.height / 2)}
        zoomOut={() => zoomAt(1 / 1.6, size.width / 2, size.height / 2)} />
      <div className="map-hud map-hud--scale" aria-label={`Scale bar ${barKm} kilometres along a meridian`}>
        <div className="scalebar" style={{ width: `${barKm / kmPerPx}px` }} />
        <span>{barKm} km</span>
      </div>
      {hover && <div className="map-hud map-hud--coords" aria-hidden="true">{formatLatLon(hover, 2)}{elevationAt ? (() => { const z = elevationAt(hover.lat, hover.lon); return z == null ? "" : ` · MOLA ${Math.round(z).toLocaleString()} m`; })() : ""}</div>}
    </div>
  );
}
