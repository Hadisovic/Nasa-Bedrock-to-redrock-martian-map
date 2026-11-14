# Jezero data feasibility

Proceed with the 384 × 384 m map window around Wildcat Ridge in Hawksbill Gap on Jezero's western delta. The two raster crops cover the same rectangle and have valid samples throughout it. Perseverance's measurements at the nearby Berry Hollow abrasion patch provide local mineralogical evidence. This package verifies data coverage. Habitat placement and route feasibility will be checked downstream.

## Source data

- **Optical imagery:** Mars Reconnaissance Orbiter (MRO) HiRISE orthorectified mosaic. The source is 7,358,523,457 bytes. The cropped GeoTIFF is 1,631,738 bytes, 1,536 rows × 1,536 columns, with 0.25 m projected spacing and 8-bit grayscale samples. Value 0 marks NoData. [USGS source and credits](https://doi.org/10.5066/P9QJDP48)
- **Elevation:** MRO HiRISE stereo terrain mosaic. The source is 1,839,545,409 bytes. The cropped GeoTIFF is 349,980 bytes, 384 rows × 384 columns, with 1 m projected spacing and float32 elevations in meters above the product's MOLA-derived delta geoid. The stored NoData value is `-3.4028226550889045e+38`. USGS lists six stereo pairs for the 2020 mosaic. Observation dates are available from the HiRISE IDs, for example [ESP_045994_1985](https://hirise.lpl.arizona.edu/ESP_045994_1985) was acquired May 19, 2016. Pixel-level acquisition dates were not determined for this crop. [USGS source and credits](https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_hirise_dtm_mosaic)
- **Mineralogy:** Mars 2020 Perseverance PIXL scans BH1 and BH2 on sols 505 and 507. The published results identify calcium sulfate phases, including anhydrite and gypsum, in the Berry Hollow abrasion patch at Wildcat Ridge. This supports a science objective of inspecting nearby fine-grained sedimentary deposits for evidence of how water interacted with the delta. Use the observation at site scale. The rover position approximates the workspace and the instrument measured a centimeter-scale patch. The package records the published evidence and links to the raw archive. [PIXL study, Figures 2 and 5](https://pmc.ncbi.nlm.nih.gov/articles/PMC12002120/) · [NASA PIXL archive](https://pds-geosciences.wustl.edu/missions/mars2020/pixl.htm) · [NASA Wildcat Ridge image](https://science.nasa.gov/resource/sample-collection-and-rock-analysis-at-wildcat-ridge/)

The product URLs, bounds, mission names and rover waypoint are in [sources.json](../../data/mars/jezero/sources.json). MRO supplies both raster types. Mars 2020 supplies the in situ mineral measurements.

## Coordinates and evidence

Both crops use Mars 2000 spherical equirectangular coordinates with radius 3,396,190 m, central meridian 0°, latitude of origin 0° and standard parallel 0°. Input locations use east-positive longitude and planetocentric latitude in degrees. The crop edges are west 4,588,016 m, south 1,093,936 m, east 4,588,400 m and north 1,094,320 m. Arrays start at the northwest corner. Columns increase east and rows increase south. The centers are half a pixel inward from each edge.

For local distances on this spherical model, north-south spacing is 1 m on the elevation grid. East-west ground spacing is the projected spacing multiplied by cosine of latitude, approximately 0.949 m here. Keep the raster metadata for map alignment and account for that scale when estimating a walking distance or slope.

The Sol 502 end-of-drive position `26_1222` is 77.40592495° E, 18.45864728° N. It projects to (4,588,212.788 m, 1,094,130.734 m). Rasterio maps it to elevation cell (row 189, column 196) and image cell (row 757, column 787), both zero-based in the crops. A direct byte-range read of the original rasters at that position yielded the same elevation and image values. Elevation is −2523.197509765625 m and imagery is DN 164. The waypoint feed reports −2523.167969 m on its geoid field. This agreement of about 0.030 m checks one location and does not establish survey accuracy across the crop. [NASA rover waypoints](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json)

The next elevation cell north (row 188, column 196) reads −2523.058837890625 m. Its center is 1 m north of the first. Subtract the two elevations to get a 0.138671875 m rise. The northward grade is 13.867% and `atan2(0.138671875, 1)` gives 7.895°. This is a directional, cell-to-cell slope. Stereo reconstruction uncertainty and obstacles smaller than the grid spacing still matter.

The crop contains 147,456 valid elevation cells and 2,359,296 valid imagery pixels, with zero missing in either raster. Elevation ranges from −2544.553 m to −2471.757 m. For traversability, require an in-bounds cell, a valid raster mask and finite elevation different from NoData. Exclude cells that fail any of those checks. The test injects a NoData sentinel, a non-finite value and a masked cell to exercise the rule even though the real crop has no holes. A valid elevation cell alone cannot establish traversability.

## Reproduce and verify

From the repository root, use Python 3.12 with Rasterio 1.4.4 and NumPy 1.26.4. An isolated Python environment can be created outside the checkout. The crop command uses public HTTPS byte-range reads and needs network access. It takes a native window from each raster without resampling and writes losslessly compressed GeoTIFFs to `data/mars/jezero`. Use `--output <directory>` to regenerate into a separate folder. Verification and tests use the checked-in crops and can run offline.

```text
python -m pip install rasterio==1.4.4 numpy==1.26.4
python scripts/data/jezero.py crop
python scripts/data/jezero.py verify
python -m unittest discover -s tests/data -v
```

## Handoff

After human review, integration and verification of #10, #11 can use these two aligned rasters and the rover waypoint as its first real fixture. The foundation owner can choose the web asset and contract formats in #11. Routing should test a missing-terrain fixture as well as this fully covered crop. Science can render Berry Hollow as sourced site evidence with its location and measurement-footprint limits.
