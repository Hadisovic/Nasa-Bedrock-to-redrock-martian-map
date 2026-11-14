export const MARS_EQUIRECTANGULAR = {
  radiusM: 3_396_190,
  proj4: "+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +R=3396190 +units=m +no_defs",
} as const;

export interface MarsCoordinate {
  longitudeEastDeg: number;
  latitudePlanetocentricDeg: number;
}

export interface ProjectedPoint {
  xM: number;
  yM: number;
}

/** North-up grid. The origin is the outer northwest corner. */
export interface RasterLayout {
  westM: number;
  northM: number;
  pixelSizeM: number;
  width: number;
  height: number;
}

export interface RasterCell {
  row: number;
  column: number;
}

const metersPerDegree = MARS_EQUIRECTANGULAR.radiusM * Math.PI / 180;

export function projectMars(point: MarsCoordinate): ProjectedPoint {
  return {
    xM: point.longitudeEastDeg * metersPerDegree,
    yM: point.latitudePlanetocentricDeg * metersPerDegree,
  };
}

export function unprojectMars(point: ProjectedPoint): MarsCoordinate {
  return {
    longitudeEastDeg: point.xM / metersPerDegree,
    latitudePlanetocentricDeg: point.yM / metersPerDegree,
  };
}

export function cellAt(layout: RasterLayout, point: ProjectedPoint): RasterCell | undefined {
  const column = Math.floor((point.xM - layout.westM) / layout.pixelSizeM);
  const row = Math.floor((layout.northM - point.yM) / layout.pixelSizeM);
  if (row >= 0 && row < layout.height && column >= 0 && column < layout.width) {
    return { row, column };
  }
}

/** Call with a valid in-bounds cell. */
export function cellCenter(layout: RasterLayout, cell: RasterCell): ProjectedPoint {
  return {
    xM: layout.westM + (cell.column + 0.5) * layout.pixelSizeM,
    yM: layout.northM - (cell.row + 0.5) * layout.pixelSizeM,
  };
}

/** Local horizontal ground distance over the bounded crop on the Mars sphere. */
export function groundDistanceM(start: ProjectedPoint, end: ProjectedPoint): number {
  const midLatitudeRad = (start.yM + end.yM) / (2 * MARS_EQUIRECTANGULAR.radiusM);
  return Math.hypot((end.xM - start.xM) * Math.cos(midLatitudeRad), end.yM - start.yM);
}
