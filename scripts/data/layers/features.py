"""Download all features of a Trek MapServer layer in FID chunks as GeoJSON. usage: features.py SERVICE OUT"""
import sys, json, subprocess, urllib.parse, collections
svc, out = sys.argv[1], sys.argv[2]
U = f"https://trek.nasa.gov/mars/trekarcgis/rest/services/{svc}/MapServer/0/query"
def q(params):
    r = subprocess.run(["curl", "-sL", "-m", "120", U + "?" + urllib.parse.urlencode(params)], capture_output=True, text=True)
    return json.loads(r.stdout)
ids = q({"where": "1=1", "returnIdsOnly": "true", "f": "json"})["objectIds"]
ids.sort(); feats = []
for i in range(0, len(ids), 500):
    lo, hi = ids[i], ids[min(i + 499, len(ids) - 1)]
    d = q({"where": f"FID>={lo} AND FID<={hi}", "outFields": "*", "returnGeometry": "true", "f": "geojson"})
    feats += d["features"]
print(svc, "ids", len(ids), "features", len(feats))
json.dump({"type": "FeatureCollection", "features": feats}, open(out, "w"))
for k in ("Class", "Type", "Instrument", "Feature", "jC_fillclr", "Radius", "Point size", "Label"):
    c = collections.Counter(str(f["properties"].get(k)) for f in feats if k in f["properties"])
    if c: print(" ", k, len(c), c.most_common(12))
print(" sample", feats[0]["properties"], str(feats[0]["geometry"])[:200])
