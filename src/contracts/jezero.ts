import { fromArrayBuffer } from "geotiff";
import manifest from "../../data/mars/jezero/sources.json" with { type: "json" };
import { MARS_EQUIRECTANGULAR } from "./coordinates.ts";
export { jezeroWaypoint } from "./jezeroWaypoint.ts";
import type { RasterLayout } from "./coordinates.ts";
import type { MapLayer, Provenance } from "./index.ts";

type RasterKind = "elevation" | "imagery";
type JezeroLayer<K extends RasterKind> = Extract<MapLayer, { status: "available"; kind: K }>;

function rasterProvenance(kind: RasterKind): Provenance {
  const source = manifest[kind];
  return {
    mission: source.mission,
    instrument: source.instrument,
    sources: [{ title: "USGS source and credits", url: source.catalog }],
    limitations: kind === "elevation"
      ? [
          "Stereo elevation at 1 m projected spacing can miss smaller obstacles.",
          "Elevations have stereo reconstruction uncertainty.",
        ]
      : [
          "8-bit grayscale digital numbers at 0.25 m projected spacing.",
          "Acquisition dates vary across the source mosaic.",
        ],
  };
}

export function decodeJezeroRaster(bytes: ArrayBuffer, kind: "elevation"): Promise<JezeroLayer<"elevation">>;
export function decodeJezeroRaster(bytes: ArrayBuffer, kind: "imagery"): Promise<JezeroLayer<"imagery">>;
export async function decodeJezeroRaster(bytes: ArrayBuffer, kind: RasterKind): Promise<JezeroLayer<RasterKind>> {
  const tiff = await fromArrayBuffer(bytes);
  const image = await tiff.getImage();
  const [westM, southM, eastM, northM] = manifest.region.bounds_m;
  const source = manifest[kind];
  const pixelSizeM = source.spacing_m;
  const width = (eastM - westM) / pixelSizeM;
  const height = (northM - southM) / pixelSizeM;
  const layout: RasterLayout = { westM, northM, pixelSizeM, width, height };
  const [x, y] = await image.getOrigin();
  const [dx, dy] = await image.getResolution();
  const noData = await image.getGDALNoData();
  const keys = image.getGeoKeys();
  const radius = MARS_EQUIRECTANGULAR.radiusM;

  // #10 stores invalid samples as the sentinel in one north-up, pixel-is-area band.
  if (await tiff.getImageCount() !== 1 || image.getSamplesPerPixel() !== 1 ||
      x !== westM || y !== northM || dx !== pixelSizeM || dy !== -pixelSizeM ||
      image.getWidth() !== width || image.getHeight() !== height ||
      image.getFileDirectory().hasTag("ModelTransformation") || noData !== source.no_data ||
      keys?.GTRasterTypeGeoKey !== 1 || keys.ProjCoordTransGeoKey !== 17 ||
      keys.GeogSemiMajorAxisGeoKey !== radius || keys.GeogSemiMinorAxisGeoKey !== radius ||
      keys.GeogPrimeMeridianLongGeoKey !== 0 || keys.ProjLinearUnitsGeoKey !== 9001 ||
      keys.ProjStdParallel1GeoKey !== 0 || keys.ProjCenterLongGeoKey !== 0 ||
      keys.ProjCenterLatGeoKey !== 0 || keys.ProjFalseEastingGeoKey !== 0 || keys.ProjFalseNorthingGeoKey !== 0) {
    throw new Error(`Unexpected Jezero ${kind} GeoTIFF metadata.`);
  }

  const samples = await image.readRasters({ samples: [0], interleave: true });
  const provenance = rasterProvenance(kind);
  if (kind === "imagery" && samples instanceof Uint8Array) {
    return {
      id: "jezero-imagery", label: "HiRISE optical imagery", status: "available", kind,
      layout, grayscaleDn: samples, noDataDn: noData, provenance,
    };
  }
  if (kind === "elevation" && samples instanceof Float32Array) {
    for (let index = 0; index < samples.length; index++) {
      if (!Number.isFinite(samples[index]) || samples[index] === noData) samples[index] = NaN;
    }
    return {
      id: "jezero-elevation", label: "HiRISE stereo elevation", status: "available", kind, provenance,
      terrain: { layout, elevationsM: samples, verticalDatum: source.unit, provenance },
    };
  }
  throw new Error(`Unexpected Jezero ${kind} sample type.`);
}
