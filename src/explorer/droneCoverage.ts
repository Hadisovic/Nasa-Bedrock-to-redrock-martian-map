import { galeBounds, metresPerDegree } from "./galeLayout.ts";
import { ELEVATION_LAYOUT } from "../data/sites.ts";
import { unprojectMars } from "../contracts/coordinates.ts";
import { regionalOnlineSources } from "./marsTrekTerrain.ts";

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
  ...regionalOnlineSources.map((source) => ({ ...source, id: source.elevation, spacingM: source.spacing,
    zoom: 650 / Math.min(source.east - source.west, source.north - source.south) })),
  { id: "olympus", label: "Olympus Mons · South flank", spacingM: 2, zoom: 12_000,
    west: -133.3963, east: -133.2537, south: 17.0656, north: 17.4931 },
] as const;
export const droneCenter = (site: typeof droneSites[number]) => ({
  lat: (site.north + site.south) / 2, lon: (site.east + site.west) / 2,
});
