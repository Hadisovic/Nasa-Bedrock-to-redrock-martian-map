# Historical events catalog: inventory

Built 2026-11-13. Output files:

- `data/mars/catalog/events.json`: 149 located events and 4 unlocated records.
- `data/mars/catalog/environment.json`: 57 dated environmental observations and 6 exclusions.
- `public/images/catalog/`: 5 resized NASA images, each under 110 KB.

Coordinates are planetocentric latitude and east longitude in the range −180 to 180. Conversions from
0–360 E or from W longitude are recorded in each record's `coordinateSource.note`. Every coordinate
comes from a NASA or JPL file fetched on the build date. Raw downloads are kept outside the
repository; the generator scripts are in `scripts/data/catalog/`.

## Count definitions

- **mapped**: a precise point.
- **approximate**: an approximate or regional point.
- **unlocated**: no defensible location (`location: null`, with `reasonUnlocated`).

## Sources checked and what each produced

| Source | URL | Result |
|---|---|---|
| MMGIS config, Perseverance | https://mars.nasa.gov/maps/location/api/configure/get?mission=M20 | Lists 11 vector layers (below). The old `mmgis-maps/M20/config.json` path returns 403. |
| MMGIS config, Curiosity | https://mars.nasa.gov/maps/location/api/configure/get?mission=MSL | Lists 4 vector layers. |
| M20 waypoints | https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json | 708 points. Used for the landing, the sol 502 stop, the witness tubes and sample cross-checks. |
| M20 current position | …/M20_waypoints_current.json | Sol 2022, RMC 93_0. |
| M20 sampling locations | …/M20_SAMPLE_v3.json | 22 points covering samples 1–30; pairs share a point. Located all 30 samples. |
| M20 sample depot zone | …/M20_TF_Sample_Depot.json | One polygon, 44 vertices, about 95 m across. Gives the Three Forks location. |
| M20 surface-view sites | …/M20_surfaceexperience.json | 7 boxes, recorded as approximate rover stops. |
| Ingenuity waypoints | …/m20_heli_waypoints.json | 73 points: deployment (Flight 0) and Flights 1–72. |
| Ingenuity flight paths | …/m20_heli_flight_path.json | 72 lines. Flight 26 locates the backshell imaging. |
| M20 landing ellipse, flight zone, traverse | …/JEZ_TRNEllipse_190507_line.json, …/M20_Heli_flightzone_dots.json, …/M20_traverse.json | Downloaded but not catalogued. They are plans or a line, not events. |
| MSL waypoints / current / surface sites | …/MSL/Layers/json/MSL_waypoints.json (1,388 points), MSL_waypoints_current.json (sol 5070), MSL_SurfaceSites.json (4 boxes) | Curiosity landing, first drive, drill sites, sulfur find, path anchor, 4 site boxes, latest position. |
| NASA Mars Rock Samples page | https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/ | Name, number, feature, type, sol, date, rock type and current location for samples 1–30, plus the witness-tube text. |
| Hazeltop/Bearwallow | https://science.nasa.gov/resource/meet-the-mars-samples-hazeltop-and-bearwallow-samples-12-and-13/ | Mudstone, vein, concretion, and which twin went to the depot. |
| Wildcat Ridge mosaic | https://science.nasa.gov/resource/sample-collection-and-rock-analysis-at-wildcat-ridge/ | Mosaic from sol 518 (Aug. 4, 2022); the abrasion patch is about 5 cm. |
| Three Forks depot map | https://science.nasa.gov/resource/perseverances-three-forks-sample-depot-map/ | 10 tubes, 5–15 m apart; sol 653 (Dec. 21, 2022) to sol 690 (Jan. 28, 2023). No coordinates. |
| Backshell / debris field / JPL news | https://science.nasa.gov/resource/rovers-backshell-seen-from-the-air/ , https://science.nasa.gov/resource/debris-field-from-perseverance-landing-gear-seen-by-mars-helicopter/ , https://www.jpl.nasa.gov/news/nasas-mars-helicopter-spots-gear-that-helped-perseverance-rover-land/ | Flight 26, April 19, 2022. No coordinates. |
| Potential biosignature release | https://www.nasa.gov/news-release/nasa-says-mars-rover-discovered-potential-biosignature-last-year/ | Sapphire Canyon / Cheyava Falls context. |
| Perseverance raw image feed | https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json | UTC dates and site/drive for sols 160, 499, 502, 504, 509, 516, 586, 653 and 690. |
| Curiosity proposed path | https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/ | May 15, 2019. An image and animation only, with no georeferenced points. |
| JPL John Klein | https://www.jpl.nasa.gov/news/nasa-curiosity-rover-collects-first-martian-bedrock-sample/ | First drill, Feb. 8, 2013, Sol 182. |
| Curiosity's first 16 sampling sites | https://science.nasa.gov/photojournal/curiositys-first-16-rock-or-soil-sampling-sites-on-mars/ | 14 drill sites with sol and date. Rocknest and Gobabeb scoops have no sols. |
| JPL sulfur | https://www.jpl.nasa.gov/news/nasas-curiosity-rover-discovers-a-surprise-in-a-martian-rock/ | Rock crushed May 30, 2024; Snow Lake image June 8, 2024 = sol 4209. |
| NASA GISS Mars24 landers | https://www.giss.nasa.gov/tools/mars24/help/landers.html | Landing coordinates and dates for all NASA landers; presumed Mars Polar Lander impact. |
| NSSDCA spacecraft pages | https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id= 1975-075C, 1975-083C, 1996-068A, 2003-027A, 2003-032A, 2007-034A, 2011-070A, 2018-042A, 2020-052A, 1999-001A | Landing text and coordinates (Viking 1/2, Pathfinder, Spirit, Opportunity, Phoenix nominal), dates, Ingenuity end. |
| JPL Horizons spacecraft records | https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='-189' (InSight), '-84' (Phoenix), '-76' (MSL) | Achieved landing coordinates. |
| Spirit at Troy | https://science.nasa.gov/photojournal/orbital-view-of-spirit-at-troy/ | 14.6 S, 175.5 E. |
| Opportunity final map / end article | https://science.nasa.gov/photojournal/opportunitys-final-traverse-map/ , https://science.nasa.gov/missions/mer/nasas-opportunity-rover-mission-on-mars-comes-to-end/ | Perseverance Valley, June 10, 2018. No coordinates. |
| MEDA feed | https://mars.nasa.gov/rss/api/?feed=weather&category=mars2020&feedtype=json | Only sols 1127–1133 (April 2024). |
| MEDA PDS (Atmospheres Node) | https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/ | Calibrated ATS and PS CSVs for sols 502, 504, 509 and 516. Daily extremes computed here. |
| REMS feed | https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json | 4,745 sols (1–4995). Used at 6 catalog sols and as the sol-to-date lookup. Outreach-only disclaimer. |
| REMS instrument page | https://science.nasa.gov/resource/mars-weather-station-tools-on-rovers-mast/ | Description only, no values. |
| RAD | https://science.nasa.gov/resource/radiation-measurements-on-mars/ | About 210 µGy/day, Aug 2012 – Jun 2013, at Gale. The PDS PPI bundle MSL-M-RAD-3-RDR-V1.0 responds (HTTP 200) but was not reduced. |
| InSight weather feed | https://mars.nasa.gov/rss/api/?feed=weather&category=insight_temperature&feedtype=json&ver=1.0 | Sols 675–681 (Oct 2020), frozen. Included at the lander site. |

