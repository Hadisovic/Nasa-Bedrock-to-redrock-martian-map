"""Rasterize the two USGS SIM 3292 mapped polar caps in Mars longitude/latitude."""
import json
import sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

from PIL import Image, ImageDraw

SERVICE = ("https://services.arcgis.com/nzS0F0zdNLvs7nc8/ArcGIS/rest/services/"
           "Mars_Geology_feature_layer/FeatureServer/0/query")
QUERY = urlencode({"f": "geojson", "where": "Unit = 'lApc'", "outFields": "Unit", "returnGeometry": "true"})
WIDTH, HEIGHT = 4096, 2048
COLORS = ((130, 191, 255, 255), (199, 230, 255, 255))


def build(repo):
    with urlopen(f"{SERVICE}?{QUERY}", timeout=45) as response:
        features = json.load(response)["features"]
    raster = Image.new("RGBA", (WIDTH, HEIGHT))
    draw = ImageDraw.Draw(raster)
    poles = set()
    for feature in features:
        geometry = feature["geometry"]
        if feature["properties"]["Unit"] != "lApc" or geometry["type"] != "Polygon":
            raise ValueError("Unexpected polar-cap geometry")
        exterior, *holes = geometry["coordinates"]
        north = exterior[0][1] > 0
        poles.add(north)
        for index, ring in enumerate((exterior, *holes)):
            if any(abs(a[0] - b[0]) > 180 for a, b in zip(ring, ring[1:])):
                raise ValueError("Polygon crosses the antimeridian without a cut")
            xy = [((lon + 180) * WIDTH / 360, (90 - lat) * HEIGHT / 180) for lon, lat in ring]
            draw.polygon(xy, fill=COLORS[north] if index == 0 else (0, 0, 0, 0))
    if poles != {False, True}:
        raise ValueError("Expected mapped caps in both hemispheres")
    path = repo / "public/layers/global/polar-caps.png"
    raster.save(path, optimize=True)
    return raster.getbbox()


if __name__ == "__main__":
    print(build(Path(sys.argv[1])))
