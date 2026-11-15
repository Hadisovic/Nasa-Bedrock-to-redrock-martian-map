import { MARS_RADIUS_KM, wrapLon } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import type { LayerEntry } from "./catalog.ts";

export const KM_PER_DEGREE = (MARS_RADIUS_KM * Math.PI) / 180;

/** Shared view for both modes: centre and zoom in screen pixels per degree of latitude. */
export interface GlobeView { lat: number; lon: number; zoom: number }
export type RouteMapPoint = { x: number; y: number; choice?: import("./missionPlan.ts").RouteChoice };

export interface GlobeMarker extends LatLon {
  id: string;
  kind: "flag" | "rocket" | "destination" | "coverage" | "crew";
  label: string;
  accent: string;
  /** Show the team provenance flag (NASA-documented event). */
  flag: boolean;
  footprintKm?: number | null;
  order?: number;
  path?: LatLon[];
}

export type OverlayFeature =
  | { kind: "point"; lat: number; lon: number; color: string }
  | { kind: "polygon"; rings: [number, number][][]; color: string };

export interface GlobeOverlay {
  entry: LayerEntry;
  image: HTMLImageElement | null;
  opacity: number;
  /** Source vectors; when present the flat map draws these instead of the raster. */
  features?: OverlayFeature[];
}

export interface TileSource {
  url: (level: number, row: number, col: number) => string;
  colsAt: (level: number) => number;
  rowsAt: (level: number) => number;
  maxZoom: number;
  cors: boolean;
}

export function clampView(view: GlobeView, heightPx: number): GlobeView {
  const halfSpan = heightPx / 2 / view.zoom;
  const limit = Math.max(0, 90 - halfSpan);
  const lat = halfSpan >= 90 ? 0 : Math.max(-limit, Math.min(limit, view.lat));
  return { lat, lon: wrapLon(view.lon), zoom: view.zoom };
}

/** Icon size grows gently with zoom so markers stay selectable without hiding the map. */
export function markerSizePx(zoom: number, minZoom: number): number {
  const steps = Math.log2(Math.max(1, zoom / Math.max(0.01, minZoom)));
  return Math.round(Math.min(30, 16 + steps * 2.2));
}

/** A useful local zoom for "Go to location", by location precision. */
export function zoomForPrecision(precision: string | undefined, footprintKm?: number | null): number {
  if (footprintKm) return Math.max(6, Math.min(400, 180 / (footprintKm / KM_PER_DEGREE * 6)));
  return precision === "precise" ? 300 : precision === "approximate" ? 90 : 30;
}
