"""Build overlay files in public/layers from the raw downloads. usage: overlays.py RAW REPO"""
import sys, os, json
import numpy as np
from PIL import Image, ImageDraw

raw, repo = sys.argv[1], sys.argv[2]
G = os.path.join(repo, "public/layers/global")
R = os.path.join(repo, "public/layers/regional")
os.makedirs(G, exist_ok=True)
os.makedirs(R, exist_ok=True)
T = os.path.join(raw, "tiles")
stats = {}


def save_rgba_quant(im, path, colors=256):
    """Palette PNG with alpha. Fully transparent pixels stay transparent (alpha 0)."""
    a = np.asarray(im)
    q = im.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    q.save(path, optimize=True)
    chk = np.asarray(Image.open(path).convert("RGBA"))
    stats[os.path.basename(path)] = {
        "size": im.size, "bytes": os.path.getsize(path),
        "alpha0_src": float((a[..., 3] == 0).mean()), "alpha0_out": float((chk[..., 3] == 0).mean()),
        "maxRGBdiff_opaque": int(np.abs(chk[..., :3].astype(int) - a[..., :3].astype(int))[a[..., 3] == 255].max()),
    }


def save_la(im, path):
    a = np.asarray(im.convert("RGBA"))
    la = Image.fromarray(np.dstack([a[..., 0], a[..., 3]]), "LA")
    # check grayscale source
    stats[os.path.basename(path) + "_grayCheck"] = int(np.abs(a[..., 0].astype(int) - a[..., 1].astype(int)).max())
    la.save(path, optimize=True)
    stats[os.path.basename(path)] = {"size": im.size, "bytes": os.path.getsize(path),
                                     "alpha0": float((a[..., 3] == 0).mean())}


# --- MOLA/HRSC blend (global, opaque) ---
m = Image.open(os.path.join(T, "Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw_z3_mosaic.png"))
assert np.asarray(m)[..., 3].min() == 255
p = os.path.join(G, "mola-hrsc-blend.jpg")
m.convert("RGB").save(p, quality=85, optimize=True, progressive=True)
stats["mola-hrsc-blend.jpg"] = {"size": m.size, "bytes": os.path.getsize(p)}

# --- TES products (Trek max zoom 1 = 1024x512) ---
for src, dst in [("TES_Thermal_Inertia", "tes-thermal-inertia.png"), ("TES_Dust", "tes-dust-cover.png"),
                 ("TES_Glass_Clay", "tes-sheet-silicates-glass.png"), ("TES_Plagioclase", "tes-plagioclase.png"),
                 ("TES_Clinopyroxene", "tes-high-ca-pyroxene.png"), ("mola_roughness", "mola-roughness.png")]:
    im = Image.open(os.path.join(T, f"{src}_z1_mosaic.png")).convert("RGBA")
    save_rgba_quant(im, os.path.join(G, dst))

# --- THEMIS day / night IR (zoom 2 = 2048x1024, grayscale + alpha) ---
for src, dst in [("THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018", "themis-day-ir.png"),
                 ("THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018", "themis-night-ir.png")]:
    im = Image.open(os.path.join(T, f"{src}_z2_mosaic.png")).convert("RGBA")
    save_la(im, os.path.join(G, dst))

# --- Vector point/polygon layers rendered to 2048x1024 + compact GeoJSON ---
W, H = 2048, 1024


def xy(lon, lat):
    return (lon + 180) / 360 * W, (90 - lat) / 180 * H


def load(n):
    return json.load(open(os.path.join(raw, "arcgis", n + ".geojson")))["features"]


def write_geojson(feats, path, keep):
    fc = {"type": "FeatureCollection", "features": []}
    for f in feats:
        g = f["geometry"]
        if g["type"] == "Point":
            geom = {"type": "Point", "coordinates": [round(g["coordinates"][0], 3), round(g["coordinates"][1], 3)]}
        elif g["type"] == "Polygon":
            geom = {"type": g["type"], "coordinates": [[[round(p[0], 4), round(p[1], 4)] for p in ring] for ring in g["coordinates"]]}
        else:
            geom = {"type": g["type"], "coordinates": [[[[round(p[0], 4), round(p[1], 4)] for p in ring] for ring in poly] for poly in g["coordinates"]]}
        fc["features"].append({"type": "Feature", "geometry": geom, "properties": {k: f["properties"].get(k) for k in keep}})
    json.dump(fc, open(path, "w"), separators=(",", ":"))
    stats[os.path.basename(path)] = {"features": len(feats), "bytes": os.path.getsize(path)}


