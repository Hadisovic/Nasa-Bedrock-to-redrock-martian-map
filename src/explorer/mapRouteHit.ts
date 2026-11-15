import type { MapLeg } from "./itinerary.ts";
import type { LatLon } from "./geo.ts";

export function routeAtMapPoint(paths: readonly MapLeg[], point: { x: number; y: number }, project: (point: LatLon) => { x: number; y: number }, tolerance: number, maxSegmentSpan = Infinity) {
  let best: MapLeg | null = null, closest = tolerance;
  for (const path of paths) {
    if (path.preview) continue;
    for (let i = 1; i < path.points.length; i++) {
      const a = project(path.points[i - 1]), b = project(path.points[i]);
      if (Math.abs(a.x - b.x) > maxSegmentSpan) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const distance = Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
      if (distance < closest || (distance === closest && path.selected)) { best = path; closest = distance; }
    }
  }
  return best;
}
