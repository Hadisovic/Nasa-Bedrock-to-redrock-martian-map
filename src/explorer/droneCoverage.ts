import { galeBounds, metresPerDegree } from "./galeLayout.ts";
import { ELEVATION_LAYOUT } from "../data/sites.ts";
import { unprojectMars } from "../contracts/coordinates.ts";
import perseverance from "../../data/mars/jezero/rover-waypoints.json" with { type: "json" };
import geology from "../../data/mars/layers/drone-geology.json" with { type: "json" };
import { greatCircleKm } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import type { CatalogEvent } from "./catalog.ts";

const { westM, northM, width, height, pixelSizeM } = ELEVATION_LAYOUT;
const fromProjected = (xM: number, yM: number) => {
  const { latitudePlanetocentricDeg: lat, longitudeEastDeg: lon } = unprojectMars({ xM, yM });
  return { lat, lon };
};
const sw = fromProjected(westM, northM - height * pixelSizeM), ne = fromProjected(westM + width * pixelSizeM, northM);
export const droneSites = [
  { id: "wildcat", label: "Wildcat Ridge", spacingM: 1, zoom: 100_000, west: sw.lon, east: ne.lon, south: sw.lat, north: ne.lat },
  { id: "gale", label: "Gale Crater · Mount Sharp", spacingM: 20, zoom: 6000,
    west: galeBounds.west / metresPerDegree, east: galeBounds.east / metresPerDegree,
    south: galeBounds.south / metresPerDegree, north: galeBounds.north / metresPerDegree },
] as const;
export const droneCenter = (site: typeof droneSites[number]) => ({
  lat: (site.north + site.south) / 2, lon: (site.east + site.west) / 2,
});

export type DroneSite = typeof droneSites[number];
export type DroneTour = Awaited<ReturnType<typeof droneTour>>;

export async function droneTour(site: DroneSite, events: readonly CatalogEvent[]) {
  const gale = site.id === "gale";
  const curiosity = gale ? (await import("../../data/mars/catalog/curiosity-traverse-gale.json", { with: { type: "json" } })).default : null;
  const contains = ({ lat, lon }: LatLon) => lat <= site.north && lat >= site.south && lon >= site.west && lon <= site.east;
  const points = curiosity ? curiosity.tracks.map((line) => line.map(([lon, lat]) => ({ lat, lon })))
    : [perseverance.waypoints.map((point) => ({ lat: point.latitude_planetocentric_deg, lon: point.longitude_east_deg }))];
  const paths = points.flatMap((line) => {
    const segments: LatLon[][] = [[]];
    for (const point of line) {
      if (contains(point)) segments.at(-1)!.push(point);
      else if (segments.at(-1)!.length) segments.push([]);
    }
    return segments.filter((segment) => segment.length > 1).map((segment) => ({
      points: segment, history: true, returning: false,
      distanceKm: segment.slice(1).reduce((km, point, i) => km + greatCircleKm(segment[i], point), 0),
    }));
  });
  const stops = events.filter((event) => event.observed && event.location && contains(event.location) &&
    (gale ? event.missionId === "msl" : event.missionId === "m2020"));
  return {
    site, paths, stops, geology: geology[site.id],
    title: gale ? "Curiosity’s drive" : "Perseverance waypoints",
    description: gale ? "Follow NASA’s mapped Curiosity drive segments across lower Mount Sharp. Open the science stops to see what the rover studied."
      : "The line connects localized rover stops at Wildcat Ridge. Open a science stop to read the evidence and see its mapped position.",
    source: curiosity?.source ?? perseverance.source,
    reference: gale ? "https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/" : null,
  };
}
