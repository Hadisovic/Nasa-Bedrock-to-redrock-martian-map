/** Original blocky astronaut with the team patch. Drawn on a 16-unit pixel grid. */
export function Astronaut({ className, decorative = false }: { className?: string; decorative?: boolean }) {
  const px = (x: number, y: number, w: number, h: number, fill: string, key?: string) =>
    <rect key={key ?? `${x}-${y}-${fill}`} x={x} y={y} width={w} height={h} fill={fill} />;
  return (
    <svg className={className} viewBox="0 0 32 52" shapeRendering="crispEdges" {...(decorative ? { "aria-hidden": true, focusable: false } : { role: "img", "aria-labelledby": "astro-title" })}>
      {!decorative && <title id="astro-title">Blocky astronaut in an off-white spacesuit with a dark square visor and the Bedrock to Redrock patch</title>}
      {/* Backpack */}
      {px(4, 13, 24, 18, "#8B97A8")}
      {px(5, 14, 22, 2, "#A9B4C3")}
      {/* Helmet */}
      {px(7, 1, 18, 15, "#ECEEF2")}
      {px(6, 3, 1, 11, "#C3CAD6")}
      {px(25, 3, 1, 11, "#C3CAD6")}
      {px(9, 4, 14, 9, "#3A4556")}
      {px(10, 5, 12, 7, "#0C1220")}
      {px(11, 6, 3, 2, "#5B86C4")}
      {px(19, 10, 2, 1, "#26364F")}
      {px(13, 16, 6, 2, "#C3CAD6")}
      {/* Torso */}
      {px(8, 18, 16, 15, "#ECEEF2")}
      {px(8, 18, 16, 2, "#C3CAD6")}
      {px(8, 30, 16, 3, "#C3CAD6")}
      {/* Chest control box */}
      {px(13, 23, 6, 4, "#15243A")}
      {px(14, 24, 1, 1, "#69D5FF")}
      {px(16, 24, 1, 1, "#E78759")}
      {px(14, 26, 4, 1, "#69D5FF")}
      {/* Team patch: copper Mars on a blue ring */}
      {px(9, 21, 4, 4, "#69D5FF")}
      {px(10, 22, 2, 2, "#E78759")}
      {/* Arms */}
      {px(3, 19, 5, 11, "#ECEEF2")}
      {px(24, 19, 5, 11, "#ECEEF2")}
      {px(3, 25, 5, 1, "#4C8BD8")}
      {px(24, 25, 5, 1, "#4C8BD8")}
      {px(3, 30, 5, 3, "#8B97A8")}
      {px(24, 30, 5, 3, "#8B97A8")}
      {/* Legs */}
      {px(9, 33, 6, 12, "#ECEEF2")}
      {px(17, 33, 6, 12, "#ECEEF2")}
      {px(9, 38, 6, 1, "#C3CAD6")}
      {px(17, 38, 6, 1, "#C3CAD6")}
      {/* Boots */}
      {px(8, 45, 7, 5, "#3A4556")}
      {px(17, 45, 7, 5, "#3A4556")}
      {px(8, 49, 7, 1, "#4C8BD8")}
      {px(17, 49, 7, 1, "#4C8BD8")}
    </svg>
  );
}

/** Small team patch used in the header. */
export function TeamPatch({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" aria-hidden="true" shapeRendering="crispEdges">
      <rect x="1" y="0" width="6" height="8" fill="#69D5FF" />
      <rect x="0" y="1" width="8" height="6" fill="#69D5FF" />
      <rect x="2" y="1" width="4" height="6" fill="#0B1424" />
      <rect x="1" y="2" width="6" height="4" fill="#0B1424" />
      <rect x="2" y="2" width="4" height="4" fill="#E78759" />
      <rect x="2" y="2" width="2" height="1" fill="#F2A57E" />
      <rect x="4" y="4" width="1" height="1" fill="#B65F36" />
    </svg>
  );
}
