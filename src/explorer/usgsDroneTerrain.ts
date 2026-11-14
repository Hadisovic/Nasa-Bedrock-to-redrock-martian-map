import { fromUrl } from "geotiff";
import { MARS_RADIUS_KM } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import { containsTerrain } from "./marsTrekTerrain.ts";
import type { Bounds } from "./marsTrekTerrain.ts";

const api = "https://stac.astrogeology.usgs.gov/api";
const archive = "https://astrogeo-ard.s3-us-west-2.amazonaws.com/";
const collections = ["mro_hirise_socet_dtms", "mro_ctx_controlled_usgs_dtms"] as const;
const metresPerDegree = MARS_RADIUS_KM * 1000 * Math.PI / 180;
const radians = Math.PI / 180;

type Asset = { href: string };
type Item = {
  id: string; bbox: [number, number, number, number]; collection: string;
  properties: { gsd: number }; assets: Record<string, Asset>;
};
export type DroneArchiveProduct = { id: string; label: string; spacing: number; bounds: Bounds; elevation: string; images: string[]; source: string };
export type DronePixels = { bounds: Bounds; heights: Float32Array; picture: Blob; label: string; spacing: number; imagery: string; flightHeight: number; source: string };
export const archiveElevationSize = 256;

function product(item: Item): DroneArchiveProduct | null {
  const assets = item.assets;
  const elevation = (assets.geoid_adjusted_dem ?? assets.dtm)?.href;
  if (!elevation?.startsWith(archive) || !Number.isFinite(item.properties.gsd) || item.properties.gsd <= 0) return null;
  const [west, south, east, north] = item.bbox;
  const images = Object.entries(assets).filter(([key]) => key === "orthoimage" || /_RED_[DA]_\d+_ORTHO$/.test(key))
    .sort(([a], [b]) => Number(b.includes("_D_")) - Number(a.includes("_D_")))
    .map(([, asset]) => asset.href).filter((href) => href.startsWith(archive));
  return { id: item.id, label: item.collection === collections[0] ? "USGS HiRISE" : "USGS CTX",
    spacing: Math.ceil(item.properties.gsd), bounds: { west, south, east, north }, elevation, images,
    source: `${api}/collections/${item.collection}/items/${encodeURIComponent(item.id)}` };
}

export async function findDroneProducts(point: LatLon, signal: AbortSignal) {
  const bbox = [Math.max(-180, point.lon - .001), Math.max(-90, point.lat - .001),
    Math.min(180, point.lon + .001), Math.min(90, point.lat + .001)];
  const results = await Promise.allSettled(collections.map(async (collection) => {
    const query = new URLSearchParams({ collections: collection, bbox: bbox.join(","), limit: "12" });
    const response = await fetch(`${api}/search?${query}`, { signal });
    if (!response.ok) throw Error("USGS terrain catalog unavailable");
    const data = await response.json() as { features: Item[] };
    return data.features.map((item) => product({ ...item, collection })).filter((item): item is DroneArchiveProduct =>
      !!item && containsTerrain(item.bounds, point));
  }));
  signal.throwIfAborted();
  return results.flatMap((result) => result.status === "fulfilled" ? result.value : []).sort((a, b) => a.spacing - b.spacing);
}

const pointIn = (bounds: Bounds, row: number, col: number, size: number) => ({
  lat: bounds.north - (bounds.north - bounds.south) * ((row + .5) / size),
  lon: bounds.west + (bounds.east - bounds.west) * ((col + .5) / size),
});

