import { useEffect, useRef } from "react";

export type DroneMove = "forward" | "backward" | "left" | "right" | "up" | "down" | "slideLeft" | "slideRight";

const movements = [
  { id: "forward", label: "Fly forward", icon: "↑", key: "ArrowUp" },
  { id: "left", label: "Turn left", icon: "↶", key: "ArrowLeft" },
  { id: "backward", label: "Fly backward", icon: "↓", key: "ArrowDown" },
  { id: "right", label: "Turn right", icon: "↷", key: "ArrowRight" },
  { id: "up", label: "Fly up", icon: "⇧", key: "PageUp" },
  { id: "down", label: "Fly down", icon: "⇩", key: "PageDown" },
  { id: "slideLeft", label: "Fly sideways left", icon: "⇤", key: "Shift+ArrowLeft" },
  { id: "slideRight", label: "Fly sideways right", icon: "⇥", key: "Shift+ArrowRight" },
] as const;

export function droneMoveForKey(key: string, shift = false): DroneMove | undefined {
  return movements.find((move) => move.key === (shift ? "Shift+" + key : key))?.id;
}

export function DroneControls({ onMove }: { onMove: (move: DroneMove, held: boolean) => void }) {
  const move = useRef(onMove);
  move.current = onMove;
  const holds = useRef(new Map<number, number>());

  function stop(pointerId?: number) {
    for (const [id, timer] of holds.current) {
      if (pointerId !== undefined && pointerId !== id) continue;
      window.clearTimeout(timer);
      holds.current.delete(id);
    }
  }

  useEffect(() => {
    const release = () => stop();
    window.addEventListener("blur", release);
    return () => { window.removeEventListener("blur", release); release(); };
  }, []);

  const buttons = (altitude: boolean) => movements.filter(({ id }) => (id === "up" || id === "down") === altitude)
    .map(({ id, label, icon, key }) => (
        <button key={id} type="button" className={`drone-controls__button drone-controls__button--${id}`}
          aria-label={label} aria-keyshortcuts={key} title={label}
          onPointerDown={(event) => {
            if (event.button !== 0 || holds.current.has(event.pointerId)) return;
            const pointerId = event.pointerId;
            event.currentTarget.setPointerCapture(pointerId);
            move.current(id, false);
            const repeat = () => {
              if (!holds.current.has(pointerId)) return;
              move.current(id, true);
              holds.current.set(pointerId, window.setTimeout(repeat, 65));
            };
            holds.current.set(pointerId, window.setTimeout(repeat, 220));
          }}
          onPointerUp={(event) => stop(event.pointerId)}
          onLostPointerCapture={(event) => stop(event.pointerId)}
          onPointerCancel={(event) => stop(event.pointerId)}
          onClick={(event) => { if (event.detail === 0) move.current(id, false); }}>
          <span aria-hidden="true">{icon}</span>
          {(id === "up" || id === "down") && <small aria-hidden="true">{id === "up" ? "Up" : "Down"}</small>}
        </button>
    ));
  return <div className="drone-controls" role="group" aria-label="Drone movement" aria-describedby="drone-control-hint">
    <div className="drone-controls__pad" role="group" aria-label="Steering joystick">{buttons(false)}</div>
    <div className="drone-controls__altitude" role="group" aria-label="Flight altitude">{buttons(true)}</div>
    <span className="sr-only" id="drone-control-hint">Hold the controls to keep moving. Arrow keys fly and turn. Hold Shift to fly sideways. Scroll, pinch, or use Page Up and Page Down to change altitude.</span>
  </div>;
}
