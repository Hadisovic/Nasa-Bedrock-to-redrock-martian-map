/**
 * Original artwork for the homepage, drawn as SVG for this project (no external images).
 * One light: a warm key light from the upper right, matching the planet's rim light, so the
 * voxel rocks, astronaut, hologram and rocket read as one scene.
 */

type Pt = [number, number];
const poly = (points: Pt[]) => points.map((p) => p.join(",")).join(" ");

/** Isometric cube helper: returns the top, left and right faces of a block. */
function isoCube(x: number, y: number, s: number, colors: [string, string, string], key: string) {
  const h = s / 2;
  const top: Pt[] = [[x, y - h], [x + s, y], [x, y + h], [x - s, y]];
  const left: Pt[] = [[x - s, y], [x, y + h], [x, y + h + s], [x - s, y + s]];
  const right: Pt[] = [[x, y + h], [x + s, y], [x + s, y + s], [x, y + h + s]];
  return (
    <g key={key}>
      <polygon points={poly(left)} fill={colors[1]} />
      <polygon points={poly(right)} fill={colors[2]} />
      <polygon points={poly(top)} fill={colors[0]} />
    </g>
  );
}

export function Planet({ className }: { className?: string }) {
  const craters: [number, number, number][] = [
    [250, 120, 26], [300, 205, 16], [215, 245, 34], [140, 150, 18], [320, 290, 22], [180, 320, 14], [265, 330, 10], [110, 250, 12],
  ];
  return (
    <svg className={className} viewBox="0 0 400 400" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="planet-body" cx="68%" cy="30%" r="75%">
          <stop offset="0" stopColor="#F59A62" />
          <stop offset="0.35" stopColor="#D7622F" />
          <stop offset="0.7" stopColor="#8E3A20" />
          <stop offset="1" stopColor="#3A1610" />
        </radialGradient>
        <radialGradient id="planet-shade" cx="20%" cy="85%" r="80%">
          <stop offset="0" stopColor="#080D19" stopOpacity="0.85" />
          <stop offset="0.55" stopColor="#080D19" stopOpacity="0.35" />
          <stop offset="1" stopColor="#080D19" stopOpacity="0" />
        </radialGradient>
        <filter id="planet-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" /></filter>
        <clipPath id="planet-clip"><circle cx="200" cy="200" r="190" /></clipPath>
      </defs>
      <circle cx="200" cy="200" r="194" fill="none" stroke="#FFB48A" strokeOpacity="0.45" strokeWidth="6" filter="url(#planet-glow)" />
      <circle cx="200" cy="200" r="190" fill="url(#planet-body)" />
      <g clipPath="url(#planet-clip)">
        <path d="M10 170 C 120 140, 260 190, 400 150 L 400 175 C 260 215, 120 165, 10 195 Z" fill="#B44E26" opacity="0.35" />
        <path d="M10 260 C 140 235, 250 280, 400 245 L 400 262 C 250 300, 140 255, 10 280 Z" fill="#6E2C18" opacity="0.35" />
        {craters.map(([x, y, r]) => (
          <g key={`${x}-${y}`}>
            <ellipse cx={x} cy={y} rx={r} ry={r * 0.82} fill="#6E2C18" opacity="0.55" />
            <ellipse cx={x + r * 0.12} cy={y + r * 0.1} rx={r * 0.78} ry={r * 0.62} fill="#A9461F" opacity="0.6" />
            <path d={`M ${x - r * 0.7} ${y - r * 0.45} A ${r} ${r * 0.82} 0 0 1 ${x + r * 0.85} ${y - r * 0.2}`} stroke="#FFB48A" strokeOpacity="0.55" strokeWidth="2" fill="none" />
          </g>
        ))}
        <circle cx="200" cy="200" r="190" fill="url(#planet-shade)" />
      </g>
    </svg>
  );
}

