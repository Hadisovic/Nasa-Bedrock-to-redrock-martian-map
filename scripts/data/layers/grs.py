"""GRS 5x5 deg element tables -> float32 grid (72x36, NaN no data) and 1440x720 colour PNG. usage: grs.py GRSDIR OUTDIR"""
import sys, os, json, numpy as np
from PIL import Image
src, out = sys.argv[1:]
# perceptual ramp (viridis key colours); stops are placed linearly between vmin and vmax
ramp = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"]
spec = {"si": (18.0, 22.0), "h2o": (1.5, 7.5), "fe": (10.0, 20.0)}
names = {"si": "grs-silicon", "h2o": "grs-water", "fe": "grs-iron"}
res = {}
def h2rgb(h): return np.array([int(h[i:i+2], 16) for i in (1, 3, 5)], float)
R = np.array([h2rgb(h) for h in ramp])
for e, (vmin, vmax) in spec.items():
    g = np.full((36, 72), np.nan, np.float32)
    for line in open(os.path.join(src, f"{e}_sr_5x5.tab")):
        p = line.split(); lat, lon, c = float(p[0]), float(p[1]), float(p[2])
        if c >= 9999: continue
        lon180 = lon - 360 if lon > 180 else lon
        r = int((90 - lat) // 5); col = int((lon180 + 180) // 5)
        assert np.isnan(g[r, col]); g[r, col] = c
    g.astype("<f4").tofile(os.path.join(out, f"{names[e]}-72x36.f32"))
    t = np.clip((g - vmin) / (vmax - vmin), 0, 1) * (len(ramp) - 1)
    i0 = np.clip(np.floor(np.nan_to_num(t)).astype(int), 0, len(ramp) - 2); f = (np.nan_to_num(t) - i0)[..., None]
    rgb = R[i0] * (1 - f) + R[i0 + 1] * f
    a = np.where(np.isnan(g), 0, 255)
    img = np.dstack([rgb, a]).astype(np.uint8)
    im = Image.fromarray(img, "RGBA").resize((1440, 720), Image.NEAREST)
    pp = os.path.join(out, f"{names[e]}.png"); im.save(pp, optimize=True)
    stops = [{"value": round(vmin + (vmax - vmin) * k / (len(ramp) - 1), 3), "color": ramp[k], "label": f"{vmin + (vmax - vmin) * k / (len(ramp) - 1):g} wt%"} for k in range(len(ramp))]
    res[names[e]] = {"valid": int((~np.isnan(g)).sum()), "min": float(np.nanmin(g)), "max": float(np.nanmax(g)),
                     "rowsWithData": [int(np.where(~np.isnan(g).all(1))[0].min()), int(np.where(~np.isnan(g).all(1))[0].max())],
                     "png": os.path.getsize(pp), "f32": os.path.getsize(os.path.join(out, f"{names[e]}-72x36.f32")), "stops": stops}
json.dump(res, open(os.path.join(src, "grs_stats.json"), "w"), indent=1)
print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk != "stops"} for k, v in res.items()}))
