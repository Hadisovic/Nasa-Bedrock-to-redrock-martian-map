# Interplanetary Survival Guide: Martian Map — challenge research

Research date: 2026-11-13 (one day before the hackathon). Companion document:
[martian-map-resources.md](martian-map-resources.md) (resources, endpoints, test results).

Legend used throughout:

- **[OFFICIAL-REQ]** stated as a requirement or core task in the challenge text.
- **[OFFICIAL-REC]** stated as optional ("you may", "you might", "consider").
- **[VERIFIED]** checked against a live source or a working request on 2026-11-13.
- **[INTERPRETATION]** our reading or idea; not from NASA.
- **[UNVERIFIED]** plausible but not confirmed.

## 1. Source pages

| Page | URL |
|---|---|
| Challenge details | https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=details |
| Challenge resources | https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=resources |
| Participant FAQs (updated 2026-11-05) | https://www.spaceappschallenge.org/resources/participant-faqs/ |
| Awards | https://www.spaceappschallenge.org/awards/ |

Challenge metadata: difficulty **Intermediate**. Subjects: Human Exploration, Mars, Planets & Moons,
Software, Space Exploration. Event: 2026 NASA Space Apps Challenge, **14–15 November 2026**.

## 2. The problem (summary of the official statement)

Robotic missions have mapped Mars for decades. The first astronauts will need the best possible map,
with information about routes and destinations, current conditions, and the data needed to finish
the mission quickly and safely.

**Core task [OFFICIAL-REQ]:** create a *layered, integrated view of a location or route on the
Martian surface* that *pulls together data from multiple NASA science missions*. It should help a
human explorer plan and carry out a successful **Marswalk** while doing science along the way.

The Objectives section restates it: create *a map, tool, or interface a Mars astronaut could use
during a surface exploration mission, using NASA data and tools*.

### Gap NASA identifies [OFFICIAL]

Existing tools (JPL Mars Trek, the USGS–NASA Planetary Geologic Mapping Program) layer data on a
global map, but they are built for **regional and global views**. They don't serve the
**hyperlocalized areas** astronauts will target on a single spacewalk or excursion. That is the gap
to fill.

### Background context [OFFICIAL]

- Humans can reason, connect observations and apply context in real time, as the Artemis II lunar
  flyby showed. Robots can't do this the same way.
- Today human exploration targets the Moon (Artemis, Moon Base buildup). Science missions pave the
  way for later destinations such as Mars.
- Data from current and past Mars missions *isn't yet layered together in the combinations needed
  to plan specific human missions*.

## 3. Objectives and guidance, separated by strength

### Requirements / core expectations [OFFICIAL-REQ]

1. A map, tool or interface usable by a Mars astronaut on a surface exploration mission.
2. Built with **NASA data and tools**.
3. A layered, integrated view of **a location or route** on the Martian surface.
4. Data drawn from **multiple NASA science missions**.
5. Supports planning and carrying out a Marswalk, including science along the way.

The page has no explicit "must" list. Items 1–5 are the challenge's stated task, so we treat them as
the requirement.

### Recommendations [OFFICIAL-REC]

- Start by choosing **science goals** and a **location**. NASA's example: boxwork formations
  (studied by Curiosity in 2025) at the Mount Sharp region.
- Pick either a well-explored rover site (lots of data and imagery) or, as a harder option, a
  less-studied area.
- "You may consider" including **at least three kinds of data**. Examples given: optical, thermal,
  spectral, topographic, geophysical, atmospheric, radiation, chemical. This is phrased as a
  suggestion, not a hard rule. *[INTERPRETATION: judges will likely expect ≥3 data types; treat it
  as a de facto target.]*
- **Astronaut safety** is NASA's first priority. Consider information that helps a crew move safely.
  Example: the Mars radiation environment differs from Earth, Earth orbit and the Moon, so space
  weather data may be included.