/** Stepped voxel rock shelf along the bottom of the hero, tallest at both sides. */
export function RockShelf({ className }: { className?: string }) {
  const width = 1600, height = 300, block = 30;
  // Low on the left under the text; a flat five-block plateau from about 44% to the right edge,
  // where the astronaut, hologram pedestal and rocket stand (their CSS bottoms match it).
  const heights = [3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6];
  const column = width / heights.length;
  const ridge = Array.from({ length: 40 }, (_, i) => 3 + Math.round(2 * Math.sin(i * 0.9) + Math.cos(i * 2.3)));
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="shelf-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B0502A" />
          <stop offset="1" stopColor="#56251E" />
        </linearGradient>
      </defs>
      {/* Distant ridge, hazy */}
      {ridge.map((h, i) => (
        <rect key={`r${i}`} x={i * 40} y={height - (h + 3) * block * 0.8} width={41} height={(h + 3) * block * 0.8} fill="#4A1F18" opacity="0.75" />
      ))}
      {heights.map((h, i) => {
        const x = i * column, top = height - h * block;
        return (
          <g key={i}>
            <rect x={x} y={top} width={column + 1} height={h * block} fill="url(#shelf-front)" />
            {Array.from({ length: h }, (_, k) => <rect key={k} x={x} y={top + k * block} width={column + 1} height={1.5} fill="#56251E" opacity="0.6" />)}
            <rect x={x} y={top} width={column + 1} height={7} fill="#E07A45" />
            {/* Light from the right: the right edge of each step is brighter. */}
            {i > 0 && heights[i - 1] < h && <rect x={x} y={top} width={4} height={(h - heights[i - 1]) * block} fill="#7A3320" />}
            {i < heights.length - 1 && heights[i + 1] < h && <rect x={x + column - 4} y={top} width={5} height={(h - heights[i + 1]) * block} fill="#E58A57" />}
          </g>
        );
      })}
    </svg>
  );
}

