import * as THREE from "three";
import { MARS_RADIUS_KM, wrapLon } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import { globeSurface } from "./galeTerrain.ts";
import type { SurfaceTerrain } from "./galeTerrain.ts";

import { containsTerrain, exportUrl, globalSource, raster, readTrekElevation, regionalOnlineSources, viking, windowBounds } from "./marsTrekTerrain.ts";
import type { Bounds, TerrainSource } from "./marsTrekTerrain.ts";
import { archiveElevationSize, archiveOrtho, archiveWindow, findDroneProducts, readArchiveRaster } from "./usgsDroneTerrain.ts";
import type { DronePixels } from "./usgsDroneTerrain.ts";
import { readSavedDroneWindows } from "./dronePacks.ts";

export interface OnlineTerrain extends SurfaceTerrain {
  bounds: Bounds;
  label: string;
  spacing: number;
  imagery: string;
  flightHeight: number;
  completeElevation: boolean;
  pixels: DronePixels;
  saved?: boolean;
}

const trekPicture = (service: string, bounds: Bounds, signal: AbortSignal) =>
  raster(exportUrl(service, bounds, 512, false), signal).then((response) => response.blob());
const vikingLabel = "Viking imagery · ~232 m";

async function terrainMesh(pixels: DronePixels, point: LatLon, signal: AbortSignal): Promise<OnlineTerrain> {
  const { bounds, heights, label, spacing, imagery, flightHeight } = pixels;
  const { west, south, east, north } = bounds;
  const size = archiveElevationSize;
  const bitmap = await createImageBitmap(pixels.picture);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  signal.throwIfAborted();
  const sample = (p: LatLon) => {
    if (!containsTerrain(bounds, p)) return null;
    const col = Math.max(0, Math.min(size - 1, (p.lon - west) / (east - west) * size - .5));
    const row = Math.max(0, Math.min(size - 1, (north - p.lat) / (north - south) * size - .5));
    const x = Math.floor(col), y = Math.floor(row), dx = col - x, dy = row - y;
    const right = Math.min(size - 1, x + 1), below = Math.min(size - 1, y + 1);
    const top = THREE.MathUtils.lerp(heights[y * size + x], heights[y * size + right], dx);
    const bottom = THREE.MathUtils.lerp(heights[below * size + x], heights[below * size + right], dx);
    const value = THREE.MathUtils.lerp(top, bottom, dy);
    return Number.isFinite(value) ? value : null;
  };
  const verifiedImagery = (p: LatLon) => {
    if (!containsTerrain(bounds, p)) return false;
    const x = Math.floor((p.lon - west) / (east - west) * canvas.width);
    const y = Math.min(canvas.height - 1, Math.floor((north - p.lat) / (north - south) * canvas.height));
    return rgba[(y * canvas.width + x) * 4 + 3] > 0;
  };
  if (sample(point) === null || !verifiedImagery(point)) throw Error("This source has no overlapping pixels at this location");
  const geometry = new THREE.PlaneGeometry(2, 2, 128, 128);
  const positions = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
  const valid = new Uint8Array(positions.count);
  for (let i = 0; i < positions.count; i++) {
    const latitude = THREE.MathUtils.lerp(south, north, uv.getY(i));
    const longitude = THREE.MathUtils.lerp(west, east, uv.getX(i));
    const height = sample({ lat: Math.max(south + 1e-9, latitude), lon: Math.min(east - 1e-9, longitude) });
    const vector = globeSurface({ lat: latitude, lon: longitude }, (height ?? 0) + 9_000);
    positions.setXYZ(i, vector.x, vector.y, vector.z);
    valid[i] = height === null ? 0 : 1;
  }
  const triangles = geometry.index!.array;
  const covered: number[] = [];
  for (let i = 0; i < triangles.length; i += 3) {
    if (valid[triangles[i]] && valid[triangles[i + 1]] && valid[triangles[i + 2]]) {
      covered.push(triangles[i], triangles[i + 1], triangles[i + 2]);
    }
  }
  geometry.setIndex(covered);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { geometry, texture, sample, verifiedImagery, bounds, label, spacing, imagery, flightHeight, pixels,
    completeElevation: valid.every(Boolean), uv: new THREE.Vector4((west + 180) / 360, (south + 90) / 180, (east + 180) / 360, (north + 90) / 180) };
}

async function loadTerrain(source: TerrainSource, point: LatLon, signal: AbortSignal) {
  const bounds = windowBounds(source, point);
  const [heights, picture] = await Promise.all([readTrekElevation(source, bounds, archiveElevationSize, signal), trekPicture(source.image, bounds, signal)]);
  return terrainMesh({ bounds, heights, picture, label: source.label, spacing: source.spacing, flightHeight: source.height,
    imagery: source.image === viking ? vikingLabel : source.label.startsWith("InSight") ? "CTX imagery" : "HiRISE imagery",
    source: "https://trek.nasa.gov/mars/" }, point, signal);
}