def rgb(s):
    return tuple(int(v) for v in s.split()[:3])


# Aqueous mineral distribution (Ehlmann & Edwards 2014 compilation); class colours from the Trek renderer
aq = load("Aquieous_Mineral_Distribution_Options_clon0")
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
order = ["phyllosilicate", "silica", "sulfate", "chloride", "carbonate"]  # rare classes drawn last
for cls in order:
    for f in aq:
        if f["properties"]["Class"] != cls:
            continue
        x, y = xy(*f["geometry"]["coordinates"])
        col = rgb(f["properties"]["jC_fillclr"])
        d.ellipse([x - 2.5, y - 2.5, x + 2.5, y + 2.5], fill=col + (255,), outline=(0, 0, 0, 255), width=1)
img.save(os.path.join(G, "aqueous-minerals.png"), optimize=True)
stats["aqueous-minerals.png"] = {"bytes": os.path.getsize(os.path.join(G, "aqueous-minerals.png"))}
write_geojson(aq, os.path.join(G, "aqueous-minerals.geojson"), ["Class"])

# Hydrous mineral detections (Carter et al. 2013), coloured by instrument as in the Trek feature attributes
hy = load("Hydrous_Mineral_Detections_OMEGA_CRISM_clon0")
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
for inst in ["OMEGA", "CRISM"]:
    for f in hy:
        if f["properties"]["Instrument"] != inst:
            continue
        x, y = xy(*f["geometry"]["coordinates"])
        col = rgb(f["properties"]["jC_fillclr"])
        d.ellipse([x - 2.5, y - 2.5, x + 2.5, y + 2.5], fill=col + (255,), outline=(0, 0, 0, 255), width=1)
img.save(os.path.join(G, "hydrous-minerals.png"), optimize=True)
stats["hydrous-minerals.png"] = {"bytes": os.path.getsize(os.path.join(G, "hydrous-minerals.png"))}
write_geojson(hy, os.path.join(G, "hydrous-minerals.geojson"), ["Instrument"])

# Chloride deposits (Osterloo et al. 2010): polygons filled; tiny ones get a 2.5 px marker at their centroid
ch = load("Chloride_Salt_bearing_Material_THEMIS_clon0")
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
col = (255, 221, 0, 255)
for f in ch:
    g = f["geometry"]
    rings = g["coordinates"] if g["type"] == "Polygon" else [r for poly in g["coordinates"] for r in poly]
    for ring in rings[:1] if g["type"] == "Polygon" else rings:
        pts = [xy(x, y) for x, y in ring]
        d.polygon(pts, fill=col)
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        d.ellipse([cx - 2.5, cy - 2.5, cx + 2.5, cy + 2.5], fill=col, outline=(0, 0, 0, 255), width=1)
img.save(os.path.join(G, "chloride-deposits.png"), optimize=True)
stats["chloride-deposits.png"] = {"bytes": os.path.getsize(os.path.join(G, "chloride-deposits.png")),
                                  "geomTypes": sorted({f["geometry"]["type"] for f in ch})}
write_geojson(ch, os.path.join(G, "chloride-deposits.geojson"), ["Name"])

# --- Regional crops ---
RG = os.path.join(raw, "region")
save_la(Image.open(os.path.join(RG, "h2942_0000_nd3_z6_crop.png")), os.path.join(R, "hrsc-viking1-h2942.png"))
save_la(Image.open(os.path.join(RG, "Hebrus_CTX_BlockAdj_dd_z7_crop.png")), os.path.join(R, "ctx-hebrus-valles.png"))

json.dump(stats, open(os.path.join(raw, "overlay_stats.json"), "w"), indent=1, default=str)
print(json.dumps(stats, indent=1, default=str))
