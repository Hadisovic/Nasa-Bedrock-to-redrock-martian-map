import type { LayerEntry } from "./catalog.ts";
import type { LatLon } from "./geo.ts";
import { imageBounds } from "./catalog.ts";
import { publicUrl } from "./data.ts";

/** The TES layer is a regional display index. Compare mapped classes without inferring a local dust measurement. */
export async function loadDustCover(layer: LayerEntry) {
  const image = new Image();
  image.src = publicUrl(layer.file);
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const stops = layer.legend?.stops ?? [];
  const colours = stops.map(({ color }) => [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16)));
  const bounds = imageBounds(layer);
  return (point: LatLon) => {
    if (point.lat < layer.coverage.south || point.lat > layer.coverage.north ||
      point.lon < layer.coverage.west || point.lon > layer.coverage.east) return null;
    const x = Math.floor((point.lon - bounds.west) / (bounds.east - bounds.west) * canvas.width);
    const y = Math.floor((bounds.north - point.lat) / (bounds.north - bounds.south) * canvas.height);
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return null;
    const offset = (y * canvas.width + x) * 4;
    if (data[offset + 3] < 250) return null;
    const scores = colours.map((rgb) => Math.hypot(...rgb.map((channel, i) => channel - data[offset + i])));
    const index = scores.indexOf(Math.min(...scores));
    return index >= 0 && scores[index] <= 80 && typeof stops[index].value === "number" ? Number(stops[index].value) : null;
  };
}
