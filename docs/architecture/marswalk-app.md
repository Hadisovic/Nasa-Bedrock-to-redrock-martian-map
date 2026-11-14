# Marswalk app architecture

The app builds on the shared contracts in [marswalk-foundation.md](marswalk-foundation.md). Those
types, coordinate rules and fixtures are unchanged. This document covers what was added for the
full app ([#20](https://github.com/Hadisovic/bedrock-to-redrock/issues/20)).

## Pages and flow

| Route | Page |
|---|---|
| `#/` | Intro. **Start Website** opens the explorer; **Start Wildcat Ridge Marswalk** opens the planner. |
| `#/explore?site=&mode=3d&layers=&base=` | Whole-planet explorer (2D map or 3D globe), historical catalog, global layers. The query is a shareable link. |
| `#/map?tab=mission&habitat=&destination=` | Wildcat Ridge local map and Marswalk planner. |
| `#/bench` | In-browser routing benchmark. |

The local map page keeps one shared state for the selected pin, layer visibility, imagery
treatment, 2D/3D mode and the mission plan. Changing view keeps all of it.

## Whole-planet explorer

| Module | Responsibility |
|---|---|
| `src/explorer/geo.ts` | Lat/lon helpers: seam wrapping, globe unit vectors matching three.js `SphereGeometry` UVs, equirectangular pixels, screen-space clustering. |
| `src/explorer/GlobeMap2D.tsx` | Flat north-up map that wraps at 180°. Pan, zoom, pinch, keyboard. Draws the bundled basemap, then finer Trek tiles on demand, overlays clipped to coverage, regional footprints, flat icons and clusters. Overlapping pins open a list at maximum zoom. |
| `src/explorer/Globe3D.tsx` | Lazy three.js globe with the same basemap. Overlays are partial spheres clipped to coverage. Markers are meshes anchored at their base, standing along the surface normal and scaled to a near-constant screen size. Accessible DOM hit areas hide on the far side. Falls back to 2D without WebGL. |
| `src/explorer/markers.ts` | Original bedrock block, cluster and team provenance-flag meshes, plus the team-supplied rocket model (`src/assets/models/redrock-lander.glb`), shared by the globe and the local terrain. |
| `src/explorer/catalog.ts`, `data.ts` | Catalog, environment and layer-manifest types; search, filters, routing availability, marker mapping. |
| `src/explorer/ExplorerPanels.tsx` | Search, catalog list with filters and the **Location unavailable** list, evidence card (**Read about**), grouped layer controls with legends, Marswalk entry points. |

Both modes share one view (`lat`, `lon`, `zoom` in screen pixels per degree), so switching keeps
the place, the selection and the active layers. Historical pins have exactly two actions: **Read
about** and **Go to location**. The hypothetical crew landing (rocket) has **Set as current
location**, which opens the planner with that start.

Data files:
- `data/mars/catalog/events.json` and `environment.json` ([inventory](../research/catalog-inventory.md));
- `data/mars/layers/manifest.json` with images in `public/layers/` ([search log](../research/layer-search.md)).

Both are loaded through `import.meta.glob`, so a build without them still runs and shows a clear notice.

## Route planner updates

- Routes regenerate automatically 150 ms after any valid change, in a Web Worker (`src/analysis/route.worker.ts`, `routeClient.ts`). Stale responses are dropped, and the planner falls back to the main thread if a worker cannot start. See [routing correctness and benchmark](../evidence/routing-correctness-and-benchmark.md).
- Invalid fields show inline errors and no result. Changed inputs clear the shown result immediately.
- The recommendation is the shortest traversable round trip, which under a constant speed is the fastest modelled one. The slope-weighted alternative is shown beside it.
- The hazard layer hatches cells steeper than the chosen max-slope planning threshold in red.

```
data/mars/jezero/*.tif ──fetch+decode──▶ TerrainGrid + imagery DN
                                          │
                      analysis/terrain.ts ├─▶ slope (calculated), hillshade (calculated)
                                          ▼
                        render/compose.ts ──▶ one RGBA canvas (0.25 m) ──┬─▶ Map2D (Canvas 2D)
                                                                          └─▶ Map3D (texture)
data/sites.ts (science site, rover traverse, habitat presets, stories) ──▶ pins in both views
analysis/routing.ts ──▶ RouteResult ──▶ analysis/mission.ts ──▶ MissionAssessment ──▶ Marswalk panel
```

| Module | Responsibility |
|---|---|
| `src/analysis/terrain.ts` | Slope (Horn 3 × 3 gradient) and hillshade from valid heights. Any unknown neighbour gives NaN. Edge cells are NaN. |
| `src/analysis/routing.ts` | `planRoundTrip(RouteRequest)` returns the shared `RouteResult`. |
| `src/analysis/mission.ts` | `assessMission(RouteResult, MissionAssumptions)` returns the shared `MissionAssessment`. |
| `src/render/compose.ts` | Composites imagery, elevation tint, relief and slope into one RGBA image used by both views. Unknown cells get a magenta hatch. |
| `src/data/sites.ts` | Sourced science site, the 43 in-crop rover waypoints, hypothetical habitats and discovery stories. |
| `src/components/Map2D.tsx` | North-up canvas map: pan (drag, arrow keys), zoom (wheel, pinch, +/−), fit (0), north arrow, scale bar, DOM pins. |
| `src/components/Map3D.tsx` | Lazy-loaded three.js terrain with OrbitControls, overhead view, DOM pins projected each frame, WebGL fallback. |
| `src/components/Panels.tsx`, `demos.ts` | Details, layers, discoveries and Marswalk panels; the three demonstration scenarios. |

## Routing

- **Graph.** Each valid elevation cell is a node with 8 neighbours. A move is allowed only when:
  - both cells are known;
  - `|atan(Δh / ground run)|` does not exceed the slope limit;
  - for a diagonal move, both orthogonal neighbours are known, so the path never cuts the corner of an unknown cell.
- **Ground run.** East–west runs are scaled by cos(latitude), about 0.949 m per projected metre. North–south runs are 1 m.
- **Shortest.** Minimises horizontal ground distance.
- **Gentler effort.** Each move costs `run × (1 + w × f × (|slope| / limit)²)`, with `f = 1` uphill and `0.5` downhill. Because uphill counts more, the outbound and return legs can differ. This is a relative effort model for comparing routes, not physiology.
- **Determinism.** A* with an admissible straight-line heuristic. Heap ties go to the lower cell index, neighbours are visited in a fixed order, and the relax step prefers the lower parent index.
- **Outcomes.** These follow the foundation contract:
  - `unavailable`: invalid request, no terrain, outside coverage, or missing endpoint elevation.
  - `no-route`: a blocked endpoint (no allowed move from it), or no connected path.
  - `available`: always with the shortest round trip, plus an alternative that is `distinct`, `coincident` or `unavailable`.
- **Geometry.** Starts and ends at the original projected endpoints, with cell centres between, in travel order.

On the real 384 × 384 grid a search takes about 20–60 ms in Node 24 on a laptop. `tests/app/routing.test.ts` covers:
- the synthetic cases;
- the shared fixtures;
- determinism;
- the real Wildcat Ridge scenario.

## Mission timing

Per the contract, `outbound = distance / speed` and `return = distance / speed`. Then
`elapsed = outbound + return + stop`, and `margin = budget − elapsed − reserve`. A negative margin
is a valid NO-GO result. The panel also shows climb (elevation gain per leg) from the elevation
grid as extra context.

The demonstration scenarios are in `src/components/demos.ts`. They are checked against the real
data in `tests/app/mission.test.ts`.

| Scenario | Inputs | Outcome on the real grid |
|---|---|---|
| 1 · Baseline | Habitat A → Wildcat Ridge, ≤ 15°, penalty 4, 0.7 m/s, stop 30 min, budget 90 min, reserve 20 min | GO, about 29 min margin |
| 2 · One changed assumption | Same, 0.3 m/s and a 60 min stop | NO-GO, reserve used |
| 3 · Failure case | Habitat C, ≤ 4° | `no-route` |

## 3D conventions

- **Scene origin and axes.** The origin is the crop centre. `+x` is east in ground metres, i.e. projected metres × cos(latitude). `−z` is north. `+y` is up, in metres above the lowest valid elevation, multiplied by the vertical exaggeration, which defaults to **1 (true scale)**.
- **Vertices and texture.** Vertices sit on elevation cell centres. The texture is the composited 1536² canvas covering the same outer bounds, so `u = (column + 0.5) / 384` and `v = 1 − (row + 0.5) / 384`. `CanvasTexture.flipY` is left at its default.
- **Gaps.** Faces touching an unknown cell are omitted, so gaps stay visible.
- **Small screens.** On screens under 700 px the mesh uses every second cell and pixel ratio is capped at 1.5. Analysis always uses the full grid.
- **Overhead view.** The camera looks straight down from the south side, so the top of the screen is north. This was checked against 2D: no mirroring, same pin positions.
- **Fallback.** If WebGL fails to start or the context is lost, the app returns to 2D with a message. All GPU resources are disposed on teardown.

## Honest-data rules in the UI

- Every layer is tagged **Observed**, **Calculated** or **Simulated**.
- The Berry Hollow PIXL result is shown as point evidence at the sol 502 rover position. The text explains that the cm-scale patch lies within arm's reach and that its exact offset is not published.
  - Its pin is nudged on screen only (`MapPin.nudgePx`), so it does not cover the rover marker. Its coordinates and elevation stay those of the rover position.
- The Three Forks depot is outside the crop. It is listed without a pin.
- Missing imagery or elevation shows a banner naming the failed file. The remaining layers and controls stay usable.

## Data added in this phase

- `data/mars/jezero/rover-waypoints.json` lists the 43 Perseverance positions inside the crop, sols 436–709. It is generated by `npm run data:waypoints` from NASA's waypoint feed and records the source URL and retrieval date.
- `public/images/pov/*.jpg` are three raw Perseverance images taken at waypoint 26_1222 (image IDs contain `N0261222`). They are listed with IDs, credits and source pages in `src/data/sites.ts`. Sizes are unchanged from NASA's 1200 px browse versions.
