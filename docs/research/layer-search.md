# Mars layer search log (Mars Trek and PDS)

Search date: 2026-11-13. The shipped files and their full provenance are in
`data/mars/layers/manifest.json`. Served paths are relative to `public/`.

## Method

- **Catalogue search.** `https://trek.nasa.gov/mars/TrekServices/ws/index/eq/searchItems?key=<word>&start=0&rows=60`.
  This is a Solr index. `key=` becomes `text:(<word>*)`, and `q=` is ignored.
- **Layer services.** For each hit, `…/ws/index/getLayerServices?uuid=<item_UUID>` gives either a WMTS
  endpoint or an ArcGIS MapServer/ImageServer endpoint.
- **Metadata.** `…/TrekWS/rest/cat/abstract?label=<productLabel>` (abstract),
  `…/cat/legend/stream?label=` (legend image; many layers return HTTP 500) and
  `…/cat/metadata/fgdc/html?label=` (FGDC; mostly empty or "TBD").
- **WMTS capabilities.** `https://trek.nasa.gov/tiles/Mars/EQ/<layer>/1.0.0/WMTSCapabilities.xml`.
  For each layer I read the bbox, format, TileMatrix list and TopLeftCorner.
- **Tile grid.** Every layer checked uses TileMatrixSet `default028mm` with TopLeftCorner (-180, 90) at
  every level. Level z has 2^(z+1) × 2^z tiles of 256 px, giving 180/(256·2^z) deg/px.
  - The ScaleDenominator values assume Earth's 111 319.49 m/deg. Take resolution from the matrix size,
    not from the scale.
- **Tile access.** Tiles are fetched with `curl` (the venv Python lacks CA certificates). Every tile
  request was logged. A missing tile is HTTP 404.

## Queries and hit counts (products/datasets only)

| key | numFound | relevant hits |
|---|---|---|
| MOLA | 113 | colour hillshade, MOLA/HRSC blend (colour, grey, DEM), global DEM, roughness; many CTX/HiRISE DEMs |
| Dust | 9 | `TES_Dust`, `tes_ruffdust`, TES albedo, CRISM dust-related browse sets |
| Thermal Inertia | 3 | `TES_Thermal_Inertia`, THEMIS day and night IR |
| Aqueous / Hydrous | 2 / 1 | `Aqueous_Mineral_Distribution_Options_clon0`, `Hydrous_Mineral_Detections_CRISM_clon0` |
| TES | 7 | Dust, Dust Index, High-Ca Pyroxene, Plagioclase, Sheet Silicates/High-Si Glass, Albedo, Thermal Inertia |
| GRS, Gamma, Silicon, Hydrogen | 0 each | none: GRS is not in Trek |
| Carbonate | 9 | aqueous minerals; CRISM `frt_07_brcarj_mtr3_ll` (Fe-Mg) and `frt_07_brcr2j_mtr3_ll` (Mg) browse sets |
| THEMIS | 8 | day and night IR mosaics, chloride salts, alluvial fans, valley networks, dune fields |
| Chloride | 3 | THEMIS chloride layer, CRISM chloride browse set |
| HRSC | 19 | `h2942_0000_nd3`, `h1394_0000_nd3` (Viking 2), MC11 quad mosaics and DEM, Mawrth Vallis |
| Hebrus / h2942 | 2 / 1 | `Hebrus_CTX_BlockAdj_dd`, `h2942_0000_nd3` |
| Odyssey, Element, Ice, Water, Albedo, Roughness, Slope, Geology, Olivine, Pyroxene, Plagioclase, Sulfate, Mineral | various | see "Other hits" below |

## Requested candidates: outcome

