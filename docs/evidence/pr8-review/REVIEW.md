# PR #8 final UI review

Reviewed requested branch `masa-noor-combined` at `d08af60f53ee63dc3aa10bda7770b1b333866985`, against main `8614e191440d792287bc70ea7793fd87c76ec940`. PR #7's head `0c197bc` is already an ancestor of this branch; it does not need a separate integration.

## Findings and corrections

1. **Missing next-step card on regional recorded previews.** Reproduced a valid 104.8 km MOLA route whose navigation card only said “Navigation.” Detailed routes already showed their next maneuver, and GPS routes showed guidance after a reliable fix. The corrected hook also supplies regional compass guidance during recorded preview and retains it while paused. The card explicitly labels regional guidance as approximate; it does not invent walking-scale turns from coarse data.
2. **GPS acquisition status hidden behind Show.** The main card now says Waiting for GPS and displays acquisition/accuracy/lost-fix messages without requiring the user to expand details. No stale fix is presented as live navigation.
3. **Landscape drone Exit covered by flight controls.** Reproduced at 844×390 with a fine pointer: the movement pad intercepted clicks on Exit. The compact landscape control layout now applies by viewport height for both pointer types. Both sites' overhead and exit controls were exercised again after the correction.

Noor's landing page, badge, atlas styling, discovery cards, telemetry and layout are retained. The 1 m Earth → 1 km Mars option, PR #5 GPS/drone improvements and PR #6 automatic navigation/fast-forward are preserved.

## Verification

- Baseline requested head: `npm test` **78 passed**, `npm run build` **passed**.
- Corrected candidate: `npm test` **78 passed**, `npm run build` **passed**. The existing large Three.js chunk advisory remains.
- Regression: the visible regional action previously returned Toward Lander; it now states Head west for the tested westbound leg, while remaining a regional stop/heading instruction rather than a fabricated precise turn. The assertion was observed failing before the correction and passing afterward.
- Production Chromium, desktop and phone-size viewports: detailed next maneuver present; regional next-step card visible and retained on pause; no horizontal overflow in the recorded mobile check.
- Both drone sites loaded actual terrain: Wildcat Ridge (1 m) and Gale / Mount Sharp (20 m). Overhead view and Exit worked. The final short-landscape regression used ordinary pointer clicks, so a covered control could not silently pass.
- Injected GPS at 1000×: first reliable fix anchored Earth base; a confirmed 6.7 m eastward Earth movement placed the simulated traveler about 6.7 km east on Mars, with eastward travel heading and regional rejoin guidance.
- Injected detailed 1× GPS: confirmed 26.7 m eastward deviation triggered a solver replan from the actual simulated position, yielding a 231 m remaining route, refreshed direction and voice/notification requests.
- Local speech and notification APIs were test doubles that captured application requests. They confirm the app requested initial and reroute guidance; they do not prove audio playback or notification delivery on physical phones. Real phone sensor accuracy, iOS/PWA restrictions, minimized/background execution and permission prompts remain device-test items.

Regional 1000× mode provides approximate compass/rejoin guidance, with scaled uncertainty and approximate waypoint crossings. Walking-scale automatic detours still require detailed terrain; use 1× in Wildcat for that real-phone rerouting check.

## Evidence and handoff

- [Regional next step on mobile](mobile-regional-next-step.png)
- [Wildcat drone](wildcat-drone.png)
- [Gale drone, corrected landscape controls](gale-drone-landscape-fixed.png)
- [Injected regional GPS](regional-gps-injected.png), [captured requests](regional-gps-injected.json)
- [Injected detailed GPS reroute](detailed-gps-reroute.png), [captured requests](gps-reroute-injected.json)
- [Test output](tests.log), [build output](build.log)

Local production preview: http://127.0.0.1:4194/ . The revised PR candidate is ready for Hadi's explicit approval and merge. After approval, use the existing main Cloudflare workflow, verify the deployed main SHA and production URL, then run the real-phone checklist above. No new deployment configuration or dependencies were introduced.