## Counts by source (events.json)

A record is counted once under each source it cites, so the columns do not sum to the total.

| Source id | Mapped | Approx. | Unlocated |
|---|---|---|---|
| m20-mmgis-heli-waypoints | 73 | 0 | 0 |
| m20-mmgis-samples | 29 | 1 | 0 |
| nasa-mars-rock-samples | 29 | 4 | 1 |
| m20-mmgis-waypoints | 3 | 2 | 0 |
| m20-mmgis-surface-sites | 0 | 7 | 0 |
| m20-mmgis-depot | 0 | 1 | 0 |
| m20-mmgis-heli-path | 0 | 1 | 0 |
| m20-mmgis-current | 1 | 0 | 0 |
| m20-raw-images | 2 | 2 | 1 |
| msl-mmgis-waypoints | 2 | 16 | 0 |
| msl-mmgis-surface-sites | 0 | 4 | 0 |
| msl-mmgis-current | 1 | 0 | 0 |
| msl-rems-feed (date lookup) | 1 | 2 | 0 |
| nasa-msl-16-sites | 0 | 14 | 1 |
| giss-mars24-landers | 5 | 5 | 2 |
| NSSDCA pages (all) | 8 | 6 | 1 |
| JPL Horizons (3 records) | 2 | 1 | 0 |
| Other NASA articles | see `counts.bySource` in the JSON | | |