- Consider spacesuit mobility and carried equipment. "If possible", include a **route map** that
  reaches the science objectives while avoiding significant obstacles such as large rock formations.

### Potential considerations ("may, but are not required to") [OFFICIAL-REC]

- Display format: a display in the spacecraft or habitat for planning, a carried tablet app, a
  helmet-visor **HUD**, or another format.
- Product type: a static snapshot, an interactive digital product, or a tool/system that generates
  maps for different locations or data types.
- Inspiration from maps NASA made for Earth, the Moon, other planets and exoplanets.
- Time frame: past data, predicted future conditions, or no time frame (for example stable layers
  like topography and geology).
- Use surface-mission **point-of-view imagery** so the astronaut knows what to expect. Consider
  embedding these images in the map.
- Consider rovers or robots carrying crew and tools, or astronauts working in **pairs**.

The resources tab notes that "More resources may be added before the hackathon begins." Re-check it
at the start of the event.

## 4. Audience and users

- **Primary user [OFFICIAL]:** a Mars astronaut or crew planning and carrying out a surface
  excursion (a Marswalk or EVA).
- **Secondary users [INTERPRETATION]:** mission planners and science teams on Earth, plus the public
  and students (judging rewards storytelling and accessibility).

## 5. What a successful solution should show [INTERPRETATION, derived from the official text]

- A clearly chosen **site** and **science objective**, with a reason for the choice.
- At least **three data layers from different NASA missions or instruments**, registered to the same
  map.
- **Hyperlocal detail** at metre scale, not just regional context. This is the gap NASA names.
- **Safety information**, such as slope, roughness, obstacles, radiation or space weather, and
  daylight or thermal conditions.
- A **traverse or route** that reaches the science stops and avoids hazards, with distance,
  elevation profile and a time or effort estimate.
- **Ground-truth imagery** (rover POV) linked to map positions.
- A usable interface for someone in a spacesuit or habitat, with legible, glanceable layers.

## 6. Judging and submission (what is officially known)

- **Global award categories [VERIFIED, /awards/]:** Best Use of Science, Best Use of Data, Best Use
  of Technology, Galactic Impact, Best Mission Concept, Most Inspirational, Best Use of
  Storytelling, Global Connection, Art & Technology, Local Impact.
- **Process [VERIFIED]:** Local Event judges pick Global Nominees, then NASA and partner experts pick
  Global Finalists and Honorable Mentions, then an executive committee picks 10 Global Winners.
  Nominees are announced December 2026; winners in January 2027.
- **Submission [VERIFIED, FAQ]:** submit through the team's project page on spaceappschallenge.org
  before the ending time of the **Local Event** (Irbid, Jordan; confirmed on the team page 2026-11-13).
- **AI disclosure [VERIFIED, FAQ]:** AI tools, termed "Super Intelligence (SI)" on the site, are
  allowed. *Each team's project submission must include a description of how SI tools were used.*
- **Timing rule [VERIFIED, FAQ]:** "Teams are not allowed to begin working on the challenges prior
  to the hackathon." Research is preparation; build work starts 14 November.
- **Team rules [VERIFIED, FAQ]:** at most 6 members. A Local Event team needs ≥1 member to be
  eligible. One team per person, one challenge per team.
- **Not found:** the Project Submission Guide and the Judging & Awards Guide (with the detailed
  judging criteria) were due 13 November. The Resources page did not list them yet when checked, and
  `/2026/judging-criteria/` returned 404. See unresolved questions.

## 7. Scientific and technical background

### Mars facts used by the data [VERIFIED from the Trek config and layer metadata]

- Reference sphere radius **3,396,190 m** (IAU Mars 2000 sphere). Trek's map projection is
  `EPSG:104905`, a simple-cylindrical / equirectangular projection in degrees with east-positive
  longitude from −180 to 180.
- Polar data uses polar stereographic projections `IAU2000:49918` (north) and `IAU2000:49920`
  (south).
