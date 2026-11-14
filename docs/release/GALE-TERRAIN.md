# Gale Crater terrain source

The patch near Mount Sharp covers 6.2 km in projected coordinates. It is not centered on Curiosity's landing site. The view uses Mars Trek's mapped orbital mosaic and numerical elevation at a shared bounding box in Mars geographic CRS 104905. Pixels without image alpha are excluded from Drone View.

- [NASA/JPL Mars Trek layer catalog](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars)
- [MRO HiRISE Curiosity mosaic crop](https://trek.nasa.gov/mars/trekarcgis/rest/services/curiosity_hirise_mosaic/ImageServer/exportImage?bbox=137.3570906338025,-4.764258811931738,137.4616883839228,-4.659661061811423&bboxSR=104905&imageSR=104905&size=1240,1240&format=png32&adjustAspectRatio=false&f=image), 1240 × 1240 resampled display pixels, about 5 m apart.
- [Gale terrain export](https://trek.nasa.gov/mars/trekarcgis/rest/services/Gale_DEM_SMG_1m/ImageServer/exportImage?bbox=137.3570906338025,-4.764258811931738,137.4616883839228,-4.659661061811423&bboxSR=104905&imageSR=104905&size=310,310&format=tiff&pixelType=F32&interpolation=RSP_BilinearInterpolation&adjustAspectRatio=false&f=image), 310 × 310 Float32 height samples, 20 m projected spacing. Parent source: [USGS Gale merged DEM](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m).
- Geographic bounds, west/south/east/north: 137.3570906338025, −4.764258811931738, 137.4616883839228, −4.659661061811423. The elevation GeoTIFF's tiepoint and pixel scale matched the requested grid. Image has 1,523,516 of 1,537,600 nontransparent pixels; all 96,100 elevation cells are finite, ranging from −4479.113 to −3525.502 m above the product datum.

To reproduce, download the linked image and elevation exports. With Pillow, save the RGBA PNG as lossless WebP, preserving its alpha channel. Convert the TIFF's north-to-south rows to little-endian Float32 and write them without a header (for example, NumPy `np.asarray(Image.open("elevation.tif"), dtype="<f4").tofile("gale-terrain.f32")`). Expected dimensions and geometry are in `src/explorer/galeLayout.ts`.

The camera is a simulated point of view rendered from measured terrain, not rover footage or a sensor feed. The 20 m routing grid cannot resolve individual rocks or narrow obstacles. The orbital image and DEM are separate NASA/USGS products; the app does not claim subpixel co-registration.
