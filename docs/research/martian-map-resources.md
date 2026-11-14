# Martian Map — resource analysis

Research date: 2026-11-13. Challenge overview: [martian-map-challenge.md](martian-map-challenge.md).
"Tested" means a real request was made on 2026-11-13 and the response checked. All coordinates
use east-positive longitude (−180..180) and planetocentric latitude on the Mars 2000 sphere
(R = 3,396,190 m) unless stated otherwise.

The challenge page carries this notice: *NASA does not endorse any non-U.S. Government entity …
participants must comply with any data use parameters of that specific website.*

## A. Official challenge resources (Resources tab)

| # | Title (as listed) | URL | Mars data? | Access checked |
|---|---|---|---|---|
| 1 | JPL Mars Trek | https://trek.nasa.gov/mars/ | Yes — core | APIs tested |
| 2 | USGS-NASA Planetary Geologic Mapping Program | https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars | Yes | ArcGIS REST tested |
| 3 | Curiosity route-map example | https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/ | Example visual | Page read |
| 4 | NASA Worldview | https://worldview.earthdata.nasa.gov/ | **No — Earth only** | Docs read |
| 5 | Mars Perseverance Raw Images Gallery | https://mars.nasa.gov/mars2020/multimedia/raw-images/ | Yes | JSON API tested |

### A1. JPL Mars Trek

Web portal for Mars data, with 2D/3D views, layers, elevation profiles and STL/OBJ export.
Built on the ArcGIS JS API, Cesium and Dojo. Its full service list is in its public config file,
https://trek.nasa.gov/mars/jpl/config/config.json.

**API documentation:** https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars, under "WMTS
Layer Services" with separate Equirectangular, North Pole and South Pole tabs.

**WMTS tiles** (tested, HTTP 200)

- Template:
  `https://trek.nasa.gov/tiles/Mars/EQ/{LayerID}/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.{png|jpg}`
- Style is `default` and the TileMatrixSet is `default028mm`.
- Zoom 0 is 2 columns × 1 row covering the globe. Each level doubles both.
- Capabilities file: `https://trek.nasa.gov/tiles/Mars/EQ/{LayerID}/1.0.0/WMTSCapabilities.xml`.
  It gives the extension and the zoom count; `curiosity_hirise_mosaic` has 19 TileMatrix levels.
- Missing tile = no coverage.
- Example: `…/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/0/0/0.jpg`
  returned 200 image/jpeg.

**Global layers** (Layer ID): what they give

- `Mars_MGS_MOLA_ClrShade_merge_global_463m`: MOLA colour hillshade, 463 m.
- `mola_roughness`: MOLA surface roughness (hazard proxy).
- `Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw` / `…_Shade_…`: MOLA+HRSC blend, 200 m.
- `THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018` / `THEMIS_NightIR_…`: thermal IR, 100 m, ±65°.
  Night IR is a proxy for thermal inertia, separating rock from dust.
- `TES_Thermal_Inertia`, `TES_Dust`, `tes_ruffdust`, `Mars_MGS_TES_Albedo_mosaic_global_7410m`.
- TES mineral abundance: `TES_Clinopyroxene`, `TES_Plagioclase`, `TES_Glass_Clay`.
- `Mars_Viking_MDIM21_ClrMosaic_global_232m`, `msss_atlas_simp_clon` (MOC colour).
- `CTX_beta01_uncontrolled_5m_Caltech`: global CTX ~5 m, uncontrolled.
- `HiRISE_Global`: uncontrolled HiRISE footprints mosaic.
- `SIM3292_Global_Geology`: USGS global geologic map (SIM 3292) as tiles.
- Thematic vector/tile products found via search: `Dune_Field`, `EZMars` (NASA human-mission
  Exploration Zones), `ExplorationZones_Proposed_Oct2015_buffer_100km_clon0`,
  `Hydrous_Mineral_Detections_CRISM_clon0`, `Aqueous_Mineral_Distribution_Options_clon0`,
  `Chloride_Salt-bearing_Material_THEMIS_clon0`, `Hynek_Valley_Networks`,
  `RSLs_Gullies_New-IcyCraters_clon0`, glacier-like forms, alluvial fans.

