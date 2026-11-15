import { advanceTravel, buildTravelTrack, cyclePlaybackRate, elapsedTravelSeconds, terrainAhead } from "./travelModel.ts";
import type { PlaybackRate } from "./travelModel.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import { bearingDeg, greatCircleKm } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import { buildItineraryTrack, deviationTracker, earthGpsDevice, gpsMovement, locateOnWalk, marsFromEarth, nearbyLandmark, nextManeuver, rejoinDirection, routeCue, sampleWalk, shorterFromSamePosition, stepDetector, trackFor, usableFix, walkDirection } from "./earthWalk.ts";
import type { EarthFix, WalkMode, WalkPose, WalkTrack } from "./earthWalk.ts";
import { cueText, missionAudio } from "./walkAudio.ts";
import type { WalkCue } from "./walkAudio.ts";
import { insideMarswalkCoverage } from "./catalog.ts";
import type { CatalogEvent, EnvironmentObservation, LayerEntry } from "./catalog.ts";
import { itineraryLegs, selectedLeg } from "./itinerary.ts";
import type { Leg, NavigationProgress, PlannedLeg } from "./itinerary.ts";
import type { Endpoint, RouteChoice, Stop } from "./missionPlan.ts";
import { useItinerary } from "./useItinerary.ts";
import { nearGale } from "./galeLayout.ts";
import { clearRouteNotice, prepareRouteNotices, routeNotice } from "./deviceNotifications.ts";

type PermissionConstructor = { requestPermission?: () => Promise<"granted" | "denied"> };
type Session = { mode: WalkMode; motion: boolean; tilt: boolean; stride: number; scale: number; notifications: boolean };
type Replan = { from: LatLon; next: number; rejoin: { point: LatLon; remaining: number } | null; obstacle?: boolean; choiceChange?: boolean; resume?: boolean };
const emptyLegs: PlannedLeg[] = [];
const meters = (a: LatLon, b: LatLon) => greatCircleKm(a, b) * 1000;
const detailedAt = (point: LatLon) => insideMarswalkCoverage(point) || nearGale(point);
async function permitted(sensor: PermissionConstructor | undefined) {
  if (!sensor) return false;
  try { return !sensor.requestPermission || await sensor.requestPermission() === "granted"; }
  catch { return false; }
}
const magnitude = (a: DeviceMotionEventAcceleration | null) =>
  a && a.x !== null && a.y !== null && a.z !== null && [a.x, a.y, a.z].every(Number.isFinite) ? Math.hypot(a.x, a.y, a.z) : null;

