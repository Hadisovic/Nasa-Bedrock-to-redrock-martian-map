import { MARS_EQUIRECTANGULAR, cellCenter } from "../contracts/index.ts";
import type { TerrainGrid } from "../contracts/index.ts";

/** Ground meters per projected meter in each direction at the grid's central latitude. */
export function groundScale(terrain: TerrainGrid): { east: number; north: number } {
  const { layout } = terrain;
  const center = cellCenter(layout, { row: layout.height / 2, column: 0 });
  return { east: Math.cos(center.yM / MARS_EQUIRECTANGULAR.radiusM), north: 1 };
}

/**
 * Surface slope in degrees per cell from a 3 × 3 central-difference gradient (Horn's method).
 * A cell is NaN when it or any neighbour is unknown, or when it sits on the grid edge.
 * This is a calculated layer derived from measured heights, not an observation.
 */
export function slopeDegrees(terrain: TerrainGrid): Float32Array {
  const { width, height, pixelSizeM } = terrain.layout;
  const z = terrain.elevationsM;
  const scale = groundScale(terrain);
  const dxM = pixelSizeM * scale.east;
  const dyM = pixelSizeM * scale.north;
  const out = new Float32Array(width * height).fill(NaN);
  for (let row = 1; row < height - 1; row++) {
    for (let column = 1; column < width - 1; column++) {
      const at = (r: number, c: number) => z[(row + r) * width + column + c];
      const a = at(-1, -1), b = at(-1, 0), c = at(-1, 1);
      const d = at(0, -1), f = at(0, 1);
      const g = at(1, -1), h = at(1, 0), i = at(1, 1);
      const dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * dxM);
      const dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * dyM);
      const value = Math.atan(Math.hypot(dzdx, dzdy)) * 180 / Math.PI;
      // Any unknown neighbour propagates NaN through the arithmetic above.
      out[row * width + column] = value;
    }
  }
  return out;
}

/** Hillshade in 0..1 (NaN for unknown), illumination from the northwest at 45°. */
export function hillshade(terrain: TerrainGrid, azimuthDeg = 315, altitudeDeg = 45): Float32Array {
  const { width, height, pixelSizeM } = terrain.layout;
  const z = terrain.elevationsM;
  const scale = groundScale(terrain);
  const dxM = pixelSizeM * scale.east;
  const dyM = pixelSizeM * scale.north;
  const zenith = (90 - altitudeDeg) * Math.PI / 180;
  const azimuth = ((360 - azimuthDeg + 90) % 360) * Math.PI / 180;
  const out = new Float32Array(width * height).fill(NaN);
  for (let row = 1; row < height - 1; row++) {
    for (let column = 1; column < width - 1; column++) {
      const at = (r: number, c: number) => z[(row + r) * width + column + c];
      const dzdx = ((at(-1, 1) + 2 * at(0, 1) + at(1, 1)) - (at(-1, -1) + 2 * at(0, -1) + at(1, -1))) / (8 * dxM);
      const dzdy = ((at(1, -1) + 2 * at(1, 0) + at(1, 1)) - (at(-1, -1) + 2 * at(-1, 0) + at(-1, 1))) / (8 * dyM);
      const slope = Math.atan(Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(dzdy, -dzdx);
      const shade = Math.cos(zenith) * Math.cos(slope) + Math.sin(zenith) * Math.sin(slope) * Math.cos(azimuth - aspect);
      out[row * width + column] = Math.max(0, shade);
    }
  }
  return out;
}

export interface ElevationStats {
  minM: number;
  maxM: number;
  validCells: number;
  unknownCells: number;
}

export function elevationStats(terrain: TerrainGrid): ElevationStats {
  let minM = Infinity, maxM = -Infinity, validCells = 0;
  for (const value of terrain.elevationsM) {
    if (!Number.isFinite(value)) continue;
    validCells++;
    if (value < minM) minM = value;
    if (value > maxM) maxM = value;
  }
  return { minM, maxM, validCells, unknownCells: terrain.elevationsM.length - validCells };
}