**Site layers at Gale / Curiosity** (bbox lon_min, lat_min, lon_max, lat_max)

- `curiosity_hirise_mosaic`: HiRISE ~25 cm. 137.1225, −4.9255, 137.7298, −4.2490.
- `curiosity_ctx_mosaic`: 136.277, −7.214, 139.386, −3.580.
- `Gale_CTX_BlockAdj_dd`: 135.184, −6.573, 139.241, −2.808.
- `mars_pahrump_patch_8k_256m` (MSL Pahrump Hills patch).

**Site layers at Jezero / Perseverance**

- `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd`: controlled HiRISE 25 cm.
  77.2229, 18.3068, 77.5840, 18.6693.
- `JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0`: controlled CTX 6 m.
- `Jezero_CTX_BlockAdj_dd`, `NES_JEZ_MID_Visible_Mosaic_HiRISE_CTX_HRSC_GCS_MARS_07-10-2018`.

**Other sites:** HiRISE mosaics for Spirit, Opportunity, Sojourner, Phoenix, InSight, Viking 1/2,
Columbia Hills, "Ares 3" and "Ares 4" landing sites, Marth crater and SW Candor. About 40 regional
CTX mosaics (CTX block-adjusted). CTX ortho, hillshade and **colour-slope** sets for Apollinaris,
Coprates, Deuteronilus and East Melas. The full list with bboxes is on the API doc page.

