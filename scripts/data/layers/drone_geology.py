"""Build the offline drone geology overlays from the published source extracts.

Usage: python scripts/data/layers/drone_geology.py GALE_ZIP JEZERO_QUERY_JSON
Dependencies: pyshp, shapely, pillow.
"""
from io import BytesIO
import json
from math import asin, atan2, cos, cosh, degrees, pi, sin, sinh
from pathlib import Path
import sys
from zipfile import ZipFile

from PIL import Image, ImageDraw
import shapefile
from shapely.geometry import box, shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[3]
RADIUS = 3396190
M_PER_DEG = RADIUS * pi / 180
GALE = tuple(v / M_PER_DEG for v in (8141800, -282400, 8148000, -276200))
WILDCAT = tuple(v / M_PER_DEG for v in (4588016, 1093936, 4588400, 1094320))
SIZE = 768


def jezero_lon_lat(x, y, z=None):
    # The USGS service uses spherical transverse Mercator, central meridian 77.5 E.
    d = y / RADIUS
    lon = 77.5 + degrees(atan2(sinh(x / RADIUS), cos(d)))
    return lon, degrees(asin(sin(d) / cosh(x / RADIUS)))


def parts(geometry, kind):
    if geometry.is_empty:
        return
    if geometry.geom_type == kind:
        yield geometry
    elif hasattr(geometry, "geoms"):
        for item in geometry.geoms:
            yield from parts(item, kind)


def write_overlay(site, bounds, groups, reference, credit):
    west, south, east, north = bounds
    crop = box(*bounds)
    image = Image.new("RGBA", (SIZE, SIZE))
    labels = []

    def pixel(point):
        lon, lat = point[:2]
        return (lon - west) / (east - west) * SIZE, (north - lat) / (north - south) * SIZE

    for title, color, description, geometries, kind in groups:
        clipped = [p for g in geometries for p in parts(g.intersection(crop), kind)]
        if not clipped:
            continue
        layer = Image.new("RGBA", image.size)
        draw = ImageDraw.Draw(layer)
        if kind == "Polygon":
            for p in parts(unary_union(clipped), kind):
                draw.polygon([pixel(pt) for pt in p.exterior.coords], fill=color)
                for hole in p.interiors:
                    draw.polygon([pixel(pt) for pt in hole.coords], fill=(0, 0, 0, 0))
            anchor = max(clipped, key=lambda p: p.area).representative_point()
        else:
            for line in clipped:
                draw.line([pixel(pt) for pt in line.coords], width=3, fill=color)
            line = max(clipped, key=lambda p: p.length)
            anchor = line.interpolate(0.5, normalized=True)
        image = Image.alpha_composite(image, layer)
        labels.append(dict(title=title, color="#%02x%02x%02x" % color[:3], description=description,
                           lat=round(anchor.y, 8), lon=round(anchor.x, 8)))
    if not labels:
        raise ValueError(f"No verified geologic features intersect {site}")
    image.save(ROOT / f"public/layers/regional/{site}-geology.png", optimize=True)
    return dict(reference=reference, credit=credit, labels=labels)


def gale_groups(source):
    def read(name):
        stem = f"SI-B1/{name}"
        with ZipFile(source) as archive:
            assert '3396190' in archive.read(stem + ".prj").decode()
            reader = shapefile.Reader(shp=BytesIO(archive.read(stem + ".shp")))
            shapes = [shape(entry.__geo_interface__) for entry in reader.iterShapes()]
            return [item.buffer(0) if not item.is_valid else item for item in shapes]

    return [
        ("Mapped pediments", (22, 184, 180, 205),
         "Mapped areas of gently sloping ground include part of the Greenheugh Pediment. The source groups the pediments in one layer.", read("Pediments"), "Polygon"),
        ("Marker bed", (255, 210, 56, 220),
         "An orbitally mapped, dark-toned bed that researchers traced between separate exposures.", read("Marker Bed Polygon"), "Polygon"),
        ("Distinctive layer boundary", (245, 103, 72, 228),
         "A line traced from orbital imagery where the appearance of the rock layers changes.", read("Distinctive Orbital Layer Boundary"), "LineString"),
    ]


def wildcat_groups(source):
    units = {}
    for item in json.loads(Path(source).read_text(encoding="utf-8"))["features"]:
        rings = item["geometry"]["rings"]
        # Esri rings use orientation for holes. Symmetric difference preserves
        # those holes and disconnected exterior rings, regardless of ordering.
        combined = None
        for ring in rings:
            polygon = shape({"type": "Polygon", "coordinates": [ring]}).buffer(0)
            combined = polygon if combined is None else combined.symmetric_difference(polygon)
        name = item["attributes"]["name"]
        units.setdefault(name, []).append(transform(jezero_lon_lat, combined))
    colors = {
        "Jezero fan 2 unit": (114, 199, 56, 186),
        "Eolian bedform unit": (255, 196, 61, 210),
        "Jezero floor unit": (40, 177, 190, 205),
        "Jezero fan 1 unit": (231, 104, 58, 205),
    }
    return [(name, colors.get(name, (219, 152, 220, 195)),
             "Orbital geologic interpretation from USGS Scientific Investigations Map 3464 (1:75,000).",
             polygons, "Polygon") for name, polygons in units.items()]


def main():
    gale_zip, jezero_json = sys.argv[1:]
    result = {
        "gale": write_overlay("gale", GALE, gale_groups(gale_zip), "https://doi.org/10.1130/GSAB.S.25938268",
                              "Meyer et al., GSA Bulletin · CC BY 4.0 · clipped and recolored"),
        "wildcat": write_overlay("wildcat", WILDCAT, wildcat_groups(jezero_json), "https://doi.org/10.3133/sim3464",
                                 "Sun and Stack, USGS SIM 3464 · clipped and recolored"),
    }
    (ROOT / "data/mars/layers/drone-geology.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
