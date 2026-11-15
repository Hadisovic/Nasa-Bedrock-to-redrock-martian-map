# Navigation clock, loading and PR integration

Local branch: `fix/navigation-clock-loading`. Combines navigation PR #6 (`be41670137ec67641ca2081faa05aed9c5ca28e6`) with phone-polish PR #5 (`72e7b4ac73751ec0c87e8dd01bce7add22ac585f`) and the requested corrections. Base main is `d75037d6beedad1a7e55ee32c9eb79b915e140a7`.

The user explicitly requested notification before pushing or merging if conflicts exist. Four conflicts were found and resolved locally: `Directions.tsx`, `EarthWalkPanel.tsx`, `Explorer.tsx`, `useEarthWalk.ts`. Nothing from this correction has been pushed, neither PR has been merged, and main remains unchanged. Local integration is ready for the user's go-ahead.

## Corrections

- Recorded preview starts at realistic 1×. Fast-forward cycles 1× / 60× / 180× / 600× so even NASA's slow rover can be previewed in seconds. Movement and simulated mission time advance by the same terrain-aware elapsed time. Remaining trip time is still physical movement time; preview duration is separate.
- The top Mars clock visibly advances and is labeled SIM during recorded preview. Mission ETA uses simulated current time plus remaining physical travel time, so acceleration alone does not change the modeled arrival. Pausing freezes the clock and traveler. Arrival clamps both to the route endpoint. A replan preserves elapsed mission time and can update ETA when the route changes.
- A themed SVG fast-forward icon replaces the emoji.
- 3D code begins downloading while basemap imagery loads, removing the previous serial wait. The older local-map application is now loaded only on its own route, keeping its raster decoder out of Explorer startup. Jezero waypoint metadata no longer imports the raster decoder.
- Routing workers use ES modules and load raster decoding on demand. Their initial entry shrank from 321,222 to 22,146 bytes. All required modules remain in the offline manifest.
- Reachable-checkpoint queries calculate only the shortest route, preserving exact shortest-path geometry and constraints. They start after the main route settles. Obsolete queued itinerary searches are cancelled when the destination or travel mode changes.

PR #5's GPS startup, direction/rejoin guidance, optional notifications, phone traveler presentation, drone controls, atmosphere, polar layer and PWA changes are retained alongside PR #6's automatic travel modes, original route alternatives and sourced science.

## Evidence

- `npm test`: **76 passed, 0 failed**. Includes PR #5's direction tests and regressions for fast-forward, stable modeled arrival, pause/arrival clamping and unchanged shortest-path geometry under checkpoint optimization.
- `npm run build`: **exit 0**, including TypeScript. Existing large Three.js chunk advisory remains.
- A real Wildcat checkpoint query took **12–15 ms** versus **92–119 ms** for the complete comparison in the same local Node process. This is a local measurement, not a universal network-speed claim.
- The long MOLA route from 12.35697° N, 90.03222° W to 15.48861° N, 76.68815° W solved in **34 ms** locally, returning an 861.1 km regional route.
- Production Chromium resource timing showed Globe3D starting alongside basemap downloads. The older `App` route was absent from Explorer startup requests and still opened successfully when visited directly.
- Rover browser checks: roughly 1.2 wall seconds at each of 60× / 180× / 600× advanced about 75 / 224 / 750 mission seconds (sampling occurs on 250 ms ticks). ETA stayed **12:50 PM** across the run while remaining physical time and preview duration decreased. Raw observations are in [clock-browser.json](clock-browser.json).
- Pause froze simulated time; choosing another route while paused preserved pause and the mission clock. Walk at 600× reached Arrived and the clock remained fixed afterward. No browser errors were recorded.
- Desktop 1440×960 and mobile 390×844: SVG control visible, no emoji in the navigation card, no horizontal overflow or modal dialog. The Route info panel remains 374×337.6 px on mobile.

Captures: [desktop](desktop-clock.png), [mobile](mobile-clock.png). Command output: [tests](tests.log), [build](build.log).

Fixed local preview: http://127.0.0.1:4193/#/explore?tab=marswalk . Use Load GPS practice route for the detailed Wildcat example. The older preview at port 4192 is unchanged.

Physical phone GPS, motion sensors, notification delivery and Safari were not tested on hardware. External NASA tile and elevation services still depend on network availability; detailed terrain failures are not replaced with invented data or falsely precise coarse guidance. No dependencies, datasets, deployment settings, visibility or permissions were changed by these corrections. PR #5's own source/data changes remain included.
