import { galeBounds, metresPerDegree } from "./galeLayout.ts";
import { ELEVATION_LAYOUT } from "../data/sites.ts";
import { unprojectMars } from "../contracts/coordinates.ts";
import perseverance from "../../data/mars/jezero/rover-waypoints.json" with { type: "json" };
import geology from "../../data/mars/layers/drone-geology.json" with { type: "json" };
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
export type DroneTour = ReturnType<typeof droneTour>;

export function droneTour(site: DroneSite, events: readonly CatalogEvent[]) {
  const gale = site.id === "gale";
  const contains = ({ lat, lon }: LatLon) => lat <= site.north && lat >= site.south && lon >= site.west && lon <= site.east;
  const stops = events.filter((event) => event.observed && event.location && contains(event.location) &&
    (gale ? event.missionId === "msl" : event.missionId === "m2020"));
  return {
    site, stops, geology: geology[site.id],
    title: gale ? "Curiosity’s drive" : "Perseverance waypoints",
    description: gale ? "Fly over the mapped terrain of lower Mount Sharp. Turn on geology or open a Curiosity science stop."
      : "Fly over the HiRISE terrain at Wildcat Ridge. Open a Perseverance pin or place your own walking route.",
    source: gale ? "https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json" : perseverance.source,
    reference: gale ? "https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/" : null,
  };
}
