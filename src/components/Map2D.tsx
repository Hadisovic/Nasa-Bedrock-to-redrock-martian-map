import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ProjectedPoint, RasterLayout } from "../contracts/index.ts";
import { Pin } from "./Pin.tsx";
import type { MapPin, RouteOverlay } from "./Pin.tsx";

interface View { scale: number; tx: number; ty: number }

export interface Map2DProps {
  image: HTMLCanvasElement;
  layout: RasterLayout;
  pins: readonly MapPin[];
  traverse: readonly ProjectedPoint[] | null;
  routes: RouteOverlay | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  placing: boolean;
  onPlace: (point: ProjectedPoint) => void;
  resetSignal: number;
  imageVersion: number;
}

const ROUTE_COLORS = { shortest: "#69D5FF", weighted: "#E78759" } as const;

function niceLength(meters: number): number {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200];
  return steps.reduce((best, s) => (s <= meters ? s : best), 1);
}

export function Map2D(props: Map2DProps) {
  const { image, layout, pins, traverse, routes, selectedId, onSelect, placing, onPlace, resetSignal, imageVersion } = props;
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; startX: number; startY: number; pinchDistance?: number }>({ moved: false, startX: 0, startY: 0 });

  const fit = useCallback((width: number, height: number): View => {
    const scale = Math.min(width / layout.width, height / layout.height) * 0.96;
    return { scale, tx: (width - layout.width * scale) / 2, ty: (height - layout.height * scale) / 2 };
  }, [layout]);

  const lastSize = useRef({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = host.current!;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width), height = Math.round(entry.contentRect.height);
      const previous = lastSize.current;
      if (previous.width === width && previous.height === height) return;
      lastSize.current = { width, height };
      // Keep the map centred when the container changes size, e.g. on rotation.
      setView((v) => (v && previous.width
        ? { ...v, tx: v.tx + (width - previous.width) / 2, ty: v.ty + (height - previous.height) / 2 }
        : fit(width, height)));
      setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit]);

  useEffect(() => { if (size.width) setView(fit(size.width, size.height)); }, [resetSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const minScale = size.width ? fit(size.width, size.height).scale * 0.5 : 0.1;
  const maxScale = 12;

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      if (!v) return v;
      const scale = Math.min(maxScale, Math.max(minScale, v.scale * factor));
      const k = scale / v.scale;
      return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    });
  }, [minScale]);

  const toScreen = useCallback((p: ProjectedPoint, v: View) => ({
    x: v.tx + ((p.xM - layout.westM) / layout.pixelSizeM) * v.scale,
    y: v.ty + ((layout.northM - p.yM) / layout.pixelSizeM) * v.scale,
  }), [layout]);

  const toProjected = useCallback((x: number, y: number, v: View): ProjectedPoint => ({
    xM: layout.westM + ((x - v.tx) / v.scale) * layout.pixelSizeM,
    yM: layout.northM - ((y - v.ty) / v.scale) * layout.pixelSizeM,
  }), [layout]);

  // Draw imagery, traverse and routes.
  useEffect(() => {
    const element = canvas.current;
    if (!element || !view || !size.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    element.width = Math.round(size.width * dpr);
    element.height = Math.round(size.height * dpr);
    const ctx = element.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0B1424";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.imageSmoothingEnabled = view.scale < 1.5;
    ctx.drawImage(image, view.tx, view.ty, layout.width * view.scale, layout.height * view.scale);
    ctx.strokeStyle = "rgba(234,242,255,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(view.tx, view.ty, layout.width * view.scale, layout.height * view.scale);

    const line = (points: readonly ProjectedPoint[], color: string, width: number, dash: number[] = []) => {
      if (points.length < 2) return;
      ctx.beginPath();
      points.forEach((p, i) => { const s = toScreen(p, view); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
      ctx.setLineDash(dash);
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(11,20,36,0.85)"; ctx.lineWidth = width + 3; ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
      ctx.setLineDash([]);
    };
    if (traverse) line(traverse, "rgba(234,242,255,0.85)", 1.5, [4, 4]);
    if (routes) {
      const order = routes.focus === "shortest" ? (["weighted", "shortest"] as const) : (["shortest", "weighted"] as const);
      for (const key of order) {
        const trip = routes[key];
        if (!trip) continue;
        const focused = routes.focus === key;
        line(trip.outbound.geometry, ROUTE_COLORS[key], focused ? 3.5 : 2);
        line(trip.return.geometry, ROUTE_COLORS[key], focused ? 2.5 : 1.5, [6, 5]);
      }
    }
  }, [image, imageVersion, view, size, layout, traverse, routes, toScreen]);

  const onPointerDown = (event: React.PointerEvent) => {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      gesture.current = { moved: false, startX: event.clientX, startY: event.clientY };
    } else {
      // Any multi-touch gesture is never a placement tap.
      gesture.current.moved = true;
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        gesture.current.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      }
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const rect = host.current!.getBoundingClientRect();
    if (pointers.current.size === 1) {
      const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
      if (Math.hypot(event.clientX - gesture.current.startX, event.clientY - gesture.current.startY) > 4) gesture.current.moved = true;
      setView((v) => (v ? { ...v, tx: v.tx + dx, ty: v.ty + dy } : v));
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && gesture.current.pinchDistance) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(distance / gesture.current.pinchDistance, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      gesture.current.pinchDistance = distance;
    }
  };

  const releasePointer = (pointerId: number): boolean => {
    const known = pointers.current.delete(pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    } else {
      gesture.current.pinchDistance = undefined;
    }
    return known;
  };

  const onPointerUp = (event: React.PointerEvent) => {
    // Ignore releases from pointers that did not go down on the map.
    if (!releasePointer(event.pointerId)) return;
    if (pointers.current.size === 0 && !gesture.current.moved && placing && view) {
      const rect = host.current!.getBoundingClientRect();
      onPlace(toProjected(event.clientX - rect.left, event.clientY - rect.top, view));
    }
  };

  const onPointerCancel = (event: React.PointerEvent) => {
    releasePointer(event.pointerId);
    gesture.current.moved = true;
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
    const step = 60;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => setView((v) => v && { ...v, tx: v.tx + step }),
      ArrowRight: () => setView((v) => v && { ...v, tx: v.tx - step }),
      ArrowUp: () => setView((v) => v && { ...v, ty: v.ty + step }),
      ArrowDown: () => setView((v) => v && { ...v, ty: v.ty - step }),
      "+": () => zoomAt(1.25, size.width / 2, size.height / 2),
      "=": () => zoomAt(1.25, size.width / 2, size.height / 2),
      "-": () => zoomAt(0.8, size.width / 2, size.height / 2),
      "0": () => setView(fit(size.width, size.height)),
    };
    const action = keys[event.key];
    if (action && event.target === event.currentTarget) { event.preventDefault(); action(); }
  };

  const metersPerPixel = view ? layout.pixelSizeM / view.scale : 1;
  const barMeters = niceLength(metersPerPixel * 110);

  return (
    <div
      ref={host}
      className={`map2d${placing ? " map2d--placing" : ""}`}
      tabIndex={0}
      role="application"
      aria-label="Two-dimensional map of Wildcat Ridge. Drag or use arrow keys to pan, scroll, pinch or use plus and minus to zoom, 0 to fit."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      <canvas ref={canvas} className="map2d__canvas" aria-hidden="true" />
      {view && pins.map((pin) => {
        const s = toScreen(pin.point, view);
        if (s.x < -20 || s.y < -20 || s.x > size.width + 20 || s.y > size.height + 20) return null;
        return <Pin key={pin.id} pin={pin} selected={pin.id === selectedId} onSelect={onSelect}
          style={{ transform: `translate(${s.x + (pin.nudgePx ?? 0)}px, ${s.y}px)` }} />;
      })}
      <div className="map-hud map-hud--north" aria-hidden="true"><span>N</span>▲</div>
      <div className="map-hud map-hud--scale" aria-label={`Scale bar ${barMeters} metres`}>
        <div className="scalebar" style={{ width: `${barMeters / metersPerPixel}px` }} />
        <span>{barMeters} m</span>
      </div>
      <div className="map-zoom">
        <button type="button" onClick={() => zoomAt(1.4, size.width / 2, size.height / 2)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomAt(1 / 1.4, size.width / 2, size.height / 2)} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => setView(fit(size.width, size.height))} aria-label="Fit map to view">⤢</button>
      </div>
      {placing && <p className="map-banner" role="status">Tap or click the map to place the hypothetical habitat.</p>}
    </div>
  );
}
