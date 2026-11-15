import manifest from "../../data/mars/jezero/sources.json" with { type: "json" };
import traverse from "../../data/mars/jezero/rover-waypoints.json" with { type: "json" };
import { cellCenter, projectMars } from "../contracts/index.ts";
import type { ProjectedPoint, Provenance, RasterLayout, ScienceSite } from "../contracts/index.ts";
import { jezeroWaypoint } from "../contracts/jezeroWaypoint.ts";

export const ELEVATION_LAYOUT: RasterLayout = (() => {
  const [westM, southM, eastM, northM] = manifest.region.bounds_m;
  const pixelSizeM = manifest.elevation.spacing_m;
  return { westM, northM, pixelSizeM, width: (eastM - westM) / pixelSizeM, height: (northM - southM) / pixelSizeM };
})();

const roverProvenance: Provenance = {
  mission: "Mars 2020 Perseverance",
  instrument: "Rover localization",
  sources: [{ title: "NASA rover waypoint feed", url: traverse.source }],
  observationPeriod: "Sols 436–709 inside this crop",
  limitations: [...traverse.limitations],
};

export interface RoverStop {
  rmc: string;
  sol: number;
  location: ProjectedPoint;
  elevationGeoidM: number;
  note: string | null;
}

export const roverTraverse: readonly RoverStop[] = traverse.waypoints.map((w) => ({
  rmc: w.rmc,
  sol: w.sol,
  location: projectMars({ longitudeEastDeg: w.longitude_east_deg, latitudePlanetocentricDeg: w.latitude_planetocentric_deg }),
  elevationGeoidM: w.elevation_geoid_m,
  note: w.note,
}));

export const roverTraverseProvenance = roverProvenance;

const pixl = manifest.science;

/** The single sourced science destination inside the crop. */
export const wildcatRidge: ScienceSite = {
  id: "wildcat-ridge",
  name: "Wildcat Ridge · Berry Hollow",
  location: jezeroWaypoint.location,
  locationMethod:
    "Perseverance's localized position on sol 502 (waypoint 26_1222). The rover stayed here until its next drive on sol 535, " +
    "so the abrasion patch and cores lie within arm's reach of this point, but their exact offset is not published.",
  observation: pixl.published_observation.result,
  objective: pixl.rationale,
  provenance: {
    mission: pixl.mission,
    instrument: pixl.instrument,
    sources: [
      { title: "Jones et al. (2025), Science Advances (open access, CC BY 4.0)", url: pixl.open_study },
      { title: "PIXL data in the NASA Planetary Data System", url: pixl.archive },
      { title: "NASA: sample collection and rock analysis at Wildcat Ridge", url: pixl.context },
      { title: "NASA rover waypoint feed", url: pixl.waypoint.url },
    ],
    observationPeriod: "PIXL scans on sols 505 (BH1) and 507 (BH2)",
    limitations: [pixl.published_observation.limitation, pixl.coverage],
  },
};

export type PinKind = "rover" | "science" | "habitat" | "hardware";

export interface Habitat {
  id: string;
  name: string;
  location: ProjectedPoint;
  note: string;
}

const habitatAt = (id: string, name: string, row: number, column: number): Habitat => ({
  id, name,
  location: cellCenter(ELEVATION_LAYOUT, { row, column }),
  note: `Hypothetical. Chosen from the elevation grid as an 11 m × 11 m patch with calculated slopes below about 3.5° (cell row ${row}, column ${column}).`,
});

/** Simulated habitat sites. Nothing has been placed here; they are planning inputs. */
export const habitatPresets: readonly Habitat[] = [
  habitatAt("habitat-se", "Habitat A · south-east flat", 364, 316),
  habitatAt("habitat-sw", "Habitat B · south-west flat", 364, 28),
  habitatAt("habitat-n", "Habitat C · northern flat", 10, 292),
];

export interface StoryImage {
  src: string;
  alt: string;
  caption: string;
  credit: string;
  sourceUrl: string;
}

export interface Story {
  id: string;
  title: string;
  kind: PinKind;
  inRange: boolean;
  when: string;
  body: string;
  image?: StoryImage;
  sources: readonly { title: string; url: string }[];
}

const rawImagePage = (id: string) => `https://mars.nasa.gov/mars2020/multimedia/raw-images/${id}`;