export async function loadBundledDroneTerrain(center: LatLon, basemap: HTMLImageElement,
  elevationAt: (lat: number, lon: number) => number | null, signal: AbortSignal): Promise<OnlineTerrain> {
  const point = { lat: Math.max(-89.99999, Math.min(89.99999, center.lat)), lon: wrapLon(center.lon) };
  const bounds = windowBounds({ ...globalSource, south: -90, east: 180, span: 16 }, point);
  const size = archiveElevationSize;
  const heights = new Float32Array(size * size);
  // The bundled MOLA raster has 4 cells per degree. Resample its cell centres
  // for the mesh and keep the source spacing on the flight readout.
  const at = (row: number, col: number) => elevationAt(90 - (row + 0.5) / 4, wrapLon((col + 0.5) / 4 - 180));
  for (let row = 0; row < size; row++) {
    const lat = THREE.MathUtils.lerp(bounds.north, bounds.south, (row + .5) / size);
    for (let col = 0; col < size; col++) {
      const lon = THREE.MathUtils.lerp(bounds.west, bounds.east, (col + .5) / size);
      const rowIndex = Math.max(0, Math.min(719, (90 - lat) * 4 - 0.5));
      const colIndex = (lon + 180) * 4 - 0.5;
      const y = Math.floor(rowIndex), x = Math.floor(colIndex);
      const a = at(y, x), b = at(y, x + 1), c = at(Math.min(y + 1, 719), x), d = at(Math.min(y + 1, 719), x + 1);
      heights[row * size + col] = a == null || b == null || c == null || d == null ? NaN
        : THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, colIndex - x), THREE.MathUtils.lerp(c, d, colIndex - x), rowIndex - y);
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const sx = (bounds.west + 180) / 360 * basemap.naturalWidth, sy = (90 - bounds.north) / 180 * basemap.naturalHeight;
  const sw = (bounds.east - bounds.west) / 360 * basemap.naturalWidth, sh = (bounds.north - bounds.south) / 180 * basemap.naturalHeight;
  canvas.getContext("2d")!.drawImage(basemap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const picture = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(Error("Could not prepare Viking imagery.")), "image/webp"));
  return terrainMesh({ bounds, heights, picture, label: "Offline global MOLA", spacing: Math.round(MARS_RADIUS_KM * Math.PI / 720 * 1000),
    imagery: "Bundled Viking imagery", flightHeight: 18_000, source: "https://fdp.astrogeology.usgs.gov/fdp/mars/" }, point, signal);
}

async function readSavedDroneWindow(point: LatLon, signal: AbortSignal) {
  for (const pixels of await readSavedDroneWindows(point)) {
    try { return { ...await terrainMesh(pixels, point, signal), saved: true }; }
    catch { signal.throwIfAborted(); }
  }
  return null;
}

async function loadArchiveTerrain(point: LatLon, signal: AbortSignal) {
  // Give unresponsive services a short budget before continuing with Mars Trek.
  const timeboxed = AbortSignal.any([signal, AbortSignal.timeout(18_000)]);
  const products = await findDroneProducts(point, timeboxed);
  for (const product of products.slice(0, 6)) {
    const scope = AbortSignal.any([timeboxed, AbortSignal.timeout(11_000)]);
    try {
      const bounds = archiveWindow(point, product.spacing);
      const raw = await readArchiveRaster(product.elevation, bounds, archiveElevationSize, scope);
      const heights = Float32Array.from(raw, (z) => z > -20_000 && z < 30_000 ? z : NaN);
      if (!Number.isFinite(heights[archiveElevationSize * (archiveElevationSize / 2) + archiveElevationSize / 2])) continue;
      let picture: Blob | undefined;
      for (const href of product.images.slice(0, 2)) {
        try { picture = await archiveOrtho(href, bounds, AbortSignal.any([scope, AbortSignal.timeout(2200)])); break; }
        catch { timeboxed.throwIfAborted(); }
      }
      const imagery = picture ? `${product.label} orbital image` : vikingLabel;
      picture ??= await trekPicture(viking, bounds, timeboxed);
      return await terrainMesh({ bounds, heights, picture, imagery, label: `${product.label} · ${product.id}`,
        spacing: product.spacing, flightHeight: Math.max(30, product.spacing * 5), source: product.source }, point, timeboxed);
    } catch { if (timeboxed.aborted) break; }
  }
  return null;
}

export async function loadOnlineTerrain(center: LatLon, signal: AbortSignal, searchArchive = false): Promise<OnlineTerrain> {
  const point = { lat: Math.max(globalSource.south + 1e-6, Math.min(89.9999, center.lat)),
    lon: Math.min(globalSource.east - 1e-6, wrapLon(center.lon)) };
  if (searchArchive) {
    const saved = await readSavedDroneWindow(point, signal).catch(() => null);
    if (saved) return saved;
    if (!navigator.onLine) throw Error("Online terrain unavailable.");
    const detail = await loadArchiveTerrain(point, signal).catch(() => null);
    if (detail) return detail;
    signal.throwIfAborted();
  }
  const source = regionalOnlineSources.find((candidate) => containsTerrain(candidate, point));
  if (source) {
    try { return await loadTerrain(source, point, signal); }
    catch { signal.throwIfAborted(); }
  }
  return loadTerrain(globalSource, point, AbortSignal.any([signal, AbortSignal.timeout(9000)]));
}
