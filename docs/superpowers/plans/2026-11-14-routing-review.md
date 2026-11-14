# Routing review implementation plan

Goal: complete the five routing features in the supplied leader brief, without merging.

Architecture: preserve the three solver objectives and their valid polylines. Build one shared collection of distinct map legs, with selected-route styling consumed by both renderers. Keep Directions, navigation and saved inputs on the same effective selection.

Tech stack: existing React, TypeScript, Three.js, Canvas2D and Node test runner; no production dependency additions.

1. Add failing regressions in `tests/app/itinerary.test.ts` and route assessment tests: shortest always present, only distinct choices, every actual path rendered, selection changes assessment/return/navigation inputs, exact thresholds, longitude seam and saved restoration.
2. Correct `itinerary.ts`, `Explorer.tsx`, `Directions.tsx`, `GlobeMap2D.tsx` and `Globe3D.tsx`. Preserve original solver vertices; distinguish selected routes by width/opacity and return legs by dashes while retaining objective color. Run focused tests.
3. Test the real Wildcat Habitat A/Sol 502 and Gale rasters, deterministic difficult/flat/blocked grids, source/cache/fallback handling and geometry-derived metrics. Correct only demonstrated defects. Record actual values and limitations.
4. Run `npm test`, `npm run build`; exercise the production app at desktop and 390 × 844 in 2D/3D, capture screenshots, switch/save/restore routes and enter/exit third-person Recorded Walk. Review scope, refresh remote heads, commit/push and prepare a focused PR for human review.

Constraints: no synthetic curves, duplicate alternatives, unmeasured hazard values, unrelated features, force push or merge. Genuine finer-grid no-route must never trigger coarse fallback. Regional estimates receive no walking ETA. Preserve other contributors' work and existing saved plans.

Review focus: partial/pending legs; recommendations coincident with shortest; alternatives distinct only on return; shared portions and overlapping return lines; restored legacy choices; unknown cells/corners; source failures versus genuine no-route; 3D surface clearance and dateline continuity.
