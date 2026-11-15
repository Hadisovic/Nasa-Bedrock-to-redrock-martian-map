import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

export type FlightInput = { forward: number; slide: number; turn: number; rise: number };
const neutral: FlightInput = { forward: 0, slide: 0, turn: 0, rise: 0 };
const movements = [
  { id: "forward", label: "Fly forward", icon: "↑", key: "ArrowUp", input: { forward: 1 } },
  { id: "left", label: "Turn left", icon: "↶", key: "ArrowLeft", input: { turn: -1 } },
  { id: "backward", label: "Fly backward", icon: "↓", key: "ArrowDown", input: { forward: -1 } },
  { id: "right", label: "Turn right", icon: "↷", key: "ArrowRight", input: { turn: 1 } },
  { id: "up", label: "Fly up", icon: "⇧", key: "PageUp", input: { rise: 1 } },
  { id: "down", label: "Fly down", icon: "⇩", key: "PageDown", input: { rise: -1 } },
  { id: "slideLeft", label: "Fly sideways left", icon: "⇤", key: "Shift+ArrowLeft", input: { slide: -1 } },
  { id: "slideRight", label: "Fly sideways right", icon: "⇥", key: "Shift+ArrowRight", input: { slide: 1 } },
] as const;

export function DroneControls({ onInput }: { onInput: (input: FlightInput) => void }) {
  const publish = useRef(onInput);
  publish.current = onInput;
  const held = useRef(new Map<number | string, Partial<FlightInput>>());
  const joystick = useRef<number | null>(null);
  const keyboardTap = useRef<number | undefined>(undefined);
  const [stick, setStick] = useState({ x: 0, y: 0 });

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
    if (joystick.current === id) {
      joystick.current = null;
      setStick({ x: 0, y: 0 });
    }
    sync();
  }

  useEffect(() => {
    const clear = () => {
      held.current.clear();
      joystick.current = null;
      clearTimeout(keyboardTap.current);
      setStick({ x: 0, y: 0 });
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

  function aim(event: PointerEvent<HTMLDivElement>) {
    if (joystick.current !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = bounds.width * 0.31;
    const x = (event.clientX - bounds.left - bounds.width / 2) / radius;
    const y = (event.clientY - bounds.top - bounds.height / 2) / radius;
    const limit = Math.max(1, Math.hypot(x, y));
    setStick({ x: x / limit * radius, y: y / limit * radius });
    const deadZone = (amount: number) => Math.sign(amount) * Math.max(0, Math.abs(amount) - 0.14) / 0.86;
    held.current.set(event.pointerId, { turn: deadZone(x / limit), forward: deadZone(-y / limit) });
    sync();
  }

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
      <span aria-hidden="true">{icon}</span>
      {altitude && <small aria-hidden="true">{id === "up" ? "Up" : "Down"}</small>}
    </button>);
  return <div className="drone-controls" role="group" aria-label="Drone movement" aria-describedby="drone-control-hint"
    onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}>
    <div className="drone-controls__steering">
      <div className="drone-controls__stick" aria-hidden="true"
        onPointerDown={(event) => {
          if (event.button !== 0 || joystick.current !== null) return;
          if (event.pointerType === "touch") event.preventDefault();
          joystick.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          aim(event);
        }}
        onPointerMove={aim}
        onPointerUp={(event) => release(event.pointerId)}
        onPointerCancel={(event) => release(event.pointerId)}
        onLostPointerCapture={(event) => release(event.pointerId)}>
        <span style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }} />
      </div>
      <div className="drone-controls__pad" role="group" aria-label="Flight arrows">{buttons(false)}</div>
    </div>
    <div className="drone-controls__altitude" role="group" aria-label="Flight altitude">{buttons(true)}</div>
    <span className="sr-only" id="drone-control-hint">Drag the joystick or hold the arrows. Drag the terrain to look around. Scroll or pinch for altitude.</span>
  </div>;
}