export const stories: readonly Story[] = [
  {
    id: "arrival",
    title: "Perseverance parks at Wildcat Ridge",
    kind: "rover",
    inRange: true,
    when: "Sol 502 · 19 July 2022",
    body:
      "After climbing the delta front, the rover ended its drive at waypoint 26_1222 and stayed for about a month. " +
      "This Navcam view from that stop shows the layered, fractured sedimentary rock around it.",
    image: {
      src: "images/pov/sol502-navcam.jpg",
      alt: "Raw Navcam image of pale, fractured sedimentary rock slabs and loose pebbles near the rover.",
      caption: "Navcam left, sol 502, image NLF_0502_0711506944_402ECM_N0261222NCAM00708_02_095J.",
      credit: "NASA/JPL-Caltech",
      sourceUrl: rawImagePage("NLF_0502_0711506944_402ECM_N0261222NCAM00708_02_095J"),
    },
    sources: [{ title: "NASA rover waypoint feed", url: traverse.source }],
  },
  {
    id: "berry-hollow",
    title: "Berry Hollow: salts left by ancient water",
    kind: "science",
    inRange: true,
    when: "Abraded sol 504 · PIXL sols 505 and 507",
    body:
      "The rover ground a fresh circular patch into the rock, called Berry Hollow. PIXL then mapped its light-toned vein " +
      "material: calcium sulfate, mainly anhydrite with gypsum and bassanite. For the BH2 scan the study reports about " +
      "45% anhydrite, 37% gypsum and 18% bassanite among those phases. Sulfates like these precipitate from water, so the " +
      "vein records how water moved through the delta sediments after they formed. The result applies to this " +
      "centimetre-scale patch only, not to the whole ridge.",
    image: {
      src: "images/pov/sol504-watson-abrasion.jpg",
      alt: "Close-up black-and-white image of a smooth circular abraded patch in grey rock.",
      caption: "SHERLOC WATSON, sol 504, at the same rover stop: a freshly abraded patch. Image SI1_0504_0711696755_871ECM_N0261222SRLC01034_0000LMJ.",
      credit: "NASA/JPL-Caltech",
      sourceUrl: rawImagePage("SI1_0504_0711696755_871ECM_N0261222SRLC01034_0000LMJ"),
    },
    sources: [
      { title: "Jones et al. (2025), Science Advances (CC BY 4.0)", url: pixl.open_study },
      { title: "PIXL archive (NASA PDS)", url: pixl.archive },
    ],
  },
  {
    id: "cores",
    title: "Hazeltop and Bearwallow: two rock cores",
    kind: "science",
    inRange: true,
    when: "Cores documented by Mastcam-Z on sol 518 · 4 August 2022",
    body:
      "Perseverance drilled two chalk-sized cores from Wildcat Ridge, samples 12 (Hazeltop) and 13 (Bearwallow). " +
      "NASA describes the rock as a fine-grained mudstone laid down in an ancient lake, a rock type with a higher " +
      "potential to preserve signs of ancient life. Hazeltop stayed on board; Bearwallow was later left at the Three Forks depot.",
    image: {
      src: "images/pov/sol518-mastcamz.jpg",
      alt: "Raw Mastcam-Z colour image of tan rock slabs and pebbles beside the rover's wheel.",
      caption: "Mastcam-Z left, sol 518, from the same rover stop. Image ZL0_0518_0712932934_098EBY_N0261222ZCAM08542_0340LMJ.",
      credit: "NASA/JPL-Caltech/ASU",
      sourceUrl: rawImagePage("ZL0_0518_0712932934_098EBY_N0261222ZCAM08542_0340LMJ"),
    },
    sources: [
      { title: "NASA: Meet the Mars samples Hazeltop and Bearwallow", url: "https://science.nasa.gov/resource/meet-the-mars-samples-hazeltop-and-bearwallow-samples-12-and-13/" },
      { title: "NASA: sample collection and rock analysis at Wildcat Ridge", url: pixl.context },
    ],
  },
  {
    id: "three-forks",
    title: "Three Forks sample depot",
    kind: "hardware",
    inRange: false,
    when: "Sols 653–690 · Dec 2022 – Jan 2023",
    body:
      "Perseverance left ten sample tubes, including Bearwallow, on flat ground near the base of the delta as a backup " +
      "for a future return mission. The depot is outside this 384 m map, so it is listed here without a map pin.",
    sources: [{ title: "NASA: Three Forks sample depot map", url: "https://science.nasa.gov/resource/perseverances-three-forks-sample-depot-map/" }],
  },
];
