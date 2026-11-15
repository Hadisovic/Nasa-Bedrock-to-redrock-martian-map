import { useEffect, useMemo, useRef, useState } from "react";
import { bearingDeg, greatCircleKm } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import { buildItineraryTrack, deviationTracker, earthGpsDevice, gpsMovement, locateOnWalk, marsFromEarth, nearbyLandmark, nextManeuver, routeCue, sampleWalk, shorterFromSamePosition, stepDetector, usableFix } from "./earthWalk.ts";
import type { EarthFix, WalkMode, WalkPose, WalkTrack } from "./earthWalk.ts";
import { cueText, missionAudio } from "./walkAudio.ts";
import type { WalkCue } from "./walkAudio.ts";
import { insideMarswalkCoverage } from "./catalog.ts";
import type { CatalogEvent, EnvironmentObservation, LayerEntry } from "./catalog.ts";
import { itineraryLegs, selectedLeg } from "./itinerary.ts";
import type { Leg, PlannedLeg } from "./itinerary.ts";
import type { Endpoint, Stop } from "./missionPlan.ts";
import { useItinerary } from "./useItinerary.ts";
import { nearGale } from "./galeLayout.ts";

type PermissionConstructor = { requestPermission?: () => Promise<"granted" | "denied"> };
type Session = { mode: WalkMode; motion: boolean; tilt: boolean; stride: number };
type Replan = { from: LatLon; next: number; rejoin: { point: LatLon; remaining: number } | null };
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

function trackFor(legs: readonly PlannedLeg[], weighted: boolean) {
  return buildItineraryTrack(legs.flatMap(({ result, toStop }) => {
    const route = selectedLeg(result, weighted);
    return route ? [{ toStop, points: route.points.map((point, i) => ({ point, elevation: route.elevationsM[i] ?? null })) }] : [];
  }));
}