export function useEarthWalk(lander: Endpoint | null, stops: Stop[], returning: boolean,
  legs: PlannedLeg[], grid: LayerEntry | undefined, slope: number, blocked: LatLon | null,
  weighted: RouteChoice | boolean, routeSpeed: number, observations: EnvironmentObservation[], events: readonly CatalogEvent[],
  rover: boolean, roverSuggestion: string | null) {
  const { track, stopDistances } = useMemo(() => trackFor(legs, weighted), [legs, weighted]);
  const travel = useMemo(() => buildTravelTrack(legs.flatMap(({ result }) => selectedLeg(result, weighted) ?? []), routeSpeed, slope), [legs, weighted, routeSpeed, slope]);
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);
  const rate = useRef<PlaybackRate>(1);
  const [plannedProgress, setPlannedProgress] = useState<NavigationProgress | null>(null);
  const eligible = !!lander && !!stops.length && track.length > 1 && legs.every(({ result }) => result?.status === "ok");
  const liveEligible = eligible && meters(lander, track[0].point) < 0.05;
  const detailed = eligible
    && legs.every(({ result }) => result?.status === "ok" && !result.terrain.regional)
    && track.every(({ point }) => detailedAt(point));
  const gpsAvailable = earthGpsDevice(navigator.userAgent, navigator.maxTouchPoints, matchMedia("(pointer: coarse)").matches);
  const [session, setSession] = useState<Session | null>(null);
  const [paused, setPaused] = useState(false);
  const [obstacleHold, setObstacleHold] = useState(false);
  const lastObstacle = useRef(blocked);
  const [muted, setMuted] = useState(false);
  const mute = useRef(false);
  const [offRoute, setOffRoute] = useState(false);
  const [rejoin, setRejoin] = useState<ReturnType<typeof rejoinDirection> | null>(null);
  const [hasFix, setHasFix] = useState(false);
  const [tiltGranted, setTiltGranted] = useState(false);
  const [message, setMessage] = useState("");
  const [pose, setPose] = useState<WalkPose | null>(null);
  const [cue, setCue] = useState<WalkCue | null>(null);
  const [request, setRequest] = useState<Replan | null>(null);
  const [planned, setPlanned] = useState<PlannedLeg[] | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [nextStop, setNextStop] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const lastCue = useRef<{ cue: WalkCue; at: number } | null>(null);
  const cueHistory = useRef(new Map<string, number>());
  const landmarksHeard = useRef(new Set<string>());
  const failedDetour = useRef<LatLon | null>(null);
  const audio = useRef<ReturnType<typeof missionAudio> | null>(null);
  const attempt = useRef(0);
  const gps = useRef<{ anchor: EarthFix; moved: ReturnType<typeof gpsMovement> } | null>(null);
  const lastGpsFix = useRef(-Infinity);
  const state = useRef({ track, travel, metres: 0, next: 0, startedAt: 0, missionSeconds: 0, point: null as LatLon | null,
    heading: 0, tilt: 0, neutral: null as number | null,
    pending: false, retryAt: 0, arrived: false, stopDistances: [] as number[] });
  const requestedLegs = useMemo<Leg[]>(() => request && lander
    ? itineraryLegs(lander, stops.slice(request.next), returning, request.from).concat(
      request.next === stops.length && returning ? [{ from: request.from, to: lander, returning: true, fromStop: null, toStop: null }] : []).map((leg) => ({ ...leg,
        fromStop: leg.fromStop === null ? null : leg.fromStop + request.next,
        toStop: leg.toStop === null ? null : leg.toStop + request.next }))
    : emptyLegs, [request, lander, stops, returning]);
  const solverLegs = useMemo(() => request?.rejoin
    ? [...requestedLegs, { from: request.from, to: request.rejoin.point, returning: false, fromStop: null, toStop: null }]
    : requestedLegs, [request, requestedLegs]);
  const solverResults = useItinerary(solverLegs, grid, slope, blocked, 0);
  const planKey = JSON.stringify([lander, stops.map(({ point }) => point), returning, slope, rover]);

  function announce(id: WalkCue, critical = false, key = typeof id === "string" ? id : id.text) {
    const now = Date.now();
    if (!critical && (now - (lastCue.current?.at ?? 0) < 4000 || now - (cueHistory.current.get(key) ?? 0) < 15_000)) return false;
    lastCue.current = { cue: id, at: now };
    cueHistory.current.set(key, now);
    setCue(id);
    if (!mute.current) audio.current?.speak(id);
    if (session?.notifications) routeNotice(cueText(id), document.hidden && !mute.current);
    return true;
  }

  function update(moving: boolean) {
    const { point, heading, tilt } = state.current;
    if (point) setPose({ point, heading, moving, tilt, animationRate: session?.mode === "Recorded Walk" ? rate.current : 1 });
  }

  function stop() {
    attempt.current++;
    if (session?.notifications) clearRouteNotice();
    audio.current?.dispose();
    audio.current = null;
    gps.current = null;
    lastGpsFix.current = -Infinity;
    setSession(null);
    setStarting(false);
    setPaused(false);
    setObstacleHold(false);
    setOffRoute(false);
    setRejoin(null);
    setHasFix(false);
    setTiltGranted(false);
    setPose(null);
    setCue(null);
    setRequest(null);
    setPlanned(null);
    setPlannedProgress(null);
    setRemaining(null);
    setAccuracy(null);
    setNextStop(null);
    setMessage("");
  }

  useEffect(() => { stop(); }, [planKey]);
  useEffect(() => {
    const s = state.current;
    if (!session || !s.point || s.arrived) return;
    s.pending = true;
    setPaused(true);
    update(false);
    setMessage("Route choice changed. Recalculating from your position…");
    setRequest({ from: s.point, next: s.next, rejoin: null, choiceChange: true,
      resume: request?.choiceChange ? request.resume : !paused });
  }, [weighted]);
  useEffect(() => () => { attempt.current++; audio.current?.dispose(); }, []);

  useEffect(() => {
    if (lastObstacle.current === blocked) return;
    lastObstacle.current = blocked;
    const crew = state.current;
    if (!session || !crew.point || crew.arrived) return;
    crew.pending = true;
    setObstacleHold(true);
    setPaused(true);
    update(false);
    setMessage(blocked ? "Reported obstacle. Recalculating…" : "Obstacle cleared. Recalculating…");
    announce("recalculating", true);
    setRequest({ from: crew.point, next: crew.next, rejoin: null, obstacle: true, resume: !paused || obstacleHold });
  }, [blocked]);

  async function start(mode: WalkMode, stride: number, tiltEnabled: boolean, scale = 1, notifications = false) {
    if (!eligible || !lander || starting || (mode === "Outdoor" && (!liveEligible || !gpsAvailable)) || ![1, 10, 100].includes(scale)) return false;
    if (mode !== "Recorded Walk" && !isSecureContext) {
      setMessage("Live sensors require HTTPS. Choose Recorded preview in this browser.");
      return false;
    }
    if (mode === "Outdoor" && !navigator.geolocation) {
      setMessage("Location is unavailable. Choose a visual preview.");
      return false;
    }
    const id = ++attempt.current;
    gps.current = null;
    setStarting(true);
    setMessage("");
    if (mode === "Outdoor" && notifications) prepareRouteNotices();
    audio.current?.dispose();
    try { audio.current = missionAudio(); } catch { audio.current = null; }
    // Start the GPS watch without waiting for the optional orientation permission.
    if (tiltEnabled && isSecureContext) {
      void permitted(window.DeviceOrientationEvent as PermissionConstructor | undefined).then((granted) => {
        if (id === attempt.current) setTiltGranted(granted);
      });
    }
    const motionGranted = mode === "Indoor Steps" && await permitted(window.DeviceMotionEvent as PermissionConstructor | undefined);
    if (id !== attempt.current) return false;
    setStarting(false);
    if (mode === "Indoor Steps" && !motionGranted) {
      audio.current?.dispose(); audio.current = null;
      setMessage("Motion access is unavailable. Enable it in browser settings or try Recorded Walk.");
      return false;
    }
    state.current = { track, travel, metres: 0, next: 0, startedAt: Date.now(), missionSeconds: 0, point: track[0].point, heading: sampleWalk(track, 0).heading,
      tilt: 0, neutral: null, pending: false, retryAt: 0, arrived: false,
      stopDistances };
    lastCue.current = null;
    cueHistory.current.clear();
    landmarksHeard.current.clear();
    failedDetour.current = null;
    rate.current = 1; setPlaybackRate(1);
    setRemaining(track.at(-1)!.metres);
    setNextStop(stops[0].point.name ?? "Stop 1");
    setSession({ mode, motion: motionGranted, tilt: tiltEnabled, stride, scale, notifications: mode === "Outdoor" && notifications });
    update(false);
    return true;
  }

  useEffect(() => {
    if (!session || !request || !requestedLegs.length || solverResults.some(({ result }) => !result)) return;
    const results = solverResults.slice(0, requestedLegs.length);
    const s = state.current;
    s.pending = false;
    s.retryAt = Date.now() + 8000;
    setRequest(null);
    if (s.arrived || s.next !== request.next) return;
    setPlannedProgress({ nextStop: request.next, at: Date.now() });
    const failure = results.find(({ result }) => result?.status !== "ok" || result.terrain.regional && detailed)?.result;
    if (failure) {
      const leg = results.find(({ result }) => result === failure);
      const target = leg?.returning ? "Lander" : leg?.to.name ?? `Stop ${request.next + (leg?.toStop ?? 0) + 1}`;
      setMessage(`Leg to ${target}: ${failure.status === "ok" ? "Detailed terrain unavailable." : failure.detail}`);
      setRemaining(null);
      if (request.obstacle || request.choiceChange) { setPlanned(results); setObstacleHold(true); }
      failedDetour.current = request.from;
      if (!request.obstacle && s.point && session.mode === "Outdoor") {
        const guidance = rejoinDirection(s.point, locateOnWalk(s.track, s.point, Math.max(0, s.metres - 6), s.stopDistances[s.next] ?? Infinity));
        setRejoin(guidance);
        announce({ text: `No verified detour. ${guidance.text}`, bearing: guidance.bearing }, true, "rejoin");
      } else if (failure.status === "no-route") announce("unavailable", true);
      else if (failure.status === "ok") announce("terrain", true);
      else announce({ text: failure.detail }, true);
      return;
    }
    const { track: nextTrack, stopDistances: remainingStops } = trackFor(results, weighted);
    if (nextTrack.length < 2) {
      failedDetour.current = request.from;
      setRemaining(null);
      setMessage("The planner returned no walkable distance from your current position.");
      announce("unavailable", true);
      return;
    }
    if (s.point && meters(request.from, s.point) > 8 && locateOnWalk(nextTrack, s.point).distance > 8) {
      setMessage("Position changed while planning. Checking for another route.");
      s.retryAt = Date.now();
      return;
    }
    s.track = nextTrack;
    s.travel = buildTravelTrack(results.flatMap(({ result }) => selectedLeg(result, weighted) ?? []), routeSpeed, slope);
    setOffRoute(false);
    setRejoin(null);
    failedDetour.current = null;
    s.metres = locateOnWalk(nextTrack, s.point ?? request.from, 0, remainingStops[s.next] ?? Infinity).metres;
    s.stopDistances = [...s.stopDistances.slice(0, s.next), ...remainingStops.slice(s.next)];
    setPlanned(results);
    if (request.obstacle || request.choiceChange) {
      setObstacleHold(false);
      if (request.resume) setPaused(false);
    }
    setRemaining(Math.max(0, nextTrack.at(-1)!.metres - s.metres));
    // Compare against a solver-verified connection to a vertex on the previous route.
    // Both alternatives start at this fix and visit the same remaining stops.
    const connector = request.rejoin && solverResults.at(-1)?.result;
    const connectorPath = connector?.status === "ok" && !connector.terrain.regional ? selectedLeg(connector, weighted) : null;
    const baseline = request.rejoin && connectorPath ? request.rejoin.remaining + connectorPath.distanceKm * 1000 : null;
    const distance = results.reduce((sum, { result }) => sum + selectedLeg(result, weighted)!.distanceKm * 1000, 0);
    const shorter = shorterFromSamePosition(distance, baseline);
    const routeUpdate = shorter ? "Shorter route found." : (weighted === true || weighted === "lower-terrain") && baseline !== null && distance > baseline + 1
      ? "Lower terrain-cost route selected. It adds distance."
      : "Route updated through your remaining stops.";
    setMessage(routeUpdate);
    const target = s.next < stops.length ? stops[s.next].point.name ?? `Stop ${s.next + 1}` : "Lander";
    const direction = walkDirection(s.track, s.metres, s.stopDistances[s.next] ?? Infinity, target, !detailed);
    announce({ text: `${routeUpdate} ${direction.text}`, fallback: shorter ? "shorter" : "updated" }, true);
  }, [request, solverResults, requestedLegs.length, session, weighted]);

  useEffect(() => {
    if (!session || paused || !roverSuggestion || cueHistory.current.has("roverSuggestion")) return;
    const timer = window.setTimeout(() => announce({ text: roverSuggestion }, true, "roverSuggestion"), 3500);
    return () => window.clearTimeout(timer);
  }, [session, paused, rover, roverSuggestion]);

  useEffect(() => {
    if (!session || paused || !lander) return;
    const s = state.current;
    let live = true;
    let watch: number | undefined;
    let lastMove = 0;
    let fixState: "waiting" | "locked" | "weak" | "denied" = "waiting";
    const deviating = deviationTracker();
    let motionSeen = false;
    const detect = stepDetector();
    const publish = (moving: boolean) => { if (live) update(moving); };
    const advance = (distance: number) => {
      const total = s.track.at(-1)!.metres;
      s.metres = Math.min(total, s.metres + distance);
      const { point, heading } = sampleWalk(s.track, s.metres);
      s.point = point; s.heading = heading;
      lastMove = Date.now();
      publish(s.metres < total);
      checkProgress();
    };
    const checkProgress = (positionUncertainty = 0, firstDirection = false) => {
      if (!s.point || s.arrived) return;
      const stop = stops[s.next];
      const previousStop = s.next;
      if (session.mode === "Outdoor") {
        if (stop && meters(stop.point, s.point) <= 5 && s.metres >= (s.stopDistances[s.next] ?? 0) - 8) s.next++;
      } else {
        while (s.next < stops.length && s.metres >= s.stopDistances[s.next]) s.next++;
      }
      const target = s.next < stops.length ? stops[s.next].point.name ?? `Stop ${s.next + 1}` : returning ? "Lander" : null;
      setNextStop(target);
      const final = returning ? lander : stops.at(-1)!.point;
      const total = s.track.at(-1)!.metres;
      setRemaining(Math.max(0, total - s.metres));
      if ((session.mode !== "Outdoor" && s.metres >= total) ||
        (session.mode === "Outdoor" && s.next === stops.length && meters(s.point, final) <= 5)) {
        s.arrived = true;
        setRemaining(0);
        setNextStop(null);
        publish(false);
        announce("arrived", true);
        setPaused(true);
        return;
      }
      const legEnd = s.stopDistances[s.next] ?? total;
      const next = session.mode === "Outdoor" && target ? walkDirection(s.track, s.metres, legEnd, target, !detailed) : null;
      const changedLeg = s.next > previousStop;
      const speakNext = (critical: boolean) => {
        if (!next) return false;
        const near = next.metres <= 12;
        const key = `step:${s.next}:${next.kind}:${Math.round((next.metres + s.metres) / 12)}:${near}`;
        if (!critical && (next.metres > 30 || cueHistory.current.has(key))) return false;
        const fallback = next.kind !== "stop" && near ? next.kind : undefined;
        return announce({ text: changedLeg ? `Stop reached. ${next.text}` : next.text, fallback, bearing: next.bearing }, critical, key);
      };
      if (next && (firstDirection || changedLeg) && speakNext(true)) return;
      if (!next && changedLeg && announce("stopReached")) return;
      const landmark = nearbyLandmark(events, s.point, s.track, s.metres, legEnd, landmarksHeard.current, positionUncertainty);
      if (landmark && announce({ text: landmark.text })) {
        landmark.ids.forEach((site) => landmarksHeard.current.add(site));
        return;
      }
      if (speakNext(false)) return;
      const id = detailed ? routeCue(s.track, s.metres, legEnd) : null;
      if (session.mode !== "Outdoor" && (id === "left" || id === "right")) {
        const turn = nextManeuver(s.track, s.metres, legEnd);
        announce({ text: `In about ${Math.round(turn.metres)} metres, turn ${id}.`, fallback: id }, false, id);
      } else if (id === "terrain" || id === "slope") announce(id);
    };
    const onFix = ({ coords, timestamp }: GeolocationPosition) => {
      if (!live || s.arrived || fixState === "denied") return;
      const fix = { lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy, timestamp };
      const now = Date.now();
      const lastFix = lastGpsFix.current;
      if (timestamp > lastFix && now - timestamp <= 5000 && timestamp <= now + 1000 &&
        Number.isFinite(fix.accuracy) && fix.accuracy >= 0) setAccuracy(fix.accuracy);
      if (!usableFix(fix, now, lastFix)) {
        if (fix.accuracy > 12 && timestamp > lastFix && now - timestamp <= 5000 && timestamp <= now + 1000) {
          fixState = "weak";
          setHasFix(false);
          setMessage("Waiting for better location accuracy (12 m or better).");
          if (!document.hidden) announce("gpsLost");
          gps.current?.moved(null);
          deviating(0, 12, Date.now());
          lastMove = 0; publish(false);
        }
        return;
      }
      lastGpsFix.current = timestamp;
      const position = gps.current ??= { anchor: fix, moved: gpsMovement(fix) };
      const lockedNow = fixState !== "locked";
      if (lockedNow) {
        fixState = "locked";
        setHasFix(true);
        setMessage(rover ? "Location locked. Move to drive the simulated rover." : "Location locked. Walk to move the astronaut.");
      }
      const previous = s.point ?? lander;
      const changed = position.moved(fix);
      const point = changed ? marsFromEarth(position.anchor, fix, lander, session.scale) : previous;
      if (changed) {
        s.heading = bearingDeg(previous, point); s.point = point; lastMove = Date.now();
        publish(true);
      }
      // Match only up to the next visit, so crossings and return legs cannot skip an ordered stop.
      const located = locateOnWalk(s.track, point, Math.max(0, s.metres - 6), s.stopDistances[s.next] ?? Infinity);
      const accuracy = Math.hypot(fix.accuracy, position.anchor.accuracy) * session.scale;
      const offRoute = located.distance > Math.max(8, accuracy + 4);
      setOffRoute(offRoute);
      if (!offRoute && (changed || lockedNow)) {
        if (failedDetour.current || (detailed && !detailedAt(previous))) setMessage("Back on the planned route.");
        failedDetour.current = null;
        setRejoin(null);
        s.metres = Math.max(s.metres, located.metres);
        checkProgress(accuracy, lockedNow);
      }
      if (detailed && deviating(located.distance, accuracy, timestamp) && !s.arrived && !s.pending && Date.now() >= s.retryAt &&
        detailedAt(point) && (s.next < stops.length || returning) &&
        (!failedDetour.current || meters(failedDetour.current, point) > Math.max(8, accuracy))) {
        s.pending = true;
        deviating(0, fix.accuracy, timestamp);
        setMessage("Off route. Recalculating from your position…");
        announce("recalculating");
        const limit = s.stopDistances[s.next] ?? Infinity;
        const vertex = s.track.find(({ metres }) => metres >= located.metres && metres <= limit + 0.01);
        setRequest({ from: point, next: s.next, rejoin: vertex
          ? { point: vertex.point, remaining: s.track.at(-1)!.metres - vertex.metres } : null });
      }
      if (offRoute && !s.pending && (changed || lockedNow)) {
        const guidance = rejoinDirection(point, located);
        setRejoin(guidance);
        setRemaining(null);
        if (detailed && !detailedAt(point)) setMessage("Outside the detailed terrain. No verified detour here.");
        else if (!detailed) setMessage("Off the regional route. Detailed detours are unavailable here.");
        announce({ text: guidance.text, bearing: guidance.bearing }, false, "rejoin");
      }
    };
    const onMotion = (event: DeviceMotionEvent) => {
      const linear = magnitude(event.acceleration), gravity = magnitude(event.accelerationIncludingGravity);
      if (!motionSeen && (linear !== null || gravity !== null)) {
        motionSeen = true;
        setMessage("Step sensor ready. Distance uses your calibrated stride.");
      }
      if (!s.arrived && detect(linear, gravity, performance.now())) advance(session.stride);
    };
    if (session.mode === "Outdoor") {
      setMessage("Acquiring a location fix…");
      watch = navigator.geolocation.watchPosition(onFix, (error) => {
        if (!live) return;
        fixState = error.code === 1 ? "denied" : "waiting";
        setHasFix(false);
        setMessage(error.code === 1 ? "Location denied. Exit and choose a visual preview."
          : "Location unavailable. Waiting for a new fix.");
        lastMove = 0; publish(false);
        gps.current?.moved(null);
        deviating(0, 12, Date.now());
        if (error.code === 1 && watch !== undefined) { navigator.geolocation.clearWatch(watch); watch = undefined; }
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 });
    }
    if (session.motion) window.addEventListener("devicemotion", onMotion);
    const motionTimer = session.motion ? window.setTimeout(() => {
      if (!motionSeen) setMessage("No motion readings received. Stop and try Recorded Walk.");
    }, 4500) : undefined;
    let lastTick = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = document.hidden ? 0 : Math.min(1, (now - lastTick) / 1000);
      lastTick = now;
      if (s.arrived) return;
      if (session.mode === "Outdoor" && fixState === "locked" && Date.now() - lastGpsFix.current > 5000) {
        fixState = "waiting";
        setHasFix(false);
        setMessage("Location signal lost. Waiting for a fresh fix.");
        if (!document.hidden) announce("gpsLost");
        gps.current?.moved(null);
        deviating(0, 12, Date.now());
        lastMove = 0;
        publish(false);
      }
      if (session.mode === "Recorded Walk") {
        const next = advanceTravel(s.travel, s.metres, elapsed, rate.current);
        s.missionSeconds += next.advancedSeconds;
        advance(next.metres - s.metres);
      }
      else if (lastMove && Date.now() - lastMove > 1200) { lastMove = 0; publish(false); }
    }, 250);
    return () => {
      live = false;
      if (session.mode === "Outdoor") gps.current?.moved(null);
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      window.removeEventListener("devicemotion", onMotion);
      window.clearTimeout(motionTimer);
      window.clearInterval(timer);
    };
  }, [session, paused, planKey, events]);

  useEffect(() => {
    if (!session?.tilt || !tiltGranted || paused) return;
    const onTilt = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      const s = state.current;
      const angle = (screen.orientation?.angle ?? 0) * Math.PI / 180;
      const value = event.beta * Math.cos(angle) + event.gamma * Math.sin(angle);
      s.neutral ??= value;
      s.tilt = Math.max(-0.32, Math.min(0.65, (value - s.neutral) * Math.PI / 180));
      setPose((pose) => pose && { ...pose, tilt: s.tilt });
    };
    window.addEventListener("deviceorientation", onTilt);
    return () => window.removeEventListener("deviceorientation", onTilt);
  }, [session?.tilt, tiltGranted, paused]);

  useEffect(() => {
    if (!session?.notifications || paused) return;
    const onVisibility = () => {
      const s = state.current;
      if (!document.hidden || s.arrived) return;
      if (!hasFix) { routeNotice("Waiting for a fresh GPS fix."); return; }
      const stop = stops[s.next];
      const target = stop ? stop.point.name ?? `Stop ${s.next + 1}` : "Lander";
      const instruction = rejoin ?? walkDirection(s.track, s.metres, s.stopDistances[s.next] ?? Infinity, target, !detailed);
      routeNotice(`Last known direction: ${instruction.text}`);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [session?.notifications, paused, hasFix, rejoin, stops, detailed]);

  useEffect(() => {
    if (!session || !pose?.point || cueHistory.current.has("temperature")) return;
    const observation = observations.find((item) => item.id === "meda-sol502-air-temperature" &&
      item.unit === "K" && item.min === 190.4 && item.max === 251.4 && item.source.url &&
      item.date === "2022-07-19" && meters(item.location, pose.point) <= 1);
    if (!observation) return;
    // The fixed offline clip describes this calibrated point observation exactly.
    const timer = window.setTimeout(() => announce("temperature", true), state.current.arrived ? 2500 : 0);
    return () => window.clearTimeout(timer);
  }, [session, pose?.point, observations]);


  const progress = state.current;
  const guidance = session?.mode === "Outdoor" && hasFix && !progress.arrived && !paused
    ? offRoute ? rejoin : walkDirection(progress.track, progress.metres, progress.stopDistances[progress.next] ?? Infinity,
      nextStop ?? "destination", !detailed) : null;
  const maneuver = session && !offRoute && !progress.arrived && detailed && progress.track.length > 1
    ? nextManeuver(progress.track, progress.metres, progress.stopDistances[progress.next] ?? Infinity) : null;
  const upcoming = useMemo(() => {
    if (!maneuver) return [];
    const end = progress.stopDistances[progress.next] ?? Infinity;
    let cursor = progress.metres;
    const steps = [];
    for (let i = 0; i < 4; i++) {
      const step = nextManeuver(progress.track, cursor, end);
      steps.push({ ...step, metres: cursor - progress.metres + step.metres });
      if (step.kind === "stop") break;
      cursor += step.metres + 6;
    }
    return steps;
  }, [!!maneuver, progress.track, progress.metres, progress.next, progress.stopDistances]);
  return { eligible, liveEligible, detailed, gpsAvailable, session, paused, pose, message, cue: cue && cueText(cue), remaining, accuracy, nextStop, planned, starting,
    maneuver, guidance, upcoming, muted, rover, obstacleHold,
    toggleMute: () => {
      mute.current = !mute.current;
      setMuted(mute.current);
      if (mute.current) audio.current?.stop();
      else void audio.current?.resume()?.catch(() => {});
    },
    playbackRate, cycleRate: () => { rate.current = cyclePlaybackRate(rate.current); setPlaybackRate(rate.current); },
    simulationUtc: session?.mode === "Recorded Walk" ? progress.startedAt + progress.missionSeconds * 1000 : null,
    travelSecondsRemaining: Math.max(0, ((session ? progress.travel : travel).at(-1)?.seconds ?? 0) - (session ? elapsedTravelSeconds(progress.travel, progress.metres) : 0)),
    playbackSpeed: routeSpeed * playbackRate,
    progress: plannedProgress,
    terrain: detailed ? terrainAhead(session ? progress.track : track, session ? progress.metres : 0) : null,
    travelledM: session ? progress.metres : 0,
    elevationM: session && progress.track.length > 1 ? progress.track[sampleWalk(progress.track, progress.metres).end]?.elevation ?? null : null,
    start, stop, recenter: () => { state.current.neutral = null; state.current.tilt = 0; update(false); },
    togglePause: () => {
      if (state.current.arrived || obstacleHold) return;
      if (!paused) update(false);
      else void audio.current?.resume()?.catch(() => {});
      setPaused(!paused);
    },
    arrived: state.current.arrived,
    repeat: () => { if (!mute.current && lastCue.current) { void audio.current?.resume()?.catch(() => {}); audio.current?.speak(lastCue.current.cue); } },
  };
}
