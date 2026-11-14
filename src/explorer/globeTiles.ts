import type { GlobeView, TileSource } from "./types.ts";

/** Reuse the equirectangular tile matrix used by the flat map. Columns may cross the longitude seam. */
export function globeTileWindow(tiles: TileSource, view: GlobeView, width: number, height: number, dpr: number) {
  let level = 0;
  while (level < tiles.maxZoom && 256 * tiles.colsAt(level) / 360 < view.zoom * dpr) level++;

  const lonSpan = Math.min(120, width / view.zoom / Math.max(.3, Math.cos(view.lat * Math.PI / 180)) * .73);
  const latSpan = Math.min(65, height / view.zoom * .73);
  for (; level >= 0; level--) {
    const columns = tiles.colsAt(level), rows = tiles.rowsAt(level), degrees = 360 / columns;
    const left = Math.floor((view.lon + 180 - lonSpan) / degrees);
    const right = Math.floor((view.lon + 180 + lonSpan) / degrees);
    const top = Math.max(0, Math.floor((90 - view.lat - latSpan) / degrees));
    const bottom = Math.min(rows - 1, Math.floor((90 - view.lat + latSpan) / degrees));
    if ((right - left + 1) * (bottom - top + 1) <= 36 && right - left < columns) {
      return { level, columns, rows, left, right, top, bottom };
    }
  }
  return null;
}

const cache = new Map<string, Promise<HTMLImageElement>>();
function readTile(url: string) {
  const cached = cache.get(url);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
  cache.set(url, promise);
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  return promise;
}

export async function makeGlobeTileTexture(tiles: TileSource, window: NonNullable<ReturnType<typeof globeTileWindow>>) {
  const { level, columns, rows, left, right, top, bottom } = window;
  const canvas = document.createElement("canvas");
  canvas.width = (right - left + 1) * 256;
  canvas.height = (bottom - top + 1) * 256;
  const context = canvas.getContext("2d")!;
  const loads: Promise<void>[] = [];
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) {
      const url = tiles.url(level, row, ((col % columns) + columns) % columns);
      loads.push(readTile(url).then((image) => {
        context.drawImage(image, (col - left) * 256, (row - top) * 256, 256, 256);
      }));
    }
  }
  const settled = await Promise.allSettled(loads);
  if (!settled.some((result) => result.status === "fulfilled")) return null;
  return { canvas, bounds: [left / columns, 1 - (bottom + 1) / rows, (right + 1) / columns, 1 - top / rows] as const };
}