| Candidate | Trek ID / source | Outcome | Why |
|---|---|---|---|
| MOLA colour hillshade (basemap) | `Mars_MGS_MOLA_ClrShade_merge_global_463m` | **Shipped** `mola-color-hillshade.jpg` (4096×2048) and `-1k.jpg` | Zoom 3 = 16×8 tiles, exactly global. Legend uses data-derived colours at metre values. |
| MOLA/HRSC colour blend | `Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw` | **Shipped** `mola-hrsc-blend.jpg` (4096×2048) | Global (bbox -180..179.998, -89.999..90). Trek serves the same legend as MOLA. |
| Global numerical MOLA DEM | `mola128_mola64_merge_90Nto90S_SimpleC_clon0` ImageServer | **Shipped** `mola-elevation-1440x720.f32` | `exportImage` F32 at 2880×1440, then 2×2 mean. Vertical datum: MOLA areoid (GMM-2B, degree/order 50). A 5760×2880 request returned HTTP 500. |
| TES Dust / Dust Cover Index | `TES_Dust` | **Shipped** `tes-dust-cover.png` (1024×512) | Legend 0–1 (relative). Direction checked against known dusty and dust-free regions. |
| TES Dust Index (Ruff) | `tes_ruffdust` | Excluded | Duplicate. No-data is painted grey, hillshade is baked in, and the legend returns HTTP 500. |
| TES Thermal Inertia | `TES_Thermal_Inertia` | **Shipped** `tes-thermal-inertia.png` (1024×512) | Legend 25–600 J m⁻² K⁻¹ s⁻½. Linear or log scale unknown, so intermediate stops have positions only. |
| Aqueous Mineral Distribution | MapServer `Aquieous_Mineral_Distribution_Options_clon0` (sic) | **Shipped** PNG + GeoJSON (4572 points) | No WMTS (404). Points queried in FID chunks (no pagination support, max 1000 per request). |
| Hydrous Mineral Detections | MapServer `Hydrous_Mineral_Detections_OMEGA_CRISM_clon0` | **Shipped** PNG + GeoJSON (1648 points) | Coloured by instrument (CRISM 1208, OMEGA 440). |
| Chloride salts | MapServer `Chloride_Salt_bearing_Material_THEMIS_clon0` | **Shipped** PNG + GeoJSON (642 polygons) | Polygons filled, with centroid markers because most are smaller than a pixel. |
| TES Sheet Silicates/High-Si Glass | `TES_Glass_Clay` | **Shipped as qualitative** | Legend endpoint returns HTTP 500, so the scale is not verified. |
| TES Plagioclase | `TES_Plagioclase` | **Shipped** (legend 0–0.2, detection limit 0.1) | |
| TES High-Ca Pyroxene | `TES_Clinopyroxene` | **Shipped** (legend 0–0.2, detection limit 0.1) | |
| GRS silicon (and others) | PDS `ODY-M-GRS-5-ELEMENTS-V1.0` | **Shipped** Si, H2O, Fe: 1440×720 PNG + 72×36 float32 each | Not in Trek. PDS 5° tables give weight %, 2002-06-04 to 2005-04-03, coverage 60S–60N. |
| CRISM carbonate | `frt_07_brcarj_mtr3_ll`, `frt_07_brcr2j_mtr3_ll` | Excluded | These are per-observation footprints with qualitative browse colours, not a mosaic. Carbonate is shipped instead as a class in aqueous minerals (36 sites). |
| THEMIS Day IR | `THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018` | **Shipped** `themis-day-ir.png` (2048×1024, grey + alpha) | Qualitative, ±65°. |
| THEMIS Night IR | `THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018` | **Shipped** `themis-night-ir.png` (2048×1024) | Trek's zoom-2/3 pyramid has a hole (~45W–0, 0–65S). It was patched from zoom-5/6 tiles; see the manifest. |
| HRSC Viking 1 site | `h2942_0000_nd3` | **Shipped** regional crop 291×1159 | bbox -49.592..-46.395, 14.073..26.807 (snapped to zoom-6 pixels). |
| CTX Hebrus Valles | `Hebrus_CTX_BlockAdj_dd` | **Shipped** regional crop 673×644 | bbox 124.755..128.452, 18.287..21.824 (snapped to zoom-7 pixels). |

