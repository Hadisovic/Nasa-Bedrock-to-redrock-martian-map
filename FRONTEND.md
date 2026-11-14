# Martian Globe Frontend — Google Earth Experience

An interactive 3D Mars visualization built for the **NASA Space Apps Challenge 2026** (*Interplanetary Survival Guide: Martian Map*).

## Quick Start

### Option A: From Repository Root
```bash
npm run dev:website
```

### Option B: From the `website` Folder
```bash
cd website
npm install
npm run dev
```

The web application runs at `http://localhost:3000/`.

To create a production build:
```bash
cd website
npm run build
```

---

## Key Features

### 1. 4K Ultra-HD Cinematic Homescreen
- High-fidelity 4K artwork (`martian-map-home.jpg`, 4096×3072) depicting a Martian landscape with an astronaut, rover lander, and holographic tactical map.
- Calibrated responsive full-bleed display (`object-fit: cover; object-position: center 36%`) eliminating blurry letterbox/pillarbox bars across all device aspect ratios.
- Smooth cinematic fade-to-black orbital transition upon pressing Enter or clicking anywhere.

### 2. Google Earth Inspired 3D Mars Globe
- Built on Three.js with realistic inertial OrbitControls (damping, glide physics, altitude-scaled zoom speed).
- Horizon cushion and calibrated near-plane clipping (`camera.near = 0.005`) preventing visual artifacts during close-up surface exploration.
- 3D horizon tilt mode for oblique panoramic terrain viewing across volcano calderas and canyon walls.
- Dynamic rotating compass with real-time North orientation needle.
- Live coordinates (degrees and minutes latitude/longitude) and camera altitude telemetry.

### 3. Atmospheric Scattering Shaders
- Multi-layer custom GLSL shaders:
  - **Outer Rayleigh Scattering Halo**: Renders a delicate atmospheric limb with exponential grazing falloff.
  - **Martian Color Grading**: Authentic dusty amber-peach / butterscotch daytime sky transitioning into twilight violet.
  - **Starlight Night Rim**: Luminous starlight contour defining the dark silhouette against deep space.
  - **Inner Atmospheric Haze**: Provides horizon depth when tilting towards the surface.

### 4. Day & Night vs. All-Lighted Planetary Illumination Toggle
- **Day & Night Mode**:
  - Realistic directional sunlight with natural terminator line.
  - Celestial starlight fill light (`0x5a75a5`) opposite the Sun + boosted ambient starlight (`MeshStandardMaterial` ground luminance ~25%) ensuring craters and terrain on the dark side are visible and legible.
- **All-Lighted Mode (Global Illumination / Atlas Mode)**:
  - Full 360° shadowless planetary illumination across all longitudes and latitudes.
  - Camera-aligned solar headlight and multi-angle ambient daylight rig.
  - Atmospheric halo expands into a seamless, glowing 360° ring encircling the globe.
- **Controls**:
  - Top exploration bar pill (`#ge-lighting-pill`).
  - Right floating navigation controls button (`#ge-lighting-toggle`).
  - Bottom telemetry button (`#ge-lighting-status`).
  - Keyboard shortcut: Press `L`.

### 5. Official NASA Space Apps Challenge 2026 Datasets
Integrated from official NASA JPL Mars Trek resources with dynamic live switching and attribution:
1. **NASA Viking MDIM 2.1**: True color natural surface albedo mosaic (232 m/px).
2. **NASA MGS MOLA Topography**: Global elevation color hillshade (463 m/px).
3. **NASA Mars Odyssey THEMIS Infrared**: Controlled day IR thermal mosaic (100 m/px).

### 6. Interactive Fly-To Landmarks
Quick fly-to camera trajectories with parabolic altitude arcs for key Martian landmarks:
- **Olympus Mons**: Solar System's tallest peak (22 km)
- **Valles Marineris**: Grand Canyon of Mars (4,000 km)
- **Jezero Crater**: Perseverance rover landing site and river delta
- **Gale Crater**: Curiosity rover landing site and Mount Sharp
- **Planum Boreum**: North polar water-ice cap
