"""Fetch Trek EQ WMTS tiles covering a lon/lat bbox at zoom z and crop to the bbox exactly.
usage: fetch_region.py LAYER ZOOM EXT W S E N OUTDIR
Tile grid: level z has 2*2^z cols x 2^z rows of 256 px, top-left (-180, 90); deg/px = 180/(256*2^z)."""
import sys, os, json, math, subprocess
from PIL import Image

layer, z, ext = sys.argv[1], int(sys.argv[2]), sys.argv[3]
W, S, E, N = map(float, sys.argv[4:8])
out = sys.argv[8]
dpp = 180.0 / (256 * 2 ** z)
x0, x1 = (W + 180) / dpp, (E + 180) / dpp
y0, y1 = (90 - N) / dpp, (90 - S) / dpp
c0, c1 = int(x0 // 256), int((x1 - 1e-9) // 256)
r0, r1 = int(y0 // 256), int((y1 - 1e-9) // 256)
tdir = os.path.join(out, layer, f"z{z}")
os.makedirs(tdir, exist_ok=True)
mos = Image.new("RGBA", ((c1 - c0 + 1) * 256, (r1 - r0 + 1) * 256), (0, 0, 0, 0))
log = {}
for r in range(r0, r1 + 1):
    for c in range(c0, c1 + 1):
        p = os.path.join(tdir, f"{r}_{c}.{ext}")
        url = f"https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/default/default028mm/{z}/{r}/{c}.{ext}"
        if not os.path.exists(p):
            res = subprocess.run(["curl", "-sL", "-m", "60", "-o", p + ".part", "-w", "%{http_code} %{content_type}", url],
                                 capture_output=True, text=True)
            code, _, ct = res.stdout.partition(" ")
            if code == "200" and ct.startswith("image"):
                os.replace(p + ".part", p)
            else:
                if os.path.exists(p + ".part"):
                    os.remove(p + ".part")
                log[f"{r}/{c}"] = res.stdout
                continue
        log[f"{r}/{c}"] = 200
        mos.paste(Image.open(p).convert("RGBA"), ((c - c0) * 256, (r - r0) * 256))
box = (round(x0 - c0 * 256), round(y0 - r0 * 256), round(x1 - c0 * 256), round(y1 - r0 * 256))
crop = mos.crop(box)
# snapped bounds actually covered by the integer pixel crop
bw = -180 + (c0 * 256 + box[0]) * dpp
be = -180 + (c0 * 256 + box[2]) * dpp
bn = 90 - (r0 * 256 + box[1]) * dpp
bs = 90 - (r0 * 256 + box[3]) * dpp
fn = os.path.join(out, f"{layer}_z{z}_crop.png")
crop.save(fn)
info = {"layer": layer, "zoom": z, "degPerPx": dpp, "tiles": len(log), "ok": sum(v == 200 for v in log.values()),
        "rows": [r0, r1], "cols": [c0, c1], "crop": crop.size, "bounds": {"west": bw, "east": be, "south": bs, "north": bn},
        "status": log}
json.dump(info, open(os.path.join(out, f"{layer}_z{z}_crop.json"), "w"), indent=1)
print(json.dumps({k: v for k, v in info.items() if k != "status"}))
