# Martian Map team implementation prompt

**Implementation checklist.** Source preview on port 4182. The handoff snapshot goes to the [Bedrock-2-Redrock main branch](https://github.com/Hadisovic/Bedrock-2-Redrock/tree/main). Run from the repository root with `npm ci` and `npm run dev -- --host 127.0.0.1 --port 4182`, then open [localhost:4182](http://127.0.0.1:4182/).

## Progress

- **Phase 1:** Adapted the `Frontend` pill controls, neutral side panel, orbit damping and fly-to motion. Explore opens on the full 3D globe. The toolbar offers Plan route, Discover, Layers and Map options. The panel opens directly to the selected section. Desktop browser checks covered globe drag, zoom, reset, layers and an arbitrary two-point route. Frame rates and physical touch gestures still need device checks.
- **Phase 2:** The preview opens on all Mars with no preset route. A browser test at 15° N, 60° E calculated the same 12.6 km round trip in 2D and 3D using Mars Trek ~200 m elevation. A 155.9 km round trip crossed the longitude seam on bundled 0.25° MOLA. Route tools open directly from the line, and a shared plan reopened in a fresh tab. Drone View loaded Viking imagery and ~200 m elevation outside the bundled areas.
- **Phase 3:** Wired Mars24 clock and daylight, UTC arrival and return, solar lighting, walking and rover inputs, return reserve and equipment notes. Verified that walking and rover profiles calculated distinct route and time results on the 1 m test grid.
- **Phase 4:** A production preview successfully reloaded after its local server stopped. With the offline pack installed, the browser calculated a route again, accepted a blocked-cell report and recalculated the return.
- **Phase 5:** Device tilt and touch controls are wired. Physical phone and tablet gesture and sensor testing remains open.


## Latest UI and verification extensions

- [x] Adopt the sharper, coordinate-matched Viking texture and camera damping from the reference UI. Keep verified terrain, route calculations and overlays. Browser-verified descent to Gale; toolbar controls share a consistent visual style.
- [x] Stream NASA Mars Trek elevation and imagery for planetwide close zoom and flight where the pixels are available. See [Drone View data sources](DRONE-DATA-CANDIDATES.md) for detailed sources and offline candidates.

- [x] Phase 1: Adopt the Frontend artwork and map-first shortcuts. Animate the astronaut, rocket and separate star glints with a reduced-motion fallback.
- [x] Phase 1: Keep toolbar actions and source credits separate from the map controls. The compass, view switch and zoom are under the top-left toolbar. Contact & Resources is in the site footer.
- [ ] Phase 1: Drag the desktop divider past the minimum to close; resize and dismiss the mobile sheet vertically. Verify on a physical phone and tablet.
- [x] Phase 1: Tested all 18 source layer controls and opacity sliders from 2D to 3D. Fixed global raster georeferencing and added regional zoom buttons.
- [x] Phase 2: Remove the landing square; add a flag toggle and yellow Drone View coverage markers. A discovery route asks for a landing point unless one was already set. The app has no live Mars fix.
- [x] Phase 2: Opened Drone View in Wildcat Ridge, Mount Sharp and outside both offline packs. The interface indicates available sources and reports missing or low-resolution coverage.
- [x] Phase 2: Replaced the flight buttons with an arrow pad and separate up/down keys. Verified click and keyboard movement, heading, and altitude changes at Mount Sharp. Touch hold still needs a physical device check.
- [x] Phase 3: Large white block-style Mars time and sol date on the map. Verified route timing and return reserve on the 442 m Jezero case.
- [x] Phase 4: Verified disconnected reload, local route calculation and obstacle replanning with the planet and Wildcat packs installed. Online NASA requests require connectivity.
- [ ] Phase 5: Optional calibrated tilt and fallback are wired. Verify permission and orientation behavior on real hardware; no live navigation feed is provided.
## What we are building

Build a Mars surface exploration and mission planning prototype for Bedrock to Redrock. Keep the cinematic introduction and interactive globe from the new frontend. On the same screen, a user should be able to inspect real NASA data, choose a destination, compare terrain-based routes, see when they would arrive, and follow directions in a simulated Marswalk. The map, route guidance and mission checks should work offline wherever the necessary data has been bundled or downloaded.

Open on the entire planet. Users can explore and pick route endpoints anywhere on Mars in both 2D and 3D. Use numerical global terrain for regional estimates and automatically use finer terrain when both endpoints are inside supported coverage. Show the resolution and route coverage at the selected scale. Wildcat Ridge is one repeatable test case. The challenge asks for an integrated view of a Martian location or route using data from multiple missions. [Challenge details](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=details) · [Challenge resources](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=resources)

## Branches and integration

- `Frontend` at `f6726a3` provides the cinematic intro, globe, flat map, layer UI, route panel and replay. Start from its `website/` interface. The build passes and both map modes open. A shader uses `vMapUv` before the texture is ready, and some route alternatives, slope and hazard values are hard-coded. Fix both before adopting it as the main preview.
- `directions/wildcat-ridge` at `c481648` provides the measured elevation routing, walking alternatives, endpoint checks and reserve calculations. The baseline returned a 442 m round trip in the previous browser check.
- `feature/v2-map-panel-routing` at `6f29891` is the integration target. It contains the broader sourced layer manifest, discovery catalog, global MOLA worker, map-first picks and terrain close-ups. Reuse these pieces through their existing data and routing interfaces where they fit. [Team branches](https://github.com/masaa0/bedrock-to-redrock-nasa-space-apps/branches)

- [x] Adapt Frontend in the isolated feature worktree and connect it to the sourced map and route worker. The root app opens at `#/`, with the explorer at `#/explore` and the launch command above.
- [x] Verify a route end to end on localhost. The two-stop Gale itinerary showed three ordered legs, including the return, in both 2D and 3D. The source branches remain available for comparison.

## Rated feature checklist

The first score is value to the experience. The second is feasibility with the current datasets and browser. Scores run from 1 to 5. The phase marks the order to build and test.

- [x] **Real maps and layers in 2D and 3D** · Value **5/5**, feasibility **5/5** · Phase 1.
- [ ] **Fast loading, responsive sliders and smooth map controls** · Value **5/5**, feasibility **4/5** · Phase 1.
- [ ] **Phone and tablet pinch, pan, rotate and tilt** · Value **5/5**, feasibility **4/5** · Phase 1.
- [x] **Compact Contact and Resources footer** · Value **4/5**, feasibility **5/5** · Phase 1.
- [x] **Planetwide routing and detailed terrain where covered** · Value **5/5**, feasibility **4/5** for regional estimates and supported local areas · Phase 2.
- [x] **Interactive Drone View over measured terrain** · Value **5/5**, feasibility **4/5** in regions with aligned imagery and elevation · Phase 2.
- [ ] **Route failures and nearest reachable point suggestions** · Value **5/5**, feasibility **4/5** · Phase 2.
- [ ] **Route alternatives and an elevation profile** · Value **5/5**, feasibility **4/5** · Phase 2.
- [x] **Moving north compass and lander-relative coordinates** · Value **4/5**, feasibility **5/5** · Phase 2.
- [x] **Site search and filters backed by documented data** · Value **5/5**, feasibility **4/5** · Phase 2.
- [ ] **Save, name, edit and share multiple routes** · Value **4/5**, feasibility **5/5** · Phase 2.
- [ ] **Mars clock, daylight and arrival time** · Value **5/5**, feasibility **4/5** · Phase 3.
- [ ] **Walk or rover comparison and mission supplies** · Value **4/5**, feasibility **4/5** as a planning model · Phase 3.
- [ ] **Offline turn-by-turn guidance with simulated or manual position** · Value **5/5**, feasibility **5/5** · Phase 4.
- [ ] **Replanning around a reported obstacle or off-route position** · Value **5/5**, feasibility **4/5** with local data · Phase 4.
- [x] **Pixel question mark and typewriter help on the homepage** · Value **4/5**, feasibility **5/5** · Phase 1, in parallel with map work.
- [ ] **Device tilt as a user setting** · Value **3/5**, feasibility **3/5** across browsers · Phase 5.
- [ ] **Position and obstacle input tested with recorded or simulated data** · Value **4/5**, feasibility **4/5** · Phase 5.
- [ ] **Live localization and automatic obstacle sensing on Mars** · Value **5/5**, feasibility **1/5** for a standalone browser · Requires compatible hardware and a calibrated feed.

## Phase 1 — Keep the new look and fix data, loading and controls

- [x] Keep the full-screen intro and default to the sourced red Viking color basemap in both views. Use one layer manifest and shared state to preserve opacity across mode changes. Layer search, quick filters, sources, legends and coverage labels are available. Representative boundary and missing-data checks are tracked below.
- [ ] Keep imagery and measurements distinct. Viking color and THEMIS infrared are imagery products. MOLA elevation is a numerical grid. Dust cover is a surface index. Odyssey GRS silicon is a regional abundance estimate. Map mineral detections at their actual footprint and date. Treat any roughness effect used solely for lighting as display styling. Test a known landmark in each mode, a regional overlay boundary, an opacity slider and an unavailable layer. Check seams near longitude ±180° and wrap in 2D.
- [ ] Load the intro and a smaller basemap first. Fetch higher-resolution textures and regional terrain only when zoom or selection calls for them. Load layers on demand, reuse decoded textures and limit cache size. Deduplicate identical bundled files where possible. Use a lightweight fallback while a texture loads, release unused GPU resources and cap rendering resolution on weaker devices. Fix the startup shader and verify it on a clean reload and on a delayed texture load.
- [ ] Make the layer sliders respond during drag. Keep the latest opacity in the renderer and apply changes on the next animation frame. Separate opacity updates from image fetching, decoding and full panel rendering. Run route computation in a worker, discard superseded results, and keep the map interactive while it works.
- [ ] Test cold and repeat loads, layer toggle and drag, zoom and mode switching on a laptop and at least one phone and tablet. Record the device, network, first usable map time and any gesture stalls before and after. Aim for opacity feedback by the next frame once a layer is loaded and smooth interactive frames on the test devices. Report measured results.
- [ ] Add touch map controls. Use one finger to pan or rotate, two to pinch and rotate, and a two-finger tilt gesture with an explicit **Tilt** button as a fallback. Keep tilt and zoom controls reachable with the panel open or closed. Isolate map gestures from the panel's vertical scroll and sliders. A drag or pinch must never place a route point. Verify portrait and landscape on iOS and Android when devices are available.
- [x] Add optional pixel help on the homepage with a gray dialog, typewriter text, a blinking cursor, quiet clicks, reduced-motion support and a close button. The explorer has its own tabbed help next to search.
- [x] Move **Contact & Resources** to the site footer below the homepage and explorer. The dialog links to map, terrain and discovery sources and has a placeholder for approved team emails. Follow-up checks are listed below.

## Phase 2 — Make the map a route planner

- [x] Support routing in both views across Mars. Use bundled MOLA 0.25° (~14.8 km at the equator) for regional estimates, and Wildcat Ridge 1 m or Gale 20 m when both endpoints are in the corresponding detailed grid. Report the source per leg. The ~200 m NASA Trek DEM supports close zoom and Drone View.
- [ ] Make zoom feel like a continuous descent from orbit into the terrain. Load higher-resolution imagery and elevation as the camera approaches. Use NASA’s Mount Sharp animation as the visual reference. At close range show a low camera angle over real relief, a route draped on the terrain, legible landmarks and a compact elevation profile. Keep the 2D plan aligned with the 3D view. Label visual elevation exaggeration where used. Retain the best available relief and show its resolution if detailed tiles are unavailable. Label NASA’s proposed Curiosity traverse separately from the user's calculated route. [NASA Mount Sharp flyover](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/)
- [ ] Add **Drone View** to the 3D controls. Let the user enter at the selected site, route or map center, then freely look around, move forward and sideways, and adjust camera height. Support mouse and keyboard on desktop and touch gestures with visible controls on phones and tablets. Include **Follow route**, **Pause**, and **Back to map**. Keep the user's selected site, route and layer settings when they return. Show bearing, estimated height above terrain and the active data resolution. Clearly label the view as a simulated camera rendered from orbital imagery and measured terrain. Prevent the camera from passing below the terrain. Where the data supports only broad relief, keep the camera higher, show the coverage message and retain orbit and tilt controls. Test a site in Gale Crater, another area with detailed terrain, and a region with global data only. [NASA Mount Sharp flyover](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/) · [USGS terrain data inventory](https://fdp.astrogeology.usgs.gov/fdp/mars/)
- [x] Place the lander, add stops from the map, flags or search, and calculate legs in manual order. Return is on by default. Show blue outbound legs and a dashed return. The browser passed stop edits, URL restore and a failed middle leg that retained the other two. Automated tests cover the terrain-weighted alternative.
- [ ] Replace the new frontend’s direct great-circle route and offset curves with the solver’s ordered coordinates. Draw the same route on the flat map and globe. If a curve or simplified line cuts across a blocked cell, render the original segments. Derive distance, climb, steepest segment and ETA from the rendered route and stated travel assumptions. A straight route is valid when the terrain supports it. A route that detours should show where the terrain changes.
- [x] Build the routing overlay from numerical elevation. Color slopes, show which steps the selected slope limit blocks, and mark user-reported obstacles separately. A route may cross a high plateau through a shallow approach. A short cliff can block it even at low elevation. Display which constraints are active and recalculate when they change.
- [x] Keep thematic overlays available for exploration. The bundled THEMIS infrared mosaic shows relative brightness, TES dust cover is a surface index, and the MOLA roughness image shows regional relative roughness. Use a hazard layer in route costs only when the team has georeferenced measurements or verified obstacle geometry at the route’s scale and a documented rule for using them. Remove fixed radiation readings, invented elevation gains and named bypasses from computed results. Label coarse MOLA routes as regional estimates and show missing walking coverage outside detailed terrain. [NASA THEMIS instrument](https://science.nasa.gov/mission/odyssey/science-instruments/) · [Mars Trek](https://trek.nasa.gov/mars/)
- [ ] Reproduce the Wildcat Ridge route from Habitat A to the Sol 502 waypoint. On the bundled 1 m grid, the straight-line reference is about 209 m one way. At a 15° limit, the shortest outbound route is about 221 m and moves up to about 14 m away from the straight line. The steepest step is 13.9° outbound and 14.8° on return. At a 10° limit, the shortest outbound route grows to about 242 m. Verify the changed path in both views, show the slope overlay at route scale, and test a fully blocked path with no fallback arc. Use these as software verification inputs for the prototype. [USGS Jezero elevation model](https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_hirise_dtm_mosaic)
- [ ] On route failure, keep the user's original pins and show the reason on the map. Use **“No route within your 15° slope limit”** when that is the verified cause, substituting the selected limit. Use **“No return route found under your current limits”** when only the return fails. Use **“Elevation data is missing at this destination”**, **“This terrain grid is too coarse for these two points”**, or **“Terrain data didn’t load”** for those cases. Offer **Retry** for a failed load. If the cause is unknown or mixed, use **“No route found with the available terrain and your selected limits.”**
- [ ] For a blocked or unmapped destination, find the closest point to the requested destination that the solver can reach from the original start and return from under the same constraints. Rank verified candidates by ground distance from the requested destination, then by route cost. Show the suggested pin, its distance from the original point, and **Use this point**. Preview both legs and keep the original destination until the user confirms. If the start is blocked, identify the start and only suggest a replacement after validating the route from it. Limit the search to a stated radius, and when there is no reachable candidate, say **“No reachable point found nearby. Choose another point on the map.”** If coverage is too coarse, offer **View regional estimate** only when the data supports it. Keep coarse estimates separate from walking suggestions.
- [ ] Test the suggestions with a closer point on the wrong side of a barrier, a slightly farther reachable point, a missing-data destination, a blocked start, and a case with zero reachable alternatives. Use the closest point with a verified round trip and report when the search radius or coverage prevented a suggestion.
- [x] Show a moving compass in the top-left map controls with a north reset. A browser Drone View test checked a 12° turn and the reset. The planner shows lander-relative east, north and up offsets. Orientation and offset-sign checks on real devices remain below.
- [ ] Add location-based search for sites, terrain and science interest. Start with named mountains and craters, rover discoveries, mapped mineral detections, regional silicon and dust cover. Show which matches are points and which cover broad regions. Rank nearby matches from the selected position. Label straight-line distance separately from calculated route distance. Add cave candidates and rocky terrain only when the source supports their location and classification.
- [ ] Let users name, duplicate, edit, delete and reopen multiple routes. Save endpoints, travel mode, assumptions, data version and selected alternative in local browser storage. Handle unavailable or full storage with an export option. Share a versioned link containing the inputs needed to recreate the route, with a compact route file option for long plans or offline transfer. Open a link in a fresh browser and check the endpoints, options and route. If a newer data version changes the result, show which version was used. Keep saved routes after reload and handle invalid links gracefully.

## Phase 3 — Add Mars time and mission planning

- [ ] Add a small clock for the selected site or lander. Show Earth UTC and local Mars solar time, with a Mars Sol Date or an explicitly named mission-sol epoch. Use NASA GISS Mars24 worked examples to verify conversion, longitude signs and rollover. Add route duration as elapsed seconds to the departure UTC instant, then convert the resulting instant at the destination for arrival and at the lander for return. Allow a fixed departure date and time so the scenario is reproducible. [NASA GISS Mars24 algorithm](https://www.giss.nasa.gov/tools/mars24/help/algorithm.html) · [Mars24 time conventions](https://www.giss.nasa.gov/tools/mars24/help/notes.html)
- [ ] Offer **Solar lighting** and **Fully lit map**. Solar lighting uses the Sun’s computed direction at the selected instant, with the same day and night boundary in 2D and 3D. Mars’s rotation drives the day-night cycle and its orbit changes seasonal lighting. Show the estimated daylight state at departure, arrival and return. Label sunrise and sunset as estimates based on the modeled horizon. Test east and west longitudes, crossing a sol boundary, and a polar day or night case. [NASA Mars facts](https://science.nasa.gov/mars/facts/) · [Mars24 technical notes](https://www.giss.nasa.gov/tools/mars24/help/notes.html)
- [ ] Add a **Mission check** with elapsed time, science stop, return margin and the assumptions used. Show a short gravity note of roughly **38% of Earth’s surface gravity**. Keep walking speed and endurance as explicit inputs. Compare walk and rover only where the route, vehicle profile and assumptions support that comparison. If walking exceeds the time or slope limit, suggest reviewing the route, returning or evaluating a rover profile with the reason shown. Include an equipment and supplies checklist for oxygen, CO₂ removal, cooling, water, food where applicable, power, communications, science tools and terrain equipment. Calculate quantities only from supplied rates, capacities and reserves, and label them as scenario estimates. Treat climbing terrain beyond the route limit as a blocked segment. [NASA Mars gravity](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html) · [NASA spacesuit standards](https://www.nasa.gov/reference/11-0-spacesuits-vol-2/)

## Phase 4 — Add offline navigation and replanning

- [ ] Build a **Navigate** view with a position marker, next maneuver, remaining distance and a simple route overview. Default to **Simulated position**, starting at the lander, and allow **Set position** to pick a known waypoint manually. Use the route geometry and elevation to say when to continue, turn, climb or descend. A turn instruction should use travel heading, with a compass bearing available when heading is unknown. Replay at controllable speed and keep the simulated position clearly labeled.
- [ ] Let the user mark a blocked section or move the simulated position off the route. Recalculate from the current position, draw the updated path, and refresh distance, ETA, return margin and affected directions together. If the destination or return leg becomes unreachable, show that state and retire the stale route. Start with the existing A* solver on the local grid. Consider an incremental planner only if repeated changes exceed the measured responsiveness target.
- [ ] Package the app, whole-planet basemap and global elevation, saved routes, and essential site records for offline use. Offer regional downloads for higher-resolution imagery and terrain with their footprint, size and readiness. Keep terrain routing and clock calculations on the device. Turn the connection off, reload the installed or cached app, then set a route, block a segment, replan and check the return. A route link can be copied offline. The receiving browser needs the app and matching data to reconstruct it.

## Phase 5 — Device tilt and navigation inputs

- [ ] Implement device-motion tilt as a user setting. Ask for browser permission when the user enables it. Provide touch and button controls regardless of sensor access. Calibrate the neutral view, support portrait and landscape, and stop the input when the setting is off. Verify both supported and denied or unavailable states. [Browser secure-context reference](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts/features_restricted_to_secure_contexts)
- [ ] Implement a common input for manual positions, simulated positions, recorded tracks and reported obstacles. Each position should carry its coordinates, timestamp, source and uncertainty when available. Exercise the input with a clearly labeled simulated or recorded trace that goes off route and reports an obstacle. Verify replanning and the response to stale or missing position data. Keep the interface ready for a calibrated hardware feed. A Mars-qualified gyroscope measures rotation and can drift over time. Perseverance combines onboard sensors and visual odometry, then uses orbital imagery to recover its position. Live crew localization and automatic obstacle detection require their own calibrated hardware and verified data. [Perseverance gyroscope and attitude tracking](https://ntrs.nasa.gov/citations/20230007024) · [Perseverance localization](https://www.nasa.gov/missions/mars-2020-perseverance/perseverance-rover/nasas-perseverance-now-autonomously-pinpoints-its-location-on-mars/)

## First end-to-end acceptance run

1. Open the new intro, try the help dialog and enter the map.
2. Switch between 3D and 2D with a sourced layer enabled. Drag the opacity slider and confirm that the same data stays aligned.
3. Plan a nearby local route in Gale or Wildcat Ridge and a longer regional route on bundled 0.25° MOLA. Repeat across the longitude seam. Compare the route options on the same inputs.
4. Fly down into Gale Crater, enter **Drone View**, fly freely and follow a calculated route. Return to the map and verify the selected route and overlays. Repeat in a second covered region, then try a global-only area and check the camera limit and resolution label. Follow the compass and compare arrival daylight with the return margin.
5. Save and share the route. Reopen the link in a clean browser and verify the same inputs.
6. Block a destination and check that the suggested point can be reached and returned from. Confirm the user keeps the original pin until they accept a replacement. Go offline and repeat with an available local terrain pack.
7. Open **Contact & Resources** from the site footer. Verify that the resource links work and the layout fits on a phone.
8. Enable device tilt on a supported phone or tablet, check the fallback with permission denied, then use a simulated or recorded track to trigger a route update.

Report which steps worked on desktop, phone and tablet, plus any missing source coverage or device behavior. Keep any hardware integration listed as future work until it has been tested with a real feed.

## Current checklist audit — 14 November 2026

The numbered references point to lines in this file. Checked boxes record work implemented and verified locally within the stated scope. Open boxes and the handoff list record remaining implementation and verification.

### Progress, integration and rated checklist

- **Lines 7–11 and 16–28.** Verified the sourced Viking globe, on-demand Drone View at an unlisted location, all 18 opacity controls at 100% in both views, the movable compass, and local route timing. Desktop keyboard resize has earlier evidence. Physical phone and tablet divider, gesture, drone hold and sensor checks remain. Disconnected local routing was tested on an earlier build. The latest itinerary build and new bundled Drone View fallback still need a disconnected test.
- **Lines 41–42.** The Frontend adaptation and two-stop route were verified locally. The launch command is at the top of the file.
- **Lines 48–66.** The ratings duplicate the phased requirements below. Source-backed maps, the help dialog, the compass, the footer and the route planner are available locally. The partial and open pieces are recorded under their phase. Live Mars localization and automatic obstacle sensing require a hardware feed.

### Phase 1 — Map, layers and controls

- **70 — Implemented locally.** Both views default to red Viking imagery and use the same layer settings. Filters now has text search and Minerals, Water, and Dust & weather shortcuts. The shortcuts filter the list and preserve active overlays.
- **71 — QA remains.** All 18 opacity controls were exercised in each view. Recheck the antimeridian, representative regional boundaries, registration at a known landmark and unavailable-source recovery. Keep published gaps visible.
- **72 — QA remains.** A small starter basemap, on-demand imagery and terrain, and bounded tile caching are in place. Test a delayed or failed texture load on a clean browser and a lower-powered device.
- **73 — QA remains.** Opacity changes reuse loaded assets and route searches run in a worker. Measure interaction during continuous slider drag and rapid route edits.
- **74 — Open.** Measure cold and repeat loads, initial usable map time, gesture stalls, and zoom or mode-switch responsiveness on a laptop, phone and tablet. The production build still reports a large Three.js chunk.
- **75 — QA remains.** Touch controls and tilt are implemented. Test physical pinch, pan, rotate, tilt, tap-versus-drag and interaction with the bottom sheet in portrait and landscape.
- **76 — Implemented locally.** The home and explorer have optional pixel help. The explorer tutorial has tabs and typing clicks. Check the audio on a physical phone.
- **77 — Updated by the latest request.** Contact & Resources is in the site footer below the home and explorer and opens the source list. The explorer footer and dialog were checked in the browser. Add approved team emails when available and check remaining source links and keyboard access.

### Phase 2 — Terrain and routes

- **81 — Implemented for the current itinerary scope.** Each directed leg selects Wildcat Ridge 1 m, Gale 20 m, or bundled MOLA 0.25° using the endpoints. The old ~200 m online routing comparison in the progress notes is historical. The current 200 m source is available to the 3D view and Drone View.
- **82 — Partial.** Orbit-to-terrain zoom, tilt and route draping were seen in Gale. Restore the elevation profile in the explorer and finish boundary, anchor and alignment checks.
- **83 — Partial.** Flight controls, altitude, source labels and Follow route are wired. Global ~200 m flight was verified outside the shortcuts. Test physical touch hold, continuity across terrain windows, route-following and restoration of the prior map state. Verify the new offline relief fallback.
- **84 — Implemented locally.** Ordered stops, per-stop science time, manual replacement and reordering, one-way routing and default return were tested. A failed middle leg left two successful legs visible. The current build still needs the full field-device run.
- **85 — Partial.** The visual line follows solver coordinates, and metrics use the original grid path. Add validation so display smoothing falls back to the original segments at blocked or unknown cells.
- **86 — Implemented locally.** The calculated local slope layer follows the active limit, and reported obstacles get a separate marker. Retest both together on a real route at close zoom.
- **87 — Implemented within the current data inventory.** Thematic overlays retain source labels. Regional MOLA legs suppress walking estimates and the budget verdict. New science data needs its own coverage and source checks.
- **88 — QA remains.** Automated tests cover real Wildcat terrain and slope constraints. Re-run the exact 15° and 10° Habitat A scenario and blocked-path case in both rendered views.
- **89 — Partial.** Directions reports failed legs and offers retry for load failures. Give the on-map status the failed leg and its actionable reason, including when only the return fails.
- **90 — Partial.** The app can suggest and preview a reachable replacement for one leg. Validate all legs affected by the replacement before calling the full itinerary reachable, and expose the search radius and no-candidate message.
- **91 — QA remains.** The disconnected-cell unit test passes. Add browser coverage for a blocked start, missing data, a nearer disconnected point, and an itinerary where a proposed replacement breaks the return.
- **92 — Implemented locally.** Compass, 2D/3D and zoom controls now sit under the top-left toolbar. The dial was verified in Drone View at 12° and after a north reset. Lander-relative offsets are available. Verify their signs and orientation with known north and east reference points.
- **93 — Partial.** Search covers catalog records and the Filters panel searches layer names, instruments and measurements. Geographic results ranked near the user for terrain and science interests remain open.
- **94 — QA remains.** Route naming, save, edit, duplicate, remove, copy, export and import are wired. URL-based itinerary restore was verified. Run a clean-profile save, reload, export/import, invalid-file and storage-failure pass.

### Phase 3 — Time and mission checks

- **98 — Partial.** The readable clock uses the map center. Reproducible departure and local stop/return arrival times are available for fully resolved local trips. Verify rollover and add a selected-site or lander clock if that earlier requirement still applies.
- **99 — Partial.** Solar lighting and the fully lit view are wired, and Mars24 unit checks pass. Restore daylight at each stop and return, plus modeled sunrise/sunset, and compare the terminator in both views.
- **100 — Partial.** Local trip timing and reserve, speed and slope inputs, the gravity note and supplies are present. The itinerary panel can switch travel profile. Restore side-by-side Walk versus Rover comparison and the action guidance when a scenario exceeds its limits.

### Phase 4 — Offline navigation and replanning

- **104 — QA remains.** The navigation panel has simulated position, bearings, remaining distance and adjustable replay speed. Verify it end to end with ordered stops, both map modes, and pause/resume. The requested reference-skin walking animation in 3D with first- and third-person camera modes is still open from the earlier UI brief.
- **105 — QA remains.** Manual positions and blocked-cell recalculation are wired. Recheck a recorded off-route fix and a blocked middle leg on a local multi-stop plan, including the updated directions and return result.
- **106 — QA remains.** The planet and regional packs exist. Repeat the disconnected production reload on the current build, then reopen a saved route, change a stop, report a blocked cell and try the new bundled Drone View fallback.

### Phase 5 — Devices and recorded input

- **110 — Device QA remains.** Test calibrated tilt in portrait and landscape on real hardware, including denied or unavailable permission and turning it off.
- **111 — QA remains.** Manual, simulated and recorded positions are supported. Run the full recorded-track and obstacle scenario with fresh, stale and missing input. Calibrated live Mars positioning and automatic obstacle detection remain hardware-dependent.

### End-to-end run, lines 115–122

1. Intro and tutorial checked in the browser. Physical-device audio and gestures are open.
2. Layer controls checked at 100% in both views. Repeat the boundary and drag-performance tests.
3. Ordered local and regional routes checked. Compare Gale or Wildcat with coarse MOLA for current acceptance. The previous 200 m routing comparison applies to the earlier planner.
4. Gale route and unlisted global flight checked. Recheck Follow route, restored layers and arrival daylight.
5. URL restore checked. Complete saved-route and file round trips in a clean profile.
6. Failed middle leg checked. Validate whole-itinerary replacement and disconnected replanning.
7. Footer and dialog checked. Check remaining external links and physical-device access.
8. Test real-device tilt and the recorded-track scenario.

### Remaining handoff tasks

- [ ] On physical phones and tablets, test panel resizing, tap versus drag, pinch, tilt, drone-control hold, tutorial sound, orientation changes and denied motion permission.
- [ ] Measure cold and warm loads and slider response. Check regional overlay alignment, the longitude seam, and recovery when a source image or tile fails.
- [ ] Restore the elevation profile. Guard route display smoothing at blocked cells, show actionable failed-leg messages on the map, and validate replacement points across all affected legs.
- [ ] Finish nearby geographic search for terrain and science interests. Verify saved-route editing, reload, export/import, invalid inputs and storage-failure recovery in a clean browser.
- [ ] Finish daylight and sunrise or sunset readouts, side-by-side Walk and Rover comparison, and guidance for trips that exceed their limits.
- [ ] Retest the production build disconnected, including saved routes, recorded-track replanning, blocked cells, and the bundled Drone View fallback. Check flight continuity and route following.
- [ ] Finish the reference astronaut walking replay and its first- and third-person views. Verify compass and lander offset orientation, footer source links, and approved team emails.
