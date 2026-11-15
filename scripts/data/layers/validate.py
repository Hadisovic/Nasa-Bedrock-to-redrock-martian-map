import sys, os, json, numpy as np
from PIL import Image
repo = sys.argv[1]; pub = os.path.join(repo, "public")
m = json.load(open(os.path.join(repo, "data/mars/layers/manifest.json")))
req = ["id","title","group","trekLayerId","productId","mission","instrument","measures","units","verticalDatum","treatment","legend","global","coverage","sourceResolution","shippedResolution","observationDates","file","width","height","bytes","hasTransparency","credit","terms","sourceUrls","downloaded","processing"]
errs = []; listed = set(); ids = set()
for l in m["layers"]:
    for k in req:
        if k not in l: errs.append(f"{l['id']} missing {k}")
    if l["id"] in ids: errs.append("dup id " + l["id"])
    ids.add(l["id"])
    if l["group"] not in ("terrain","materials","weather","hazards"): errs.append(l["id"]+" group")
    if l.get("treatment") not in ("true-color","colorized-imagery","false-color","shaded-relief","grayscale","qualitative"): errs.append(l["id"]+" treatment")
    p = os.path.join(pub, l["file"]); listed.add(os.path.normpath(p))
    if not os.path.exists(p): errs.append("missing " + p); continue
    if os.path.getsize(p) != l.get("bytes"): errs.append(f"{l['id']} bytes {os.path.getsize(p)} != {l.get('bytes')}")
    if p.endswith(".f32"):
        if os.path.getsize(p) != l["width"] * l["height"] * 4: errs.append(l["id"] + " f32 size")
        a = np.fromfile(p, "<f4"); print(l["id"], "f32 nan", int(np.isnan(a).sum()), "min", a.min(), "max", a.max())
    else:
        im = Image.open(p); im.verify(); im = Image.open(p)
        if im.size != (l["width"], l["height"]): errs.append(f"{l['id']} size {im.size}")
        alpha = im.convert("RGBA").getchannel("A")
        tr = alpha.getextrema()[0] < 255
        if tr != l.get("hasTransparency"): errs.append(l["id"] + " transparency flag")
        raster = l.get("rasterBounds", l["coverage"])
        west, south, east, north = (raster[k] for k in ("west", "south", "east", "north"))
        if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
            errs.append(l["id"] + " raster bounds")
        else:
            dx, dy = (east - west) / im.width, (north - south) / im.height
            bounds = alpha.getbbox()
            if bounds is None:
                errs.append(l["id"] + " raster has no visible pixels")
            elif not l.get("featuresFile"):
                x0, y0, x1, y1 = bounds
                actual = {"west": west + x0 * dx, "south": north - y1 * dy,
                          "east": west + x1 * dx, "north": north - y0 * dy}
                for key, value in actual.items():
                    tolerance = (dx if key in ("west", "east") else dy) + 1e-6
                    if abs(value - l["coverage"][key]) > tolerance:
                        errs.append(f"{l['id']} {key} data coverage {value:.6f} != {l['coverage'][key]}")
    for v in l.get("variants", []):
        q = os.path.join(pub, v["file"]); listed.add(os.path.normpath(q)); im = Image.open(q)
        if im.size != (v["width"], v["height"]) or os.path.getsize(q) != v["bytes"]: errs.append("variant " + v["file"])
    for fk, bk in (("featuresFile", "featuresBytes"), ("dataFile", "dataBytes")):
        if fk in l:
            q = os.path.join(pub, l[fk]); listed.add(os.path.normpath(q))
            if os.path.getsize(q) != l[bk]: errs.append(fk + " bytes " + l["id"])
            if fk == "featuresFile":
                features = json.load(open(q))["features"]
                if len(features) != l["featureCount"]: errs.append("feature count " + l["id"])
                if all(f["geometry"]["type"] == "Point" for f in features):
                    for f in features:
                        lon, lat = f["geometry"]["coordinates"]
                        x = min(im.width - 1, int((lon - west) / (east - west) * im.width))
                        y = min(im.height - 1, int((north - lat) / (north - south) * im.height))
                        if not (west <= lon <= east and south <= lat <= north) or not alpha.getpixel((x, y)):
                            errs.append(f"{l['id']} missing raster detection at {lon}, {lat}")
                            break
            else:
                if os.path.getsize(q) != 72 * 36 * 4:
                    errs.append("grs size " + l["id"])
                else:
                    grid = np.fromfile(q, "<f4").reshape(36, 72)
                    rows = ((np.arange(36) + 0.5) * im.height / 36).astype(int)
                    cols = ((np.arange(72) + 0.5) * im.width / 72).astype(int)
                    drawn = np.asarray(alpha)[np.ix_(rows, cols)] != 0
                    if not np.array_equal(drawn, np.isfinite(grid)):
                        errs.append("grs coverage mask " + l["id"])
if m["basemap"] not in ids: errs.append("basemap id")
ondisk = set()
for root, _, fs in os.walk(os.path.join(pub, "layers")):
    for f in fs: ondisk.add(os.path.normpath(os.path.join(root, f)))
print("unlisted files:", sorted(ondisk - listed))
print("total shipped bytes", sum(os.path.getsize(f) for f in ondisk), "files", len(ondisk))
print("ERRORS:", errs or "none")
sys.exit(bool(errs))
