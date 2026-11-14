"""Reproduce and verify the native-grid Wildcat Ridge GeoTIFF crops."""

import argparse
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.windows import from_bounds
from rasterio.warp import transform


PACKAGE = Path(__file__).resolve().parents[2] / "data" / "mars" / "jezero"
LAYER_NAMES = ("elevation", "imagery")


def valid_cells(samples, mask, nodata):
    """Only cells with a finite value and a valid dataset mask can be used."""
    return (mask != 0) & np.isfinite(samples) & (samples != nodata)


def crop_sources(manifest, output):
    output.mkdir(parents=True, exist_ok=True)
    bounds = manifest["region"]["bounds_m"]
    # Skip sibling probes and read only the strips intersecting the crop.
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT=30):
        for name in LAYER_NAMES:
            layer = manifest[name]
            with rasterio.open("/vsicurl/" + layer["source_url"]) as source:
                window = from_bounds(*bounds, source.transform)
                if any(not float(value).is_integer() for value in window.flatten()):
                    raise ValueError(f"{name} crop would not align with the native grid")
                if (window.col_off < 0 or window.row_off < 0
                        or window.col_off + window.width > source.width
                        or window.row_off + window.height > source.height):
                    raise ValueError(f"{name} crop extends beyond the source raster")
                if source.nodata != layer["no_data"]:
                    raise ValueError(f"{name} source NoData changed")
                samples = source.read(1, window=window)
                valid = valid_cells(samples, source.read_masks(1, window=window), source.nodata)
                samples[~valid] = source.nodata
                with rasterio.open(
                    output / layer["file"], "w", driver="GTiff",
                    width=samples.shape[1], height=samples.shape[0], count=1,
                    dtype=source.dtypes[0], crs=source.crs, nodata=source.nodata,
                    transform=source.window_transform(window), compress="deflate",
                ) as crop:
                    crop.write(samples, 1)
                    crop.update_tags(AREA_OR_POINT="Area")
                    crop.set_band_unit(1, "m" if name == "elevation" else "DN")


def verify(manifest, directory):
    region = manifest["region"]
    expected_crs = CRS.from_string(region["projected_crs"])
    waypoint = manifest["science"]["waypoint"]
    x_values, y_values = transform(
        CRS.from_string("+proj=longlat +R=3396190 +no_defs"),
        expected_crs,
        [waypoint["longitude_east_deg"]],
        [waypoint["latitude_planetocentric_deg"]],
    )
    x, y = x_values[0], y_values[0]
    result = {"waypoint_projected_m": [x, y]}
    for name in LAYER_NAMES:
        layer = manifest[name]
        path = directory / layer["file"]
        spacing = layer["spacing_m"]
        with rasterio.open(path) as crop:
            if (list(crop.bounds) != region["bounds_m"] or crop.crs != expected_crs
                    or crop.res != (spacing, spacing) or crop.nodata != layer["no_data"]
                    or crop.transform.b != 0 or crop.transform.d != 0
                    or crop.transform.a != spacing or crop.transform.e != -spacing
                    or crop.dtypes[0] != {"elevation": "float32", "imagery": "uint8"}[name]):
                raise ValueError(f"{name} crop georeferencing or sample type changed")
            samples = crop.read(1)
            valid = valid_cells(samples, crop.read_masks(1), crop.nodata)
            row, col = crop.index(x, y)
            if not (0 <= row < crop.height and 0 <= col < crop.width and valid[row, col]):
                raise ValueError(f"{name} has no usable sample at the rover waypoint")
            value = float(samples[row, col])
            result[name] = {
                "shape_rows_cols": list(crop.shape),
                "valid_cells": int(valid.sum()),
                "missing_cells": int(valid.size - valid.sum()),
                "range": [float(samples[valid].min()), float(samples[valid].max())],
                "waypoint_cell_row_col": [row, col],
                "waypoint_cell_center_m": list(crop.xy(row, col)),
                "waypoint_cell_value": value,
                "file_bytes": path.stat().st_size,
            }
            if name == "elevation":
                if row < 1 or not valid[row - 1, col]:
                    raise ValueError("Cannot check slope without the north neighbor")
                north = float(samples[row - 1, col])
                result["north_step"] = {
                    "cell_row_col": [row - 1, col],
                    "center_m": list(crop.xy(row - 1, col)),
                    "elevation_m": north,
                    "horizontal_run_m": spacing,
                    "rise_m": north - value,
                    "grade_percent": 100 * (north - value) / spacing,
                    "slope_deg": math.degrees(math.atan2(north - value, spacing)),
                }
                result["dtm_minus_rover_geoid_m"] = value - waypoint["elevation_geoid_m"]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("crop", "verify"))
    parser.add_argument("--output", type=Path, default=PACKAGE, help="Directory for crop files")
    args = parser.parse_args()
    manifest = json.loads((PACKAGE / "sources.json").read_text(encoding="utf-8"))
    if args.mode == "crop":
        crop_sources(manifest, args.output)
    print(json.dumps(verify(manifest, args.output), indent=2))


if __name__ == "__main__":
    main()