**Total: 112 mapped, 37 approximate, 4 unlocated** (149 located events).

By type: 71 flight, 46 sample, 15 rover-stop, 9 landing, 2 science-observation, 2 hardware,
2 end-of-mission, 1 sample-depot and 1 proposed-path.

## Required verification cases

1. **Sol 502 rover stop at Wildcat Ridge** (`m2020-sol502-wildcat-ridge-stop`)
   - Waypoint RMC 26_1222, sol 502, at 77.40592495 E, 18.45864728 N, elevation −2523.167969 m (geoid).
   - Precise, ±10 m.
   - The raw image feed dates sol 502 to 2022-07-19 and tags its images site 26 / drive 1222.
   - The next waypoint is 26_1652 on sol 535.
   - Source: M20_waypoints.json.
2. **Berry Hollow abrasion, sol 504** (`m2020-sol504-berry-hollow-abrasion`)
   - Same point as case 1. Raw images from sol 504 are tagged 26_1222, so the rover had not moved.
   - Dated 2022-07-21; sol 504 spans 21–22 July UTC.
   - PIXL scanned on sols 505 and 507. The mineral results are reused from `src/data/sites.ts`, which cites Jones et al. 2025 (PDS data).
   - Science-observation, precise.
3. **Hazeltop (12) and Bearwallow (13)**
   - Dates and sols from the NASA samples page:
     - Hazeltop: sealed sol 509, July 27, 2022. Current location: Perseverance Rover.
     - Bearwallow: sealed sol 516, Aug. 3, 2022. Current location: Sample Depot.
   - Location: the MMGIS sample point 77.40588851 E, 18.45863707 N, which is 2.1 m from waypoint 26_1222.
   - Raw images from sols 509 and 516 are tagged site 26 drive 1222.
   - The MMGIS layer agrees: sols "509 & 516", "Jul. 27&Aug. 3, 2022".
4. **Three Forks sample depot** (`m2020-three-forks-depot`)
   - Its own record, at the centroid of NASA's depot-zone polygon: 77.40822645 E, 18.45296028 N.
   - Regional precision, ±48 m, footprint 0.095 km.
   - It lies 361 m from Wildcat Ridge.
   - Dated sol 653 (2022-12-21); the last drop was sol 690 (2023-01-28).
   - Contents: 9 sample tubes plus witness tube 3, which matches NASA's "10 samples".
5. **Curiosity in Gale Crater**
   - Landing (`msl-landing`):
     - Point: 137.441633 E, −4.589467 N, from MSL waypoint 2_0. The rover did not drive until sol 16.
     - Cross-checks: GISS gives 137.44 E, 4.59 S; Horizons gives 137.4417 E with a printed latitude of "4.55895 S", an apparent typo.
     - Date: 2012-08-06, 05:32 UTC Earth received time.
   - Proposed path (`msl-proposed-path-mount-sharp`):
     - `observed: false`, regional, with no `path` array because the NASA source is not georeferenced.
     - Anchored at Curiosity's position on the publication date: sol 2407 (2019-05-15), waypoint 75_1450, −4.72602422 N, 137.3836646 E.

## Decisions and discrepancies

**Sample sols and dates.** These follow the NASA samples page, not the MMGIS layer. They differ for:

| Sample | Samples page | MMGIS layer |
|---|---|---|
| Mageik | sol 619 (Nov 16, 2022) | sol 579 |
| Otis Peak | sol 832 | sol 822 |
| Lefroy Bay | sol 949 (Oct 21, 2023) | sol 942 |

For Bell Island (29) the page says TBD, so the MMGIS values are used: sol 1483, Apr 21, 2025.
Gallants (30) is TBD in both, so its sol and date are null and it is still mapped.

