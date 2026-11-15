# Martian Map final preview checklist

Branch `fix/final-mobile-preview`, based on `a1f1f2f` (PR #3 merged by the team).
The release preview uses `npm run build`, serves `dist/` over HTTPS, and needs a real phone for location, orientation, and multitouch sign-off.

## Interface and discovery

- [x] Put the pixel-font Mars clock, logo and search on the same header row.
- [x] Add a map feature list to the intro tutorial. Use continuous cover artwork for portrait and landscape layouts.
- [x] Keep the right panel at the right edge, with an icon matching the active tab on its collapse handle.
- [x] Order the tabs Discover, Layers, Directions, Drone. Put reset and 3D solar lighting beside the zoom and view controls.
- [x] Use sun/moon icons for lighting. Keep the dark interface and use solar shading only on the globe.
- [x] Use a satellite icon for drone coverage, collapse discovery filters at first open, and restore scroll when returning from a record.
- [x] Show one credited image per illustrated discovery in README. Keep the unlocated records in the source catalog and the counts in the [catalog report](../research/catalog-counts.md).
- [x] Keep the Viking imagery credit and center coordinates with separate scale/coordinate space on phone screens.
- [x] Remove the standalone Device tilt action. Route setup still offers camera tilt permission.

## Directions and GPS

- [x] Put lander and stop entry first in Directions. Show clickable distance and walk/rover comparisons immediately below.
- [x] Display distinct shortest and lower-slope paths in different colours in 2D and 3D. Keep returns dashed and offer a control to hide the other path.
- [x] Require route selection before Start. Put Start and Route details on the map.
- [x] Add closeable route details with profile inputs, measured elevation and grade, and modeled walk or vehicle arrival dates, Mars local time and daylight. Estimates use the current time and account for earlier science stops.
- [x] Keep controls for saved routes and navigation. Move life-support and equipment wording to a voice cue driven by a computed return-budget shortfall.
- [x] Give route setup a close icon and two mode choices. Recorded preview is accelerated playback and the desktop default. Phone and tablet GPS input can move a simulated astronaut or rover.
- [x] Offer 1×, 10× and 100× Earth-to-Mars movement. Use accepted position fixes and true bearings. Accuracy scales together with distance. The tutorial explains precise location, an open test area, and the separate sensors and positioning that a Mars mission would need.
- [x] Keep the on-route position during a 2D/3D view change. Put the collapsing next-turn card under the tabs with mute and readable text.
- [x] Resolve detected deviations and user-reported blocked cells with the terrain worker. Keep honest no-route and unavailable outcomes, show sourced landmarks, and use local speech or bundled audio. Play a short tone before the recalculation cue. A missing detailed grid limits local turn and detour guidance.
- [ ] Physical verification of Earth GPS, walking and driving scale, voice over speaker, new obstacle reroute, and maintaining position during a view change. A browser fixture exercises test fixes.
- [ ] Per-step heading from an independent step sensor. The live feature uses reliable Earth GPS fixes. An individual step smaller than GPS uncertainty cannot establish a unique position.

## Drone and layers

- [x] Explain both drone areas in the Drone tab and map tutorial. Keep the 1 m Wildcat and 20 m Mount Sharp terrain packs, their original imagery, and a local flight boundary.
- [x] Start from a central elevated view against a star field. Show uncoloured imagery by default. Geology highlights and real science flags remain available during flight.
- [x] Replace preplanned tracks with an in-flight lander and editable added stops, terrain-based route solving, and recorded walk playback. Maintain manual flight during playback. Retain NASA’s Curiosity and rover references.
- [x] Label the exit with an icon. Suppress the browser context menu and touch callout on flight controls.
- [x] Simplify layer rows to checkbox, title, and details arrow. Remove the local-only slope overlay and the unshipped research list from Filters.
- [x] Add an Ice indicators shortcut to the available Odyssey water-equivalent hydrogen layer. Maintain the actual scientific footprints, source descriptions, and polar gaps.
- [ ] Physical phone and tablet multitouch sign-off, including long-press behavior.
- [ ] Additional cave and lava layers require a sourced, aligned dataset. Pole gaps stay visible where the product has no observations.
- [ ] Higher-resolution and wider chunks require additional verified elevation. The bundled packs retain their known source resolution.

## Release

- [x] Add optional original ambient sound from the map tutorial.
- [ ] Confirm the team contact address and any new domain. Keep the current contact placeholder until the team chooses the address.
- [x] Remove the unused local-slope renderer, dust audio sampler, and older untracked regional audio cue. Remove stale agent and issue links from the public README. Source evidence, collaboration records and regression tests remain available.
- [x] Complete the browser checks listed below.
- [ ] Receive the hosted HTTPS preview URL and complete the device tests.

## Verification

- `npm test` passed all 50 tests, including scaled Earth displacement, terrain-derived travel estimates, source contracts, and local and regional route logic.
- `npm run build` passed with the known chunk-size and elevation import warnings.
- `python scripts/data/layers/validate.py .` passed the overlay data checks.
- Production browser checks at Pixel 7, iPad portrait, and desktop sizes passed the intro feature list, shared header layout, discovery scroll restore, collapsed filters, 100% water overlay, route-choice gate, departure-now arrivals, live 2D/3D switching, and navigation hide and mute.
- Simulated phone GPS followed measured Wildcat terrain and preserved stop order during off-route replanning. Reporting a new obstacle during GPS submitted a new solve from the existing crew position and resumed the same session after a valid path returned.
- Both drone areas passed the compass, geology, custom lander and stop, calculated walk playback and exit checks. Emulated simultaneous forward and climb input stopped on release.
- The browser drew all 18 overlays at full opacity in both map views, restored the unavailable-overlay fixture on retry, and placed the regional CTX overlay in its source footprint.
