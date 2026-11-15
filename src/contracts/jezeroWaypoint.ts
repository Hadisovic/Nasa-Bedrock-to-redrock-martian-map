import manifest from "../../data/mars/jezero/sources.json" with { type: "json" };
import { projectMars } from "./coordinates.ts";

// Coordinate metadata must not pull the GeoTIFF decoder into the app's startup path.
export const jezeroWaypoint = {
  id: manifest.science.waypoint.rmc,
  sol: manifest.science.waypoint.sol,
  location: projectMars({
    longitudeEastDeg: manifest.science.waypoint.longitude_east_deg,
    latitudePlanetocentricDeg: manifest.science.waypoint.latitude_planetocentric_deg,
  }),
  sourceUrl: manifest.science.waypoint.url,
};