export function useEarthWalk(lander: Endpoint | null, stops: Stop[], returning: boolean,
  legs: PlannedLeg[], grid: LayerEntry | undefined, slope: number, blocked: LatLon | null,
  weighted: boolean, routeSpeed: number, observations: EnvironmentObservation[], events: readonly CatalogEvent[],
  rover: boolean, roverSuggestion: string | null) {
  const { track, stopDistances } = useMemo(() => trackFor(legs, weighted), [legs, weighted]);
  const eligible = !!lander && !!stops.length && track.length > 1 && legs.every(({ result }) => result?.status === "ok");
  const liveEligible = eligible && meters(lander, track[0].point) < 0.05;
  const detailed = eligible
    && legs.every(({ result }) => result?.status === "ok" && !result.terrain.regional)
    && track.every(({ point }) => detailedAt(point));
  const gpsAvailable = earthGpsDevice(navigator.userAgent, navigator.maxTouchPoints, matchMedia("(pointer: coarse)").matches);
  const [session, setSession] = useState<Session | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const mute = useRef(false);
  const [offRoute, setOffRoute] = useState(false);
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
  const state = useRef({ track, metres: 0, next: 0, point: null as LatLon | null,
    heading: 0, tilt: 0, neutral: null as number | null,
    pending: false, retryAt: 0, arrived: false, stopDistances: [] as number[] });
  const requestedLegs = useMemo<Leg[]>(() => request && lander
    ? itineraryLegs(lander, stops.slice(request.next), returning, request.from).concat(
      request.next === stops.length && returning ? [{ from: request.from, to: lander, returning: true, fromStop: null, toStop: null }] : [])
    : emptyLegs, [request, lander, stops, returning]);
  const solverLegs = useMemo(() => request?.rejoin
    ? [...requestedLegs, { from: request.from, to: request.rejoin.point, returning: false, fromStop: null, toStop: null }]
    : requestedLegs, [request, requestedLegs]);
  const solverResults = useItinerary(solverLegs, grid, slope, blocked, 0);
  const planKey = JSON.stringify([lander, stops.map(({ point }) => point), returning, slope, blocked, weighted, rover]);

  function announce(id: WalkCue, critical = false, key = typeof id === "string" ? id : id.text) {
    const now = Date.now();
    if (!critical && (now - (lastCue.current?.at ?? 0) < 4000 || now - (cueHistory.current.get(key) ?? 0) < 15_000)) return false;
    lastCue.current = { cue: id, at: now };
    cueHistory.current.set(key, now);
    setCue(id);
    if (!mute.current) audio.current?.speak(id);
    return true;
  }

  function update(moving: boolean) {
    const { point, heading, tilt } = state.current;
    if (point) setPose({ point, heading, moving, tilt });
  }

  function stop() {
    attempt.current++;
    audio.current?.dispose();
    audio.current = null;
    gps.current = null;
    lastGpsFix.current = -Infinity;
    setSession(null);
    setStarting(false);
    setPaused(false);
    setOffRoute(false);
    setPose(null);
    setCue(null);
    setRequest(null);
    setPlanned(null);
    setRemaining(null);
    setAccuracy(null);
    setNextStop(null);
    setMessage("");
  }

  useEffect(() => { stop(); }, [planKey]);
  useEffect(() => () => { attempt.current++; audio.current?.dispose(); }, []);

  async function start(mode: WalkMode, stride: number, tiltEnabled: boolean) {
    if (!eligible || !lander || starting || (rover && mode !== "Recorded Walk") || (mode === "Outdoor" && (!liveEligible || !gpsAvailable))) return false;
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
    audio.current?.dispose();
    try { audio.current = missionAudio(); } catch { audio.current = null; }
    // iPadOS requires both requests to begin in the Start button gesture.
    const motion = mode === "Indoor Steps"
      ? permitted(window.DeviceMotionEvent as PermissionConstructor | undefined) : Promise.resolve(false);
    const orientation = tiltEnabled && isSecureContext
      ? permitted(window.DeviceOrientationEvent as PermissionConstructor | undefined) : Promise.resolve(false);
    const [motionGranted, tiltGranted] = await Promise.all([motion, orientation]);
    if (id !== attempt.current) return false;
    setStarting(false);
    if (mode === "Indoor Steps" && !motionGranted) {
      audio.current?.dispose(); audio.current = null;
      setMessage("Motion access is unavailable. Enable it in browser settings or try Recorded Walk.");
      return false;
    }
    state.current = { track, metres: 0, next: 0, point: track[0].point, heading: sampleWalk(track, 0).heading,
      tilt: 0, neutral: null, pending: false, retryAt: 0, arrived: false,
      stopDistances };
    lastCue.current = null;
    cueHistory.current.clear();
    landmarksHeard.current.clear();
    failedDetour.current = null;
    setRemaining(track.at(-1)!.metres);
    setNextStop(stops[0].point.name ?? "Stop 1");
    setSession({ mode, motion: motionGranted, tilt: tiltGranted, stride });
    if (tiltEnabled && !tiltGranted) setMessage("Tilt is unavailable. Map controls are still available.");
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
    const failure = results.find(({ result }) => result?.status !== "ok" || result.terrain.regional)?.result;
    if (failure) {
      const leg = results.find(({ result }) => result === failure);
      const target = leg?.returning ? "Lander" : leg?.to.name ?? `Stop ${request.next + (leg?.toStop ?? 0) + 1}`;
      setMessage(`Leg to ${target}: ${failure.status === "ok" ? "Detailed terrain unavailable." : failure.detail}`);
      setRemaining(null);
      failedDetour.current = request.from;
      if (failure.status === "no-route") announce("unavailable", true);
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
    setOffRoute(false);
    failedDetour.current = null;
    s.metres = locateOnWalk(nextTrack, s.point ?? request.from, 0, remainingStops[0] ?? Infinity).metres;
    s.stopDistances = [...s.stopDistances.slice(0, s.next), ...remainingStops];
    setPlanned(results);
    setRemaining(Math.max(0, nextTrack.at(-1)!.metres - s.metres));
    // Compare against a solver-verified connection to a vertex on the previous route.
    // Both alternatives start at this fix and visit the same remaining stops.
    const connector = request.rejoin && solverResults.at(-1)?.result;
    const connectorPath = connector?.status === "ok" && !connector.terrain.regional ? selectedLeg(connector, weighted) : null;
    const baseline = request.rejoin && connectorPath ? request.rejoin.remaining + connectorPath.distanceKm * 1000 : null;
    const distance = results.reduce((sum, { result }) => sum + selectedLeg(result, weighted)!.distanceKm * 1000, 0);
    const shorter = shorterFromSamePosition(distance, baseline);
    setMessage(shorter ? "Shorter route found." : weighted && baseline !== null && distance > baseline + 1
      ? "Lower slope cost route selected. It adds distance."
      : "Route updated through your remaining stops.");
    announce(shorter ? "shorter" : "updated", true);
  }, [request, solverResults, requestedLegs.length, session, weighted]);

  useEffect(() => {
    if (!session || paused || rover || !roverSuggestion || cueHistory.current.has("roverSuggestion")) return;
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
    const checkProgress = (positionUncertainty = 0) => {
      if (!s.point || s.arrived) return;
      const stop = stops[s.next];
      const previousStop = s.next;
      if (session.mode === "Outdoor") {
        if (stop && meters(stop.point, s.point) <= 5 && s.metres >= (s.stopDistances[s.next] ?? 0) - 8) s.next++;
      } else {
        while (s.next < stops.length && s.metres >= s.stopDistances[s.next]) s.next++;
      }
      setNextStop(s.next < stops.length ? stops[s.next].point.name ?? `Stop ${s.next + 1}` : returning ? "Lander" : null);
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
      if (s.next > previousStop && announce("stopReached")) return;
      const legEnd = s.stopDistances[s.next] ?? total;
      const landmark = nearbyLandmark(events, s.point, s.track, s.metres, legEnd, landmarksHeard.current, positionUncertainty);
      if (landmark && announce({ text: landmark.text })) {
        landmark.ids.forEach((site) => landmarksHeard.current.add(site));
        return;
      }
      const id = detailed ? routeCue(s.track, s.metres, legEnd) : null;
      if (id === "left" || id === "right") {
        const turn = nextManeuver(s.track, s.metres, legEnd);
        announce({ text: `In about ${Math.round(turn.metres)} metres, turn ${id}.`, fallback: id }, false, id);
      } else if (id) announce(id);
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
          setMessage("Waiting for better location accuracy (12 m or better).");
          announce("gpsLost");
          gps.current?.moved(null);
          deviating(0, 12, Date.now());
          lastMove = 0; publish(false);
        }
        return;
      }
      lastGpsFix.current = timestamp;
      const position = gps.current ??= { anchor: fix, moved: gpsMovement(fix) };
      if (fixState !== "locked") {
        fixState = "locked";
        setMessage("Location locked. Walk to move the astronaut.");
        announce("gpsLocked");
      }
      const previous = s.point ?? lander;
      const changed = position.moved(fix);
      const point = changed ? marsFromEarth(position.anchor, fix, lander) : previous;
      if (changed) {
        s.heading = bearingDeg(previous, point); s.point = point; lastMove = Date.now();
        publish(true);
      }
      // Match only up to the next visit, so crossings and return legs cannot skip an ordered stop.
      const located = locateOnWalk(s.track, point, Math.max(0, s.metres - 6), s.stopDistances[s.next] ?? Infinity);
      const accuracy = Math.hypot(fix.accuracy, position.anchor.accuracy);
      const offRoute = located.distance > Math.max(8, accuracy + 4);
      setOffRoute(offRoute);
      if (!offRoute && changed) {
        if (failedDetour.current || (detailed && !detailedAt(previous))) setMessage("Back on the planned route.");
        failedDetour.current = null;
        s.metres = Math.max(s.metres, located.metres);
        checkProgress(accuracy);
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
      if (detailed && changed && !detailedAt(point)) {
        setRemaining(null);
        setMessage("Outside this terrain pack. Move back into the mapped area to continue.");
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
    const onTilt = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      const angle = (screen.orientation?.angle ?? 0) * Math.PI / 180;
      const value = event.beta * Math.cos(angle) + event.gamma * Math.sin(angle);
      s.neutral ??= value;
      s.tilt = Math.max(-0.32, Math.min(0.65, (value - s.neutral) * Math.PI / 180));
      publish(Date.now() - lastMove < 1200);
    };
    if (session.mode === "Outdoor") {
      setMessage("Acquiring a location fix…");
      watch = navigator.geolocation.watchPosition(onFix, (error) => {
        if (!live) return;
        fixState = error.code === 1 ? "denied" : "waiting";
        setMessage(error.code === 1 ? "Location denied. Exit and choose a visual preview."
          : "Location unavailable. Waiting for a new fix.");
        lastMove = 0; publish(false);
        gps.current?.moved(null);
        deviating(0, 12, Date.now());
        if (error.code === 1 && watch !== undefined) { navigator.geolocation.clearWatch(watch); watch = undefined; }
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 });
    }
    if (session.motion) window.addEventListener("devicemotion", onMotion);
    if (session.tilt) window.addEventListener("deviceorientation", onTilt);
    const motionTimer = session.motion ? window.setTimeout(() => {
      if (!motionSeen) setMessage("No motion readings received. Stop and try Recorded Walk.");
    }, 4500) : undefined;
    const timer = window.setInterval(() => {
      if (s.arrived) return;
      if (session.mode === "Outdoor" && fixState === "locked" && Date.now() - lastGpsFix.current > 5000) {
        fixState = "waiting";
        setMessage("Location signal lost. Waiting for a fresh fix.");
        announce("gpsLost");
        gps.current?.moved(null);
        deviating(0, 12, Date.now());
        lastMove = 0;
        publish(false);
      }
      if (session.mode === "Recorded Walk") advance(0.25 * recordedSpeed(s.track.at(-1)!.metres));
      else if (lastMove && Date.now() - lastMove > 1200) { lastMove = 0; publish(false); }
    }, 250);
    return () => {
      live = false;
      if (session.mode === "Outdoor") gps.current?.moved(null);
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("deviceorientation", onTilt);
      window.clearTimeout(motionTimer);
      window.clearInterval(timer);
    };
  }, [session, paused, planKey, events]);

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

  function recordedSpeed(metres: number) { return Math.max(1.8, Number.isFinite(routeSpeed) ? routeSpeed : 0, metres / 38); }
  const progress = state.current;
  const maneuver = session && !paused && !offRoute && !progress.arrived && detailed && progress.track.length > 1
    ? nextManeuver(progress.track, progress.metres, progress.stopDistances[progress.next] ?? Infinity) : null;
  return { eligible, liveEligible, detailed, gpsAvailable, session, paused, pose, message, cue: cue && cueText(cue), remaining, accuracy, nextStop, planned, starting,
    maneuver, muted, rover,
    toggleMute: () => {
      mute.current = !mute.current;
      setMuted(mute.current);
      if (mute.current) audio.current?.stop();
      else void audio.current?.resume()?.catch(() => {});
    },
    playbackSpeed: recordedSpeed((session ? state.current.track : track).at(-1)?.metres ?? 0),
    start, stop, recenter: () => { state.current.neutral = null; state.current.tilt = 0; update(false); },
    togglePause: () => {
      if (state.current.arrived) return;
      if (!paused) update(false);
      else void audio.current?.resume()?.catch(() => {});
      setPaused(!paused);
    },
    arrived: state.current.arrived,
    repeat: () => { if (!mute.current && lastCue.current) { void audio.current?.resume()?.catch(() => {}); audio.current?.speak(lastCue.current.cue); } },
  };
}
