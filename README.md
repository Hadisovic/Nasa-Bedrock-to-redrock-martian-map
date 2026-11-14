<div align="center">

<h1>Bedrock to Redrock</h1>
<p><strong>From building worlds to exploring new ones.</strong></p>
<p>A Minecraft-inspired approach to exploring Mars.</p>

<a href="https://www.spaceappschallenge.org/2026/find-a-team/bedrock-to-redrock/">NASA Space Apps 2026 · Team page</a>

</div>

---

## The idea

**Bedrock to Redrock** draws on Minecraft's sense of discovery and survival to make navigation on Mars interactive, accessible, and engaging.

Our aim is to bring Mars science data into a clear, layered map that helps human explorers understand their surroundings and plan a Marswalk.

## The challenge

Created for **NASA Space Apps Challenge 2026** at the **Irbid, Jordan** local event, the project addresses **Interplanetary Survival Guide: Martian Map**.

Future astronauts will need more than a route from one point to another. They will need terrain information, conditions along the way, and scientific context to explore safely and make the most of each mission.

The project is working toward:

- **A layered Mars map** combining information from multiple NASA science missions.
- **Route planning** that helps explorers assess their path and destination.
- **An accessible exploration experience** inspired by Minecraft's spirit of discovery.

## The app

Explore the whole of Mars, then plan a Marswalk at **Wildcat Ridge**, a 384 m × 384 m area of the western Jezero delta:

- A whole-planet explorer: a flat map that wraps at the seam and a 3D globe, both on the MOLA colour basemap with NASA Trek layers.
- 149 located NASA historical events and discoveries (landings, rover stops, samples, Ingenuity flights, hardware), each with **Read about** and **Go to location**.

- A 2D map and a true-scale 3D terrain, both built from the same MRO HiRISE image and 1 m stereo elevation.
- Perseverance's real positions, its PIXL sulfate discovery at Berry Hollow, and raw images from that stop.
- Terrain-aware outbound and return routes from a hypothetical habitat.
- A GO/NO-GO return decision based on the crew assumptions you set.

```sh
npm ci
npm run dev        # http://localhost:5173 (intro), #/explore, #/map, #/bench
npm test
```

See [running, testing and deploying](docs/release/RUNNING.md) and the [app architecture](docs/architecture/marswalk-app.md).
Research on the challenge and its resources is in [docs/research](docs/research/).

## Project workflow

This repository uses a human-triggered, interactive GitHub workflow. Implementation is tracked in
[#20](https://github.com/Hadisovic/bedrock-to-redrock/issues/20). See the
[coordination guide](docs/coordination.md) and [task tracker](TASKS.md). Start a fresh worker chat
with the [Codex prompt](docs/coordination/CODEX_START_PROMPT.md). On a model limit, use the
[reporting-only Gemini prompt](docs/coordination/GEMINI_TOKEN_LIMIT_REPORT.md).

Follow the project on our [official team page](https://www.spaceappschallenge.org/2026/find-a-team/bedrock-to-redrock/).
