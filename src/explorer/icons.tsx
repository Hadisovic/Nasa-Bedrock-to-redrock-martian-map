import { TeamBadge } from "./teamBadge.tsx";

const flightPaths = {
  drone: "M8 9h8v6H8zM8 12H4m12 0h4M2 8h5m10 0h5M4 8v4m16-4v4m-9 3h2",
  exit: "M11 6 5 12l6 6m-6-6h13m-2-8h4v16h-4",
  terrain: "M3 18 9 8l4 6 3-4 5 8zM7 12h4",
  geology: "m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5",
  camera: "M4 8h4l2-3h4l2 3h4v11H4zM9 13a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
};

export function FlightIcon({ kind }: { kind: keyof typeof flightPaths }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={flightPaths[kind]} /></svg>;
}

export function GoToLocation({ onClick }: { onClick: () => void }) {
  return <button type="button" className="btn btn--small btn--locate" onClick={onClick}>
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M3 11 21 3l-8 18-2.2-7.8L3 11Z" />
    </svg>
    Go to location
  </button>;
}

export function RoverIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <path d="M3 16h18v-4l-4-2h-6V6h5M7 16v-3h4M3 16v-3" />
    <circle cx="5" cy="18" r="2" /><circle cx="12" cy="18" r="2" /><circle cx="19" cy="18" r="2" />
  </svg>;
}

const navigationPaths = {
  start: "M4 11 20 4l-7 16-2.3-6.7L4 11Z",
  gps: "M12 2v4m0 12v4M2 12h4m12 0h4M12 5a7 7 0 1 0 0 14 7 7 0 1 0 0-14Zm0 5a2 2 0 1 0 0 4 2 2 0 1 0 0-4Z",
  astronaut: "M15 5a2 2 0 1 0-4 0 2 2 0 1 0 4 0ZM7 21l3-5 2-6m0 0 3 4h4m-7-4H9l-3 4m4 2 5 1 2 4",
  close: "m6 6 12 12M18 6 6 18",
  expand: "m5 9 7 7 7-7",
  collapse: "m5 15 7-7 7 7",
  sound: "M3 9v6h4l5 4V5L7 9H3Zm12 0a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10",
  mute: "M3 9v6h4l5 4V5L7 9H3Zm12 1 5 5m0-5-5 5",
  ahead: "M12 21V4m-6 6 6-6 6 6",
  left: "M18 21v-7a4 4 0 0 0-4-4H4m5-5-5 5 5 5",
  right: "M6 21v-7a4 4 0 0 1 4-4h10m-5-5 5 5-5 5",
};

export function NavigationIcon({ kind }: { kind: keyof typeof navigationPaths }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={navigationPaths[kind]} /></svg>;
}

export function RocketIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 14" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      <rect x="5" y="0" width="2" height="1" fill="#E78759" />
      <rect x="4" y="1" width="4" height="2" fill="#EEEEF4" />
      <rect x="3" y="3" width="6" height="6" fill="#EEEEF4" />
      <rect x="5" y="4" width="2" height="2" fill="#0a1a3a" />
      <rect x="3" y="7" width="6" height="1" fill="#9B0806" />
      <rect x="2" y="8" width="1" height="3" fill="#A3B1C4" />
      <rect x="9" y="8" width="1" height="3" fill="#A3B1C4" />
      <rect x="4" y="9" width="4" height="2" fill="#343C4E" />
      <rect x="1" y="11" width="2" height="1" fill="#A3B1C4" />
      <rect x="9" y="11" width="2" height="1" fill="#A3B1C4" />
      <rect x="0" y="13" width="12" height="1" fill="#69D5FF" />
    </svg>
  );
}

/** Team-designed provenance flag with a plain-text NASA credit beside it. */
export function SourceFlag() {
  return (
    <span className="source-flag">
      <svg width="18" height="12" viewBox="0 0 24 16" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
        <rect width="24" height="16" fill="#0B1424" stroke="#EAF2FF" strokeWidth="1" />
        <rect x="0" y="10" width="24" height="3" fill="#69D5FF" />
        <rect x="3" y="3" width="5" height="5" fill="#E78759" />
      </svg>
      Source: NASA
    </span>
  );
}
export function MapFlag({ size = 24, color = "#ffcc80", nasaSource = false }: { size?: number; color?: string; nasaSource?: boolean }) {
  if (nasaSource) return <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
    <path d="M4 25V3h23v17H4" fill="#fff" stroke="#1d344f" strokeWidth="1.4" strokeLinejoin="round" />
    <TeamBadge x={5} y={4} width={21} height={15} />
  </svg>;
  return <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
    <path d="M6 25V4h17l-4 6 4 6H6" fill={color} stroke="#111827" strokeWidth="3" strokeLinejoin="round" />
    <path d="M6 25V4h17l-4 6 4 6H6" fill="none" stroke="#fff" strokeWidth="1.25" strokeLinejoin="round" />
  </svg>;
}

export function FlagCluster({ count }: { count: number }) {
  return <span className="cluster-icon"><MapFlag size={33} nasaSource /><b>{count}</b></span>;
}
