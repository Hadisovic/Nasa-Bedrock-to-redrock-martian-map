# Terrain routing review and merge readiness

Reviewed repository: `Hadisovic/b2r`. Target: `main` at `0b2b927cf37a2c34bf350f733c65be25ff18a9df`. Starting routing branch: `codex/mars-terrain-routing` at `696c1ece77ef41c9109e78673cefc49b78674aa9`. Date: 14 November 2026.

The five features are ready for human code and merge review after the focused corrections below. This is a submission for review, not an approval or integration into main. No merge, force push, ownership change or unrelated feature work was performed. The direct leader brief supplied this task's scope; the inherited TASKS.md and coordination documents still describe the earlier bedrock-to-redrock repository and contain no current b2r routing assignment. They were preserved.

## Feature results

| Approved improvement | Result | Evidence |
| --- | --- | --- |
| Multi-route planning | PASS | Three real weighted searches; geometry-based deduplication; shortest always selectable. Real Wildcat exposes three objectives; Gale exposes shortest/recommended plus distinct lower terrain cost. |
| Terrain-based calculations | PASS | Slope rejection, asymmetric uphill/downhill allowance, fine-grid roughness and missing-neighborhood treatment, blocked cells and corners tested. Strict improvement thresholds and inclusive 25% detour cap tested. No radiation, temperature or active-dust routing cost. |
| Higher-resolution NASA routing | PASS | Real Wildcat 1 m and Gale 20 m files; real global MOLA; live NASA Trek Valles export. Cached loads, retry after failure, fixture crop georeferencing and effective resolution, unavailable-source fallback, and preservation of genuine finer-grid no-route tested. |
| Route assessment | PASS | Segment-summed distance, ascent/descent, maximum grade, steep distance/run, terrain allowance and base-speed timing checked against actual vertices. Both outbound and independently solved return feed navigation. Regional routes suppress walking ETA and resource margin. |
| Simultaneous 2D/3D visualization | PASS | All distinct solver paths remain visible in orange/cyan/green. Selection changes emphasis, assessment, ETA and navigation. Shared legs collapse; return lines retain objective color and use dashes. Actual desktop and mobile checks and screenshots below. |

## Corrections

1. Explorer constructed only the selected path. A shared map-path builder now passes every distinct valid objective to both maps, without replacing or smoothing solver vertices. Selected legs draw last, thicker and fully opaque; other choices remain visible.
2. The previous choice filter always retained balanced but could hide shortest when only the lower-terrain alternative differed. Shortest is now the permanent feasible baseline. Geographic equality suppresses cloned duplicate geometry, including equivalent wrapped longitudes. When objectives coincide or fail the comparison thresholds, Directions explains the shared recommendation instead of inventing alternatives.
3. Return lines were white, obscuring their objective. Both renderers retain their objective color and distinguish returns with dashes. Fit route includes all alternatives. On mobile it fits beside the existing clock and above the existing sheet. The 3D start hit marker now also carries the existing lander icon, keeping it identifiable in a top-down view while preserving the lander model.
4. Floating-point subtraction could accept a lower-terrain candidate exactly on the minimum improvement boundary. Comparing candidate cost directly against the permitted cost ceiling enforces the documented strict threshold.
5. Changing choice stopped an active Earth Walk. It now pauses briefly and solves from the actual crew position through the remaining ordered stops and return, preserving whether playback was running or paused. Resume is disabled during recalculation or after an invalid result. Directions, map paths and navigation consume the same replanned results.
6. A replanned return was labeled as an entire round trip, and completed science stops could enter remaining estimates. Replans now carry their start time and completed-stop index, preserve global stop indices, display “Remaining route,” count only unvisited science, and suppress a resource margin because mission consumables already spent are not established by sensor or accelerated playback time.

## Measured scenarios

The source files and endpoints are unchanged. [Scenario inputs](scenario-plans.json) and [complete measurements](measurements.json) are supplied. Terrain allowance is a planning index expressed in equivalent metres, not an additional physical path length. Times below use the existing scenario base speed of 0.7 m/s and exclude science stops.

| Scenario / choice | Path distance | Terrain allowance | Estimated travel |
| --- | ---: | ---: | ---: |
| Wildcat Habitat A → Sol 502 → Habitat A, shortest | 441.516 m | 72.331 m | 12.234 min |
| Wildcat, balanced recommendation | 441.516 m | 61.571 m | 11.978 min |
| Wildcat, lower terrain cost | 452.899 m | 57.760 m | 12.159 min |
| Gale 20 m, shortest / recommended | 4,091.324 m | 766.063 m | 115.652 min |
| Gale, lower terrain cost | 4,498.545 m | 528.310 m | 119.687 min |
| Global MOLA, shortest / recommended | 429.971 km | 7.658 km | Unevaluated |
| Global MOLA, lower terrain cost | 430.337 km | 3.852 km | Unevaluated |

Wildcat's balanced maximum step is 14.841° against the 15° limit, with 20.248 m gained and lost across the round trip. Shortest reaches 14.876° and lower terrain cost 14.661°. The balanced outbound and return are independently solved; three itinerary objectives produce five distinct directional legs because one return geometry is shared. The earlier assessment's approximately 442 m recommendation and 453 m lower-terrain path are reproduced without hardcoding those numbers.

Gale's shortest reaches 14.930°; the lower-terrain path is longer and takes more modeled time, despite reducing terrain allowance. This demonstrates why lower terrain cost must not be called universally safer or faster. Gale roughness is not asserted at 20 m. Global MOLA reports approximately 14,818.674 m equatorial spacing and explicitly regional results.

