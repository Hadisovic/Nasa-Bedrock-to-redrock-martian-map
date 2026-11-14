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
    if l["treatment"] not in ("true-color","false-color","shaded-relief","grayscale","qualitative"): errs.append(l["id"]+" treatment")
    p = os.path.join(pub, l["file"]); listed.add(os.path.normpath(p))
    if not os.path.exists(p): errs.append("missing " + p); continue
    if os.path.getsize(p) != l["bytes"]: errs.append(f"{l['id']} bytes {os.path.getsize(p)} != {l['bytes']}")
    if p.endswith(".f32"):
        if os.path.getsize(p) != l["width"] * l["height"] * 4: errs.append(l["id"] + " f32 size")
        a = np.fromfile(p, "<f4"); print(l["id"], "f32 nan", int(np.isnan(a).sum()), "min", a.min(), "max", a.max())
    else:
        im = Image.open(p); im.verify(); im = Image.open(p)
        if im.size != (l["width"], l["height"]): errs.append(f"{l['id']} size {im.size}")
        tr = bool((np.asarray(im.convert("RGBA"))[..., 3] < 255).any())
        if tr != l["hasTransparency"]: errs.append(l["id"] + " transparency flag")
    for v in l.get("variants", []):
        q = os.path.join(pub, v["file"]); listed.add(os.path.normpath(q)); im = Image.open(q)
        if im.size != (v["width"], v["height"]) or os.path.getsize(q) != v["bytes"]: errs.append("variant " + v["file"])
    for fk, bk in (("featuresFile", "featuresBytes"), ("dataFile", "dataBytes")):
        if fk in l:
            q = os.path.join(pub, l[fk]); listed.add(os.path.normpath(q))
            if os.path.getsize(q) != l[bk]: errs.append(fk + " bytes " + l["id"])
            if fk == "featuresFile":
                n = len(json.load(open(q))["features"])
                if n != l["featureCount"]: errs.append("feature count " + l["id"])
            else:
                if os.path.getsize(q) != 72 * 36 * 4: errs.append("grs size")
if m["basemap"] not in ids: errs.append("basemap id")
ondisk = set()
for root, _, fs in os.walk(os.path.join(pub, "layers")):
    for f in fs: ondisk.add(os.path.normpath(os.path.join(root, f)))
print("unlisted files:", sorted(ondisk - listed))
print("total shipped bytes", sum(os.path.getsize(f) for f in ondisk), "files", len(ondisk))
print("ERRORS:", errs or "none")
