import { fromArrayBuffer } from "geotiff";
import type { LatLon } from "./geo.ts";

const service = "https://trek.nasa.gov/mars/trekarcgis/rest/services/";
export const viking = "Mars_Viking_MDIM21_ClrMosaic_global_232m";
const blend = "Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw";

export type Bounds = { west: number; south: number; east: number; north: number };
export type TerrainSource = Bounds & {
  label: string; elevation: string; image: string; spacing: number; span: number; height: number;
};

export const regionalOnlineSources: TerrainSource[] = [
  { label: "HiRISE · Arabia Terra", elevation: "DTEEC_041277_2115_040776_2115_A01_m2", image: viking, spacing: 2, span: .009, height: 70,
    west: -28.692987, south: 31.239192, east: -28.552972, north: 31.526233 },
  { label: "Gale · HiRISE", elevation: "Gale_DEM_SMG_1m", image: "curiosity_hirise_mosaic", spacing: 5, span: .026, height: 75,
    west: 137.123, south: -4.925, east: 137.729, north: -4.249 },
  { label: "Spirit · Columbia Hills", elevation: "DEM_1m_ColumbiaHills", image: viking, spacing: 5, span: .026, height: 120,
    west: 175.444, south: -14.681, east: 175.560, north: -14.496 },
  { label: "Opportunity · Victoria Crater", elevation: "DEM_1m_VictoriaCrater", image: viking, spacing: 3, span: .014, height: 100,
    west: -5.5109, south: -2.0681, east: -5.4892, north: -2.0393 },
  { label: "Opportunity · Endeavour Crater", elevation: "DEM_1m_Endeavour_Crater_isis3_2017_04_14", image: viking, spacing: 5, span: .026, height: 120,
    west: -5.4466, south: -2.4904, east: -5.3102, north: -2.1238 },
  { label: "InSight · Elysium Planitia", elevation: "InSight_HiRISE_CTX_HRSC_dem_mosaic_50pix_sigma5_exp3_gcs",
    image: "InSightCTXMosaic_112917_gcs", spacing: 20, span: .09, height: 150,
    west: 133.936, south: 3.729, east: 137.275, north: 5.069 },
];
export const globalSource: TerrainSource = { label: "Global HRSC / MOLA", elevation: blend, image: viking,
  spacing: 200, span: .864, height: 2200, west: -180, south: -89.99922, east: 179.99844, north: 90 };
export const containsTerrain = (b: Bounds, p: LatLon) => p.lon >= b.west && p.lon < b.east && p.lat > b.south && p.lat <= b.north;

export function exportUrl(layer: string, bounds: Bounds, pixels: number, elevation: boolean) {
  const query = new URLSearchParams({
    bbox: [bounds.west, bounds.south, bounds.east, bounds.north].join(","),
    bboxSR: "104905", imageSR: "104905", size: `${pixels},${pixels}`,
    format: elevation ? "tiff" : "png32", adjustAspectRatio: "false", f: "image",
  });
  if (elevation) {
    query.set("pixelType", "F32");
    query.set("interpolation", "RSP_BilinearInterpolation");
  }
  return `${service}${layer}/ImageServer/exportImage?${query}`;
}

export function windowBounds(source: TerrainSource, center: LatLon): Bounds {
  const { span } = source;
  const west = Math.max(source.west, Math.min(center.lon - span / 2, source.east - span));
  const south = Math.max(source.south, Math.min(center.lat - span / 2, source.north - span));
  return { west, south, east: west + span, north: south + span };
}

export async function raster(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw Error("NASA terrain export unavailable");
  return response;
}

export async function readTrekElevation(source: TerrainSource, bounds: Bounds, size: number, signal: AbortSignal) {
  const response = await raster(exportUrl(source.elevation, bounds, size, true), signal);
  const tiff = await fromArrayBuffer(await response.arrayBuffer());
  const image = await tiff.getImage();
  const actual = image.getBoundingBox();
  const expected = [bounds.west, bounds.south, bounds.east, bounds.north];
  if (image.getWidth() !== size || image.getHeight() !== size ||
      actual.some((coordinate, i) => !Number.isFinite(coordinate) || Math.abs(coordinate - expected[i]) > 1e-6)) {
    throw Error("NASA elevation grid bounds do not match the request");
  }
  const values = await image.readRasters({ samples: [0], interleave: true });
  const noData = image.getGDALNoData();
  signal.throwIfAborted();
  return Float32Array.from(values, (z) => Number.isFinite(z) && z > -20_000 && z < 30_000 && z !== noData ? z : NaN);
}
