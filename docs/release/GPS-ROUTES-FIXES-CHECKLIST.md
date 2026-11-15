# Bedrock to Redrock GPS and routing fixes

## Local preview verification

- [x] Earth GPS Demo separates physical phone movement from visual playback and tilt. Browser tests cover stale and weak fixes, accepted movement, signal loss, permission denied, and watcher cleanup. *(Verified via `tests/app/earth-walk.test.ts` & `smoke.mjs`)*
- [x] Regional GPS simulation and bundled Mission Control voice work in the local build. The regional view suppresses the walking ETA and detailed terrain guidance. *(Verified via `gps-global.mjs`)*
- [x] Both drone simulations open from the Drone tab. Verified the flight controls, geology toggles and cards, rover-path following and exit on desktop and emulated phone. *(Verified via `flyover.mjs`)*
- [x] The production build packages the official NASA SVG for the header, both map views, and the offline pack. *(Verified locally via `flags-local.mjs`)*
- [x] Route Analysis, Walk vs. Rover timing, Hazards and nearby geographic search are available. Verified on an emulated iPhone. Radiation is historical context only. *(Verified via `analysis-local.mjs`)*
- [x] Offline browser reload and cached geology and flag assets passed. *(Verified via `analysis-local.mjs`)*
- [ ] Physical phone or tablet walk, tilt, speaker playback, and simultaneous touch flight test. *(Requires physical device outdoors)*
- [x] Saved routes survive reload. Verified save, duplicate, remove, reopen, and restoration from a shared URL in a browser. *(Verified via `analysis-local.mjs`)*
- [x] Verify GPS obstacle replanning in an emulated Pixel 7 on the real Wildcat Ridge elevation raster. Preserves stop order and science times, reuses the blocked cell, replans to the next stop and back to the lander, and plays and repeats the bundled voice cue. *(Verified via `gps-navigation.mjs`)*
- [x] Test sourced landmark proximity and spoken distance and direction after an offline reload. The case uses actual Perseverance catalog coordinates and a simulated phone fix. *(Verified via `gps-landmarks.mjs` and `tests/app/earth-walk.test.ts`)*
- [x] Review PR #2 in a separate copy. Verify its three route choices and selection on both map views. Use its regional obstacle-cell rerouting and 3D route draping changes locally. Keep the handheld-only GPS policy and existing Gale and regional GPS flows. *(Verified via `pr2-gps-review.mjs` and `tests/app/global-routing.test.ts`)*
- [x] Verify the short room route, next maneuver display, voice mute and repeat, modeled rover option, and NASA rover replay in a phone-sized browser. The physical room GPS check remains open. *(Verified via `gps-rover-preview.mjs` and `gps-room-preview.mjs`)*
- [ ] Verify GPS obstacle rerouting end to end on a physical device. *(Requires physical outdoor walk)*
- [ ] Add numerical suit or vehicle resource estimates when the team supplies a reference equipment profile and operating assumptions. The app currently compares travel times and reports terrain and radiation evidence.

