import * as THREE from "three";
import { latLonToUnit, MARS_RADIUS_KM } from "./geo.ts";
import type { LatLon } from "./geo.ts";
import { galeBounds, galeElevationFile, galeLayout, metresPerDegree, nearGale } from "./galeLayout.ts";
import { projectMars, unprojectMars } from "../contracts/coordinates.ts";
import { ELEVATION_LAYOUT } from "../data/sites.ts";

const side = galeLayout.width;
const spacing = galeLayout.pixelSizeM;
const { west, east, north, south } = galeBounds;
export const galeUv = new THREE.Vector4(
  (west / metresPerDegree + 180) / 360, (south / metresPerDegree + 90) / 180,
  (east / metresPerDegree + 180) / 360, (north / metresPerDegree + 90) / 180,
);

export function globeSurface(point: LatLon, elevationM: number) {
  const radius = 1 + elevationM / (MARS_RADIUS_KM * 1000);
  return new THREE.Vector3(...latLonToUnit(point)).multiplyScalar(radius);
}

export interface SurfaceTerrain {
  geometry: THREE.BufferGeometry;
  texture: THREE.Texture;
  uv: THREE.Vector4;
  sample: (point: LatLon) => number | null;
  verifiedImagery?: (point: LatLon) => boolean;
}