/** Decorative holographic map on a pedestal; the real map is the interactive surface. */
export function Hologram({ className }: { className?: string }) {
  // Stepped terrain inset on a 14 × 10 grid of cells.
  const terrain = [
    "..oooooo......",
    ".oooOOooooo...",
    "ooOOddOOoooo..",
    "oOOdddOOoooOo.",
    "oOOOdOOooOOOoo",
    ".ooOOOooOdddOo",
    "..ooooooOdddOo",
    "...ooooooOOOo.",
    "....oooooooo..",
    "......oooo....",
  ];
  const fills: Record<string, string> = { o: "#C4572B", O: "#E07A45", d: "#7A3320" };
  const cell = 16, ox = 52, oy = 46;
  return (
    <svg className={className} viewBox="0 0 360 330" aria-hidden="true" focusable="false">
      <defs>
        <filter id="holo-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" /></filter>
        <linearGradient id="holo-beam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#6BD6FF" stopOpacity="0.45" />
          <stop offset="1" stopColor="#6BD6FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Beam */}
      <polygon points="120,282 240,282 300,230 60,230" fill="url(#holo-beam)" />
      {/* Glass panel with clipped corners */}
      <polygon points="40,20 300,20 320,40 320,226 300,246 40,246 20,226 20,40" fill="#6BD6FF" fillOpacity="0.1" stroke="#6BD6FF" strokeWidth="5" filter="url(#holo-glow)" />
      <polygon points="40,20 300,20 320,40 320,226 300,246 40,246 20,226 20,40" fill="none" stroke="#B9ECFF" strokeWidth="2" />
      {/* Grid */}
      {Array.from({ length: 11 }, (_, i) => <line key={`h${i}`} x1="22" x2="318" y1={40 + i * 19} y2={40 + i * 19} stroke="#6BD6FF" strokeOpacity="0.12" />)}
      {Array.from({ length: 15 }, (_, i) => <line key={`v${i}`} y1="22" y2="244" x1={34 + i * 20} x2={34 + i * 20} stroke="#6BD6FF" strokeOpacity="0.12" />)}
      {terrain.flatMap((row, r) => [...row].map((c, k) => (c === "." ? null : (
        <rect key={`${r}-${k}`} x={ox + k * cell} y={oy + r * cell} width={cell - 1} height={cell - 1} fill={fills[c]} opacity="0.92" />
      ))))}
      {/* Route */}
      <polyline points="100,150 130,170 160,160 190,175 220,150 245,110" fill="none" stroke="#6BD6FF" strokeWidth="3" strokeDasharray="5 4" />
      {[[100, 150], [245, 110]].map(([x, y]) => (
        <g key={`${x}`} transform={`translate(${x} ${y})`}>
          <path d="M0 0 L -10 -16 A 12 12 0 1 1 10 -16 Z" fill="#F3F6FC" stroke="#A94424" strokeWidth="2" />
          <rect x="-4" y="-24" width="8" height="8" fill="#F36B37" />
        </g>
      ))}
      {/* Side controls: layers, terrain, temperature */}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(282 ${42 + i * 50})`}>
          <rect width="30" height="30" rx="3" fill="#0C1220" fillOpacity="0.7" stroke="#6BD6FF" strokeWidth="1.5" />
          {i === 0 && <path d="M7 12 L15 8 L23 12 L15 16 Z M7 17 L15 21 L23 17" fill="none" stroke="#B9ECFF" strokeWidth="1.6" />}
          {i === 1 && <path d="M6 22 L12 12 L16 17 L19 13 L24 22 Z" fill="none" stroke="#B9ECFF" strokeWidth="1.6" />}
          {i === 2 && <path d="M15 7 V18 M12 21 A 3.5 3.5 0 1 0 18 21 A 3.5 3.5 0 1 0 12 21 M19 9 H22 M19 12 H22" fill="none" stroke="#B9ECFF" strokeWidth="1.6" />}
        </g>
      ))}
      {/* Pedestal */}
      <polygon points="70,282 290,282 310,300 50,300" fill="#2A3445" />
      <rect x="50" y="300" width="260" height="22" fill="#1A2230" />
      <rect x="120" y="306" width="120" height="6" fill="#6BD6FF" />
      <rect x="120" y="306" width="120" height="6" fill="#6BD6FF" filter="url(#holo-glow)" />
    </svg>
  );
}

/** Pixel rocket used while the team's 3D model loads, or when WebGL is unavailable. */
export function PixelRocket({ className, size }: { className?: string; size?: number }) {
  const r = (x: number, y: number, w: number, h: number, fill: string) => <rect key={`${x}-${y}-${w}-${fill}`} x={x} y={y} width={w} height={h} fill={fill} />;
  return (
    <svg className={className} width={size} height={size ? size * 1.4 : undefined} viewBox="0 0 30 42" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {r(13, 0, 4, 2, "#C9D2DE")}
      {r(11, 2, 8, 3, "#F3F6FC")}
      {r(9, 5, 12, 4, "#F3F6FC")}
      {r(8, 9, 14, 12, "#EEF1F6")}
      {r(21, 9, 1, 12, "#C9D2DE")}
      {r(11, 11, 8, 5, "#26364F")}
      {r(12, 12, 3, 2, "#5B86C4")}
      {r(8, 21, 14, 10, "#B8432A")}
      {r(8, 21, 14, 2, "#F36B37")}
      {r(12, 24, 6, 5, "#EEF1F6")}
      {r(13, 25, 4, 3, "#26364F")}
      {r(9, 24, 2, 4, "#8E2E1D")}
      {r(19, 24, 2, 4, "#8E2E1D")}
      {r(5, 27, 3, 2, "#C9D2DE")}
      {r(22, 27, 3, 2, "#C9D2DE")}
      {r(3, 29, 3, 9, "#B8432A")}
      {r(24, 29, 3, 9, "#B8432A")}
      {r(1, 38, 6, 2, "#C9D2DE")}
      {r(23, 38, 6, 2, "#C9D2DE")}
      {r(10, 31, 10, 3, "#4A5568")}
    </svg>
  );
}

/** Small pixel rocket for the header wordmark. */
export function BrandRocket({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      <rect x="8" y="0" width="3" height="1" fill="#F3F6FC" />
      <rect x="7" y="1" width="4" height="2" fill="#F3F6FC" />
      <rect x="5" y="2" width="5" height="3" fill="#EEF1F6" />
      <rect x="4" y="4" width="4" height="3" fill="#EEF1F6" />
      <rect x="7" y="3" width="2" height="1" fill="#26364F" />
      <rect x="3" y="6" width="3" height="2" fill="#F36B37" />
      <rect x="6" y="5" width="2" height="2" fill="#B8432A" />
      <rect x="2" y="8" width="2" height="2" fill="#F5B841" />
      <rect x="0" y="10" width="2" height="2" fill="#F36B37" />
      <rect x="1" y="9" width="1" height="1" fill="#F5B841" />
    </svg>
  );
}

/** Feature card illustrations, drawn at one isometric angle with light from the right. */
export function TerrainIllustration() {
  const s = 18;
  const cubes: [number, number, number][] = [];
  const layout = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0], [1, 1, 0], [2, 1, 0], [0, 2, 0], [1, 2, 0], [3, 1, 0], [1, 1, 1], [0, 1, 1], [1, 0, 1], [1, 1, 2]];
  for (const [gx, gy, gz] of layout) cubes.push([gx, gy, gz]);
  cubes.sort((a, b) => a[2] - b[2] || a[0] + a[1] - (b[0] + b[1]));
  return (
    <svg viewBox="0 0 200 130" aria-hidden="true" focusable="false">
      {cubes.map(([gx, gy, gz], i) => isoCube(100 + (gx - gy) * s, 52 + (gx + gy) * s / 2 - gz * s, s, ["#E07A45", "#8A3A22", "#C4572B"], `c${i}`))}
    </svg>
  );
}

export function RouteIllustration() {
  const dots: Pt[] = [[30, 110], [45, 104], [60, 100], [76, 102], [92, 98], [106, 90], [118, 80], [130, 72], [144, 66], [158, 62], [172, 56]];
  return (
    <svg viewBox="0 0 200 130" aria-hidden="true" focusable="false" shapeRendering="crispEdges">
      {dots.map(([x, y], i) => <rect key={i} x={x} y={y} width="7" height="7" fill={i % 2 ? "#6BD6FF" : "#3E8FD6"} />)}
      <g transform="translate(76 8)">
        <rect x="4" y="0" width="20" height="4" fill="#F36B37" />
        <rect x="0" y="4" width="28" height="18" fill="#F36B37" />
        <rect x="8" y="8" width="12" height="9" fill="#8A3A22" />
        <rect x="4" y="22" width="20" height="6" fill="#D85A2E" />
        <rect x="9" y="28" width="10" height="6" fill="#B8432A" />
        <rect x="12" y="34" width="4" height="5" fill="#8A3A22" />
      </g>
    </svg>
  );
}

export function LayersIllustration() {
  const sheet = (y: number, colors: [string, string, string], key: string) => {
    const top: Pt[] = [[100, y - 26], [158, y], [100, y + 26], [42, y]];
    return (
      <g key={key}>
        <polygon points={poly([[42, y], [100, y + 26], [100, y + 34], [42, y + 8]])} fill={colors[1]} />
        <polygon points={poly([[100, y + 26], [158, y], [158, y + 8], [100, y + 34]])} fill={colors[2]} />
        <polygon points={poly(top)} fill={colors[0]} />
      </g>
    );
  };
  return (
    <svg viewBox="0 0 200 130" aria-hidden="true" focusable="false">
      {sheet(92, ["#8A3A22", "#56251E", "#6E2C18"], "a")}
      {sheet(72, ["#E07A45", "#A94424", "#C4572B"], "b")}
      {sheet(50, ["#4DA8E8", "#1F5A94", "#2F78BD"], "c")}
      <polyline points="70,48 92,38 112,52 130,44" fill="none" stroke="#B9ECFF" strokeWidth="2" />
      <polyline points="64,56 84,62 100,56" fill="none" stroke="#B9ECFF" strokeWidth="2" />
    </svg>
  );
}
