import type { RasterLayout } from "../contracts/index.ts";

export interface LayerVisibility {
  imagery: boolean;
  relief: boolean;
  elevation: boolean;
  slope: boolean;
  traverse: boolean;
  science: boolean;
  /** Red hatching over cells steeper than the planning slope limit. */
  hazard: boolean;
}

export type ImageryTreatment = "grayscale" | "mars";

export interface ComposeInput {
  imagery: { layout: RasterLayout; grayscaleDn: Uint8Array; noDataDn: number } | null;
  elevation: { layout: RasterLayout; elevationsM: Float32Array; minM: number; maxM: number } | null;
  slopeDeg: Float32Array | null;
  hillshade: Float32Array | null;
  visibility: LayerVisibility;
  treatment: ImageryTreatment;
  /** Planning threshold for the hazard overlay, in degrees (the Marswalk max-slope input). */
  hazardSlopeDeg?: number;
}

export const HAZARD_RGB = [255, 59, 59] as const;

/** Slope classes used by the overlay and its legend. */
export const SLOPE_CLASSES = [
  { maxDeg: 10, label: "under 10°", rgba: [0, 0, 0, 0] },
  { maxDeg: 15, label: "10–15°", rgba: [255, 214, 92, 120] },
  { maxDeg: 25, label: "15–25°", rgba: [255, 140, 50, 150] },
  { maxDeg: 90, label: "25° and steeper", rgba: [230, 50, 50, 175] },
] as const;

export const UNKNOWN_RGBA = [200, 60, 200, 255] as const;

/** Elevation tint ramp from low (deep blue) to high (pale copper). */
const RAMP = [[28, 58, 110], [52, 120, 160], [120, 180, 150], [230, 200, 120], [240, 140, 90]];

function ramp(t: number): number[] {
  const x = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  return RAMP[i].map((v, k) => v + (RAMP[i + 1][k] - v) * f);
}

/**
 * Composite the visible raster layers into RGBA at the imagery resolution (0.25 m),
 * falling back to elevation resolution when imagery is missing. Elevation-derived
 * layers are sampled from their 1 m cell without interpolation.
 */
export function composeLayers(input: ComposeInput): { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer> } | null {
  const base = input.imagery?.layout ?? input.elevation?.layout;
  if (!base) return null;
  const { width, height } = base;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const elevationLayout = input.elevation?.layout;
  const ratio = elevationLayout ? elevationLayout.pixelSizeM / base.pixelSizeM : 1;
  const v = input.visibility;
  const showImagery = v.imagery && !!input.imagery;
  const range = input.elevation ? input.elevation.maxM - input.elevation.minM || 1 : 1;

  for (let row = 0; row < height; row++) {
    const eRow = Math.floor(row / ratio);
    for (let column = 0; column < width; column++) {
      const o = (row * width + column) * 4;
      const e = elevationLayout ? eRow * elevationLayout.width + Math.floor(column / ratio) : -1;
      let r = 34, g = 38, b = 46, a = 255;

      if (showImagery && input.imagery) {
        const dn = input.imagery.grayscaleDn[row * width + column];
        if (dn === input.imagery.noDataDn) {
          [r, g, b] = [20, 20, 24];
        } else if (input.treatment === "mars") {
          r = Math.min(255, dn * 1.08 + 18); g = dn * 0.66 + 8; b = dn * 0.42;
        } else {
          r = g = b = dn;
        }
      }

      if (e >= 0 && input.elevation) {
        const z = input.elevation.elevationsM[e];
        if (!Number.isFinite(z)) {
          // Unknown terrain is shown as a distinct hatch, never blended away.
          if ((row + column) % 8 < 4) [r, g, b] = UNKNOWN_RGBA;
          rgba.set([r, g, b, a], o);
          continue;
        }
        if (v.elevation) {
          const [er, eg, eb] = ramp((z - input.elevation.minM) / range);
          const mix = showImagery ? 0.45 : 1;
          r = r * (1 - mix) + er * mix; g = g * (1 - mix) + eg * mix; b = b * (1 - mix) + eb * mix;
        }
        if (v.relief && input.hillshade) {
          const h = input.hillshade[e];
          if (Number.isFinite(h)) {
            const shade = showImagery || v.elevation ? 0.55 + 0.6 * h : 0.15 + 0.95 * h;
            if (showImagery || v.elevation) { r *= shade; g *= shade; b *= shade; } else { r = g = b = 200 * shade; }
          }
        }
        if (v.slope && input.slopeDeg) {
          const s = input.slopeDeg[e];
          if (Number.isFinite(s)) {
            const cls = SLOPE_CLASSES.find((c) => s < c.maxDeg) ?? SLOPE_CLASSES[SLOPE_CLASSES.length - 1];
            const alpha = cls.rgba[3] / 255;
            r = r * (1 - alpha) + cls.rgba[0] * alpha;
            g = g * (1 - alpha) + cls.rgba[1] * alpha;
            b = b * (1 - alpha) + cls.rgba[2] * alpha;
          }
        }
        if (v.hazard && input.slopeDeg && input.hazardSlopeDeg) {
          const s = input.slopeDeg[e];
          if (Number.isFinite(s) && s > input.hazardSlopeDeg) {
            // Hatching keeps hazards distinct from the yellow-to-red slope classes and science pins.
            const stripe = ((row - column) % 6 + 6) % 6 < 2;
            const alpha = stripe ? 0.85 : 0.22;
            r = r * (1 - alpha) + HAZARD_RGB[0] * alpha;
            g = g * (1 - alpha) + HAZARD_RGB[1] * alpha;
            b = b * (1 - alpha) + HAZARD_RGB[2] * alpha;
          }
        }
      }
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
    }
  }
  return { width, height, rgba };
}
