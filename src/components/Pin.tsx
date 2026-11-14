import type { CSSProperties } from "react";
import type { ProjectedPoint, RoundTrip } from "../contracts/index.ts";
import type { PinKind } from "../data/sites.ts";
import { MapFlag, RocketIcon } from "../explorer/icons.tsx";

export interface MapPin {
  id: string;
  kind: PinKind | "waypoint";
  label: string;
  point: ProjectedPoint;
  /** Screen-space offset for pins that share a location; the data coordinate is unchanged. */
  nudgePx?: number;
}

export interface RouteOverlay {
  shortest?: RoundTrip;
  weighted?: RoundTrip;
  focus: "shortest" | "weighted";
}

/** Flat icons match the flags and rocket on the terrain. */
function PinIcon({ kind }: { kind: MapPin["kind"] }) {
  if (kind === "habitat") return <RocketIcon size={28} />;
  return kind === "waypoint" ? null : <MapFlag size={28} nasaSource />;
}

export const PIN_KIND_LABEL: Record<MapPin["kind"], string> = {
  rover: "Rover discovery stop",
  science: "Science target",
  habitat: "Hypothetical crew landing and habitat",
  hardware: "Mission hardware",
  waypoint: "Rover waypoint",
};

export function Pin({ pin, selected, style, onSelect }: {
  pin: MapPin;
  selected: boolean;
  style: CSSProperties;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`pin pin--${pin.kind}${selected ? " pin--selected" : ""}`}
      style={style}
      aria-label={`${PIN_KIND_LABEL[pin.kind]}: ${pin.label}`}
      aria-pressed={selected}
      onClick={(event) => { event.stopPropagation(); onSelect(pin.id); }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="pin__icon" aria-hidden="true"><PinIcon kind={pin.kind} /></span>
    </button>
  );
}
