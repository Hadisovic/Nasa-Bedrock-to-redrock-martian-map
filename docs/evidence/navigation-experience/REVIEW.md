# Walk / Rover navigation review

Implemented on `feature/navigation-experience`, based on main `d75037d6beedad1a7e55ee32c9eb79b915e140a7`. Main was fetched again before submission and has not moved. This branch is for human review; it has not been merged. GitHub Pages deployment was cancelled by the user. No hosting settings or deployment workflows were changed.

## Result

- The existing Martian Map theme, fonts, palette, models and NASA imagery are retained. Google Maps informed the navigation interactions only.
- Walk / Rover are two direct buttons. Each mode shows the shortest, balanced and lower terrain-cost options when the solver produces genuinely distinct alternatives. Orange, cyan and green paths retain the original solved vertices. Clicking a path or its card selects it.
- Travel estimates are automatic. Walk uses a modeled 0.7 m/s baseline; Rover uses the Perseverance maximum baseline of 0.042 m/s. The documented terrain-equivalent allowance slows both ETA and simulated movement through the same cumulative clock. These are scenario estimates, with autonomous pauses and science operations excluded. Manual speed, available-time and reserve fields are removed from the route flow.
- Start route opens the simulated traveler directly. The floating card shows the next turn and distance, a measured uphill/downhill cue when warranted, remaining distance and movement time. Playback cycles 1× / 2× / 3× / 4×, with accelerated playback time shown separately. Pause, voice controls, obstacle reporting, GPS tools, original stop boundaries and rover/astronaut artwork are retained.
- Destination science uses catalogue evidence. Selected catalogue destinations include their scientific value and findings, with source links. Arbitrary map points receive explicitly labeled nearby context. The nearest discovery and closest confirmed reachable science site are compared; coincident entries are combined.
- A single nonmodal Route info panel provides Overview, Terrain and Science tabs, elevation profile, terrain source/resolution, mode assumptions, measured limits and live route progress. It can be closed without stopping movement.

## Verification

`npm test`: **73 passed, 0 failed**. Fresh-main baseline was 50 tests. `npm run build`: **exit 0**, including TypeScript. `git diff --check`: clean after removing two trailing blank lines. The build retains the existing large-chunk advisory.

Captured command output: [test log](tests.log), [production build log](build.log). Local production preview: http://127.0.0.1:4192/#/explore?tab=marswalk ; use Load GPS practice route to open the Wildcat example.

Focused coverage includes automatic timing and terrain penalties, identical ETA/simulation clocks, all playback rates, saved-plan compatibility and stricter saved slope limits, stable turn anchors, nearest-segment map taps and seam handling, reachable-science lower bounds/cancellation, three-objective route comparison, original geometry, stop boundaries, fine-data selection, genuine no-route behavior and legacy GPS regressions. No new dependencies or source datasets were added.

Production Chromium checks at `http://127.0.0.1:4192/`:

| Check | Observed result |
|---|---|
| Desktop, 1440 × 960 | Themed controls, all three real Wildcat alternatives, registered HiRISE imagery and original geometry in 3D and 2D. |
| Wildcat Walk preview | Shortest 221 m, balanced 221 m, lower terrain 232 m; all round to 7 min. Different geometry remains visible despite rounded distances. |
| Same destination, Rover | Shortest 242 m / 2.2 hr; balanced 243 m / 2.1 hr; lower terrain 288 m / 2.3 hr, using the stricter 10° profile. |
| Route selection | Clicking the green 2D path selected Lower terrain. Changing choices during movement replanned from the current position and resumed; changing while paused preserved pause. |
| Playback | Cycled through 1×, 2×, 3× and 4×. Rover showed roughly 2 hr 19 min movement remaining and 35 min playback at 4×. |
| Science | Selecting Berry Hollow abrasion displayed calcium sulfate, anhydrite, gypsum and bassanite, scoped to the measured patch, with source. Hazeltop was the nearest and reachable checkpoint, about 3 m by terrain route. |
| Mobile, 390 × 844 | No horizontal overflow, no open modal dialog, no numeric route-input fields. Info bounds: x 8, y 456.4, width 374, height 337.6, ending at y 794. Internal tab content scrolls. |
| Live terrain | Current elevation, measured grade, profile and progress update alongside the moving traveler. The rover and accelerated control are visible in the mobile capture. |
| Genuine blocked route | Loading a stricter saved 1° limit produced Route unavailable on 1 m Wildcat HiRISE: every move exceeded the limit or crossed unknown terrain. It did not fall back to coarse MOLA. |
| Regional terrain | A 0°/0° to 1°/1° MOLA route showed 104.8 km, regional limitations and no movement-time claim. Distant catalogue evidence is not presented as nearby scientific value. The Gale imagery asset returned HTTP 200 from the production preview. |

Screenshots are observations from the production build, not mockups:

- [Desktop Walk alternatives](desktop-walk-routes.png)
- [Desktop paused guidance and Terrain](desktop-walk-guidance.png)
- [Desktop 2D Rover and exact destination science](desktop-2d-rover-science.png)
- [Mobile live Rover and Terrain](mobile-live-terrain.png)
- [Mobile Science](mobile-science.png)

## Scientific and testing limits

[NASA/JPL rover mobility](https://www-robotics.jpl.nasa.gov/what-we-do/flight-projects/mars-2020-rover/m2020mobility/) supports the maximum 4.2 cm/s rover baseline; it is not a measured mission-average speed. Walking speed and the terrain allowance are scenario assumptions. Terrain routing is not a certified safety model.

Valley names and unmeasured hazards are not synthesized. Elevation-derived uphill/downhill guidance is shown where detailed terrain supports it. Sub-grid rocks, traction, radiation, temperature and active dust hazards remain unevaluated. Coarse MOLA routes retain regional labels and suppress detailed movement-time/turn promises.

Reachable science is confirmed only among observed, located science/sample sites in the supported Wildcat/Gale detailed terrain area, subject to this mode's slope limit and reported obstacle. Unknown terrain is labeled unresolved. Nearby evidence is never attributed as an exact finding at an arbitrary coordinate.

Browser testing used desktop Chromium with an emulated mobile viewport. Real mobile sensors, Safari, physical GPS walking, offline-upgrade behavior and mission safety are not certified by these checks. Existing GPS and geometry automated tests pass. This is a self-reviewed submission; human current-head review is still required before main integration.
