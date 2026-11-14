import { useEffect, useMemo, useRef, useState } from "react";
import { bearingDeg, greatCircleKm } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import { buildWalkTrack, deviationTracker, locateOnWalk, marsFromEarth, orderedStopDistances, routeCue, sampleWalk, shorterFromSamePosition, stepDetector, usableFix } from "./earthWalk.ts";
import type { EarthFix, WalkMode, WalkPose, WalkTrack } from "./earthWalk.ts";
import { cueText, missionAudio } from "./walkAudio.ts";
import type { CueId } from "./walkAudio.ts";
import { insideMarswalkCoverage } from "./catalog.ts";
import type { EnvironmentObservation, LayerEntry } from "./catalog.ts";
import { itineraryLegs, selectedLeg } from "./itinerary.ts";
import type { Leg, PlannedLeg } from "./itinerary.ts";
import type { Endpoint, Stop } from "./missionPlan.ts";
import { useItinerary } from "./useItinerary.ts";
import { loadDustCover } from "./walkTerrain.ts";

type PermissionConstructor = { requestPermission?: () => Promise<"granted" | "denied"> };
type Session = { mode: WalkMode; motion: boolean; tilt: boolean; stride: number };
type Replan = { from: LatLon; next: number; rejoin: { point: LatLon; remaining: number } | null };
const emptyLegs: PlannedLeg[] = [];
const meters = (a: LatLon, b: LatLon) => greatCircleKm(a, b) * 1000;
async function permitted(sensor: PermissionConstructor | undefined) {
  if (!sensor) return false;
  try { return !sensor.requestPermission || await sensor.requestPermission() === "granted"; }
  catch { return false; }
}
const magnitude = (a: DeviceMotionEventAcceleration | null) =>
  a && a.x !== null && a.y !== null && a.z !== null && [a.x, a.y, a.z].every(Number.isFinite) ? Math.hypot(a.x, a.y, a.z) : null;

function trackFor(legs: readonly PlannedLeg[], weighted: boolean) {
  return buildWalkTrack(legs.flatMap(({ result }) => {
    const route = selectedLeg(result, weighted);
    return route?.points.map((point, i) => ({ point, elevation: route.elevationsM[i] ?? null })) ?? [];
  }));
}

