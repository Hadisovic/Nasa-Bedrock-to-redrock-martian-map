export const BALANCED_WEIGHT = 1;
export const LOWER_TERRAIN_WEIGHT = 4;
export const DOWNHILL_PENALTY_FACTOR = 0.5;

/** Fractional cost at this mission's slope limit, with a bounded local roughness term. */
export function terrainPenalty(riseM: number, runM: number, limitDeg: number, roughness = 0) {
  const slope = Math.atan2(Math.abs(riseM), runM) * 180 / Math.PI;
  return (riseM < 0 ? DOWNHILL_PENALTY_FACTOR : 1) * (slope / limitDeg) ** 2 + 0.25 * roughness;
}

export function improvesCost(candidate: number, baseline: number) {
  return candidate < baseline * 0.99;
}

/** Local relief after removing a linear north/south and east/west trend.
 * Values are dimensionless, normalized to half a pixel of relief and capped at one.
 * NaN means there is no full cross of measured neighbors. */
export function localRoughness(elevations: Float32Array, width: number, height: number, spacingM: number) {
  if (spacingM > 5) return undefined;
  const roughness = new Float32Array(elevations.length).fill(NaN);
  for (let row = 1; row < height - 1; row++) {
    for (let column = 1; column < width - 1; column++) {
      const i = row * width + column;
      const eastWest = (elevations[i - 1] + elevations[i + 1]) / 2 - elevations[i];
      const northSouth = (elevations[i - width] + elevations[i + width]) / 2 - elevations[i];
      if (Number.isFinite(eastWest) && Number.isFinite(northSouth)) {
        roughness[i] = Math.min(1, Math.hypot(eastWest, northSouth) / (spacingM / 2));
      }
    }
  }
  return roughness;
}

export function edgeRoughness(roughness: Float32Array | undefined, a: number, b: number) {
  if (!roughness) return 0;
  // Neither incomplete neighborhoods nor raster borders earn a low-roughness discount.
  const from = Number.isFinite(roughness[a]) ? roughness[a] : 1;
  const to = Number.isFinite(roughness[b]) ? roughness[b] : 1;
  return (from + to) / 2;
}
