# Running, testing and deploying

Requires Node.js 22.18+ or 24+, plus npm. All data is bundled, so no API keys or network services
are needed at runtime.

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

## Local testing milestone (current phase)

The prompt extensions replace deployment for this phase. The team runs, tests and tunes the pushed
branch locally, then handles hosting. For local QA:

```sh
git fetch origin && git checkout implementation/full-app
npm ci && npm test && npm run build
npm run preview -- --host 127.0.0.1 --port 4173   # production build at http://127.0.0.1:4173/
```

To test on a phone or tablet on the same Wi-Fi network, start the server with `--host 0.0.0.0`
and open `http://<laptop-ip>:4173/`. The URL paths are:
- `#/` for the intro;
- `#/explore` for the whole planet (add `?site=<id>&mode=3d&layers=a,b` for a shared link);
- `#/map?tab=mission` for the Marswalk planner;
- `#/bench` for the routing benchmark.

Finer basemap tiles in the 2D explorer stream from NASA Trek (`trek.nasa.gov`, which allows any
origin) when you zoom past the bundled 4096 px basemap. Offline, the bundled basemap, catalog,
layers and Wildcat Ridge data all still work.

## Data reproduction

```sh
python scripts/data/jezero.py crop --output <tmp>   # regenerate the HiRISE crops (needs rasterio)
python scripts/data/jezero.py verify
npm run data:waypoints                              # refresh in-crop rover waypoints from NASA
```
