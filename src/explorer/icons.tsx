import { nasaInsignia } from "./nasaMark.ts";

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
    <path d="M4 25V4h23v15H4" fill="#134579" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    {nasaInsignia
      ? <image href={nasaInsignia} x="8" y="4.6" width="15" height="14" />
      : <text x="15.5" y="14.5" fill="#fff" textAnchor="middle" fontFamily="sans-serif" fontSize="7.8" fontWeight="700">NASA</text>}
  </svg>;
  return <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
    <path d="M6 25V4h17l-4 6 4 6H6" fill={color} stroke="#111827" strokeWidth="3" strokeLinejoin="round" />
    <path d="M6 25V4h17l-4 6 4 6H6" fill="none" stroke="#fff" strokeWidth="1.25" strokeLinejoin="round" />
  </svg>;
}
