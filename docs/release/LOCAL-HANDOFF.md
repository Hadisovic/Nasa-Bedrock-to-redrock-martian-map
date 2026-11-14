# Local testing handoff: prompt extensions

This records the status of each item in the prompt extensions on branch `implementation/full-app`.
For each item it says what was built, the evidence, and what is still open. The exact tested commit
SHA is posted with the push on [#20](https://github.com/Hadisovic/bedrock-to-redrock/issues/20). Run
instructions are in [RUNNING.md](RUNNING.md).

Key: ✅ done and verified · 🟡 done with a stated limit · ⏸ deferred by the checklist's own gate · ⬜ needs humans.

## 1. Whole planet

| Item | Status | Evidence / notes |
|---|---|---|
| **Start Website** opens the explorer; **Start Wildcat Ridge Marswalk** shortcut on the intro and in the explorer | ✅ | `src/main.tsx`, `src/components/Intro.tsx`, explorer top bar |
| One credited basemap in both modes; 2D wraps at the seam; 3D sphere; mouse, touch and keyboard; reset; 2D fallback without WebGL | ✅ | MGS MOLA colour hillshade, 4096 × 2048 ([layer-search.md](../research/layer-search.md)). Seam and texture alignment are tested in `tests/app/geo.test.ts`. Screenshots: [2D](../evidence/explorer-2d-planet.jpg), [3D](../evidence/explorer-3d-globe.jpg) |
| Site and layers kept when switching; far-side pins hidden; finer imagery on demand; bundled basemap | 🟡 | One shared view (lat, lon, zoom). Far-side and limb markers are hidden. Finer Trek tiles stream on demand **in 2D only**; the 3D globe uses the bundled 4096 px texture, so it is blurry at crater scale. A 1024 px basemap is used on low-memory devices. |
| Bedrock pins and rocket markers as 3D meshes; matching flat 2D icons | ✅ | `src/explorer/markers.ts`: meshes anchored at the base and upright to the globe normal or terrain. Screenshots: [local 2D](../evidence/local-2d-route-markers.jpg), [local 3D](../evidence/local-3d-route-markers.jpg) |
| Zoom-aware sizing with separate accessible hit areas | 🟡 | Globe: about 22–34 px. Local terrain: 1.5–25 m. Icons grow 16–30 px with zoom. Hit areas are separate 44 px buttons. Replay camera modes do not exist yet (§5). |
| **Go to location**, search by site, event, mission or alias, shareable link, clustering | ✅ | Search ranks titles, aliases, missions and sols. A link such as `#/explore?site=m2020-sample-12-hazeltop` opens, centres and highlights the site in a fresh session (verified). Clusters split as you zoom; at maximum zoom an overlapping group opens as a list. |

## 2. Historical events and discoveries

| Item | Status | Evidence / notes |
|---|---|---|
| Inventory and map every verifiably located event | ✅ | [catalog-inventory.md](../research/catalog-inventory.md). 149 mapped records (112 precise, 37 approximate or regional) and 4 in **Location unavailable**. Covers 9 NASA landings, Perseverance stops, all 30 sample records plus witness tubes, the Three Forks depot, Ingenuity flights 1–72, Curiosity drill sites and milestones, and hardware. Filters for mission, type, sol and year. |
| Stable ID, date or sol, mission, type, evidence, coordinate source and precision, media; counts by source | ✅ | `data/mars/catalog/events.json`. Counts are shown in the Discoveries panel. |
| Bedrock pin and NASA flag | 🟡 | Minecraft permission is unverified, so the release uses a **team-made bedrock texture**. The flag is team-designed, with a plain-text **Source: NASA** credit; no NASA artwork is used. A human must confirm any asset change. |
| Historical pins have exactly two actions | ✅ | **Read about** and **Go to location** in the pin popover. The evidence card has only a close control. |
| Representative cases | ✅ | Sol 502 stop, Berry Hollow (sol 504), Hazeltop and Bearwallow (sealed sols 509 and 516), the separate Three Forks depot, Curiosity's landing in Gale, and the proposed Mount Sharp path labelled **not observed**. See the inventory for the exact values. |

## 3. NASA data layers

| Item | Status | Evidence / notes |
|---|---|---|
| Trek search, product IDs, downloads, shipped and excluded reasons | ✅ | `data/mars/layers/manifest.json` and [layer-search.md](../research/layer-search.md). 19 layers, 14.6 MB; the exclusions are listed in the Layers panel. |
| Terrain and imagery | ✅ | MOLA colour hillshade and MOLA/HRSC blend (metre legend, MOLA areoid datum). Numerical MOLA DEM drives the cursor elevation readout. Regional HRSC Viking 1 and CTX Hebrus are clipped to their bounds. |
| Dust, materials, minerals | 🟡 | TES dust cover index (surface dust, labelled), thermal inertia, plagioclase, high-Ca pyroxene, sheet silicates (qualitative). Aqueous minerals, hydrous minerals and chloride deposits are drawn from source vectors in 2D. |
| Silicon and carbon | 🟡 | Odyssey GRS silicon, water and iron (weight %, from PDS). Carbonate appears as a class in the aqueous-minerals layer; standalone CRISM carbonate footprints were excluded with a reason. SHERLOC organics are not shown as a separate layer. |
| Temperature and weather | 🟡 | THEMIS day and night IR (qualitative brightness). Dated MEDA (computed daily min/max from PDS for sols 502–516), REMS, InSight and RAD observations appear in evidence cards near their sites, each with instrument and time. MCS and calibrated THEMIS brightness temperature were not shipped. |
| Hazards | 🟡 | Local hazard: red hatching for cells steeper than the chosen planning threshold, labelled as a threshold. Global: MOLA roughness (qualitative). The RAD dose is shown only at Gale. |
| Layer controls and data integrity | ✅ | Grouped by terrain, materials, weather and hazards. Each has visibility, opacity, a legend, coverage, resolution, source, dates and a false-colour tag. No-data stays transparent. |

## 4. Route planner

| Item | Status | Evidence / notes |
|---|---|---|
| Rocket model as the landing marker; **Set as current location** in both views; credits; hypothetical label | ✅ | `src/assets/models/redrock-lander.glb`, credited in Layers → About and credits. Historical landings remain bedrock pins with the landing accent. |
| Current location and destination by pin, search or site list; automatic alternatives; stale results cleared; unavailable cases | ✅ | Destination search box, pin actions, the explorer's Marswalk tab (every site shows its routing availability), auto-generation 150 ms after valid input |
| Recommendation with explanation; both legs; overlap legend; inline errors; **No route**; **Marswalk routing unavailable here** | ✅ | Verified on the production build |
| Metrics from verified terrain | ✅ | Horizontal ground distance on the Mars sphere, labelled as such. Values are unrounded through the calculation, and 2D and 3D share one geometry. |
| Correctness vs Dijkstra; hand fixture; real route; speed change; unsupported route | ✅ | [routing-correctness-and-benchmark.md](../evidence/routing-correctness-and-benchmark.md) |
| Browser benchmark; worker adopted on measured benefit | ✅ | Same document. Desktop Chrome 157 on macOS: longest frame stall 100 ms on the main thread vs 17 ms in the worker. |

### Worked route example (baseline demo, real terrain)

Habitat A (south-east flat) → Wildcat Ridge (waypoint 26_1222), max slope 15°, penalty 4,
0.7 m/s, 30 min stop, 90 min budget, 20 min reserve:

- Outbound: 220.758 m horizontal ground distance, steepest step 13.9°.
- Return: 220.758 m, steepest step 14.8°.
- Walking: 315.4 s + 315.4 s = 630.7 s (10.5 min). With the 30 min stop, elapsed time is 2430.7 s (40.5 min).
- Margin = 5400 − 2430.7 − 1200 = **1769.3 s (29.5 min) → GO**.
- A distinct gentler-effort alternative is also generated.
- Changing the speed to 0.3 m/s and the stop to 60 min gives **NO-GO**.
- Habitat C with a 4° limit gives **No route**.

## 5. Tutorial and replay: ⏸ deferred

The checklist asks the team to review the planet and catalog before spending time on the tutorial
or route animation. None of §5 is built yet. That covers:
- the Tutorial button;
- the Laby.net skin, whose reuse rights are unverified;
- **Simulate Marswalk** with first- and third-person cameras;
- the simulated suit HUD.

## 6. Verification on this push

- `npm test`: 26 of 26 pass (contracts, routing, mission, A* vs Dijkstra, geometry and search).
- `npm run typecheck` and `npm run build` pass. The production build was checked at `npm run preview`.
- Desktop Chrome 157 (macOS), real browser:
  - explorer 2D and 3D, search, Go to location, a shared link in a new load;
  - overlapping clusters, layer toggles with vector minerals;
  - the three Marswalk demos, inline errors, worker routing.
- **Emulated** (same-origin iframes in desktop Chrome):
  - phone 390 × 844 and 844 × 390;
  - tablet 820 × 1180 and 1180 × 820;
  - pages: intro, explorer 2D and 3D, planner.
  - No horizontal overflow and no fatal errors at any size.
- **Not yet tested on real phones or tablets.** That is the workers' local QA.
- Missing-data handling:
  - A build without the catalog or the manifest shows a notice; this was seen while the data was being prepared.
  - A failed layer file shows "This layer's file did not load". That path is implemented but was not exercised in a browser this session. The offline fallback works for all bundled data; only the on-demand Trek tiles need a network.

## Known gaps for the team

- 3D globe: no on-demand fine tiles yet.
- §5 (tutorial, replay, HUD) is deferred pending team review.
- Asset permissions:
  - Minecraft bedrock texture: not used until permission is verified.
  - NASA flag art: not used.
  - Rocket model: creator and terms to be confirmed by the team.
- Weather and temperature: MCS profiles and calibrated THEMIS brightness temperatures are not shipped.
- Real-device QA is still to be done.