export async function loadGaleTerrain(): Promise<SurfaceTerrain> {
  const response = await fetch(galeElevationFile);
  if (!response.ok) throw new Error("Gale elevation data unavailable.");
  const heights = new Float32Array(await response.arrayBuffer());
  if (heights.length !== side * side) throw new Error("Unexpected Gale elevation dimensions.");
  const sample = (point: LatLon) => {
    if (!nearGale(point)) return null;
    const col = Math.max(0, Math.min(side - 1, (point.lon * metresPerDegree - west) / spacing - 0.5));
    const row = Math.max(0, Math.min(side - 1, (north - point.lat * metresPerDegree) / spacing - 0.5));
    const x = Math.floor(col), y = Math.floor(row);
    const a = col - x, b = row - y;
    const x1 = Math.min(side - 1, x + 1), y1 = Math.min(side - 1, y + 1);
    return (1 - b) * ((1 - a) * heights[y * side + x] + a * heights[y * side + x1]) +
      b * ((1 - a) * heights[y1 * side + x] + a * heights[y1 * side + x1]);
  };
  const geometry = new THREE.PlaneGeometry(2, 2, 155, 155);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < position.count; i++) {
    const point = { lon: (west + uv.getX(i) * (east - west)) / metresPerDegree,
      lat: (south + uv.getY(i) * (north - south)) / metresPerDegree };
    const p = globeSurface(point, (sample(point) ?? 0) + 9_000);
    position.setXYZ(i, p.x, p.y, p.z);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  try {
    const texture = await new THREE.TextureLoader().loadAsync("./layers/regional/gale-terrain.webp");
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const image = texture.image as HTMLImageElement;
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const verifiedImagery = (point: LatLon) => {
      const x = Math.floor((point.lon * metresPerDegree - west) / (east - west) * canvas.width);
      const y = Math.floor((north - point.lat * metresPerDegree) / (north - south) * canvas.height);
      return x >= 0 && x < canvas.width && y >= 0 && y < canvas.height && rgba[(y * canvas.width + x) * 4 + 3] > 0;
    };
    return { geometry, texture, sample, verifiedImagery, uv: galeUv };
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}

export function nearWildcat(point: LatLon, padding = 0) {
  const { xM, yM } = projectMars({ longitudeEastDeg: point.lon, latitudePlanetocentricDeg: point.lat });
  const { westM, northM, width, height, pixelSizeM } = ELEVATION_LAYOUT;
  return xM >= westM - padding && xM <= westM + width * pixelSizeM + padding &&
    yM <= northM + padding && yM >= northM - height * pixelSizeM - padding;
}

export async function loadWildcatTerrain(): Promise<SurfaceTerrain> {
  const [{ decodeJezeroRaster }, { default: elevationUrl }, { default: imageryUrl }] = await Promise.all([
    import("../contracts/jezero.ts"), import("../../data/mars/jezero/elevation.tif?url"), import("../../data/mars/jezero/imagery.tif?url"),
  ]);
  const read = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Wildcat Ridge terrain file unavailable.");
    return response.arrayBuffer();
  };
  const [elevation, imagery] = await Promise.all([
    read(elevationUrl).then((bytes) => decodeJezeroRaster(bytes, "elevation")),
    read(imageryUrl).then((bytes) => decodeJezeroRaster(bytes, "imagery")),
  ]);
  const { layout, elevationsM } = elevation.terrain;
  const eastM = layout.westM + layout.width * layout.pixelSizeM;
  const southM = layout.northM - layout.height * layout.pixelSizeM;
  const toPoint = (xM: number, yM: number) => {
    const { latitudePlanetocentricDeg: lat, longitudeEastDeg: lon } = unprojectMars({ xM, yM });
    return { lat, lon };
  };
  const sw = toPoint(layout.westM, southM), ne = toPoint(eastM, layout.northM);
  const sample = (point: LatLon) => {
    const { xM, yM } = projectMars({ longitudeEastDeg: point.lon, latitudePlanetocentricDeg: point.lat });
    if (xM < layout.westM || xM > eastM || yM < southM || yM > layout.northM) return null;
    const x = THREE.MathUtils.clamp((xM - layout.westM) / layout.pixelSizeM - 0.5, 0, layout.width - 1);
    const y = THREE.MathUtils.clamp((layout.northM - yM) / layout.pixelSizeM - 0.5, 0, layout.height - 1);
    const a = Math.floor(x), b = Math.floor(y);
    const c = Math.min(a + 1, layout.width - 1), d = Math.min(b + 1, layout.height - 1);
    const top = THREE.MathUtils.lerp(elevationsM[b * layout.width + a], elevationsM[b * layout.width + c], x - a);
    const bottom = THREE.MathUtils.lerp(elevationsM[d * layout.width + a], elevationsM[d * layout.width + c], x - a);
    const z = THREE.MathUtils.lerp(top, bottom, y - b);
    return Number.isFinite(z) ? z : null;
  };
  const geometry = new THREE.PlaneGeometry(2, 2, 192, 192);
  const positions = geometry.getAttribute("position");
  const coordinates = geometry.getAttribute("uv");
  const valid = new Uint8Array(positions.count);
  for (let i = 0; i < positions.count; i++) {
    const point = toPoint(THREE.MathUtils.lerp(layout.westM, eastM, coordinates.getX(i)), THREE.MathUtils.lerp(southM, layout.northM, coordinates.getY(i)));
    const height = sample(point);
    valid[i] = height === null ? 0 : 1;
    const p = globeSurface(point, (height ?? 0) + 9_000);
    positions.setXYZ(i, p.x, p.y, p.z);
  }
  const triangles = geometry.index!.array;
  const covered: number[] = [];
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2];
    if (valid[a] && valid[b] && valid[c]) covered.push(a, b, c);
  }
  geometry.setIndex(covered);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const canvas = document.createElement("canvas");
  canvas.width = imagery.layout.width;
  canvas.height = imagery.layout.height;
  const ctx = canvas.getContext("2d")!;
  const rgba = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < imagery.grayscaleDn.length; i++) {
    const value = imagery.grayscaleDn[i];
    rgba.data.set([value, value, value, value === imagery.noDataDn ? 0 : 255], i * 4);
  }
  ctx.putImageData(rgba, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const verifiedImagery = (point: LatLon) => {
    const { xM, yM } = projectMars({ longitudeEastDeg: point.lon, latitudePlanetocentricDeg: point.lat });
    const x = Math.floor((xM - layout.westM) / (eastM - layout.westM) * canvas.width);
    const y = Math.floor((layout.northM - yM) / (layout.northM - southM) * canvas.height);
    return x >= 0 && x < canvas.width && y >= 0 && y < canvas.height && rgba.data[(y * canvas.width + x) * 4 + 3] > 0;
  };
  return { geometry, texture, sample, verifiedImagery,
    uv: new THREE.Vector4((sw.lon + 180) / 360, (sw.lat + 90) / 180, (ne.lon + 180) / 360, (ne.lat + 90) / 180) };
}
