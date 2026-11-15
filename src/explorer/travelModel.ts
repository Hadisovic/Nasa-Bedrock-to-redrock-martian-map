import { terrainPenalty } from "../analysis/terrainCost.ts";
import { greatCircleKm } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import type { GlobalRouteLeg } from "./globalRouting.ts";

export type PlaybackRate = 1 | 2 | 3 | 4 | 60 | 180 | 600;
export type TravelPoint = { point: LatLon; elevation: number | null; metres: number; seconds: number };
const playbackRates = [1, 60, 180, 600] as const;
export const cyclePlaybackRate = (rate: PlaybackRate): PlaybackRate => playbackRates[(playbackRates.indexOf(rate as typeof playbackRates[number]) + 1) % playbackRates.length];

/** The same terrain-equivalent time drives both the estimate and the moving traveler.
 * This is a scenario allowance, not an empirically calibrated suit/vehicle model. */
export function buildTravelTrack(legs: readonly GlobalRouteLeg[], speedMps: number, slopeLimit: number): TravelPoint[] {
  if (!(Number.isFinite(speedMps) && speedMps > 0)) return [];
  const track: TravelPoint[] = [];
  let metres = 0, seconds = 0;
  for (const leg of legs) {
    const segmentPenalties = leg.points.slice(1).map((point, i) => {
      const run = greatCircleKm(leg.points[i], point) * 1000;
      const from = leg.elevationsM[i], to = leg.elevationsM[i + 1];
      return run && from !== null && to !== null ? run * terrainPenalty(to - from, run, slopeLimit) : 0;
    });
    const slopeAllowance = segmentPenalties.reduce((a, b) => a + b, 0);
    // Distribute the measured roughness allowance over the leg. Never synthesize
    // a roughness measurement for coarse data or change the solver's geometry.
    const extraFactor = leg.distanceKm ? Math.max(0, (leg.assessment?.terrainCostKm ?? slopeAllowance / 1000) * 1000 - slopeAllowance) / (leg.distanceKm * 1000) : 0;
    leg.points.forEach((point, i) => {
      const last = track.at(-1);
      const run = i ? greatCircleKm(leg.points[i - 1], point) * 1000 : last ? greatCircleKm(last.point, point) * 1000 : 0;
      if (last && run < 1e-6) return;
      metres += run;
      seconds += (run * (1 + extraFactor) + (i ? segmentPenalties[i - 1] : 0)) / speedMps;
      track.push({ point, elevation: leg.elevationsM[i], metres, seconds });
    });
  }
  return track;
}

function interpolate(track: readonly TravelPoint[], value: number, field: "metres" | "seconds", other: "seconds" | "metres") {
  if (!track.length) return 0;
  if (value <= 0) return 0;
  const end = track.at(-1)!;
  if (value >= end[field]) return end[other];
  let low = 1, high = track.length - 1;
  while (low < high) { const mid = (low + high) >> 1; if (track[mid][field] < value) low = mid + 1; else high = mid; }
  const a = track[low - 1], b = track[low];
  const t = (value - a[field]) / Math.max(1e-12, b[field] - a[field]);
  return a[other] + (b[other] - a[other]) * t;
}
export const elapsedTravelSeconds = (track: readonly TravelPoint[], metres: number) => interpolate(track, metres, "metres", "seconds");
export function advanceTravel(track: readonly TravelPoint[], metres: number, elapsedSeconds: number, rate: PlaybackRate) {
  const before = elapsedTravelSeconds(track, metres);
  const seconds = Math.min(track.at(-1)?.seconds ?? 0, before + Math.max(0, elapsedSeconds) * rate);
  return { metres: interpolate(track, seconds, "seconds", "metres"), seconds, advancedSeconds: Math.max(0, seconds - before) };
}

export function terrainAhead(track: readonly { point: LatLon; elevation: number | null; metres: number }[], metres: number) {
  const from = track.findIndex((point) => point.metres >= metres);
  if (from < 0) return null;
  const a = track[from], b = track.slice(from + 1).find((point) => point.metres - a.metres >= 20) ?? track.at(-1)!;
  const run = b.metres - a.metres;
  if (run < 2 || a.elevation === null || b.elevation === null) return null;
  const rise = b.elevation - a.elevation;
  const slopeDeg = Math.atan2(Math.abs(rise), run) * 180 / Math.PI;
  if (slopeDeg < 3) return null;
  return { label: rise > 0 ? "Uphill ahead" : "Downhill ahead", riseM: rise, slopeDeg, distanceM: run };
}
