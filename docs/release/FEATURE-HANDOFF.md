# Martian Map team handoff

**Branch** `feature/v2-map-panel-routing` in the private [Bedrock to Redrock NASA Space Apps repository](https://github.com/masaa0/bedrock-to-redrock-nasa-space-apps).

**Status** Ready for team testing and tuning on localhost. This is the handoff for the feature branch, following the earlier [full-app milestone](LOCAL-HANDOFF.md). Use the commit you checked out when reporting results.

## Run it

From a clone of the private repository, use Node 22.18+ on the 22.x line or Node 24+.

```sh
git fetch origin
git switch feature/v2-map-panel-routing
npm ci
npm test
npm run dev -- --host 127.0.0.1 --port 4176
```

Open `http://127.0.0.1:4176/#/`. To test the release build, run `npm run build` and then `npm run preview -- --host 127.0.0.1 --port 4177`. For a physical phone or tablet on the same Wi-Fi, start Vite with `--host 0.0.0.0` and open the laptop's LAN address on port 4176.

## What changed

- **Intro and header.** The reference artwork has pointer-responsive motion, a soft “Tap anywhere to begin the mission” prompt, and a reduced-motion mode. The explorer header uses the intro wordmark with the team name underneath.
- **Whole-planet maps.** Both views default to a red Viking Orbiter color basemap. The flat map can load finer NASA Trek tiles. The globe has global MOLA relief and close-up terrain at Wildcat Ridge and in part of Gale Crater. Use **Tilt terrain** in those close-ups. Layers, search, site links, and historical evidence cards remain available.
- **Discovery flags.** NASA flags replace the Bedrock markers. Orange corner brackets and a diamond identify the selected site. One tap opens the evidence card in browse mode. Double-click or hold a flag to plan from the current rocket or the default hypothetical landing.
- **Panel.** Hide and show it with one click. On desktop, drag the panel's left divider or focus it and use the arrow keys. The current width returns when reopened. Narrow screens use a bottom panel.
- **Map-first routes.** Click **Plan route**, place the hypothetical lander, then pick a destination on the surface or tap a flag. Blue shows the outbound leg and white dashes show the return. Distance and routing status appear on the map, including with the panel closed. **Route details** opens the calculation and options. The lander animates in 2D and 3D with reduced-motion support.
- **Routing data.** The worker uses 1 m HiRISE elevation when both points are in the Wildcat Ridge crop, the bundled 20 m Gale grid when both points are in that crop, and 0.25° MOLA for global estimates. Walking time uses horizontal distance and the selected speed. The separate `#/map` view still contains the original mission demos, reserve calculation and gentler-route comparison.

## What was verified

- `npm test` passed all 29 tests, including route correctness, real Wildcat Ridge fixtures, missing data, slopes, and global routes across the longitude seam.
- `npm run build` passed. Vite reported a Three.js bundle chunk above 500 kB.
- Local browser checks covered the intro prompt, header, flags in 2D and 3D, desktop panel drag and keyboard resize, mobile collapse, and a 390 px viewport with no header or route-control overflow.
- Map-first planning worked with the sidebar closed. A desktop 3D Wildcat Ridge run returned a 219 m round trip on the 1 m grid. A separate phone-sized 2D run returned 132 m. A desktop 3D global run returned a 2,746.4 km coarse estimate. These are results for the points clicked in those runs.
- The Wildcat Ridge 3D preview showed the HiRISE texture, tilted terrain and both route lines.

## Team test checklist

- [ ] **Intro and layout.** Test desktop, an actual tablet and phone, both orientations, keyboard entry and reduced motion. Check the intro fills the screen and the hint stays visible. Confirm the wordmark, search, map buttons and bottom panel fit.
- [ ] **Panel controls.** Drag the desktop divider, hide and reopen the panel, then use the keyboard. Check that map controls remain usable with the panel at both limits.
- [ ] **Sites and layers.** Search for Berry Hollow, Hazeltop and a site outside Jezero. Test **Go to location**, a fresh shared site link, a single tap for evidence, and a double-click or touch hold for a route. Toggle a mineral or heat layer and confirm its legend, credit and alignment.
- [ ] **3D terrain.** In 3D, search **Berry Hollow**, click **Go to location**, zoom and toggle **Tilt terrain**. Repeat for **Curiosity's proposed path up Mount Sharp**. Check seams, the close-up boundary, flag anchoring and return to the global view.
- [ ] **Map-first routing.** Hide the panel. Place the rocket, pick a destination, then change and clear it. Repeat in both map modes with a mouse and with touch. Try another pair of endpoints on a different part of Mars. Close points within one coarse MOLA cell should show an explanation instead of a fabricated walking path.
- [ ] **Timing and unavailable routes.** With a local route, change walking speed and check that time changes while distance stays the same. Try a strict slope limit, a long route and a rapid sequence of destination edits. Look for clear status and stale paths disappearing.
- [ ] **Release preview.** Try the built app without internet and with WebGL disabled. Verify the bundled basemap, layers, evidence and route data. NASA Trek tiles and the dev insignia require a network. Record the tested SHA, device, browser, viewport, steps and result for any issue.

## What is left and what to build next

- [ ] **Simplify the panel first.** Use **Discover**, **Layers**, and **Route**. Open site evidence inside Discover with a back action. Group layers by purpose. In Route, put start, destination and summary first, then move speed, stop time and slope into **More options**.
- [ ] **Check performance and route clarity on real devices.** Prioritize first load, pinch zoom, 3D-to-2D switching, overlapping flags, and touch selection near the route controls. The global 0.25° grid is roughly 15 km per cell at the equator. It supports regional estimates and cannot resolve walking-scale obstacles.
- [ ] **Expand close-up coverage where data supports it.** Add aligned imagery and elevation patches with credit, resolution and coverage. The detailed Wildcat Ridge view is a 384 m × 384 m projected crop. The Gale patch also has limited coverage. Keep the global relief outside verified patches and check the blend at their boundaries. The Gale asset preprocessing still needs reproducible documentation. [USGS Jezero data](https://astrogeology.usgs.gov/search/map/mars-2020-jezero-crater-landing-site-products) · [USGS Gale terrain](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m)
- [ ] **Bring mission decisions into the explorer.** Consider showing reserve and the return margin alongside the map route, borrowing the existing mission logic in `#/map`. Verify a changed walking speed or stop duration with a reproducible scenario.
- [ ] **Add the optional experience after QA.** Consider a button-triggered tutorial, an astronaut replay along a calculated route, and first- and third-person views. Label any suit telemetry as simulated. Confirm character and model asset rights before including them in a release.
- [ ] **Review public-release assets and the submission.** The official NASA SVG loads from NASA in dev, while production UI flags and the header use a text fallback. The supplied intro artwork itself includes a NASA mark, so review it along with the lander and any Minecraft-inspired assets before public hosting. Verify the real build and update the [submission draft](SUBMISSION.md) before recording the 30-second video or preparing the Irbid slides. [NASA brand guidelines](https://www.nasa.gov/nasa-brand-center/brand-guidelines/)

## Where to work

- Intro and styling: `src/components/LiveHome.tsx`, `src/styles/home.css`.
- Explorer shell, sidebar and route controls: `src/explorer/Explorer.tsx`, `src/explorer/ExplorerPanels.tsx`, `src/explorer/Directions.tsx`, `src/styles/app.css`.
- Maps, marker gestures and terrain: `src/explorer/GlobeMap2D.tsx`, `src/explorer/Globe3D.tsx`, `src/explorer/MarkerButton.tsx`, `src/explorer/markers.ts`, `src/explorer/galeTerrain.ts`.
- Routing and layer data: `src/explorer/globalRoute.worker.ts`, `src/explorer/globalRouting.ts`, `src/analysis/routing.ts`, `data/mars/layers/manifest.json`, `tests/app/global-routing.test.ts`.
