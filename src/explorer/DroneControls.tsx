import { useEffect, useRef } from "react";

export type FlightInput = { forward: number; slide: number; turn: number; rise: number };
const neutral: FlightInput = { forward: 0, slide: 0, turn: 0, rise: 0 };
const movements = [
  { id: "forward", label: "Fly forward", icon: "M12 20V4m-6 6 6-6 6 6", key: "ArrowUp", input: { forward: 1 } },
  { id: "left", label: "Turn left", icon: "M5 12h8a5 5 0 0 1 5 5v2M5 12l5-5m-5 5 5 5", key: "ArrowLeft", input: { turn: -1 } },
  { id: "backward", label: "Fly backward", icon: "M12 4v16m-6-6 6 6 6-6", key: "ArrowDown", input: { forward: -1 } },
  { id: "right", label: "Turn right", icon: "M19 12h-8a5 5 0 0 0-5 5v2m13-7-5-5m5 5-5 5", key: "ArrowRight", input: { turn: 1 } },
  { id: "up", label: "Fly up", icon: "m6 10 6-6 6 6m-12 7 6-6 6 6", key: "PageUp", input: { rise: 1 } },
  { id: "down", label: "Fly down", icon: "m6 7 6 6 6-6m-12 7 6 6 6-6", key: "PageDown", input: { rise: -1 } },
  { id: "slideLeft", label: "Fly sideways left", icon: "M19 12H5m6-6-6 6 6 6M3 5v14", key: "Shift+ArrowLeft", input: { slide: -1 } },
  { id: "slideRight", label: "Fly sideways right", icon: "M5 12h14m-6-6 6 6-6 6m8-13v14", key: "Shift+ArrowRight", input: { slide: 1 } },
] as const;

export function DroneControls({ onInput }: { onInput: (input: FlightInput) => void }) {
  const publish = useRef(onInput);
  publish.current = onInput;
  const held = useRef(new Map<number | string, Partial<FlightInput>>());
  const keyboardTap = useRef<number | undefined>(undefined);

  function sync() {
    const input = { ...neutral };
    for (const command of held.current.values()) {
      for (const axis of Object.keys(neutral) as (keyof FlightInput)[]) input[axis] += command[axis] ?? 0;
    }
    for (const axis of Object.keys(neutral) as (keyof FlightInput)[]) input[axis] = Math.max(-1, Math.min(1, input[axis]));
    publish.current(input);
  }

  function release(id: number | string) {
    held.current.delete(id);
    sync();
  }

  useEffect(() => {
    const clear = () => {
      held.current.clear();
      clearTimeout(keyboardTap.current);
      publish.current(neutral);
    };
    const keydown = (event: KeyboardEvent) => {
      if (!(event.target instanceof Element) || event.target.closest("input, textarea, select, [contenteditable], dialog[open]") ||
        event.altKey || event.ctrlKey || event.metaKey) return;
      const match = movements.find(({ key }) => key === `${event.shiftKey ? "Shift+" : ""}${event.key}`);
      if (!match) return;
      event.preventDefault();
      held.current.set(event.code || event.key, match.input);
      sync();
    };
    const keyup = (event: KeyboardEvent) => {
      const key = event.code || event.key;
      if (held.current.has(key)) release(key);
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      clear();
    };
  }, []);

  const buttons = (altitude: boolean) => movements.filter(({ id }) => (id === "up" || id === "down") === altitude)
    .map(({ id, label, icon, key, input }) => <button key={id} type="button"
      className={`drone-controls__button drone-controls__button--${id}`} aria-label={label} aria-keyshortcuts={key} title={label}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if (event.pointerType === "touch") event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        held.current.set(event.pointerId, input);
        sync();
      }}
      onPointerUp={(event) => release(event.pointerId)}
      onPointerCancel={(event) => release(event.pointerId)}
      onLostPointerCapture={(event) => release(event.pointerId)}
      onClick={(event) => {
        if (event.detail !== 0) return;
        clearTimeout(keyboardTap.current);
        held.current.set("tap", input);
        sync();
        keyboardTap.current = window.setTimeout(() => release("tap"), 120);
      }}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
      {altitude && <small aria-hidden="true">{id === "up" ? "Up" : "Down"}</small>}
    </button>);
  return <div className="drone-controls" role="group" aria-label="Drone movement" aria-describedby="drone-control-hint"
    onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}>
    <div className="drone-controls__pad" role="group" aria-label="Flight arrows">{buttons(false)}</div>
    <div className="drone-controls__altitude" role="group" aria-label="Flight altitude">{buttons(true)}</div>
    <span className="sr-only" id="drone-control-hint">Hold the arrows to fly. Drag the terrain to look around. Scroll or pinch to zoom by changing altitude.</span>
  </div>;
}