export function useEarthWalk(lander: Endpoint | null, stops: Stop[], returning: boolean,
  legs: PlannedLeg[], grid: LayerEntry | undefined, slope: number, blocked: LatLon | null,
  weighted: boolean, routeSpeed: number, dustLayer: LayerEntry | undefined, observations: EnvironmentObservation[]) {
  const track = useMemo(() => trackFor(legs, weighted), [legs, weighted]);
  const eligible = !!lander && !!stops.length && track.length > 1 && meters(lander, track[0].point) < 0.05 && insideMarswalkCoverage(lander)
    && legs.every(({ result }) => result?.status === "ok" && !result.terrain.regional)
    && track.every(({ point }) => insideMarswalkCoverage(point));
  const [session, setSession] = useState<Session | null>(null);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState("");
  const [pose, setPose] = useState<WalkPose | null>(null);
  const [cue, setCue] = useState<CueId | null>(null);
  const [request, setRequest] = useState<Replan | null>(null);
  const [planned, setPlanned] = useState<PlannedLeg[] | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [nextStop, setNextStop] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const lastCue = useRef<{ id: CueId; at: number } | null>(null);
  const cueHistory = useRef(new Map<CueId, number>());
  const audio = useRef<ReturnType<typeof missionAudio> | null>(null);
  const dust = useRef<Awaited<ReturnType<typeof loadDustCover>> | null>(null);
  const attempt = useRef(0);
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
  useEffect(() => {
    if (!session || !dustLayer) return;
    let live = true;
    void loadDustCover(dustLayer).then((sample) => { if (live) dust.current = sample; }, () => {});
    return () => { live = false; dust.current = null; };
  }, [session, dustLayer]);
  const planKey = JSON.stringify([lander, stops.map(({ point }) => point), returning, slope, blocked, weighted]);

  function announce(id: CueId, critical = false) {
    const now = Date.now();
    if (!critical && (now - (lastCue.current?.at ?? 0) < 4000 || now - (cueHistory.current.get(id) ?? 0) < 15_000)) return false;
    lastCue.current = { id, at: now };
    cueHistory.current.set(id, now);
    setCue(id);
    audio.current?.speak(id);
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
    setSession(null);
    setStarting(false);
    setPaused(false);
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
    if (!eligible || !lander || starting) return false;
    if (mode !== "Recorded Walk" && !isSecureContext) {
      setMessage("Live sensors require HTTPS. Use Recorded Walk in this browser.");
      return false;
    }
    if (mode === "Outdoor" && !navigator.geolocation) {
      setMessage("Location is unavailable. Try Indoor Steps or Recorded Walk.");
      return false;
    }
    const id = ++attempt.current;
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
    state.current = { track, metres: 0, next: 0, point: lander, heading: sampleWalk(track, 0).heading,
      tilt: 0, neutral: null, pending: false, retryAt: 0, arrived: false,
      stopDistances: orderedStopDistances(track, stops.map(({ point }) => point)) };
    lastCue.current = null;
    cueHistory.current.clear();
    setRemaining(track.at(-1)!.metres);
    setNextStop(stops[0].point.name ?? "Stop 1");
    setSession({ mode, motion: motionGranted, tilt: tiltGranted, stride });
    if (tiltEnabled && !tiltGranted) setMessage("Tilt is unavailable. You can still walk and use the map controls.");
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
      setMessage(failure.status === "ok" ? "Detailed terrain unavailable ahead." : failure.detail);
      announce(failure.status === "ok" ? "terrain" : "unavailable", true);
      return;
    }
    const nextTrack = trackFor(results, weighted);
    if (nextTrack.length < 2) {
      setMessage("The planner returned no walkable distance from your current position.");
      announce("unavailable", true);
      return;
    }
    s.track = nextTrack;
    s.metres = locateOnWalk(nextTrack, s.point ?? request.from).metres;
    s.stopDistances = [...s.stopDistances.slice(0, s.next),
      ...orderedStopDistances(nextTrack, stops.slice(s.next).map(({ point }) => point))];
    setPlanned(results);
    setRemaining(Math.max(0, nextTrack.at(-1)!.metres - s.metres));
    // Compare against a solver-verified connection to a vertex on the previous route.
    // Both alternatives start at this fix and visit the same remaining stops.
    const connector = request.rejoin && solverResults.at(-1)?.result;
    const connectorPath = connector?.status === "ok" && !connector.terrain.regional ? selectedLeg(connector, weighted) : null;
    const baseline = request.rejoin && connectorPath ? request.rejoin.remaining + connectorPath.distanceKm * 1000 : null;
    const distance = results.reduce((sum, { result }) => sum + selectedLeg(result, weighted)!.distanceKm * 1000, 0);
    const shorter = shorterFromSamePosition(distance, baseline);
    setMessage(shorter ? "Shorter route found." : "Route updated through your remaining stops.");
    announce(shorter ? "shorter" : "updated", true);
  }, [request, solverResults, requestedLegs.length, session, weighted]);

  useEffect(() => {
    if (!session || paused || !lander) return;
    const s = state.current;
    let live = true;
    let watch: number | undefined;
    let anchor: EarthFix | null = null;
    let marsAnchor = s.point ?? lander;
    let lastFix = -Infinity, lastMove = 0;
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
    const checkProgress = () => {
      if (!s.point || s.arrived) return;
      const stop = stops[s.next];
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
      if (session.mode === "Outdoor" && !insideMarswalkCoverage(s.point)) {
        setMessage("Detailed terrain unavailable ahead. Return toward the mapped area to replan.");
        announce("terrain");
        return;
      }
      const id = routeCue(s.track, s.metres);
      if (id && announce(id)) return;
      const sample = dust.current;
      if (sample) {
        const now = sample(s.point), ahead = sample(sampleWalk(s.track, s.metres + 15).point);
        if (now !== null && ahead !== null && ahead >= 0.75 && ahead - now >= 0.25) announce("dust");
      }
    };
    const onFix = ({ coords, timestamp }: GeolocationPosition) => {
      if (!live || s.arrived) return;
      const fix = { lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy, timestamp };
      const now = Date.now();
      if (timestamp > lastFix && now - timestamp <= 5000 && Number.isFinite(fix.accuracy)) setAccuracy(fix.accuracy);
      if (!usableFix(fix, now, lastFix)) {
        if (fix.accuracy > 12 && timestamp > lastFix && now - timestamp <= 5000) {
          fixState = "weak";
          setMessage("Waiting for better location accuracy (12 m or better).");
          deviating(0, 12, Date.now());
          lastMove = 0; publish(false);
        }
        return;
      }
      lastFix = timestamp;
      if (!anchor) {
        anchor = fix;
        marsAnchor = s.point ?? lander;
      }
      if (fixState !== "locked") {
        fixState = "locked";
        setMessage("Location locked. Walk to move the astronaut.");
      }
      const point = marsFromEarth(anchor, fix, marsAnchor);
      const previous = s.point ?? marsAnchor;
      const moved = meters(point, previous);
      if (moved >= Math.max(1.2, fix.accuracy * 0.35)) {
        s.heading = bearingDeg(previous, point); s.point = point; lastMove = Date.now();
        publish(true);
      }
      // Match only up to the next visit, so crossings and return legs cannot skip an ordered stop.
      const located = locateOnWalk(s.track, point, Math.max(0, s.metres - 6), s.stopDistances[s.next] ?? Infinity);
      const accuracy = Math.hypot(fix.accuracy, anchor.accuracy);
      const offRoute = located.distance > Math.max(8, accuracy + 4);
      if (!offRoute) s.metres = Math.max(s.metres, located.metres);
      checkProgress();
      if (deviating(located.distance, accuracy, timestamp) && !s.arrived && !s.pending && Date.now() >= s.retryAt &&
        insideMarswalkCoverage(point) && (s.next < stops.length || returning)) {
        s.pending = true;
        deviating(0, fix.accuracy, timestamp);
        setMessage("Off route. Recalculating from your position…");
        const limit = s.stopDistances[s.next] ?? Infinity;
        const vertex = s.track.find(({ metres }) => metres >= located.metres && metres <= limit + 0.01);
        setRequest({ from: point, next: s.next, rejoin: vertex
          ? { point: vertex.point, remaining: s.track.at(-1)!.metres - vertex.metres } : null });
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
        setMessage(error.code === 1 ? "Location denied. Stop and choose Indoor Steps or Recorded Walk."
          : "Location unavailable. Waiting for a new fix.");
        lastMove = 0; publish(false);
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
      if (session.mode === "Outdoor" && fixState === "locked" && Date.now() - lastFix > 5000) {
        fixState = "waiting";
        setMessage("Location signal lost. Waiting for a fresh fix.");
      }
      if (session.mode === "Recorded Walk") advance(0.25 * Math.max(1.8, routeSpeed, s.track.at(-1)!.metres / 38));
      else if (lastMove && Date.now() - lastMove > 1200) { lastMove = 0; publish(false); }
    }, 250);
    return () => {
      live = false;
      anchor = null;
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("deviceorientation", onTilt);
      window.clearTimeout(motionTimer);
      window.clearInterval(timer);
    };
  }, [session, paused, planKey]);

  useEffect(() => {
    if (!session || !pose?.point || cueHistory.current.has("temperature")) return;
    const observation = observations.find((item) => item.id === "meda-sol502-air-temperature" &&
      item.date === "2022-07-19" && meters(item.location, pose.point) <= 1);
    if (!observation) return;
    // The fixed offline clip describes this calibrated point observation exactly.
    const timer = window.setTimeout(() => announce("temperature", true), state.current.arrived ? 2500 : 0);
    return () => window.clearTimeout(timer);
  }, [session, pose?.point, observations]);

  return { eligible, session, paused, pose, message, cue: cue && cueText(cue), remaining, accuracy, nextStop, planned, starting,
    start, stop, recenter: () => { state.current.neutral = null; state.current.tilt = 0; update(false); },
    togglePause: () => {
      if (state.current.arrived) return;
      if (!paused) update(false);
      else void audio.current?.resume()?.catch(() => {});
      setPaused(!paused);
    },
    arrived: state.current.arrived,
    repeat: () => { if (lastCue.current) { void audio.current?.resume()?.catch(() => {}); audio.current?.speak(lastCue.current.id); } },
  };
}
