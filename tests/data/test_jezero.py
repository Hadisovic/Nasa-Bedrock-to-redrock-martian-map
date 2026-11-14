"""Check the packaged source alignment, elevation and missing-data behavior."""

import importlib.util
import json
from pathlib import Path
import unittest

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("jezero", ROOT / "scripts/data/jezero.py")
jezero = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(jezero)


class JezeroTests(unittest.TestCase):
    def test_missing_elevation_is_ineligible(self):
        nodata = np.float32(-3.4028226550889045e38)
        heights = np.array([-2523.2, nodata, np.nan, np.inf, -2522.0], dtype=np.float32)
        mask = np.array([255, 255, 255, 255, 0], dtype=np.uint8)
        np.testing.assert_array_equal(
            jezero.valid_cells(heights, mask, nodata),
            [True, False, False, False, False],
        )

    def test_crops_match_source_samples_at_rover_waypoint(self):
        manifest = json.loads((jezero.PACKAGE / "sources.json").read_text(encoding="utf-8"))
        result = jezero.verify(manifest, jezero.PACKAGE)
        self.assertEqual(result["elevation"]["shape_rows_cols"], [384, 384])
        self.assertEqual(result["imagery"]["shape_rows_cols"], [1536, 1536])
        self.assertEqual(result["elevation"]["valid_cells"], 147456)
        self.assertEqual(result["imagery"]["valid_cells"], 2359296)
        self.assertEqual(result["elevation"]["waypoint_cell_row_col"], [189, 196])
        self.assertEqual(result["imagery"]["waypoint_cell_row_col"], [757, 787])
        self.assertAlmostEqual(result["elevation"]["waypoint_cell_value"], -2523.197509765625)
        self.assertEqual(result["imagery"]["waypoint_cell_value"], 164)
        self.assertAlmostEqual(result["north_step"]["elevation_m"], -2523.058837890625)
        self.assertAlmostEqual(result["north_step"]["slope_deg"], 7.89496, places=4)
