"""Download all WMTS tiles of one Trek EQ layer at one zoom and stitch them.

usage: fetch_tiles.py LAYER ZOOM EXT OUTDIR
Writes OUTDIR/LAYER/zZOOM/{row}_{col}.EXT and OUTDIR/LAYER_zZOOM_mosaic.png (RGBA),
plus OUTDIR/LAYER_zZOOM_log.json with HTTP status per tile.
Level 0 is 2 cols x 1 row of 256 px tiles, top-left (-180, 90); each level doubles.
"""
import sys, os, json, io, urllib.request, concurrent.futures as cf
from PIL import Image

layer, z, ext, out = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
cols, rows = 2 * 2 ** z, 2 ** z
tdir = os.path.join(out, layer, f"z{z}")
os.makedirs(tdir, exist_ok=True)
base = f"https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/default/default028mm/{z}/{{r}}/{{c}}.{ext}"


def get(rc):
    r, c = rc
    p = os.path.join(tdir, f"{r}_{c}.{ext}")
    if os.path.exists(p) and os.path.getsize(p) > 0:
        return rc, 200, p
    import subprocess
    url = base.format(r=r, c=c)
    for _ in range(3):
        res = subprocess.run(["curl", "-sL", "-o", p + ".part", "-w", "%{http_code} %{content_type}", url],
                             capture_output=True, text=True)
        code, _, ctype = res.stdout.partition(" ")
        if code == "200" and ctype.startswith("image"):
            os.replace(p + ".part", p)
            return rc, 200, p
        if os.path.exists(p + ".part"):
            os.remove(p + ".part")
        if code in ("404", "403", "400", "204") or (code == "200"):
            return rc, f"{code} {ctype}", None
        err = f"{code} {res.stderr[:80]}"
    return rc, err, None


mosaic = Image.new("RGBA", (cols * 256, rows * 256), (0, 0, 0, 0))
log = {}
with cf.ThreadPoolExecutor(8) as ex:
    for (r, c), st, p in ex.map(get, [(r, c) for r in range(rows) for c in range(cols)]):
        log[f"{r}/{c}"] = st
        if p:
            im = Image.open(p)
            im = im.convert("RGBA")
            mosaic.paste(im, (c * 256, r * 256))
mosaic.save(os.path.join(out, f"{layer}_z{z}_mosaic.png"))
ok = sum(1 for v in log.values() if v == 200)
json.dump({"layer": layer, "zoom": z, "cols": cols, "rows": rows, "ok": ok, "status": log, "template": base},
          open(os.path.join(out, f"{layer}_z{z}_log.json"), "w"), indent=0)
print(layer, z, f"{ok}/{cols*rows} tiles", mosaic.size)