- Elevations are relative to the Mars areoid (geoid). Example: the Curiosity landing site is about
  −4,501 m.

### The example site: Gale crater / Mount Sharp boxwork

- **Boxwork [VERIFIED, NASA/JPL release 2026-013, 23 Feb 2026]**
  (https://www.nasa.gov/missions/mars-science-laboratory/curiosity-rover/nasas-curiosity-rover-sees-martian-spiderwebs-up-close/):
  - Low ridges about 1–2 m tall with sandy hollows between them, crisscrossing for miles. From orbit
    they look like spiderwebs.
  - Formed where groundwater moved through bedrock fractures and left minerals that hardened the
    ridges. Wind later eroded the weaker material in between.
  - The boxwork lies within the **sulfate-bearing layer** of Mount Sharp.
  - Findings: the dark central lines are fractures. Nodules sit along ridge walls and hollows. Drill
    samples showed clay minerals in the ridge and carbonates in the hollow.
  - Significance: groundwater persisted later and higher than expected, which extends the window for
    habitability.
  - Curiosity studied the boxwork for about six months (imagery dated Aug–Sep 2025). The release said
    it would leave around March 2026.
- **Curiosity's position [VERIFIED, MSL waypoints GeoJSON]:**
  - Around sols 4560–4860 the rover was near **lon 137.379–137.383 E, lat −4.800 to −4.813**, at
    about **−3,650 to −3,580 m** elevation.
  - *[INTERPRETATION]* This matches the boxwork campaign period. A Curiosity blog post titled for
    sols 4798–4803 was cited by the release.
  - Latest waypoint at the time of research: **sol 5070, lon 137.38915, lat −4.82568, −3,473.7 m**,
    38.6 km total driven.
- NASA says Curiosity reached a **1 km elevation gain** on Mount Sharp (milestone dated 26 Aug 2026,
  mission page). Not fetched in detail.
- Coverage at this site is excellent [VERIFIED]. It has a 25 cm/pixel HiRISE mosaic, a **1 m HiRISE
  DEM**, CTX and HRSC context, a 25 m HRSC DEM, THEMIS day and night IR, TES thermal inertia and
  mineralogy, the global geologic map, and Curiosity raw images with positions. See the resources
  document.

### Other candidate sites [INTERPRETATION]

- **Jezero crater (Perseverance).** It has a controlled 25 cm HiRISE mosaic, controlled CTX, a
  **1:75K USGS geologic map (SIM 3464)** and Perseverance raw images plus panoramas tied to
  waypoints. Gale has no published detailed geologic map; its 1:60K map is "In Progress".
- Trek also has Ares 3 / Ares 4 HiRISE sites (from *The Martian*), Columbia Hills (Spirit, 1 m DEM),
  Victoria crater (Opportunity, 1 m DEM), Phoenix (1 m DEM) and NASA "Exploration Zones" for human
  missions.

### Safety-related concepts

- **Terrain hazards:** slope, roughness and rocks.
  - [VERIFIED] Slope can be derived from the 1 m DEM.
  - [VERIFIED] Trek exposes slope, path, rock-detection and crater-detection service endpoints. Their
    parameters are undocumented, see the resources document.
  - [VERIFIED] Trek publishes a global MOLA roughness layer and CTX colour-slope layers for a few
    sites.
- **Surface material:** thermal inertia (TES, THEMIS night IR) separates rock and bedrock from dust
  and sand, which bears on mobility and dune hazards. *[Established planetary-science concept;
  layer availability VERIFIED.]*
- **Radiation and space weather:**
  - [VERIFIED] The DONKI API (api.nasa.gov) returns CME analyses with WSA-ENLIL predicted **impacts
    at Mars**. Example: CME 2025-10-02T23:36 had a predicted glancing-blow arrival at Mars on
    2025-10-07T08:00Z.
  - Curiosity's RAD instrument measures surface radiation. The commonly quoted surface dose of
    ~0.67 mSv/day (Hassler et al., *Science* 2014) is **[UNVERIFIED in this session]**. Check the
    paper before quoting it.
  - MAVEN ended: contact was lost 6 Dec 2025 and end of mission was declared 3 Jun 2026. There is no
    live MAVEN feed.
- **Weather:**
  - [VERIFIED] The InSight weather API still answers, but its data is frozen (latest sol 675,
    October 2020).
  - Curiosity REMS and Perseverance MEDA measure weather. Their live public feeds are unconfirmed.
- **Point-of-view imagery:** [VERIFIED] Perseverance and Curiosity raw-image JSON APIs, plus waypoint
  GeoJSON (site/drive → lat/lon), let images be placed on the map.

## 8. Implementation considerations (for later discussion — not a design) [INTERPRETATION]

- **Data stack that already works end-to-end** (verified requests, see the resources document):
  - Trek WMTS tiles for base imagery and thematic layers.
  - Trek ArcGIS ImageServer for DEM point queries and GeoTIFF export.
  - Raw-image APIs combined with waypoint GeoJSON for POV images.
  - DONKI for space-weather events.
  - The USGS PGM feature service for geologic map footprints.
- All main layers share `EPSG:104905` (lon/lat degrees on the Mars sphere). A web map client only
  needs a custom CRS and does not need reprojection.
- Route planning can run offline on an exported 1 m DEM patch: slope or cost raster, then
  least-cost path (A*/Dijkstra), then an elevation profile. This avoids the undocumented Trek
  path/slope endpoints.
- Fit with the team's Minecraft theme: "Bedrock to Redrock". Voxel or blocky rendering of a DEM
  patch, layer toggles as "lenses", and waypoints as quest markers. This is our own concept and does
  not come from NASA.
- Constraints:
  - Some Trek services are slow or undocumented.
  - CRISM mineral coverage at Gale in Trek's set is sparse (one footprint at the edge).
  - Worldview is Earth-only.
  - Under the hackathon timing rule, build work only starts on 14 November.

## 9. Repository policy notes relevant to this challenge

- The Space Apps FAQ requires each submission to *include a description of how SI tools were used*.
  The leader resolved this in [#20](https://github.com/Hadisovic/bedrock-to-redrock/issues/20):
  truthful AI-use, tool and media disclosures are required wherever the event asks for them. The
  repository rule against crediting AI as authors or team members still applies.
- [#20](https://github.com/Hadisovic/bedrock-to-redrock/issues/20) assigns implementation of the
  full app to `aliad77`. The official guide gives 14 November 2026, 09:00 Jordan time, as the start
  of project work. Repository authorization is not an organizer waiver, so the timing of early work
  must stay accurately recorded.

## 10. Unresolved questions

1. Detailed judging criteria and the Project Submission Guide. Both were due 13 November; recheck the
   Resources page and the challenge's Resources tab on the 14th.
2. Have more challenge resources been added at hackathon start?
3. Exact submission deadline and format for the Irbid Local Event (ask the Local Lead).
4. Exact AI-use disclosure text for the submission form. The policy is settled in #20; the wording
   is not yet written.
5. Site choice was settled by roadmap #9 and the #10 data package: Wildcat Ridge in the western
   Jezero delta. The Gale/Mount Sharp analysis above remains as background.
6. Parameters for Trek's `slope`, `path`, `rock/detect` and `light` services. The slope endpoint
   returned HTTP 400 with no parameters, and no public documentation was found.
7. Curiosity RAD dose values and the archive URL (PDS PPI node responded, contents not inspected).
8. Live access to REMS and MEDA weather data.
9. Exact boxwork extent coordinates. No NASA page gives them; the positions above are inferred from
   rover waypoints.
10. Licensing: NASA data is generally public domain, but image credits (for example
    NASA/JPL-Caltech/University of Arizona for HiRISE) should be shown. Per-product terms weren't
    reviewed individually.