**DEMs — ArcGIS ImageServer** (list:
https://trek.nasa.gov/tiles/Mars/rasters/eq/list.json, 7 products)

| productLabel | Area | Res |
|---|---|---|
| `Gale_DEM_SMG_1m` | Gale/Curiosity: lon 137.12–137.73, lat −4.93 to −4.25 | 1 m |
| `Gale_HRSC_DEMi_25m` | lon 135.98–139.49, lat −7.85 to −3.21 | 25 m |
| `DEM_1m_ColumbiaHills` | Spirit site | 1 m |
| `DEM_1m_VictoriaCrater` | Opportunity site | 1 m |
| `STEREO_DEM_1_m_Phoenix_Box_B81` | Phoenix site | 1 m |
| `MC11E11_HRDTMAR_DA5` | HRSC MC11 quad (lon −22.5–0, lat 0–30) | 50 m |
| `mola128_mola64_merge_90Nto90S_SimpleC_clon0` | Global MOLA | 463 m |

No Jezero DEM appears in this list. `searchDEM` may find more; this wasn't tested.

- Endpoint: `https://trek.nasa.gov/mars/trekarcgis/rest/services/{productLabel}/ImageServer`.
- Tested on `Gale_DEM_SMG_1m`:
  - `?f=json`: F32, 1 band, pixel 1.687e-5° (~1 m), WKID 104905, capabilities
    Image/Metadata/Mensuration, max export 15000×4100 px.
  - `/identify?geometry={"x":137.4,"y":-4.6}&geometryType=esriGeometryPoint&f=json` returned
    elevation **−4502.48 m**.
  - `/exportImage?bbox=137.38,-4.62,137.40,-4.60&bboxSR=104905&size=256,256&format=tiff&pixelType=F32&f=image`
    returned a valid 256×256 float32 GeoTIFF (263 KB). **This gives raw elevation for slope and
    route analysis.**

**Catalog search** (tested)

- `https://trek.nasa.gov/mars/TrekServices/ws/index/eq/searchItems?bbox=lon1,lat1,lon2,lat2&start=0&rows=200&intersects=true`
  is a Solr-style API returning `response.numFound`/`docs`. Gale bbox 137.0,−5.0,137.8,−4.2
  returned 58 items.
- Item fields: `title`, `productLabel`, `item_UUID`, `bbox`, `itemType`, `layers`.
- Layer endpoints: `https://trek.nasa.gov/mars/TrekServices/ws/index/getLayerServices?uuid={item_UUID}`
  returns `endPoint`, `protocol` (WMTS or ArcGISFeature), `layerId`.
- Text abstract: `https://trek.nasa.gov/mars/TrekWS/rest/cat/abstract?label={productLabel}`
  (tested). Also `…/cat/metadata/fgdc/html?label=`, `…/cat/data/stream?label=` (download) and
  `…/cat/legend/stream?label=`.
- CRISM items at Gale are **footprint features**, not mosaics. Feature service:
  `https://trek.nasa.gov/mars/trekarcgis/rest/services/mars_mro_crism_mtrdr_c0a_humex_frt_sites/MapServer/0`
  ("humex" sites). Only **1 footprint** intersects the Gale query box: FRT000045F2, centre −5.02,
  137.07, at the box edge.
  - Each feature links to the PDS/ODE product: `ProdURL`, `FilesURL`, `LabelURL`.
  - CRISM is therefore weak for hyperlocal Mount Sharp mineralogy in Trek. Better CRISM data would
    need PDS/ODE (not explored).

**Analysis services listed in config** (not documented publicly; parameters unknown)

- `…/TrekServices/ws/elevationProfile/calculate`: returned 204 with no params.
- `…/elevationProfile/distance`, `…/multiDEM/interpolated`.
- `…/TrekWS/rest/slope`: returned **400** with no params.
- `…/TrekWS/rest/path`, `…/rock/detect`, `…/crater/detect`, `…/light`.
- `https://trek.nasa.gov/getAzElfromT1`: sun angle.
- `…/transform/latlon/subset/stream/tiff`: subset export.
- STL/OBJ model export (`…/ws/model/mars/trekSTL.stl`, `trekOBJ.zip`).
- 3D terrain tiles at `https://marshub.s3.amazonaws.com/mars_v14/`.
- **Treat these as unreliable for a hackathon unless the parameters can be confirmed.** Computing
  slope and paths locally from the exported DEM is safer.

**Limitations:** the main app is a JS canvas, so it can't be scraped. Some layers are uncontrolled
(they may misalign by tens of metres). Service availability and speed vary. Credit lines come with
each layer abstract (for example HiRISE: NASA/JPL/University of Arizona).

### A2. USGS–NASA Planetary Geologic Mapping Program (Astrogeology hub)

- The hub page is an ArcGIS Experience app ("Interactive Maps: Mars"). Item
  `eecdba26c1734c8ab47459c387daf58d`, owner USGS.
- It embeds web maps for the equatorial region (`3fcd2bb90f574fefb8eae11ef67686d6`), the south
  pole (`18169ff5d35146458307e3a5282128cc`) and the north pole
  (`e0bc0396276c42cca8205a5b2eafdcde`). The equatorial map uses WKID 104905 over a Trek MOLA
  colour-hillshade basemap.
- Chrome could not read the page (domain permission). It was examined through the public ArcGIS
  REST API instead.
- **Map database feature service (tested):**
  `https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/PGM_Map_Database_MARS_INTERACTIVE2/FeatureServer/1`
  - Holds **148** Mars map footprints (polygons).
  - Fields: `MapTitle`, `USGSMapNumber`, `MapScale`, `MapStatus`, `PublicationDate`, authors,
    `USGSPublicationPage` (DOI), `FullImageLink`, `AstropediaPage`, `SuggestedCitation`,
    `WebMap`, and others.
  - Query by point with `geometryType=esriGeometryPoint&inSR=4326`.

**Maps covering Gale (137.4, −4.7):**

- SIM 3292 *Geologic Map of Mars* (2014, 1:20M), https://doi.org/10.3133/sim3292.
- I-1802B (1987, 1:15M), I-2461 (1995, 1:30M), I-2397 Elysium paleolake (1995, 1:5M),
  I-1083 (1978, 1:25M), I-1111 Aeolis quadrangle (1978, 1:5M).
- Two unnamed **in-progress** maps at 1:60K and 1:2M. No published detailed Gale map.

**Maps covering Jezero (77.5, 18.4):**

- **SIM 3464 *Geologic Map of Jezero Crater and the Nili Planum Region* (2020, 1:75K)**,
  https://doi.org/10.3133/sim3464.
- Also SIM 3292, SIM 2888 Northern Plains (1:2M), I-995 Syrtis Major (1:5M), I-1802B, I-2461,
  I-1083.

**Usefulness:** geologic units as a science-context layer. SIM 3292 is also available as Trek tiles
(`SIM3292_Global_Geology`). For a detailed site map, Jezero is much better served than Gale.
**Licensing:** USGS publications are public domain; cite with `SuggestedCitation`.

### A3. Curiosity's proposed path up Mount Sharp (example visual)

- NASA Science resource page dated 15 May 2019: an animation of a proposed Curiosity route, an
  annotated region map and a flyover video. Downloads: original 1041×586 image and a GIF (2.86 MB).
- Credit: NASA/JPL-Caltech/ESA/University of Arizona/JHUAPL/MSSS/USGS Astrogeology.
- Data combined: **MRO HiRISE, MRO CRISM, MRO CTX and ESA Mars Express HRSC**. This shows the
  multi-mission layering NASA expects.
- Use: a style reference for route plus annotated science regions. It is not a dataset.

### A4. NASA Worldview

- Interactive browser for full-resolution global daily **Earth** satellite imagery, with 1,200+
  products, near-real-time data, events and snapshots. Powered by **GIBS**.
- GIBS API (https://nasa-gibs.github.io/gibs-api-docs/):
  - Protocols: WMTS (KVP/REST), WMS, TWMS, XYZ.
  - Time dimension in ISO 8601.
  - Projections EPSG:4326, 3413, 3031, 3857.
- Earthdata Login is needed for some downloads.
- **It has no Mars data.** Its role here is inspiration (layered, time-aware map UX), matching the
  challenge's suggestion to look at Earth maps. *[Only the docs were read; the app page returned no
  text and Chrome was denied on that domain.]*

### A5. Perseverance raw images

- The gallery page (Chrome denied reading it) is backed by a public JSON feed. Tested:
  `https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num={n}&page={p}&order=sol+desc[&search=CAMERA]`
  - `total_results` = **579,518** images at research time. Latest sol 2031 (2026-11-06).
  - `search=NAVCAM_LEFT` filters by camera (64,795 results).
  - Per image: `imageid`, `sol`, `date_taken_utc`, `date_taken_mars`, `site`, `drive`,
    `camera.instrument` with CAHV camera model, `extended.mastAz/mastEl`, `image_files`
    (small/medium/large/full_res URLs), `credit`, `caption`, `json_link`.
- **Location join (tested):** waypoint GeoJSON maps `site`+`drive` (field `RMC` = "site_drive") to
  lon/lat/elevation.
  - `https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json` (~600 KB).
  - `…/M20_waypoints_current.json`: sol 2022, lon 77.23322, lat 18.43559, −1936 m, 45.2 km
    driven. It also includes end-of-drive **panorama** mosaic metadata (cylindrical, az/el ranges),
    with the path relative to `https://mars.nasa.gov/mmgis-maps/M20/`.
- Credit lines vary by instrument (for example NASA/JPL-Caltech/LANL/CNES/IRAP for SuperCam).
  Raw images are unprocessed engineering products.

## B. Additional resources found during research (not on the Resources tab)

| Resource | URL | Status | Use |
|---|---|---|---|
| Curiosity raw images API | `https://mars.nasa.gov/api/v1/raw_image_items/?order=sol%20desc&per_page=N&page=P&condition_1=msl:mission` | Tested: 1,518,571 items, sol 5072, fields incl. `site`, `drive`, `https_url` | POV images for Gale |
| Curiosity waypoints | `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json` (1,388 points), `MSL_waypoints_current.json`, `MSL_traverse.json` (1.36 MB) | Tested | Rover track, position ↔ image join |
| NASA DONKI (space weather) | `https://api.nasa.gov/DONKI/CME?startDate=…&endDate=…&api_key=DEMO_KEY` | Tested: CME analyses include WSA-ENLIL `impactList` with `location: "Mars"` | Space weather / CME arrival warnings at Mars |
| InSight weather API | `https://api.nasa.gov/insight_weather/?api_key=DEMO_KEY&feedtype=json&ver=1.0` | Responds, but **data frozen at sol 675 (Oct 2020)** | Historical only |
| Curiosity boxwork release | https://www.nasa.gov/missions/mars-science-laboratory/curiosity-rover/nasas-curiosity-rover-sees-martian-spiderwebs-up-close/ | Read (23 Feb 2026) | Science objective context |
| Curiosity mission page | https://science.nasa.gov/mission/msl-curiosity/ | Read (1 km elevation gain milestone, 26 Aug 2026) | Status |
| Curiosity / Perseverance instruments | https://science.nasa.gov/mission/msl-curiosity/science-instruments/ , https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/ | Read | REMS (pressure, temp, humidity, wind, UV), RAD, MEDA descriptions; no data links |
| MAVEN | https://science.nasa.gov/mission/maven/ | Read | Mission ended (contact lost 6 Dec 2025, EOM 3 Jun 2026) |
| PDS PPI node (MSL, incl. RAD) | https://pds-ppi.igpp.ucla.edu/mission/MSL | HTTP 200, contents not inspected | Radiation data archive |
| GIBS API docs | https://nasa-gibs.github.io/gibs-api-docs/ | Read | Earth tile-service reference |

API key note: `DEMO_KEY` is rate-limited. A free personal key from api.nasa.gov is needed for real
use, and it must stay out of Git.

## C. Not accessible or not verified

- Chrome access was denied for reading these domains: astrogeology-usgs.hub.arcgis.com,
  mars.nasa.gov, worldview.earthdata.nasa.gov, and trek.nasa.gov (screenshots and clicks only).
  Public APIs and docs were used instead.
- https://kauai.ccmc.gsfc.nasa.gov/DONKI/ refused the connection. The api.nasa.gov DONKI mirror
  worked.
- https://science.nasa.gov/mission/msl-curiosity/rad/ returned 404.
- The Space Apps Judging & Awards and Project Submission guides (due 13 Nov) were not listed yet.
- Trek analysis services (slope/path/rock/light) have no public parameter documentation.

## D. Dependencies between resources

- The USGS web maps use a Trek MOLA basemap and the same WKID 104905. SIM 3292 is also served as
  Trek tiles.
- Raw images (Perseverance/Curiosity) depend on the waypoint GeoJSON for coordinates, joined on
  site + drive.
- Hazard layers (slope, route) depend on Trek DEM export. The 1 m DEM exists only at specific
  sites, so site choice is constrained.
- CRISM footprints link out to PDS ODE for actual spectral cubes.
- DONKI is independent (heliospheric) and works for any site.

## E. Data-type coverage at the two strongest sites

| Data type (challenge list) | Gale / Mount Sharp | Jezero |
|---|---|---|
| Optical | HiRISE 25 cm, CTX, HRSC | HiRISE 25 cm (controlled), CTX 6 m |
| Topographic | **1 m HiRISE DEM**, 25 m HRSC DEM, MOLA | MOLA/HRSC global only (no site DEM in Trek list) |
| Thermal | THEMIS day/night 100 m, TES thermal inertia | same |
| Spectral / mineral | TES global mineral maps; CRISM sparse | TES; CRISM coverage untested |
| Geologic | SIM 3292 (1:20M) only | **SIM 3464 (1:75K)** |
| Radiation / space weather | DONKI (Mars impacts); RAD archive | DONKI |
| Atmospheric | TES dust; REMS (access unverified) | TES dust; MEDA (access unverified) |
| Surface POV | Curiosity raw images + waypoints | Perseverance raw images + waypoints + panoramas |