A live Valles request from (-11.9°, -70°) to (-11.8°, -69.8°) loaded the NASA HRSC/MOLA crop, reporting 14.1 km, 108 m terrain allowance, 142 m ascent, 169 m descent and 3.5° maximum step. Its 256 × 256 export has approximately 200.052 m north/south spacing; the UI rounds this to 200 m. See [captured result](live-trek-result.txt). Blocking NASA requests and reloading selected bundled MOLA instead; these particular endpoints occupy one coarse cell, so the app reported unavailable resolution and drew no false local route.

## Test evidence

Baseline: **43/43** tests passed before corrections. Final: **58/58** passed using `npm test`; `npm run build` passed, including TypeScript checking. See [test output](tests.txt) and [build output](build.txt). `git diff --check` passed. No production or test dependencies were added.

Focused coverage includes:

- Both reported visibility regressions, cloned coincident geometry, distinct return-only choices, exact map vertices and selected draw order.
- Saved objective parsing, selected outbound/return navigation distance, partial failures and regional timing suppression.
- Deterministic steep barrier, traversable detour and unknown cells; sampled displayed segments remain in known terrain. An impenetrable barrier returns no-route.
- Real Wildcat blocked endpoint and Habitat C's strict 4° no-route; real Gale geometry and slopes; global longitude wrapping and polar routing.
- Direct assessment arithmetic, reversed ascent/descent, steep-distance/run and roughness coverage, uphill/downhill cost asymmetry, and exact detour/improvement boundaries.
- Successful NASA-shaped GeoTIFF fixture loading with verified bounds and dimensions, effective spacing, cache reuse, missing-file retries, and no coarse retry after a loaded Gale or Trek grid yields no-route. Fixture tests do not claim their synthetic elevations are NASA measurements.
- Remaining-route science and suppression of an unestablished remaining mission budget.

The build emits the existing ineffective dynamic import warning for elevation.tif, which is also statically imported. It does not fail the build.

## Actual browser checks

Chromium through agent-browser, production Vite preview, **1440 × 960** desktop and **390 × 844** mobile emulation. These were actual interactions, not inferred from unit tests.

- Loaded Habitat A / Sol 502, enabled return to lander, compared all three choices, and switched 2D/3D while retaining selection. The shortest round trip displayed 13 min, balanced 12 min, and lower-terrain 13 min after UI rounding.
- Selected lower terrain cost on mobile: summary changed to 453 m, selection stayed highlighted after map-mode switching, and horizontal overflow was false. Fit route kept the alternative corridors clear of the clock and sheet. Both endpoints and the same geographic corridors were checked in 2D/3D; normal and tilted 3D views were inspected without observed route clipping.
- Saved the lower-terrain choice using the actual Save form, changed selection, then opened the saved route: lower-terrain selection was restored. Reloading share-plan inputs also retained the selected objective.
- Entered third-person Recorded Walk, paused/resumed, changed objective, waited for an actual solver update, and exited. A paused session stayed active and paused. A running session resumed after recalculation. On the return leg, assessment showed remaining distance rather than a new complete round trip; completed science and unestablished resource margin were omitted.
- Gale: shortest/recommended and distinct lower-terrain controls both selectable; selection changed distance from approximately 4.1 to 4.5 km and allowance from 766 to 528 m.
- Global MOLA: regional label and no detailed travel ETA. Coincident fine-cell case: one shortest/recommended choice with explicit shared-result explanation. Habitat C at 4°: explicit no-route and no accepted route line. Live Valles NASA source and blocked-NASA resolution fallback checked as described above.

During iterative rebuilding of the preview, an already-open browser encountered one transient empty-root failure. The exact cause was not established; a subsequent reload resolved it, and it did not recur in the fresh final session against a stable production build. Cross-version offline deployment behavior was not established.

| Capture | What it shows |
| --- | --- |
| [Desktop 2D](desktop-2d-all-routes.png) | Actual alternatives together, shortest selected, round trip |
| [Desktop 3D](desktop-3d-all-routes.png) | Same routes, balanced selected, colored dashed returns |
| [Mobile 2D](mobile-2d-all-routes.png) | 390 × 844, shortest selected, route controls and all corridors |
| [Mobile 3D](mobile-3d-all-routes.png) | 390 × 844, lower terrain cost selected, same itinerary |
| [Navigation switch](navigation-switch.png) | Active navigation with the changed choice and assessment |

## Scope and remaining limitations

The complete PR file inventory is [changed-files.txt](changed-files.txt). It includes the original routing commit plus focused corrections, tests and evidence. Source rasters, scientific catalog records, existing saved-plan formats, lander/astronaut assets, third-person controls and production dependencies were preserved. No Sketchfab replacement, additional hazard model, route dashboard, elevation chart, first-person navigation, new Drone region or general mobile redesign was implemented.

This is an elevation-based scenario planning model, **not NASA-certified safety**. Radiation, temperature, active dust, individual rocks, soil traction, sub-grid hazards and mission-specific consumables remain unevaluated. Three weighted optima and per-leg thresholds are compared; all possible routes are not enumerated. Fine and coarse sources are not stitched across a leg. Regional grid routing cannot establish detailed walking conditions, including journeys wholly inside one unresolved coarse cell. Bundled pack load failures are reported for retry rather than silently inventing fine detail.

Browser evidence covers the tested Chromium viewports and Recorded Walk. Physical GPS, motion sensors, device tilt hardware, Safari, real mobile GPU performance and deployment/offline-pack upgrades were not validated here. Final integration and current-head independent review remain human responsibilities.