export async function readArchiveRaster(url: string, bounds: Bounds, size: number, signal: AbortSignal) {
  const options = { allowFullFile: false, blockSize: 65536, maxRanges: 1 };
  const tiff = await fromUrl(url, options, signal);
  const image = await tiff.getImage();
  const keys = image.getGeoKeys();
  if (!keys || keys.ProjFalseEastingGeoKey || keys.ProjFalseNorthingGeoKey || keys.GeogPrimeMeridianLongGeoKey) {
    throw Error("Unsupported Mars terrain projection");
  }
  let project: (point: LatLon) => [number, number];
  if (keys.ProjCoordTransGeoKey === 17 && !keys.ProjCenterLatGeoKey) {
    const xFactor = metresPerDegree * Math.cos((keys.ProjStdParallel1GeoKey ?? 0) * radians);
    project = ({ lon, lat }) => [(lon - (keys.ProjCenterLongGeoKey ?? 0)) * xFactor, lat * metresPerDegree];
  } else if (keys.ProjCoordTransGeoKey === 15 && Math.abs(keys.ProjNatOriginLatGeoKey) === 90) {
    const pole = Math.sign(keys.ProjNatOriginLatGeoKey);
    const central = keys.ProjStraightVertPoleLongGeoKey ?? 0;
    project = ({ lon, lat }) => {
      const rho = 2 * MARS_RADIUS_KM * 1000 * (keys.ProjScaleAtNatOriginGeoKey ?? 1) * Math.tan((90 - pole * lat) * radians / 2);
      const theta = (lon - central) * radians;
      return [rho * Math.sin(theta), -pole * rho * Math.cos(theta)];
    };
  } else throw Error("Unsupported Mars terrain projection");

  const [west, , , north] = image.getBoundingBox();
  const [sx, sy] = image.getResolution();
  if (!(sx > 0 && sy < 0)) throw Error("Unsupported terrain raster orientation");
  const columns = new Int32Array(size * size), rows = new Int32Array(size * size);
  let left = image.getWidth(), right = -1, top = image.getHeight(), bottom = -1;
  for (let i = 0; i < columns.length; i++) {
    const [x, y] = project(pointIn(bounds, Math.floor(i / size), i % size, size));
    const col = columns[i] = Math.floor((x - west) / sx);
    const row = rows[i] = Math.floor((y - north) / sy);
    if (col < 0 || col >= image.getWidth() || row < 0 || row >= image.getHeight()) continue;
    left = Math.min(left, col); right = Math.max(right, col);
    top = Math.min(top, row); bottom = Math.max(bottom, row);
  }
  if (right < left || bottom < top) throw Error("Raster does not cover this point");
  const width = right - left + 1, height = bottom - top + 1;
  if (width * height > 3_000_000) throw Error("The requested archive crop is too large");
  const values = await image.readRasters({ window: [left, top, right + 1, bottom + 1], samples: [0], interleave: true, signal });
  const noData = image.getGDALNoData(), metadata = await image.getGDALMetadata(0);
  const scale = Number(metadata?.SCALE ?? metadata?.scale ?? 1), offset = Number(metadata?.OFFSET ?? metadata?.offset ?? 0);
  if (!Number.isFinite(scale) || !Number.isFinite(offset)) throw Error("Unknown terrain scale");
  return Float32Array.from(columns, (col, i) => {
    const row = rows[i];
    if (col < left || col > right || row < top || row > bottom) return NaN;
    const value = values[(row - top) * width + col - left];
    return value === noData ? NaN : value * scale + offset;
  });
}

export function archiveWindow(point: LatLon, spacing: number): Bounds {
  const halfLat = spacing * archiveElevationSize / (2 * metresPerDegree);
  const halfLon = halfLat / Math.max(.13, Math.cos(point.lat * radians));
  return { west: Math.max(-180, point.lon - halfLon), south: Math.max(-90, point.lat - halfLat),
    east: Math.min(180, point.lon + halfLon), north: Math.min(90, point.lat + halfLat) };
}

export async function archiveOrtho(url: string, bounds: Bounds, signal: AbortSignal) {
  const size = 256;
  const values = await readArchiveRaster(url, bounds, size, signal);
  const center = values[(size / 2) * size + size / 2];
  if (!Number.isFinite(center)) throw Error("No orbital image at the requested point");
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(size, size);
  const sorted = values.filter(Number.isFinite).sort();
  const lo = sorted[Math.floor(sorted.length * .02)], hi = sorted[Math.floor(sorted.length * .98)];
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) continue;
    const value = (values[i] - lo) / Math.max(1, hi - lo) * 255;
    image.data.set([value, value, value, 255], i * 4);
  }
  context.putImageData(image, 0, 0);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(Error("Could not encode orbital image"))));
}