Additional shipped layer: `mola_roughness` (`mola-roughness.png`, hazards group). It is an RGB composite
of roughness at 0.6, 2.4 and 9.2 km baselines, with the channel meanings taken from the Trek abstract.

## Findings that affect the app

- **TES products are low-resolution in Trek.** `TES_*` and `mola_roughness` only have levels 0–1. Zoom 2
  returns 404, so the best available is 1024×512. They are shipped at 1024×512 rather than upsampled
  to 2048×1024. `tes_ruffdust` goes to zoom 2.
- **Legend colours.** The TES legend JPEGs use a muted ramp, while the tiles use a saturated
  purple→red ramp in the same order. Values can be read approximately but not exactly.
  - For the MOLA colour layers, the legend swatches carry crater texture. The stops in the manifest are
    therefore the median image colour at DEM elevations (±300 m).
- **Alignment.** The basemap, blend and THEMIS Day IR were cross-correlated (gradient magnitude) against
  the numerical MOLA DEM. All peak within one sample of zero offset. TES Thermal Inertia vs THEMIS Night
  IR also peaks at zero offset.
  - Olympus Mons summit (18.65N, 133.8W) lands at basemap pixel (525.7, 811.8), which is white, the top
    of the ramp.
  - The Hellas floor (42.4S, 70.5E) lands at (2850.1, 1506.4), which is deep purple, the bottom of the
    ramp.
- **CORS.**
  - Trek tile GETs return `Access-Control-Allow-Origin: *` (checked with Origin `http://localhost:5173`,
    for JPEG and PNG, plus the OPTIONS preflight). A browser can load them with
    `crossOrigin = "anonymous"` and upload them to WebGL.
  - The ImageServer echoes the origin with credentials allowed.
  - `searchItems` sends no CORS header, so it can't be called from the browser.
- **Vector layer quirks.**
  - Trek's MapServer query rejects `resultOffset` ("Pagination is not supported"); query by FID ranges
    instead.
  - Adding `outSR=104905` to a GeoJSON query returns an error; leave it out.
  - In the hydrous layer, the `Longitude` and `Long_East` attributes are swapped relative to their
    names. Use the geometry.

## Other hits considered (not shipped)

- `Mars_MGS_TES_Albedo_mosaic_global_7410m`: TES albedo, levels 0–1, no legend (HTTP 500). Could be
  added as a qualitative layer.
- `Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw` and `…_Shade_…`: the numerical blend DEM and the
  grey hillshade. Redundant at 4 px/deg.
- `SIM3292_Global_Geology` (USGS global geologic map), `Dune_Field`, `Hynek_Valley_Networks`,
  `FanSurvey_2005_2008_clon0` (alluvial fans), `Glacier-like_Forms_GLFs_2012_clon0`,
  `Gullied_Landform_Survey_2015_clon0`, `EZMars` and `ExplorationZones_Proposed_Oct2015_buffer_100km_clon0`.
  Global thematic layers, mostly vector. They are good candidates for a later hazards or "where to land" set.
- CRISM browse datasets `frt_07_*` (Fe minerals, mafic, phyllosilicates, hydrated silica, polyhydrated
  sulfates, CO2 frost/ice, chloride). All are footprint datasets in the same feature service.
- `MC18_PolySulfate_Mineral_IndicatorV2_SP` (CRISM polyhydrated sulfate, MC-18 quadrangle) and
  `T1303_FeMgSmectite_Mineral_Indicator_SP` (one CRISM tile). Regional mineral indicators.
- `h1394_0000_nd3` (HRSC Viking 2 site, 73–175E, 46–87N); about 40 regional CTX block-adjusted mosaics
  (Gale, Jezero, Gusev, Mawrth, etc.).
- PDS GRS volume `ody-m-grs-5-elements-v1` also has K, Th, Cl and K/Th tables in the same format.

## Raw downloads

Raw tiles, capabilities, abstracts, legends, feature JSON, the DEM GeoTIFF and the PDS tables are kept
outside the repository, in the session scratch directory (`layers-raw/`). They are not shipped.