Work from the GPS update on [Hadisovic/b2r main](https://github.com/Hadisovic/b2r/tree/main). The working baseline for this checklist is commit `0b2b927`. Use the root app and its existing globe, route solver, data packs and third-person astronaut. Review this checklist and preview the current build before changing the app.

---

## Phase 1 — Make the tablet GPS simulation a reliable navigation input

- [x] On one phone or tablet over HTTPS, let the user explicitly start **Earth GPS Demo**. Use the first reliable Earth fix as the origin and anchor it to the Mars lander. Convert accepted Earth displacement into local east and north metres on Mars at 1:1 scale. Move the astronaut only after accepted physical movement, with a stationary dead zone, stale fix handling and filtering based on reported accuracy. When the signal drops, hold the last reliable position and show that the app is waiting for GPS. *(Implemented in `src/explorer/earthWalk.ts` & `src/explorer/useEarthWalk.ts`)*
- [x] Keep third-person movement and camera tilt. Give the existing motion and recorded demo their own clearly labelled preview mode. It can animate the astronaut and tilt the camera. GPS alone updates the live mission position, completed stops, and replanning in Earth GPS Demo. Keep tilt, step and playback input out of the GPS position and route state. *(Implemented in `src/explorer/EarthWalkPanel.tsx` & `src/explorer/Globe3D.tsx`)*
- [x] Keep the desktop experience on simulated preview and manual route planning with no Earth location request on desktop. Keep phone and tablet Earth fixes in memory on the device, out of requests sent by the app, logs, saved routes, links and exports. Release the location watch when the session ends. Explain the Earth GPS simulation in the **?** guide and label its position while active. *(Implemented; verified desktop bypasses geolocation prompt)*
- [ ] Verify on a physical tablet that walking moves the astronaut, stopping keeps it still and tilting moves only the camera. Verify denied permission, poor accuracy, exit and the desktop flow. *(Emulated tests pass in `smoke.mjs`; physical hardware walk pending)*

---

## Phase 2 — Fix multiple routes, validation and spoken alerts

- [x] Calculate **Shortest** and **Lower slope cost** for the same start, ordered stops, return setting and terrain constraints. Display the options clearly in 2D and 3D and explain the distance, time and slope trade-offs. Use the same verified geometry for the displayed line, GPS guidance and route metrics. When both options coincide, show one line and explain why. Use **Lower risk** only when validated hazard inputs justify the label. *(Implemented in `src/analysis/routing.ts`, `src/explorer/itinerary.ts`, `src/explorer/globalRouting.ts`)*
- [x] Preserve completed stops and their science durations when replanning from a sustained off-route GPS fix. Recalculate the remaining legs and any return to lander. Validate alternate destinations across every affected leg. When local terrain is missing or a leg exceeds the limit, show the affected leg and reason. Keep coarse global estimates visibly separate from detailed walking guidance. *(Implemented in `src/explorer/useEarthWalk.ts`)*
- [x] Use short, clear Mission Control audio and matching text for supported turns, route changes and measured terrain cues. Add **Repeat last cue** and avoid repeated announcements from location jitter. Prefer an on-device voice or bundled clips for offline use. Say **“Shorter route found”** only after comparing valid routes from the same current position with the same remaining stops and limits. For a route with lower slope cost that adds distance, state that trade-off. *(Implemented in `src/explorer/walkAudio.ts` & `src/explorer/useEarthWalk.ts`)*
- [x] Use source-backed alerts. A dust layer can describe mapped surface dust cover. A temperature reading requires a calibrated and dated observation at the applicable scale. Show when the data is too coarse or absent to support a cue. *(Implemented; TES dust raster and MEDA Sol 502 observation integrated)*

---

## Phase 3 — Smooth Drone View in the two detailed areas

- [x] Offer Drone View only in **Wildcat Ridge** and **Gale Crater / Mount Sharp**. Use the existing local terrain packs. At the edge of coverage, keep the craft within verified terrain and show the boundary. Keep whole-planet map browsing and route planning available. *(Implemented in `src/explorer/droneCoverage.ts`)*
- [x] Add a game-style analog joystick for movement, on-screen flight arrows, separate climb and descend controls, and mouse or finger drag to look around. Support simultaneous touch input for steering and altitude, and keep all controls reachable on a phone or tablet. *(Implemented in `src/explorer/DroneControls.tsx`)*
- [x] Smooth movement and camera changes. Verify control release and exit with browser input and emulated touch. Use NASA’s Mount Sharp flyover as a camera and terrain presentation reference. *(Verified via `flyover.mjs`)*
- [ ] Verify joystick, altitude and release behavior on physical touch hardware in both drone areas.

---

## Phase 4 — Production branding, flags and credits

- [x] Fix the development-only asset path that currently hides the NASA insignia in the production build. Where the team has permission for the intended logo and flag use, package those assets with the app and verify them in the header, homepage artwork and both map views. Keep a bundled Bedrock to Redrock flag with NASA source credit available so markers and attribution stay visible wherever the official insignia is unavailable or awaiting permission. *(Implemented via `src/explorer/nasaMark.ts` and `VITE_APPROVED_NASA_INSIGNIA`)*
- [x] Add **Licenses & Terms** under **Resources**. Record sources, credits and applicable terms for imagery, elevation, artwork, models and audio. Check production and offline asset loading. Keep the app’s own license separate from third-party asset terms. *(Implemented in `src/components/Resources.tsx`)*
- [x] Record permission for the official NASA insignia in the homepage artwork, app header, and map flags. The team confirmed these placements in chat on 15 November 2026. The app records the scope under **Licenses & Terms**. [NASA Brand Guidelines](https://www.nasa.gov/nasa-brand-center/brand-guidelines/)
- [x] Keep the current globe. If a new downloaded or Sketchfab replacement planet model was pushed, remove that integration and its unused assets. The baseline already includes a redrock lander and an astronaut model used by the app. *(Current lightweight 3D globe and lander preserved)*

---

## Phase 5 — Follow-up work after GPS and route fixes

- [x] Add a **Route Analysis** tab with an elevation profile, ascent and descent, steepest and sustained slopes, ETA, and terrain coverage. Add **Walk vs. Rover**, with supported resource estimates backed by explicit assumptions. Include a dedicated hazard view. Research radiation sources before listing numerical estimates, and leave those estimates out where the evidence is insufficient. *(Implemented in `src/explorer/RouteAnalysis.tsx`)*
- [x] Verify the iPhone layout, nearby search, the geology overlays, and saved and shared routes in the browser. Mars24 clock and subsolar calculations have automated coverage. GPS obstacle replanning passed in mobile emulation.
- [x] Validate scientific raster dimensions, bounds, visible coverage, aqueous and hydrous detection positions, and no-data masks for GRS water, silicon and iron. *(Verified via `python scripts/data/layers/validate.py .`)*
- [x] Check all 18 science and imagery overlays at 100% opacity in the flat map and globe. Verify filter tabs, retained opacity on view switch, color changes within the Hebrus Valles footprint, and recovery from an unavailable layer. *(Verified via `overlays-local.mjs`)*
- [ ] Physically verify tilt and outdoor navigation.
- [x] Run the repo checks and smoke-test the production preview. Report the commit, tested devices, map and route cases, data source behind each alert, and any gaps still awaiting verification. *(All automated test suites passing)*

---

## Verification results

1. **Unit & Contract Tests:**
   - Command: `npm test` inside `b2r`
   - Result: **50 / 50 passed** covering A* routing, Mars24 sun/time, seam crossing, MOLA global routes, GPS fix filtering, ordered route progress, step detection, terrain alignment, and next maneuver directions.

2. **TypeScript & Static Typechecking:**
   - Command: `npm run typecheck`
   - Result: Clean pass, **0 errors**.

3. **Production Build:**
   - Command: `npm run build`
   - Result: Successful build to `dist/`, generating complete offline manifest `offline-files.json`.

4. **Browser verification from the local Playwright harness:**
   - `flags-local.mjs` $\rightarrow$ **PASS**: Verified local NASA insignia SVG in header, 2D site/cluster pins, and 3D cloth flag.
   - `analysis-local.mjs` $\rightarrow$ **PASS**: Verified Route Analysis tab, elevation profiles, Walk vs. Rover, Hazards (NASA RAD), nearby search, zero horizontal overflow on iPhone 13, saved route lifecycle (save, duplicate, reload, remove, reopen, restore from share URL), and offline service worker assets.
   - `flyover.mjs` $\rightarrow$ **PASS**: Tested both Gale Crater / Mount Sharp and Wildcat Ridge drone simulations, geology overlay toggle, analog joystick, altitude controls, held mouse control, and clean exit restoring 2D map.
   - `gps-global.mjs` $\rightarrow$ **PASS**: Tested global route across 180° longitude seam, offline WAV Mission Control voice, suppressed unsupported ETAs, weak signal detection, and geolocation watch release.
   - `gps-navigation.mjs` $\rightarrow$ **PASS**: Verified voice playback and repeat, stale and jitter filtering, emulated tilt without GPS movement, stop order, preservation of science times, obstacle-aware detour and return, and pause and exit cleanup.
   - `node smoke.mjs --routes-only` $\rightarrow$ **PASS**: Verified first-click lander selection, clearing a plan, shared multi-stop routes in 2D and 3D, desktop recorded preview, and phone permission denial and weak fixes.

5. **Phone preview:**
   - Deploy branch `fix/gps-routes-drone` with `npm run build` and serve `dist/` over HTTPS.
   - Open the preview on the phone, choose **Directions → Start route → Earth GPS Demo**, and allow precise location. Test walking, stopping, tilting, and an off-route detour.

6. **Remaining verification:**
   - Outdoor physical walk with a real phone/tablet over HTTPS to test live GPS dead-zone and 1:1 displacement mapping against real terrestrial satellites.
   - Physical orientation sensor (gyroscope/accelerometer) calibration test on real mobile hardware.
   - Verification of obstacle rerouting during live physical walk.
   - Physical multitouch flight in both drone areas and speaker playback outdoors.
   - Reference equipment inputs for numerical resource estimates. For a suit, record usable oxygen, consumption at the planned activity levels, and emergency reserve. For a rover, record usable battery energy, driving consumption by grade and surface, stationary draw, and return reserve. The [NASA Mars surface power analysis](https://ntrs.nasa.gov/citations/20220003043) models a specific reference mission. Its assumptions do not establish equipment capacity for this app's route.
