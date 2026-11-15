# Running, testing and deploying

Requires Node.js 22.18+ or 24+, plus npm. The map and routing data are bundled. Web Push
on the hosted app uses the optional relay described below.

## Local development

```sh
npm ci
npm run dev        # http://localhost:5173
npm test           # contract, routing, mission and data tests (Node test runner)
npm run typecheck
```

## Production build and offline fallback

```sh
npm run build      # type-checks, then writes dist/
npm run preview    # serves dist/ locally
```

`dist/` is fully static and uses relative asset paths. It works at a site root or in a
subdirectory. For the venue fallback without internet, copy `dist/` to the demo laptop and serve it
with any local HTTP server, for example:

```sh
python3 -m http.server 8000 --directory dist --bind 127.0.0.1
# open http://127.0.0.1:8000/
```

Opening `index.html` directly from disk (`file://`) is not supported, because the browser blocks
the raster fetches.

The intro uses the orange Bedrock to Redrock badge in `public/images/martian-map-home-badge.png`.
The header, white discovery flags, app icon and GPS notices use the blue badge in
`public/images/martian-map-logo.png`. The offline pack includes both badges and the intro artwork.
Mission imagery and data retain their original attribution.

The desktop background in `public/images/martian-map-hero.png` was prepared with the built-in image editor.
The edit prompt asked to remove only the round NASA insignia and red swoosh above the title and fill the
spot with matching dark star field. It asked to preserve the original text, star field, scene,
perspective, colors and 4:3 composition. The independent badge overlay uses the original supplied raster.

## Local testing milestone (current phase)

Run these commands from the branch under test for local QA:

```sh
npm ci && npm test && npm run build
npm run preview -- --host 127.0.0.1 --port 4173   # production build at http://127.0.0.1:4173/
```

To test GPS on Android, connect it by USB and use [Chrome DevTools port forwarding](https://developer.chrome.com/docs/devtools/remote-debugging/local-server/)
from device port `4173` to `localhost:4173` on the computer. Open `http://localhost:4173/` in Chrome on the Android device.
Under **Directions → Route options → Offline maps**, download **Planet map and app** and the
terrain pack for your route. Verify the route opens on the phone before disconnecting the cable.
For a walk away from the computer, open the same build from a trusted HTTPS host reachable by the phone.
A hosted preview uses `npm run build` and the `dist/` output directory. Open the HTTPS link directly
in Safari or Chrome, choose **Directions → Start route → Earth GPS Demo**, and allow precise location.
A regular Wi-Fi HTTP preview is suitable for checking the layout. The URL paths are:
- `#/` for the intro;
- `#/explore` for the whole planet (add `?site=<id>&mode=3d&layers=a,b` for a shared link);
- `#/map?tab=mission` for the Marswalk planner;
- `#/bench` for the routing benchmark.

Finer basemap tiles in the 2D explorer stream from NASA Trek (`trek.nasa.gov`, which allows any
origin) when you zoom past the bundled 4096 px basemap. Offline, the bundled basemap, catalog,
layers and Wildcat Ridge data all still work.

**Drone → Try drone simulation (2)** opens either local terrain pack. Turn on **Geology** for
mapped units or choose **Terrain & route** to place a lander and stops within the pack. **Preview
walk** follows the calculated route while the camera stays under your control. The guide links the
[NASA MMGIS Curiosity traverse](https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json)
and the 2019 proposed flyover as references. Download the terrain pack for offline flight.

The map colors come from [Meyer et al., supplemental orbital mapping](https://doi.org/10.1130/GSAB.S.25938268)
(CC BY 4.0) and [Sun and Stack, USGS SIM 3464](https://doi.org/10.3133/sim3464).
The app clips and recolors these features to the terrain pack bounds. The [NASA 2019 animation](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/)
shows a wider area and uses a different set of annotations. The exported Jezero polygon layer is
USGS ArcGIS item `b602bd9a573d447eb07388e5fb9ca884`, layer 8, queried in its native coordinates
with envelope `-6400,1092000,-3900,1097000`. Use the Gale supplement ZIP and the Jezero JSON with
`python scripts/data/layers/drone_geology.py GALE_ZIP JEZERO_QUERY_JSON` to regenerate overlays.

Earth GPS Demo uses a phone or tablet’s fixes to simulate astronaut or rover movement from the selected
lander. Choose 1×, 10×, or 100× distance scaling in the setup. The larger scales amplify location
uncertainty, so use 1× for precise local detours.
On coarse MOLA it gives the regional route, estimated position, and GPS status. Detailed turns,
terrain alerts, and off-route detours are limited to a route within the local terrain packs.
Routine GPS voice prompts are bundled in the core offline pack. Nearby site cues are derived from
observed catalog locations near the active leg. The phone's offline English voice reads the name,
distance, and compass direction when available. The same message appears in the navigation panel.
The app keeps Earth coordinates in the phone tab's memory and shares only the planned Mars coordinates.
For a short indoor test, use **Recorded preview** to verify the camera, route, and voice. Earth GPS
Demo waits for a reliable fix and is best tested outdoors in an open area.

The [Perseverance model](https://science.nasa.gov/resource/mars-perseverance-rover-3d-model/) is
credited to NASA/JPL-Caltech. The app loads it when rover playback starts and includes it in the
offline app download. Rover estimates use user-entered speeds and limits and the selected route's
measured slope. A suggestion requires a complete detailed round trip, a walking time over budget,
and a rover time within budget and reserve. The visual model represents Perseverance.

## Data reproduction

```sh
python scripts/data/jezero.py crop --output <tmp>   # regenerate the HiRISE crops (needs rasterio)
python scripts/data/jezero.py verify
npm run data:waypoints                              # refresh in-crop rover waypoints from NASA
```

## Earth GPS notifications

In GPS options, leave **Device notifications** checked and allow the browser prompt when starting the demo. Switching away during an active Earth GPS route can display the last confirmed instruction, or a prompt to reopen the map if no fix was available. Location and spoken guidance resume in the open map when the device has a fresh fix. On iPhone and iPad use the Home Screen app.

The production Cloudflare Pages project can relay Web Push through `/api/route-push`. Generate a stable VAPID key pair with `npx web-push generate-vapid-keys`, then configure `ROUTE_PUSH_PUBLIC_KEY`, `ROUTE_PUSH_PRIVATE_KEY` (secret), and `ROUTE_PUSH_SUBJECT` (an HTTPS contact URL or contact mailto URI) in Pages before deploying. Keep the private key out of source control and the frontend build. The relay gets the browser subscription and the instruction text, with a 20-second lifetime. Earth GPS coordinates stay on the device. Without the relay the app uses local service-worker notifications on supported browsers.

To verify the deployed relay, use Chrome on Android or add the site to the Home Screen on iPhone. Start Earth GPS, wait for the next instruction, switch to another app, tap the notification, then confirm fresh GPS guidance resumes. Repeat with notifications denied, a paused route, and a recorded preview.
