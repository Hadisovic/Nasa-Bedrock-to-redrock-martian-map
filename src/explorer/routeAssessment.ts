import { edgeRoughness, improvesCost, terrainPenalty } from "../analysis/terrainCost.ts";
import { greatCircleKm } from "./geo.ts";
import type { LatLon } from "./geo.ts";

export interface GlobalRouteLeg {
  points: LatLon[];
  distanceKm: number;
  maxSlopeDeg: number;
  climbM: number;
  elevationsM: (number | null)[];
  assessment?: TerrainAssessment;
}

interface TerrainAssessment {
  descentM: number;
  steepDistanceKm: number;
  longestSteepRunKm: number;
  limitDeg: number;
  terrainCostKm: number;
  equivalentDistanceKm: number;
  roughnessCoverage: number | null;
}

/** Segment sums on the Mars sphere. The solver has already checked terrain coverage. */
export function assessLeg(points: LatLon[], elevationsM: number[], slopeLimit: number,
  roughness?: { grid: Float32Array; cells: number[] }): GlobalRouteLeg {
  let distanceKm = 0, maxSlopeDeg = 0, climbM = 0, descentM = 0;
  let steepDistanceKm = 0, steepRunKm = 0, longestSteepRunKm = 0, terrainCostKm = 0, roughDistanceKm = 0;
  for (let i = 1; i < points.length; i++) {
    const run = greatCircleKm(points[i - 1], points[i]);
    if (!run) continue;
    const rise = elevationsM[i] - elevationsM[i - 1];
    const slope = Math.atan2(Math.abs(rise), run * 1000) * 180 / Math.PI;
    const a = roughness?.cells[i - 1] ?? 0, b = roughness?.cells[i] ?? 0;
    if (roughness && Number.isFinite(roughness.grid[a]) && Number.isFinite(roughness.grid[b])) roughDistanceKm += run;
    const relief = edgeRoughness(roughness?.grid, a, b);
    terrainCostKm += run * terrainPenalty(rise, run * 1000, slopeLimit, relief);
    maxSlopeDeg = Math.max(maxSlopeDeg, slope);
    if (slope >= 0.55 * slopeLimit) {
      steepDistanceKm += run;
      steepRunKm += run;
      longestSteepRunKm = Math.max(steepRunKm, longestSteepRunKm);
    } else steepRunKm = 0;
    climbM += Math.max(0, rise);
    descentM += Math.max(0, -rise);
    distanceKm += run;
  }
  const assessment = { descentM, steepDistanceKm, longestSteepRunKm, limitDeg: slopeLimit, terrainCostKm,
    equivalentDistanceKm: distanceKm + terrainCostKm,
    roughnessCoverage: roughness && distanceKm ? roughDistanceKm / distanceKm : null };
  return { points, elevationsM, distanceKm, climbM, maxSlopeDeg, assessment };
}

export function compareLegs(shortest: GlobalRouteLeg, balanced?: GlobalRouteLeg, alternative?: GlobalRouteLeg) {
  if (!shortest.assessment) return { shortest };
  const recommended = balanced?.assessment && improvesCost(balanced.assessment.equivalentDistanceKm,
    shortest.assessment.equivalentDistanceKm) && balanced.distanceKm <= shortest.distanceKm * 1.25 ? balanced : shortest;
  // Require both a relative and distance-scaled gain to suppress trivial detours.
  const reduction = recommended.assessment!.terrainCostKm - (alternative?.assessment?.terrainCostKm ?? Infinity);
  const lower = alternative && reduction > Math.max(recommended.assessment!.terrainCostKm * 0.01, shortest.distanceKm * 0.005) &&
    alternative.distanceKm <= shortest.distanceKm * 1.25 ? alternative : undefined;
  return { shortest, balanced: recommended === shortest ? undefined : recommended, alternative: lower };
}

export function estimateLegMinutes(leg: GlobalRouteLeg, speedMps: number) {
  // Treat terrain cost as a configurable scenario allowance through the selected
  // base speed. No empirical walking or driving speed model is available here.
  return (leg.assessment?.equivalentDistanceKm ?? leg.distanceKm) * 1000 / speedMps / 60;
}
