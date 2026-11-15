import type { ReactNode, Ref } from "react";

const ticks = Array.from({ length: 36 }, (_, index) => index);

export function MapControls({ switchView, zoomIn, zoomOut, resetNorth, needle, flying = false, extras }: {
  switchView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetNorth?: () => void;
  needle?: Ref<SVGGElement>;
  flying?: boolean;
  extras?: ReactNode;
}) {
  const dial = <svg viewBox="0 0 72 72" aria-hidden="true">
    <circle cx="36" cy="36" r="33" fill="#121925" stroke="#6b7989" />
    <circle cx="36" cy="36" r="22.5" fill="#1d2a39" stroke="#526375" strokeWidth=".8" />
    {ticks.map((tick) => <path key={tick} transform={`rotate(${tick * 10} 36 36)`}
      d={tick % 3 === 0 ? "M36 4v4" : "M36 5v1.5"} stroke="#9daebb" strokeWidth={tick % 3 === 0 ? 1 : .7} />)}
    <g textAnchor="middle" fontSize="8" fontWeight="700" fill="#dce6ef">
      <text x="36" y="20" fill="#ff9e79">N</text>
      <text x="53" y="39">E</text>
      <text x="36" y="58">S</text>
      <text x="19" y="39">W</text>
    </g>
    <g ref={needle}>
      <path d="M36 22 40 36 36 34 32 36Z" fill="#ff986a" />
      <path d="M36 50 32 36 36 34 40 36Z" fill="#d6e4ec" />
    </g>
    <circle cx="36" cy="36" r="2.3" fill="#0c1421" stroke="#9baabc" />
  </svg>;

  return <div className="explorer-map-controls" role="group" aria-label="Map navigation"
    onPointerDown={(event) => event.stopPropagation()}>
    {resetNorth ? <button type="button" className="explorer-compass" aria-label="Reset compass to north" title="Reset compass to north"
      onClick={resetNorth}>{dial}</button>
      : <span className="explorer-compass" role="img" aria-label="North is up">{dial}</span>}
    {!flying && <>
      <button type="button" aria-label={resetNorth ? "Switch to 2D map" : "Switch to 3D globe"} onClick={switchView}>{resetNorth ? "2D" : "3D"}</button>
      <button type="button" className="explorer-map-controls__zoom" onClick={zoomIn} aria-label="Zoom in">+</button>
      <button type="button" className="explorer-map-controls__zoom" onClick={zoomOut} aria-label="Zoom out">−</button>
      {extras}
    </>}
  </div>;
}