**Sample locations.**
- Lefroy Bay has the same coordinates as Pelican Point in MMGIS, so it is marked approximate.
- Pilot Mountain, Mageik, Kukaklek, Green Gardens and Lefroy Bay are 177–550 m from the rover's
  position on the sealing sol. Sealing came after the rover drove on, so the MMGIS sampling point is
  used.

**Landers.**
- Viking 2: GISS gives 48.27 N (Kuchynka et al. 2014) and NSSDCA gives 47.6673 N. The GISS value is used.
- Pathfinder: GISS gives 19.47 N, 326.75 E and NSSDCA gives 19.33 N, 33.55 W. The GISS value is used.
- InSight: GISS gives 4.50 N, 135.62 E and Horizons gives an achieved 4.555681 N, 135.623447 E. The
  GISS value is used, marked approximate with ±3.5 km to cover both.
- GISS does not state its datum. It matches planetocentric NASA values where a check was possible
  (Viking 1 against NSSDCA, and the Curiosity and Perseverance feeds).

**Hardware.** The backshell and parachute record is approximate (±200 m). It is the mean of the
Flight 26 path, because NASA gives no coordinates for the hardware.

**Curiosity drill sites.** These are approximate. Each uses the last waypoint at or before the drill
sol (3–18 sols earlier).

**Sulfur find.** The sulfur record is dated sol 4200 by derivation (sol 4209 minus nine days). The
REMS feed maps sol 4200 to 2024-05-30.

**Wildcat Ridge MEDA values.** These are computed from calibrated PDS data:
- Air temperature: daily minimum and maximum of the mean of the three mast ATS sensors.
- Pressure: daily minimum and maximum of the BAROCAP1 column.

Sampling is not continuous. Sol 516 has only about 8,000 samples, against about 39,000 on sol 502.

## Unlocated records

| Record | Reason |
|---|---|
| Opportunity final position | Perseverance Valley, June 10, 2018, sol 5111; no NASA coordinates. |
| Mars Polar Lander / Deep Space 2 | Only presumed impact points; the hardware has not been found. |
| First witness tube | The NASA page gives sol 160 in one place and sol 120 (June 21, 2021) in another. |
| Curiosity Rocknest and Gobabeb scoops | No sol is given. |

## Gaps

- Individual tube coordinates at Three Forks: NASA publishes only a map image.
- Perseverance heat shield and descent-stage crash site: no NASA coordinates were fetched.
- Spirit's exact final position: Troy is regional (0.1°).
- Sojourner's final position: not located.
- The full Curiosity sample list after Quela (2016) and Curiosity's boxwork campaign (2025–26): not
  catalogued. No NASA source with sols was fetched.
- Perseverance abrasion patches other than Berry Hollow: not catalogued.
- MEDA ground temperature, wind, humidity and dust opacity: not computed. RAD time series: not reduced.
- The landing ellipse and the full traverse lines are available in MMGIS but are not catalogued as events.

## CORS (Access-Control-Allow-Origin)

Tested on GET with an `Origin` header. A HEAD request to the MMGIS layer JSON returned no CORS header.

| Endpoint | Header |
|---|---|
| `mars.nasa.gov/mmgis-maps/M20/Layers/json/*.json` (waypoints, samples, heli) | `*` |
| `mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json` | `*` |
| `mars.nasa.gov/maps/location/api/configure/get?mission=M20` | `*` |
| `mars.nasa.gov/rss/api/?feed=weather&category=mars2020` and `category=msl` | `*` |
| `mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020` | `*` |
| `mars.nasa.gov/api/v1/raw_image_items/` (Curiosity) | `*` |

## Images (public/images/catalog)

All are resized to a maximum of 640 px.

| File | Source | Credit |
|---|---|---|
| `three-forks-depot-map.jpg` | PIA25682 | NASA/JPL-Caltech |
| `perseverance-backshell-ingenuity.jpg` | PIA25219 | NASA/JPL-Caltech |
| `spirit-at-troy-hirise.jpg` | PIA12205 | NASA/JPL-Caltech/University of Arizona |
| `wildcat-ridge-mastcamz.jpg` | PIA24928 | NASA/JPL-Caltech/ASU/MSSS |
| `curiosity-sulfur-crystals.jpg` | PIA26309 | NASA/JPL-Caltech/MSSS |
