import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

const HOLD_MS = 520;
const TAP_TOLERANCE_PX = 8;

export function MarkerButton({ className, label, selected, onSelect, onRoute, children }: {
  className: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
  onRoute?: () => void;
  children?: ReactNode;
}) {
  const route = useRef(onRoute);
  route.current = onRoute;
  const timer = useRef<number | undefined>(undefined);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const skipClick = useRef(false);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);

  function stopHolding() {
    window.clearTimeout(timer.current);
    pointer.current = null;
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return <button type="button" className={className} aria-label={label} aria-pressed={selected}
    title={onRoute ? "Open details · double-click or hold for directions" : undefined}
    onPointerDown={(event) => {
      event.stopPropagation();
      if (!onRoute || !event.isPrimary || event.button !== 0) return;
      skipClick.current = false;
      const id = event.pointerId;
      pointer.current = { id, x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(id);
      timer.current = window.setTimeout(() => {
        skipClick.current = true;
        lastTap.current = null;
        stopHolding();
        route.current?.();
      }, HOLD_MS);
    }}
    onPointerMove={(event) => {
      const press = pointer.current;
      if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP_TOLERANCE_PX) {
        skipClick.current = true;
        lastTap.current = null;
        stopHolding();
      }
    }}
    onPointerUp={stopHolding}
    onPointerCancel={stopHolding}
    onLostPointerCapture={stopHolding}
    onContextMenu={onRoute ? (event) => event.preventDefault() : undefined}
    onClick={(event) => {
      event.stopPropagation();
      if (event.detail === 0) {
        lastTap.current = null;
        onSelect();
        return;
      }
      if (skipClick.current) { skipClick.current = false; return; }
      const { clientX: x, clientY: y, timeStamp: time } = event;
      const previous = lastTap.current;
      if (onRoute && (event.detail === 2 || (previous && time - previous.time < 350 &&
          Math.hypot(x - previous.x, y - previous.y) <= TAP_TOLERANCE_PX))) {
        lastTap.current = null;
        onRoute();
        return;
      }
      lastTap.current = { x, y, time };
      onSelect();
    }}>
    {children}
  </button>;
}
