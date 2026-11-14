import { wrapLon } from "./geo.ts";
import type { LatLon } from "./geo.ts";

const rad = Math.PI / 180;
const sin = (degrees: number) => Math.sin(degrees * rad);
const cos = (degrees: number) => Math.cos(degrees * rad);
const mod = (value: number, cycle: number) => (value % cycle + cycle) % cycle;
const terms = [[0.0071, 2.2353, 49.409], [0.0057, 2.7543, 168.173], [0.0039, 1.1177, 191.837],
  [0.0037, 15.7866, 21.736], [0.0021, 2.1354, 15.704], [0.0020, 2.4694, 95.528], [0.0018, 32.8493, 49.095]];

// Effective UTC dates after J2000. Keep this table updated if IERS announces another leap second.
const leapDates = ["2006-01-01", "2009-01-01", "2012-07-01", "2015-07-01", "2017-01-01"].map((day) => Date.parse(day));

/** NASA GISS Mars24 algorithm, with east longitude and a spherical lighting boundary. */
export function marsSun(utcMs: number) {
  const tt = utcMs / 86400000 + 2440587.5 + (64.184 + leapDates.filter((day) => utcMs >= day).length) / 86400;
  const d = tt - 2451545;
  const anomaly = 19.3871 + 0.52402073 * d;
  const center = (10.691 + 3e-7 * d) * sin(anomaly) + 0.623 * sin(2 * anomaly) + 0.050 * sin(3 * anomaly)
    + 0.005 * sin(4 * anomaly) + 0.0005 * sin(5 * anomaly) + terms.reduce((n, [a, t, p]) => n + a * cos(0.985626 * d / t + p), 0);
  const ls = 270.3871 + 0.524038496 * d + center;
  const eq = 2.861 * sin(2 * ls) - 0.071 * sin(4 * ls) + 0.002 * sin(6 * ls) - center;
  const msd = (tt - 2451549.5) / 1.0274912517 + 44796 - 0.0009626;
  const subsolar = { lat: Math.asin(0.42565 * sin(ls)) / rad + 0.25 * sin(ls), lon: wrapLon(180 - msd * 360 - eq) };
  return { msd, eq, subsolar };
}

export function marsAt(utcMs: number, point: LatLon) {
  const { msd, eq, subsolar } = marsSun(utcMs);
  const hour = mod(msd * 24 + (point.lon + eq) / 15, 24);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sin(point.lat) * sin(subsolar.lat) +
    cos(point.lat) * cos(subsolar.lat) * cos(point.lon - subsolar.lon)))) / rad;
  const horizon = -Math.tan(point.lat * rad) * Math.tan(subsolar.lat * rad);
  const daylight = horizon <= -1 ? "Polar day" : horizon >= 1 ? "Polar night" : altitude >= 0 ? "Daylight" : "Night";
  const half = Math.acos(Math.max(-1, Math.min(1, horizon))) / rad / 15;
  return { sol: Math.floor(msd + (point.lon + eq) / 360), time: solarTime(hour), daylight, altitude,
    sunrise: Math.abs(horizon) < 1 ? solarTime(12 - half) : null, sunset: Math.abs(horizon) < 1 ? solarTime(12 + half) : null };
}

function solarTime(hour: number) {
  const minutes = Math.floor(hour * 60 + 1e-7) % 1440;
  return [Math.floor(minutes / 60), minutes % 60].map((v) => String(v).padStart(2, "0")).join(":");
}
