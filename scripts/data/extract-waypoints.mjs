// Extract the Perseverance waypoints that fall inside the Wildcat Ridge crop.
// Usage: node scripts/data/extract-waypoints.mjs [output.json]
import { readFile, writeFile } from "node:fs/promises";

const SOURCE = "https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json";
const RADIUS_M = 3_396_190;
const manifest = JSON.parse(await readFile(new URL("../../data/mars/jezero/sources.json", import.meta.url), "utf8"));
const [west, south, east, north] = manifest.region.bounds_m;
const output = process.argv[2] ?? new URL("../../data/mars/jezero/rover-waypoints.json", import.meta.url);

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Waypoint request failed (HTTP ${response.status}).`);
const { features } = await response.json();
const metersPerDegree = RADIUS_M * Math.PI / 180;

const waypoints = features
  .map(({ properties: p }) => ({
    rmc: p.RMC,
    sol: p.sol,
    longitude_east_deg: p.lon,
    latitude_planetocentric_deg: p.lat,
    elevation_geoid_m: p.elev_geoid,
    note: p.Note ?? null,
    x_m: p.lon * metersPerDegree,
    y_m: p.lat * metersPerDegree,
  }))
  // Same edge rule as the raster grid: west and north edges are inside.
  .filter((w) => w.x_m >= west && w.x_m < east && w.y_m > south && w.y_m <= north)
  .map(({ x_m, y_m, ...w }) => w);

await writeFile(output, JSON.stringify({
  source: SOURCE,
  retrieved: new Date().toISOString().slice(0, 10),
  description: "Perseverance localized positions inside the Wildcat Ridge crop, in travel order.",
  credit: "NASA/JPL-Caltech",
  limitations: [
    "Rover body positions from localization, not instrument or sample footprints.",
    "Elevations are the feed's geoid values and can differ slightly from the HiRISE grid.",
  ],
  waypoints,
}, null, 2) + "\n");
console.log(`${waypoints.length} of ${features.length} waypoints are inside the crop.`);
