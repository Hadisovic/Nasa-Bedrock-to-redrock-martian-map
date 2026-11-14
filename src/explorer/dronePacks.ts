import type { DronePixels } from "./usgsDroneTerrain.ts";
import type { Bounds } from "./marsTrekTerrain.ts";
import type { LatLon } from "./geo.ts";
import { archiveElevationSize } from "./usgsDroneTerrain.ts";
import { containsTerrain } from "./marsTrekTerrain.ts";

const cacheName = "martian-map-drone-windows-v1";
const prefix = () => new URL("./__drone_window__/", window.location.href).href;

type PackMetadata = Omit<DronePixels, "heights" | "picture">;
export type SavedDronePack = { key: string; label: string; spacing: number; bounds: Bounds };

async function installedPacks(cache: Cache) {
  const start = prefix();
  const packs: SavedDronePack[] = [];
  for (const request of await cache.keys()) {
    if (!request.url.startsWith(start)) continue;
    try {
      const values = JSON.parse(decodeURIComponent(request.url.slice(start.length)));
      if (values.length === 3) {
        const [label, spacing, bounds] = values;
        packs.push({ key: request.url, label, spacing, bounds });
      } else {
        const response = await cache.match(request);
        if (!response) continue;
        const metadata = readHeader(await response.arrayBuffer()).metadata;
        packs.push({ key: request.url, label: metadata.label, spacing: metadata.spacing, bounds: metadata.bounds });
      }
    } catch { /* An incomplete cache entry is not a terrain pack. */ }
  }
  return packs;
}

export async function listSavedDroneWindows() {
  if (typeof caches === "undefined") return [];
  if (!(await caches.has(cacheName))) return [];
  return installedPacks(await caches.open(cacheName));
}

export async function saveDroneWindow({ heights, picture, ...metadata }: DronePixels) {
  const cache = await caches.open(cacheName);
  const key = prefix() + encodeURIComponent(JSON.stringify([metadata.label, metadata.spacing, metadata.bounds]));
  const encoded = new TextEncoder().encode(JSON.stringify(metadata));
  const length = new ArrayBuffer(4);
  new DataView(length).setUint32(0, encoded.length);
  await cache.put(key, new Response(new Blob([length, encoded, heights.slice().buffer, picture])));
}

function readHeader(buffer: ArrayBuffer) {
  const headerEnd = 4 + new DataView(buffer).getUint32(0);
  const pictureStart = headerEnd + archiveElevationSize ** 2 * 4;
  if (pictureStart >= buffer.byteLength) throw Error("Incomplete terrain pack");
  const metadata = JSON.parse(new TextDecoder().decode(buffer.slice(4, headerEnd))) as PackMetadata;
  return { metadata, headerEnd, pictureStart };
}

export async function readSavedDroneWindows(point: LatLon): Promise<DronePixels[]> {
  if (typeof caches === "undefined" || !(await caches.has(cacheName))) return [];
  const cache = await caches.open(cacheName);
  const packs = (await installedPacks(cache)).filter(({ bounds }) => containsTerrain(bounds, point)).sort((a, b) => a.spacing - b.spacing);
  const matches: DronePixels[] = [];
  for (const pack of packs) {
    const response = await cache.match(pack.key);
    if (!response) continue;
    try {
      const buffer = await response.arrayBuffer();
      const { metadata, headerEnd, pictureStart } = readHeader(buffer);
      matches.push({ ...metadata, heights: new Float32Array(buffer.slice(headerEnd, pictureStart)),
        picture: new Blob([buffer.slice(pictureStart)]) });
    } catch { /* Skip unreadable packs and use the next available source. */ }
  }
  return matches;
}
