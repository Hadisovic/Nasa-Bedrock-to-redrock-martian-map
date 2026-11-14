# Marswalk foundation

The full app built on these contracts is described in [marswalk-app.md](marswalk-app.md).

## Run locally

Use Node.js 22.18 or later on the 22.x line, or Node.js 24 or later, with npm. From the repository root:

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Open the URL printed by Vite. The preview shows the real Wildcat Ridge imagery and samples the elevation at the Sol 502 rover waypoint. `npm test` checks synthetic outcomes and the actual checked-in GeoTIFFs, including the independent waypoint and slope values from the [Jezero feasibility report](../data/jezero-feasibility.md).

## Renderer and static build

Use Canvas 2D for a north-up raster, with a positioned marker or SVG overlay sharing its projected bounds. The preview writes grayscale values into a native-size canvas and scales it with CSS. Positions use `(x − west) / (width × spacing)` and `(north − y) / (height × spacing)`; use those same fractions for cells, markers and route geometry. Keep geographic ground distances separate from the display transform. Fit the common extent when combining 1 m elevation with 0.25 m imagery.

GeoTIFF.js decodes the two small, losslessly compressed crops from #10. Vite resolves the `?url` imports and copies the original TIFFs to hashed assets in `dist/`. Serve that entire directory over HTTP(S) at either a site root or a subdirectory with a trailing slash. The relative Vite base keeps assets under that directory. The preview fetches roughly 1.98 MB of raster data from the same origin, plus application code. It needs no credentials, preprocessing step, external tile service, special range support or backend. Failed fetch or decode produces an unavailable preview. This approach is scoped to the bounded crop, which fits in memory. [Vite static asset guide](https://vite.dev/guide/assets) · [GeoTIFF.js documentation](https://github.com/geotiffjs/geotiff.js/)

To reproduce the subdirectory check, copy the contents of `dist/` into a folder named `marswalk` in a temporary directory. From the temporary parent, run `python -m http.server 8000 --bind 127.0.0.1` and open `http://127.0.0.1:8000/marswalk/`. Confirm that the marker and imagery render and the waypoint reads −2523.20 m. To exercise the failure state, block the imagery TIFF request in browser developer tools and reload. A failed raster request should display “Jezero preview unavailable.”

## Coordinate and terrain conventions

- Geographic coordinates are planetocentric latitude and east-positive longitude in degrees. Use the longitude branch containing Jezero, around 77.4° E. Convert to projected meters with `projectMars` and back with `unprojectMars` from `src/contracts/index.ts`. The Mars 2000 spherical equirectangular projection uses radius 3,396,190 m, a 0° standard parallel and zero offsets. With angles in radians, `x = R × longitude` and `y = R × latitude`.
- A `RasterLayout` gives the northwest **outer corner**, positive projected pixel size, columns and rows. Rows grow south and columns east. Arrays are row-major with index `row × width + column`. `cellAt` includes the north and west edges and excludes the south and east edges. `cellCenter` adds a half-pixel offset into a valid cell.
- The crop spans west 4,588,016 m, south 1,093,936 m, east 4,588,400 m and north 1,094,320 m. The [source manifest](../../data/mars/jezero/sources.json) records provenance and both NoData values. The imagery sample is an 8-bit digital number, with 0 transparent. For a `TerrainGrid`, elevation is float32 meters above the source's MOLA-derived delta geoid. NaN represents unknown terrain. The #10 preprocessing bakes invalid masks into the GeoTIFF sentinel. The bundled crop decoder checks the expected grid and converts the sentinel and non-finite values to NaN. `elevationAt` returns undefined for an unknown or out-of-bounds sample. Valid elevation establishes data coverage; traversability requires additional route checks.
- `groundDistanceM` uses the local spherical approximation `hypot(Δx × cos(midLatitude), Δy)` for segments within this crop. An east-west projected meter is about 0.949 ground meters here. Sum ground segment lengths for route distance. Signed slope is `atan2(ΔelevationM, groundRunM)` converted to degrees; use the absolute slope for the terrain threshold and report the largest absolute slope over each leg. A zero-length leg has zero distance and slope.
- The Sol 502 waypoint projects to approximately (4,588,212.788 m, 1,094,130.734 m), at elevation cell (189, 196) and imagery pixel (757, 787), zero-based row then column. Expected elevation is −2523.197509765625 m and imagery DN is 164. The 1 m northward step rises 0.138671875 m, about 7.895°. The waypoint is a rover position and can only approximate the nearby PIXL workspace. Resolution and stereo uncertainty limit interpretation of obstacles and slopes.

## Consumer handoff

Import shared types and coordinate helpers from `src/contracts/index.ts`. `src/contracts/jezero.ts` supplies the typed decoder and verified waypoint; `src/fixtures/marswalk.ts` supplies synthetic inputs and sample outputs for independent integration.

| Consumer | Contract |
| --- | --- |
| Map (#12) | Read the `MapLayer` status first, then use its kind to access a raster or science points. Use the common projection for marker placement and both legs of each available round trip. Render unavailable layers and missing raster samples explicitly. |
| Routing (#13) | Consume `RouteRequest` with projected endpoints, numeric terrain, an absolute slope ceiling in degrees and a finite nonnegative terrain penalty weight. A zero penalty uses distance alone. Document the exact weighting, tie-breaks and endpoint treatment in #13. Preserve the original projected inputs for validation and report actual traversed geometry in travel order. |
| Science (#14) | Supply `ScienceSite` positions in projected meters. Record the location method, observed evidence, exploration objective and source mission, instrument, links and limitations. Represent Berry Hollow as point evidence with the observation footprint and waypoint uncertainty. |
| Mission (#15) | Combine an available `RouteResult` with user-set `MissionAssumptions`. Preserve outbound and return travel times, elapsed time including the science stop, and remaining margin after reserve in `MissionAssessment`. An assessed result can have a negative margin. |

For routing, absent terrain, missing endpoint elevation, out-of-coverage endpoints and invalid input are **unavailable**. A blocked endpoint or no traversable path in the usable grid is **no-route**. Exclude unknown cells and segments that require crossing them. If missing cells prevent the search from finding a path, the no-route detail should state that it describes the available grid. A usable result carries a shortest complete round trip and an alternative state. Report **coincident** when both outbound and return paths coincide. A distinct round trip must differ on at least one leg; show an unavailable alternative with its detail when one cannot be produced. Never duplicate the shortest geometry to manufacture a second option.

For mission timing, use a positive finite walking speed in m/s and nonnegative finite time budget, stop and reserve in seconds. For each available round trip, divide each leg's horizontal distance by the walking speed, sum both travel times plus the stop, then subtract elapsed time and reserve from the budget. Preserve the user's assumptions with the result. A missing route or invalid assumptions produce an unavailable assessment. The result estimates time under the supplied assumptions and does not establish astronaut safety.

The synthetic fixtures cover a usable route and a distinct gentler round trip, missing destination elevation, a fully blocked route, and coincident candidates. They also provide a site, available terrain and science layers, an unavailable imagery layer and a timing example. They demonstrate shape and semantics independently of the routing and mission algorithms. Coordinate shared contract changes and further root dependency additions on #11 before implementation.
