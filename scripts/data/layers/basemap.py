"""Build basemap JPEGs and the float32 DEM, and run the alignment check.
usage: basemap.py RAWDIR REPO"""
import sys, os, json
import numpy as np, tifffile
from PIL import Image

raw, repo = sys.argv[1], sys.argv[2]
outdir = os.path.join(repo, "public/layers/global")
os.makedirs(outdir, exist_ok=True)
L = "Mars_MGS_MOLA_ClrShade_merge_global_463m"
m = Image.open(os.path.join(raw, "tiles", f"{L}_z3_mosaic.png"))
assert m.size == (4096, 2048)
a = np.asarray(m)
print("alpha min", a[..., 3].min())
rgb = m.convert("RGB")
p4 = os.path.join(outdir, "mola-color-hillshade.jpg")
rgb.save(p4, quality=85, optimize=True, progressive=True)
p1 = os.path.join(outdir, "mola-color-hillshade-1k.jpg")
rgb.resize((1024, 512), Image.LANCZOS).save(p1, quality=85, optimize=True, progressive=True)
print("jpg", os.path.getsize(p4), os.path.getsize(p1))

# DEM: 2880x1440 float32 export (0.125 deg, tie point -180,90), 2x2 mean -> 1440x720
dem = tifffile.imread(os.path.join(raw, "dem", "mola_2880,1440.tif")).astype(np.float64)
d4 = dem.reshape(720, 2, 1440, 2).mean(axis=(1, 3)).astype("<f4")
pdem = os.path.join(outdir, "mola-elevation-1440x720.f32")
d4.tofile(pdem)
print("dem", d4.shape, float(d4.min()), float(d4.max()), os.path.getsize(pdem))


def pix(lon, lat, w, h):
    return (lon + 180) / 360 * w, (90 - lat) / 180 * h


# Feature check on DEM (independent numeric source)
r, c = np.unravel_index(np.argmax(d4), d4.shape)
print("DEM max at lat %.3f lon %.3f val %.0f" % (90 - (r + .5) * .25, -180 + (c + .5) * .25, d4[r, c]))
# Hellas lowest point within 30-55S, 50-90E
sub = d4[int((90 + 30) * 4):int((90 + 55) * 4), int((180 + 50) * 4):int((180 + 90) * 4)]
rr, cc = np.unravel_index(np.argmin(sub), sub.shape)
print("Hellas min lat %.3f lon %.3f val %.0f" % (-30 - (rr + .5) * .25, 50 + (cc + .5) * .25, sub[rr, cc]))

# Alignment: correlate gradient magnitude of basemap luminance (downsampled to 1440x720) with DEM gradient
lum = np.asarray(rgb.resize((1440, 720), Image.BILINEAR).convert("L"), dtype=np.float64)


def gmag(x):
    gy, gx = np.gradient(x)
    return np.hypot(gx, gy)


band = slice(120, 600)  # 60N..60S to limit polar distortion
A = gmag(lum)[band]
B = gmag(d4.astype(np.float64))[band]
A = (A - A.mean()) / A.std()
best = None
res = {}
for dy in range(-4, 5):
    for dx in range(-4, 5):
        Bs = np.roll(np.roll(gmag(d4.astype(np.float64)), dy, 0), dx, 1)[band]
        Bs = (Bs - Bs.mean()) / Bs.std()
        cval = float((A * Bs).mean())
        res[(dy, dx)] = cval
        if best is None or cval > best[0]:
            best = (cval, dy, dx)
print("best corr %.4f at dy=%d dx=%d (DEM pixels, 0.25 deg); corr at 0,0 = %.4f" % (best[0], best[1], best[2], res[(0, 0)]))
for name, lon, lat in [("Olympus Mons summit", -133.8, 18.65), ("Hellas floor", 70.5, -42.4)]:
    x, y = pix(lon, lat, 4096, 2048)
    px = a[int(y), int(x), :3]
    print(name, "expected 4096 px x=%.1f y=%.1f rgb=%s" % (x, y, px.tolist()), "1k x=%.1f y=%.1f" % pix(lon, lat, 1024, 512))
