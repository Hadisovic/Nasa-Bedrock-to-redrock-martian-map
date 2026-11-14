import { localRoughness } from "../analysis/terrainCost.ts";
import { ELEVATION_LAYOUT } from "../data/sites.ts";
import { galeElevationFile, galeLayout } from "./galeLayout.ts";
import { droneSites } from "./droneCoverage.ts";
import type { GlobeOverlay } from "./types.ts";

const grids = new Map<string, Promise<{ layout: typeof galeLayout; heights: Float32Array }>>();
export async function terrainHazardOverlays(limit: number, kind: "slope" | "roughness"): Promise<GlobeOverlay[]> {
  const load = async (site: typeof droneSites[number]) => {
    if (site.id === "wildcat") {
      const [{ decodeJezeroRaster }, { default: url }] = await Promise.all([
        import("../contracts/jezero.ts"), import("../../data/mars/jezero/elevation.tif?url"),
      ]);
      const response = await fetch(url);
      if (!response.ok) throw Error("Wildcat elevation unavailable");
      const { terrain } = await decodeJezeroRaster(await response.arrayBuffer(), "elevation");
      return { layout: ELEVATION_LAYOUT, heights: terrain.elevationsM };
    }
    const response = await fetch(galeElevationFile);
    if (!response.ok) throw Error("Gale elevation unavailable");
    return { layout: galeLayout, heights: new Float32Array(await response.arrayBuffer()) };
  };
  const sites = droneSites.filter(({ id }) => id === "wildcat" || (kind === "slope" && id === "gale"));
  const results = await Promise.allSettled(sites.map(async (site): Promise<GlobeOverlay> => {
    let request = grids.get(site.id);
    if (!request) { request = load(site).catch((error) => { grids.delete(site.id); throw error; }); grids.set(site.id, request); }
    const { layout, heights } = await request;
    const { width, height, pixelSizeM: step } = layout;
    if (heights.length !== width * height) throw Error("Invalid terrain dimensions");
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const pixels = ctx.createImageData(width, height);
    const roughness = kind === "roughness" ? localRoughness(heights, width, height, step) : undefined;
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
      const i = row * width + col, z = heights[i];
      if (roughness) {
        const value = roughness[i];
        const color = !Number.isFinite(value) ? [154, 151, 174, 185]
          : value >= 0.66 ? [239, 56, 45, 205] : value >= 0.33 ? [255, 199, 70, 155] : [51, 211, 173, 125];
        pixels.data.set(color, i * 4);
        continue;
      }
      let max = 0, moves = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = col + dx, y = row + dy;
        if ((!dx && !dy) || x < 0 || x >= width || y < 0 || y >= height || !Number.isFinite(z)) continue;
        const other = heights[y * width + x];
        if (!Number.isFinite(other) || (dx && dy && (!Number.isFinite(heights[i + dx]) || !Number.isFinite(heights[i + dy * width])))) continue;
        const midLat = site.north - (row + 0.5 + dy / 2) * (site.north - site.south) / height;
        const east = step * Math.cos(midLat * Math.PI / 180);
        max = Math.max(max, Math.atan2(Math.abs(other - z), Math.hypot(dx * east, dy * step)) * 180 / Math.PI);
        moves++;
      }
      if (!moves) pixels.data.set([154, 151, 174, 185], i * 4);
      else if (max > limit) pixels.data.set([239, 56, 45, 205], i * 4);
      else if (max > limit * .55) pixels.data.set([255, 199, 70, 155], i * 4);
      else pixels.data.set([51, 211, 173, 125], i * 4);
    }
    ctx.putImageData(pixels, 0, 0);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    await image.decode();
    return { image, opacity: .65, entry: {
      id: kind + "-" + site.id, title: "Calculated " + kind + " · " + site.label, group: "hazards",
      treatment: "false-color", credit: "Calculated from NASA/USGS elevation",
      measures: kind === "slope" ? "Steepest adjoining measured step" : "Local relief index (0–1)",
      coverage: site, rasterBounds: site, global: false, file: "", width, height,
      legend: { type: "categorical" },
    } };
  }));
  return results.flatMap((r) => r.status === "fulfilled" ? [r.value] : []);
}
