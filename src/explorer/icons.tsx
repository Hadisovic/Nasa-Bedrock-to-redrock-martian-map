import { nasaInsignia } from "./nasaMark.ts";

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
    <path d="M4 25V3h23v17H4" fill={nasaInsignia ? "#f5f7fb" : "#153655"} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    {nasaInsignia
      ? <image href={nasaInsignia} x="5.5" y="3.5" width="20" height="16" />
      : <><path d="M5 16.5h21" stroke="#e78759" /><text x="15.5" y="13.8" fill="#fff" textAnchor="middle"
          fontFamily="sans-serif" fontSize="7.8" fontWeight="700">NASA</text></>}
  </svg>;
  return <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
    <path d="M6 25V4h17l-4 6 4 6H6" fill={color} stroke="#111827" strokeWidth="3" strokeLinejoin="round" />
    <path d="M6 25V4h17l-4 6 4 6H6" fill="none" stroke="#fff" strokeWidth="1.25" strokeLinejoin="round" />
  </svg>;
}

export function FlagCluster({ count }: { count: number }) {
  return nasaInsignia
    ? <span className="cluster-icon"><MapFlag size={33} nasaSource /><b>{count}</b></span>
    : <span className="gpin__count">{count}</span>;
}
