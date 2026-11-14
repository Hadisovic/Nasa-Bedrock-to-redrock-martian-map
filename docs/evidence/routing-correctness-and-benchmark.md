# Routing correctness and benchmark

## Correctness checks (`npm test`)

| Check | File | What it verifies |
|---|---|---|
| A* vs Dijkstra reference | `tests/app/dijkstra.test.ts` | 60 random 9 × 9 grids (about 12% unknown cells, random heights) × 4 limit/penalty settings. The reference is an independent O(n²) Dijkstra written from the documented move rules: 8 neighbours, no corner cutting across unknown cells, slope limit, run × (1 + w·f·(|slope|/limit)²) with the downhill factor 0.5. For every case the A* path cost equals the reference optimum within 1e-9 for shortest and slope-weighted searches, outbound and return (direction-dependent). When A* reports no route, the reference also finds the goal unreachable. |
| Direction-dependent cost | same | An uphill step costs more than the same downhill step. |
| Hand-calculated fixture | same | A flat 3-cell row: distance = 2 × cos(latitude) m each way. Elapsed = out/speed + back/speed + stop; margin = budget − elapsed − reserve, unrounded. |
| Real Wildcat Ridge route | same | Leg distance equals the sum of its segment lengths. Every geometry vertex lies on known terrain. Changing speed changes time and margin but not distance. A no-route result has no computed metrics. |
| Earlier routing tests | `tests/app/routing.test.ts`, `tests/app/mission.test.ts` | Unknown cells, blocked endpoints, cliff bands, distinct alternatives, determinism, zero-length legs, the three demo scenarios. |

Two notes on the rules being checked:
- **Ground runs** use the grid's central latitude, which is the documented rule. Across the 384 m grid, the per-row variation is below 1e-7 m per step.
- **Displayed distances** are horizontal ground distance on the Mars 2000 sphere (east–west factor cos φ). They are not elevation-adjusted surface distance.

## Browser benchmark (`#/bench`)

Run on 2026-11-13 on the local Vite dev server, which serves unminified modules. Machine: desktop Chrome 157 on macOS (Apple Silicon, 10 logical cores). Each round trip is four searches: shortest out and back, and slope-weighted out and back. Results are from nine runs.

| Case (real 384 × 384 grid, penalty 4) | Result | Median ms | Max ms |
|---|---|---|---|
| Representative: habitat A → Wildcat Ridge, 15° | available | 29.4 | 55.8 |
| Long: habitat B (west edge) → Wildcat Ridge, 15° | available | 18.5 | 18.7 |
| Long: habitat C (north) → Wildcat Ridge, 15° | available | 79.4 | 80.4 |
| Corner to corner, 25° | available | 74.3 | 75.1 |
| No route: habitat C, 4° | no-route | 2.2 | 2.5 |

Rapid endpoint changes were tested with 12 requests 40 ms apart. The measure is the longest gap between animation frames, which is a proxy for UI stalls:

| Where the search runs | Longest frame gap | Total |
|---|---|---|
| Main thread | 100 ms | 1197 ms |
| Web worker (`src/analysis/route.worker.ts`) | 17 ms | 1101 ms |

**Decision.** Keep A*: it matches the Dijkstra optimum, and the slowest real search takes 80 ms. Move the search into a Web Worker. Measured on this machine, the worker removed the main-thread stalls of up to about 100 ms during rapid edits, and it returns the same results because it calls the same `planRoundTrip`. If a worker cannot start, the planner falls back to the main thread. Stale responses are dropped, so a superseded request never replaces a newer result. Inputs are debounced by 150 ms.

Node 24 gives similar figures (`planRoundTrip` medians of 30, 19, 81 and 2 ms for the same cases). Real phones and tablets have not been measured yet; that is part of the worker QA handoff.
