import { ELEVATION_LAYOUT } from "../data/sites.ts";
import { projectMars, unprojectMars } from "../contracts/coordinates.ts";
import { galeLayout, nearGale } from "./galeLayout.ts";
import { publicUrl } from "./data.ts";
import type { LatLon } from "./geo.ts";

export function localMapRegion(point: LatLon) {
  const { xM, yM } = projectMars({ latitudePlanetocentricDeg: point.lat, longitudeEastDeg: point.lon });
  const l = ELEVATION_LAYOUT;
  if (xM >= l.westM - 1000 && xM <= l.westM + l.width * l.pixelSizeM + 1000 && yM <= l.northM + 1000 && yM >= l.northM - l.height * l.pixelSizeM - 1000) return "wildcat";
  return nearGale(point, 10000) ? "gale" : null;
}
export type LocalMapRegion = NonNullable<ReturnType<typeof localMapRegion>>;
const cache = new Map<LocalMapRegion, Promise<{ image: CanvasImageSource; northwest: LatLon; southeast: LatLon }>>();
export function loadLocalMapImagery(region: LocalMapRegion) {
  const cached = cache.get(region);
  if (cached) return cached;
  const promise = (async () => {
    const layout = region === "wildcat" ? ELEVATION_LAYOUT : galeLayout;
    const point = (xM: number, yM: number) => { const { latitudePlanetocentricDeg: lat, longitudeEastDeg: lon } = unprojectMars({ xM, yM }); return { lat, lon }; };
    const northwest = point(layout.westM, layout.northM);
    const southeast = point(layout.westM + layout.width * layout.pixelSizeM, layout.northM - layout.height * layout.pixelSizeM);
    if (region === "gale") {
      const image = new Image(); image.src = publicUrl("layers/regional/gale-terrain.webp");
      await image.decode(); return { image, northwest, southeast };
    }
    const [{ decodeJezeroRaster }, { default: url }] = await Promise.all([import("../contracts/jezero.ts"), import("../../data/mars/jezero/imagery.tif?url")]);
    const response = await fetch(url); if (!response.ok) throw Error("Local imagery unavailable");
    const data = await decodeJezeroRaster(await response.arrayBuffer(), "imagery");
    const canvas = document.createElement("canvas"); canvas.width = data.layout.width; canvas.height = data.layout.height;
    const context = canvas.getContext("2d")!; const rgba = context.createImageData(canvas.width, canvas.height);
    data.grayscaleDn.forEach((value, i) => rgba.data.set([value, value, value, value === data.noDataDn ? 0 : 255], i * 4));
    context.putImageData(rgba, 0, 0); return { image: canvas, northwest, southeast };
  })();
  cache.set(region, promise); void promise.catch(() => cache.delete(region)); return promise;
}
