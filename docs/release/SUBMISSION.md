# Submission package (draft for the human portal owner)

This is a draft. The human portal owner confirms the current Space Apps Project Submission Guide,
the Irbid local event's format and deadline, and every link before submitting. Planning targets
below are a 30-second video and at most seven slides. Change them if the official form says
otherwise.

## Story in one line

Real rover discovery → terrain-informed round trip → one changed assumption → a clear return
decision.

Primary award target: **Best Use of Data**. Secondary: **Best Use of Storytelling**.

## What each dataset contributes and cannot resolve

| Data | Mission / instrument | Contributes | Cannot resolve |
|---|---|---|---|
| Optical image, 0.25 m | MRO HiRISE (USGS mosaic) | Locates the ridge, the delta front, dunes and the rover tracks area | Mineralogy; anything smaller than about 1 m |
| Elevation, 1 m | MRO HiRISE stereo (USGS DTM) | Slope, relief, 3D terrain, route cost and climb | Individual rocks; stereo uncertainty |
| Rover positions | Mars 2020 localization | Ground truth for where Perseverance worked, sols 436–709 | The instrument footprint within arm's reach |
| PIXL mineralogy | Mars 2020 PIXL (Jones et al. 2025) | The science objective: calcium sulfates recording past water | Composition beyond the cm-scale abrasion patch |
| Raw images | Navcam, WATSON, Mastcam-Z | What the crew would see at the destination | Exact pointing for map registration |

## Captioned demo script (about 30 s)

| Time | Visual | Caption |
|---|---|---|
| 0–4 s | Intro: blocky astronaut, **Start Website** | "Could a crew walk to a real Mars discovery and get back safely?" |
| 4–9 s | 2D map of Wildcat Ridge; tap the Berry Hollow pin | "Perseverance found water-made sulfate salts here, in Jezero Crater." |
| 9–13 s | Switch to 3D at true vertical scale | "Real 1 m HiRISE elevation, the same data in 3D." |
| 13–19 s | Marswalk → **1 · Baseline**; two routes appear | "Shortest versus gentler route, out and back, from the terrain." |
| 19–25 s | **2 · One changed assumption** → NO-GO | "Slower suited walking and a longer stop: the reserve is gone." |
| 25–30 s | Debrief panel: Observed / Calculated / Simulated | "Real data, honest limits, a clear decision." |

Record from the deployed build at the tested SHA. Keep a teammate-voiced version as the fallback.
Use an AI voiceover only if the event rules allow it, and disclose it.

## Five-slide pitch outline (Irbid)

1. **The crew question.** Could astronauts walk from a habitat to Wildcat Ridge, do science and return within their reserve?
2. **Rover evidence.** Perseverance abraded Berry Hollow (sol 504). PIXL found anhydrite, gypsum and bassanite. Hazeltop and Bearwallow were cored here.
3. **Data layers.** HiRISE image and 1 m elevation (MRO) plus rover positions, PIXL and raw images (Mars 2020). Shown in 2D and true-scale 3D.
4. **Route and decision.** Deterministic terrain-aware round trips; one changed assumption turns GO into NO-GO; a strict slope limit gives no route.
5. **Limits and next observations.** The 1 m grid misses rocks. Timing is a simple model, not certified safety. Next steps: CRISM mineral overlay, finer rock maps, physiological models.

## Submission copy (draft)

**Bedrock to Redrock: plan a Marswalk on real Martian ground.** Our map puts a future crew at
Wildcat Ridge in Jezero Crater, where NASA's Perseverance rover found sulfate salts left by ancient
water. It layers MRO HiRISE imagery and 1 m stereo elevation with Perseverance's own positions,
PIXL mineral results and raw images, in a 2D map and a true-scale 3D terrain. Choose a habitat and
the app computes terrain-aware outbound and return routes, compares the shortest and a gentler
option, and turns your crew assumptions into a GO or NO-GO return decision. Every value is labelled
as observed, calculated or simulated, so the map is honest about what it knows.

## Credits

- HiRISE orthoimage and DTM: NASA/JPL/University of Arizona; USGS Astrogeology Mars 2020 terrain products, doi:10.5066/P9QJDP48 and doi:10.5066/P9REJ9JN.
- Perseverance waypoints and raw images: NASA/JPL-Caltech (Mastcam-Z: NASA/JPL-Caltech/ASU).
- PIXL study: Jones, M. W. M. et al. (2025), *Science Advances* 11(16), eadt3048, CC BY 4.0. PIXL archive: doi:10.17189/1522645.
- Context pages: NASA Science, "Meet the Mars Samples: Hazeltop and Bearwallow", "Sample Collection and Rock Analysis at Wildcat Ridge", and "Perseverance's Three Forks Sample Depot Map".
- Fonts: Press Start 2P and Atkinson Hyperlegible Next (SIL OFL 1.1). Libraries: React, Vite, GeoTIFF.js, three.js.
- Original artwork: blocky astronaut, team patch and bedrock texture, made for this project. Not endorsed by NASA. Minecraft-inspired theme only; no Minecraft assets are used.
- Team: list the human team members as registered on the Space Apps team page.

## AI-use disclosure (draft; required by the Space Apps FAQ)

> We used AI tools during development. Claude Code (Anthropic) helped research the challenge
> resources, write and test application code, process the public datasets and draft documentation,
> under direction and review by our human team. All scientific data comes from the cited NASA and
> USGS sources, and source links are in the app. [Add any other AI tools the team used, and any AI
> voiceover or generated media in the video.]

The human team should confirm this text matches what was actually used before submitting.

## Known limitations to state

- One 384 m × 384 m area. Routing uses 1 m cells and cannot see rocks smaller than a cell.
- Walking time is horizontal distance ÷ an assumed speed. It is not a physiological, suit or certified safety model.
- The PIXL result applies to the abrasion patch only. The rover position approximates the workspace.
- Device testing so far was done in desktop Chrome with emulated tablet and phone sizes. Real-device results come from M6.

## Human checklist before submitting

- [ ] Current Project Submission Guide and Judging & Awards Guide read; local deadline confirmed with the Irbid Local Lead.
- [ ] Deployed URL, tested commit SHA and video link recorded on #20.
- [ ] AI-use, voiceover and media disclosures confirmed accurate.
- [ ] Team credits match the registered team.
- [ ] Early-work timing recorded accurately; eligibility left to the organizers.
