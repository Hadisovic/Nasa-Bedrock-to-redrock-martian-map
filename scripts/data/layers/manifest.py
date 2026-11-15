"""Write data/mars/layers/manifest.json. File sizes and dimensions are read from disk.
usage: manifest.py RAW REPO"""
import sys, os, json, datetime
import numpy as np
from PIL import Image

raw, repo = sys.argv[1], sys.argv[2]
PUB = os.path.join(repo, "public")
M_PER_DEG = 2 * np.pi * 3396190 / 360  # Mars 2000 sphere


def zres(z):
    d = 180 / (256 * 2 ** z)
    return f"{d:.6g} deg/px (~{d * M_PER_DEG:.0f} m/px at the equator)"


def img_info(rel):
    p = os.path.join(PUB, rel)
    im = Image.open(p)
    a = np.asarray(im.convert("RGBA"))[..., 3]
    return {"width": im.size[0], "height": im.size[1], "bytes": os.path.getsize(p), "hasTransparency": bool((a < 255).any())}


def file_bytes(rel):
    return os.path.getsize(os.path.join(PUB, rel))


TREK = "https://trek.nasa.gov/tiles/Mars/EQ/{L}/1.0.0/WMTSCapabilities.xml"
TILE = "https://trek.nasa.gov/tiles/Mars/EQ/{L}/1.0.0/default/default028mm/{z}/{{row}}/{{col}}.{ext}"
ABS = "https://trek.nasa.gov/mars/TrekWS/rest/cat/abstract?label={L}"
LEG = "https://trek.nasa.gov/mars/TrekWS/rest/cat/legend/stream?label={L}"
SRV = "https://trek.nasa.gov/mars/TrekServices/ws/index/getLayerServices?uuid={U}"


def trek_urls(L, U, legend=True):
    u = [TREK.format(L=L), ABS.format(L=L), SRV.format(U=U)]
    if legend:
        u.append(LEG.format(L=L))
    return u


# ---------- data-derived elevation legend stops (median colour of the image at DEM elevation +/-300 m) ----------
dem = np.fromfile(os.path.join(PUB, "layers/global/mola-elevation-1440x720.f32"), "<f4").reshape(720, 1440)


def elev_stops(rel):
    im = np.asarray(Image.open(os.path.join(PUB, rel)).convert("RGB").resize((1440, 720), Image.BOX)).astype(int)
    out = []
    for v in [-7000, -6000, -4000, -2000, 0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000]:
        m = np.abs(dem - v) < 300
        c = np.median(im[m], 0).astype(int)
        out.append({"value": v, "color": "#%02x%02x%02x" % tuple(c), "label": f"{v} m"})
    return out


tes_stops = json.load(open(os.path.join(raw, "legends/stops.json")))
grs = json.load(open(os.path.join(raw, "grs/grs_stats.json")))
reg = {n: json.load(open(os.path.join(raw, "region", f"{n}_crop.json"))) for n in ["h2942_0000_nd3_z6", "Hebrus_CTX_BlockAdj_dd_z7"]}
ov = json.load(open(os.path.join(raw, "overlay_stats.json")))

NASA_TERMS = "NASA-produced data; not copyrighted in the US (NASA media usage guidelines). Credit the mission and instrument team."
GLOBAL = {"west": -180, "east": 180, "south": -90, "north": 90}

layers = []


def add(d, rel=None):
    if rel:
        d["file"] = rel.replace("layers/", "layers/", 1)
        d.update(img_info(rel))
        if rel.lower().endswith((".png", ".jpg", ".jpeg")):
            d["rasterBounds"] = GLOBAL if rel.startswith("layers/global/") else d["coverage"]
    layers.append(d)


# ---------------- terrain ----------------
L = "Mars_Viking_MDIM21_ClrMosaic_global_232m"
add({
    "id": "viking-color", "title": "Viking Orbiter global color mosaic", "group": "terrain",
    "trekLayerId": L, "productId": L, "mission": "Viking Orbiter", "instrument": "Viking Visual Imaging Subsystem",
    "measures": "Visible-light imagery", "units": None, "verticalDatum": None, "treatment": "colorized-imagery",
    "legend": {"type": "none", "stops": []}, "global": True, "coverage": GLOBAL,
    "sourceResolution": "232 m/px in the USGS source mosaic",
    "shippedResolution": "2048 × 1024, assembled from level 2 Trek tiles",
    "observationDates": "Viking Orbiter imaging; the mosaic combines observations",
    "credit": "NASA/JPL-Caltech/USGS; NASA Solar System Treks",
    "terms": "USGS lists the source mosaic as public domain. Credit NASA/JPL-Caltech/USGS and NASA Solar System Treks.",
    "sourceUrls": [TREK.format(L=L), "https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m"],
    "downloaded": "NASA Mars Trek geographic tile matrix, level 2",
    "processing": "Assembled tiles in row and column order. Uses the geographic footprint from longitude −180 to 180° and latitude −90 to 90°.",
}, "layers/global/viking-color.jpg")

L = "Mars_MGS_MOLA_ClrShade_merge_global_463m"; U = "833ace00-106b-45d2-8144-aeb1bea43105"
d = {
    "id": "mola-color-hillshade", "title": "MGS MOLA, Global Color Hillshade", "group": "terrain",
    "trekLayerId": L, "productId": L + " (Trek item 833ace00-106b-45d2-8144-aeb1bea43105)",
    "mission": "Mars Global Surveyor", "instrument": "Mars Orbiter Laser Altimeter (MOLA)",
    "measures": "Surface elevation shown as colour over a shaded-relief rendering of the topography",
    "units": "m (colour = elevation)", "verticalDatum": "MOLA areoid (GMM-2B gravity field, degree and order 50), per the Trek MOLA DEM abstract",
    "treatment": "false-color",
    "legend": {"type": "gradient", "stops": elev_stops("layers/global/mola-color-hillshade.jpg"),
               "range": {"min": -8200, "max": 21229, "label": "Trek legend: -8200 m minimum, 21229 m maximum; above 9000 m only on the large volcanoes"},
               "note": "Stop colours are the median colour of this image at pixels whose MOLA DEM elevation is within 300 m of the stop value, so they include the hillshade. The Trek legend image (sourceUrls) gives the value range and tick positions; its swatches carry crater texture and were not used for colours."},
    "global": True, "coverage": GLOBAL,
    "sourceResolution": "463 m/px (128 px/deg MOLA MEGDR blend); Trek pyramid to zoom 7 = " + zres(7),
    "shippedResolution": "4096x2048 = " + zres(3) + "; low-memory variant 1024x512",
    "observationDates": "MOLA altimetry 1997-2001 (Trek abstract: more than 600 million measurements gathered 1999-2001)",
    "credit": "NASA/JPL-Caltech Mars Trek; MOLA Science Team (NASA/GSFC)", "terms": NASA_TERMS,
    "sourceUrls": trek_urls(L, U),
    "downloaded": TILE.format(L=L, z=3, ext="jpg") + " ; zoom 3, 16 cols x 8 rows = 128 tiles, all HTTP 200",
    "processing": "Read WMTSCapabilities: TileMatrixSet default028mm, TopLeftCorner -180 90 at every level, level 0 = 2x1 tiles of 256 px, zoom 3 = 16x8 tiles = 4096x2048 px covering lon -180..180, lat 90..-90 (layer bbox -180..179.998, -89.999..90). Pasted tiles at (col*256, row*256) with no resampling; saved RGB JPEG quality 85, optimized, progressive. 1k variant: Lanczos downsample to 1024x512, JPEG quality 85.",
    "alignmentCheck": "Gradient-magnitude cross-correlation against the MOLA numerical DEM (8 px/deg export): peak at 0,0 offset at 0.25 deg/px and within 1 sample (0.125 deg, under 1 px of this 4096 image) at 0.125 deg/px. Olympus Mons summit (18.65N, 133.8W) -> pixel x=525.7, y=811.8, colour #e9fbfb (white, top of ramp); DEM there 20022 m. Hellas floor (42.4S, 70.5E) -> x=2850.1, y=1506.4, colour #4827aa (deep purple, bottom of ramp); DEM there -6044 m.",
}
add(d, "layers/global/mola-color-hillshade.jpg")
v = "layers/global/mola-color-hillshade-1k.jpg"
d["variants"] = [{"file": v, **{k: img_info(v)[k] for k in ("width", "height", "bytes")}, "use": "low-memory devices"}]

L = "Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw"; U = "eb179b2d-89a8-4c5a-baaa-f4670ff5a335"
add({
    "id": "mola-hrsc-blend", "title": "MGS MOLA and Mars Express HRSC, Color Hillshade Blend", "group": "terrain",
    "trekLayerId": L, "productId": L + " (Trek item eb179b2d-89a8-4c5a-baaa-f4670ff5a335)",
    "mission": "Mars Global Surveyor; Mars Express", "instrument": "MOLA; High Resolution Stereo Camera (HRSC)",
    "measures": "Surface elevation from the blended MOLA + HRSC terrain model, shown as colour over shaded relief",
    "units": "m (colour = elevation)", "verticalDatum": "MOLA areoid (assumed same as MOLA; the Trek abstract for the blend does not restate it)",
    "treatment": "false-color",
    "legend": {"type": "gradient", "stops": elev_stops("layers/global/mola-hrsc-blend.jpg"),
               "range": {"min": -8200, "max": 21229, "label": "Trek serves the same legend image as the MOLA colour hillshade"},
               "note": "Stop colours are the median colour of this image at MOLA DEM elevations within 300 m of each value. Hue order matches the MOLA ramp; this rendering is darker."},
    "global": True, "coverage": GLOBAL,
    "sourceResolution": "200 m/px blended DEM; Trek pyramid to zoom 8 = " + zres(8),
    "shippedResolution": "4096x2048 = " + zres(3),
    "observationDates": "MOLA 1997-2001; HRSC DTMs from Mars Express (in orbit since Dec 2003); exact HRSC set not stated by Trek",
    "credit": "NASA/JPL-Caltech Mars Trek; MOLA Science Team; ESA/DLR/FU Berlin (HRSC)",
    "terms": "MOLA: NASA data, not copyrighted in the US. HRSC: ESA/DLR/FU Berlin data, credit required; ESA terms apply.",
    "sourceUrls": trek_urls(L, U),
    "downloaded": TILE.format(L=L, z=3, ext="jpg") + " ; zoom 3, 128 tiles, all HTTP 200",
    "processing": "Same grid as the basemap (TopLeftCorner -180 90, zoom 3 = 4096x2048, layer bbox global). Tiles pasted without resampling; RGB JPEG quality 85.",
    "alignmentCheck": "Gradient cross-correlation with the MOLA DEM peaks within 1 sample (0.125 deg).",
}, "layers/global/mola-hrsc-blend.jpg")

L = "mola128_mola64_merge_90Nto90S_SimpleC_clon0"; U = "1cc3cfbb-ac38-46d1-a3df-5fff16ca397e"
rel = "layers/global/mola-elevation-1440x720.f32"
add({
    "id": "mola-elevation", "title": "MGS MOLA, Global DEM (numerical, 4 px/deg)", "group": "terrain",
    "trekLayerId": L, "productId": L + " (Trek ImageServer; MOLA MEGDR 128/64 px/deg merge)",
    "mission": "Mars Global Surveyor", "instrument": "Mars Orbiter Laser Altimeter (MOLA)",
    "measures": "Surface elevation in metres above the MOLA areoid",
    "units": "m", "verticalDatum": "MOLA areoid from the GMM-2B gravity field truncated to degree and order 50 (Trek abstract). Horizontal: Mars 2000 (GeoTIFF GCS_Mars_2000, WKID 104905).",
    "treatment": "grayscale",
    "legend": {"type": "none", "stops": [], "note": "Raw numbers, not an image. Shipped range -7951 to 21126.5 m (cell means)."},
    "global": True, "coverage": GLOBAL,
    "sourceResolution": "128 px/deg (463 m) where available, 64 px/deg near the poles; ImageServer pixel 0.0078122 deg, S16",
    "shippedResolution": "1440x720 = 0.25 deg/px (4 px/deg)",
    "observationDates": "MOLA altimetry 1997-2001",
    "file": rel, "format": "little-endian float32, row-major, 1440 columns x 720 rows, row 0 = 90N..89.75N, column 0 = 180W..179.75W; cell centres at lon -179.875 + 0.25*col, lat 89.875 - 0.25*row; no no-data cells",
    "width": 1440, "height": 720, "bytes": file_bytes(rel), "hasTransparency": False,
    "credit": "NASA/JPL-Caltech Mars Trek; MOLA Science Team (NASA/GSFC)", "terms": NASA_TERMS,
    "sourceUrls": ["https://trek.nasa.gov/mars/trekarcgis/rest/services/" + L + "/ImageServer?f=json", ABS.format(L=L), SRV.format(U=U)],
    "downloaded": "https://trek.nasa.gov/mars/trekarcgis/rest/services/" + L + "/ImageServer/exportImage?bbox=-180,-90,180,90&bboxSR=104905&imageSR=104905&size=2880,1440&format=tiff&pixelType=F32&f=image ; one 2880x1440 float32 GeoTIFF (18.1 MB, kept in scratch only). A 5760x2880 request returned HTTP 500.",
    "processing": "GeoTIFF tie point (-180, 90), pixel 0.125 deg (checked from ModelTiepoint/ModelPixelScale tags). Averaged 2x2 blocks to 1440x720 and wrote raw little-endian float32. The server resampled the 128 px/deg source by nearest neighbour, so each 0.25 deg cell is the mean of 4 point samples, not a full-area mean.",
    "alignmentCheck": "ImageServer identify: 20022 m at 18.65N 133.8W (Olympus Mons summit area) and -6044 m at 42.4S 70.5E (Hellas). In the shipped grid the maximum, 21126.5 m, is at 17.375N 132.625W (Olympus Mons) and the minimum, -7951 m, is at 32.875S 62.375E (Hellas floor).",
})

L = "mola_roughness"; U = "ff4f8d5e-ae05-4513-a521-1e169a6286ae"
add({
    "id": "mola-roughness", "title": "MGS MOLA, Global Surface Roughness", "group": "hazards",
    "trekLayerId": L, "productId": L, "mission": "Mars Global Surveyor", "instrument": "MOLA",
    "measures": "Kilometre-scale surface roughness from MOLA topography (Kreslavsky and Head 2000). Brighter = rougher; hue shows which baseline dominates.",
    "units": "none (RGB composite of roughness at three baselines)", "verticalDatum": None,
    "treatment": "false-color",
    "legend": {"type": "categorical", "stops": [
        {"value": "R", "color": "#ff0000", "label": "red channel: roughness at 9.2 km baseline"},
        {"value": "G", "color": "#00ff00", "label": "green channel: roughness at 2.4 km baseline"},
        {"value": "B", "color": "#0000ff", "label": "blue channel: roughness at 0.6 km baseline"}],
        "note": "Channel meanings from the Trek abstract. No numeric scale is published by Trek (legend endpoint HTTP 500). Read as relative: brighter = rougher."},
    "global": True, "coverage": GLOBAL,
    "sourceResolution": "8 px/deg (~7.5 km), per the Trek abstract; Trek pyramid max zoom 1",
    "shippedResolution": "1024x512 = " + zres(1) + " (Trek's highest level; not upsampled)",
    "observationDates": "MOLA altimetry 1997-2001",
    "credit": "NASA/JPL-Caltech Mars Trek; Kreslavsky and Head (2000), JGR 105(E11), 26695-26711", "terms": NASA_TERMS,
    "sourceUrls": trek_urls(L, U, legend=False),
    "downloaded": TILE.format(L=L, z=1, ext="png") + " ; zoom 1, 4x2 = 8 tiles, all HTTP 200 (zoom 2 returns 404)",
    "processing": "Stitched 8 PNG tiles (TopLeftCorner -180 90) into 1024x512 RGBA; reduced to a 256-colour palette PNG (Pillow FASTOCTREE, no dither). Median per-pixel colour error 9/255.",
}, "layers/global/mola-roughness.png")

# ---------------- materials / weather: TES ----------------
TES_PAPER = "Bandfield (2002), JGR 107(E6), 5042"


def tes_mineral(id_, L, U, title, mineral, legend_stops, legend_ok, extra_note=""):
    stops = []
    if legend_ok:
        for s in legend_stops:
            lab = f"{s['value']:g}"
            if s["value"] == 0.1:
                lab += " (detection limit)"
            stops.append({"value": s["value"], "color": s["color"], "label": lab})
    return {
        "id": id_, "title": title, "group": "materials",
        "trekLayerId": L, "productId": L + f" (Trek item {U})", "mission": "Mars Global Surveyor",
        "instrument": "Thermal Emission Spectrometer (TES)",
        "measures": f"Surface concentration of {mineral} from TES spectral deconvolution",
        "units": "areal concentration fraction (0-1); values below 0.1 are under the detection limit",
        "verticalDatum": None,
        "treatment": "false-color" if legend_ok else "qualitative",
        "legend": ({"type": "gradient", "stops": stops,
                    "note": "Values from the Trek legend image (0 to 0.2, detection-limit tick at 0.1 at mid-bar, so linear). Colours sampled from that legend; the tiles use a more saturated purple-to-red ramp in the same order, so colour-to-value reading is approximate. Ordering verified: high at Syrtis Major, low over dusty Arabia and Amazonis." + extra_note}
                   if legend_ok else
                   {"type": "none", "stops": [],
                    "note": "Qualitative. The Trek legend endpoint returns HTTP 500 for this layer. The abstract quotes concentrations of 0-0.20, and the sibling TES mineral maps use a 0-0.2 purple-to-red ramp, but this layer's scale is not verified. Purple = low, red = high." + extra_note}),
        "global": True, "coverage": {"west": -180, "east": 178.59, "south": -87.54, "north": 82.27},
        "sourceResolution": "TES deconvolution at 1 px/deg, map at 4 px/deg (~16 km) per the Trek abstract; Trek pyramid max zoom 1",
        "shippedResolution": "1024x512 = " + zres(1) + " (Trek's highest level; not upsampled to 2048x1024)",
        "observationDates": "MGS TES mapping-phase spectra (mapping began 1999); see " + TES_PAPER,
        "credit": "NASA/JPL-Caltech Mars Trek; MGS TES team (Arizona State University); " + TES_PAPER, "terms": NASA_TERMS,
        "sourceUrls": trek_urls(L, U),
        "downloaded": TILE.format(L=L, z=1, ext="png") + " ; zoom 1, 8 tiles, all HTTP 200 (zoom 2 returns 404)",
        "processing": "Stitched 8 RGBA PNG tiles (TopLeftCorner -180 90) to 1024x512. Kept the source alpha: no-data (polar gaps, orbit-track gaps, masked Hellas) stays transparent. Reduced to a 256-colour palette PNG with alpha (Pillow FASTOCTREE, no dither); no opaque pixel became transparent and no transparent pixel became visible; median colour error about 10/255. Coverage bounds measured from alpha.",
    }


add(tes_mineral("tes-plagioclase", "TES_Plagioclase", "ac842ac0-e5dc-4b1e-846f-76c3857d7d1e", "MGS TES, Global Plagioclase Abundance", "plagioclase feldspar", tes_stops["TES_Plagioclase.jpg"], True), "layers/global/tes-plagioclase.png")
layers[-1]["coverage"] = {"west": -180, "east": 178.59, "south": -87.19, "north": 82.62}
add(tes_mineral("tes-high-ca-pyroxene", "TES_Clinopyroxene", "ce8340b2-823b-40a0-9db3-948da9813a16", "MGS TES, Global High-Ca Pyroxene Abundance", "high-calcium pyroxene (clinopyroxene)", tes_stops["TES_Clinopyroxene.jpg"], True), "layers/global/tes-high-ca-pyroxene.png")
add(tes_mineral("tes-sheet-silicates-glass", "TES_Glass_Clay", "a4170f68-83f3-43c3-b549-4c27d866bcee", "MGS TES, Global Sheet Silicates/High-Si Glass", "sheet silicates and high-silica glass (one spectral end-member group)", None, False, " Trek notes this map is noisier because its spectral shape resembles atmospheric dust."), "layers/global/tes-sheet-silicates-glass.png")

L = "TES_Dust"; U = "9d856cbb-5ab2-4b53-94d2-68e768d1afdf"
add({
    "id": "tes-dust-cover", "title": "MGS TES, Global Dust (Dust Cover Index)", "group": "weather",
    "trekLayerId": L, "productId": L + " (Trek item 9d856cbb-5ab2-4b53-94d2-68e768d1afdf)",
    "mission": "Mars Global Surveyor", "instrument": "Thermal Emission Spectrometer (TES)",
    "measures": "Relative amount of fine dust covering the ground (surface dust cover, not airborne dust)",
    "units": "relative index, Trek display scale 0-1 (unitless)", "verticalDatum": None,
    "treatment": "false-color",
    "legend": {"type": "gradient", "stops": [
        {"value": 0, "color": tes_stops["TES_Dust"][0]["color"], "label": "0: least dust cover"},
        {"value": 0.25, "color": tes_stops["TES_Dust"][1]["color"], "label": ""},
        {"value": 0.5, "color": tes_stops["TES_Dust"][2]["color"], "label": ""},
        {"value": 0.75, "color": tes_stops["TES_Dust"][3]["color"], "label": ""},
        {"value": 1, "color": tes_stops["TES_Dust"][4]["color"], "label": "1: most dust cover"}],
        "note": "Endpoints 0 and 1 come from the Trek legend image; intermediate positions assume a linear bar. Trek does not say how 0-1 maps to the Ruff and Christensen (2002) emissivity-based DCI, so read the values as relative. Direction checked on the tiles: high over Tharsis, Arabia and Amazonis (known dusty), low over Syrtis Major and Acidalia (known dust-poor) and over Solis Planum. Tile colours are a more saturated version of the legend ramp."},
    "global": True, "coverage": {"west": -180, "east": 178.59, "south": -87.54, "north": 82.27},
    "sourceResolution": "16 px/deg (~3.5 km) per the Trek abstract; Trek pyramid max zoom 1",
    "shippedResolution": "1024x512 = " + zres(1) + " (Trek's highest level for this layer)",
    "observationDates": "MGS TES mapping-phase data; see Ruff and Christensen (2002), JGR 107(E12), 5127",
    "credit": "NASA/JPL-Caltech Mars Trek; MGS TES team (ASU); Ruff and Christensen (2002)", "terms": NASA_TERMS,
    "sourceUrls": trek_urls(L, U),
    "downloaded": TILE.format(L=L, z=1, ext="png") + " ; zoom 1, 8 tiles, all HTTP 200 (zoom 2 returns 404)",
    "processing": "Same as the TES mineral layers: stitched 1024x512 RGBA, source alpha kept, 256-colour palette PNG with alpha.",
}, "layers/global/tes-dust-cover.png")

L = "TES_Thermal_Inertia"; U = "0370fb88-8efd-4844-9e92-74665f342c33"
ti = tes_stops["TES_TI"]
add({
    "id": "tes-thermal-inertia", "title": "MGS TES, Global Thermal Inertia", "group": "materials",
    "trekLayerId": L, "productId": L + " (Trek item 0370fb88-8efd-4844-9e92-74665f342c33)",
    "mission": "Mars Global Surveyor", "instrument": "Thermal Emission Spectrometer (TES)",
    "measures": "How well the top few centimetres store heat: low = fine dust or sand, high = rock, bedrock or cemented ground",
    "units": "J m^-2 K^-1 s^-1/2 (thermal inertia units)", "verticalDatum": None,
    "treatment": "false-color",
    "legend": {"type": "gradient", "stops": [
        {"value": 25, "color": ti[0]["color"], "label": "25"},
        *[{"value": None, "position": s["position"], "color": s["color"], "label": ""} for s in ti[1:-1]],
        {"value": 600, "color": ti[-1]["color"], "label": "600"}],
        "note": "Endpoints 25 and 600 from the Trek legend image. Trek does not say whether the bar is linear or logarithmic, so intermediate stops carry only their position (0-1) along the bar, not a value. Units from Putzig et al. (2005). Direction verified: low over dusty Tharsis, Arabia and Amazonis; higher at Syrtis, Acidalia and Solis. Cross-correlation with THEMIS night IR peaks at zero offset."},
    "global": True, "coverage": {"west": -180, "east": 178.59, "south": -77.70, "north": 61.88},
    "sourceResolution": "20 px/deg (~3 km) per the Trek abstract; Trek pyramid max zoom 1",
    "shippedResolution": "1024x512 = " + zres(1) + " (Trek's highest level for this layer)",
    "observationDates": "MGS TES nighttime data; see Putzig et al. (2005), Icarus 173, 325-341",
    "credit": "NASA/JPL-Caltech Mars Trek; MGS TES team (ASU); Putzig et al. (2005)", "terms": NASA_TERMS,
    "sourceUrls": trek_urls(L, U),
    "downloaded": TILE.format(L=L, z=1, ext="png") + " ; zoom 1, 8 tiles, all HTTP 200 (zoom 2 returns 404)",
    "processing": "Stitched 1024x512 RGBA, source alpha kept (no data poleward of ~62N and ~78S), 256-colour palette PNG with alpha.",
}, "layers/global/tes-thermal-inertia.png")

# ---------------- THEMIS ----------------
for id_, L, U, title, meas in [
    ("themis-day-ir", "THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018", "26a567c7-79b5-4b8b-a7d6-3276b267150f", "MO THEMIS-IR Day, Global Mosaic",
     "Daytime thermal-infrared brightness; mostly shows topography (sunward slopes warmer and brighter)"),
    ("themis-night-ir", "THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018", "ecbd1840-2302-49c8-be40-86740c21ea98", "MO THEMIS-IR Night, Global Mosaic",
     "Nighttime thermal-infrared brightness; brighter = warmer at night, a proxy for higher thermal inertia (rock rather than dust)")]:
    add({
        "id": id_, "title": title, "group": "materials",
        "trekLayerId": L, "productId": L + f" (Trek item {U}; THEMIS controlled mosaic v2, Oct 2018 release)",
        "mission": "2001 Mars Odyssey", "instrument": "Thermal Emission Imaging System (THEMIS), IR",
        "measures": meas, "units": "relative brightness (8-bit, not calibrated temperature)", "verticalDatum": None,
        "treatment": "grayscale",
        "legend": {"type": "none", "stops": [], "note": "Qualitative: brighter = warmer. Trek publishes no legend (HTTP 500), and the mosaic is contrast-normalised per image, so do not read absolute temperatures."},
        "global": False, "coverage": {"west": -180, "east": 180, "south": -65.57, "north": 65.39},
        "sourceResolution": "100 m/px controlled mosaic, +/-65 deg latitude; Trek pyramid to zoom 9 = " + zres(9),
        "shippedResolution": "2048x1024 = " + zres(2),
        "observationDates": "Odyssey THEMIS IR (mapping since 2002); mosaic released Oct 2018",
        "credit": "NASA/JPL-Caltech/Arizona State University (THEMIS); Mars Trek", "terms": NASA_TERMS,
        "sourceUrls": trek_urls(L, U, legend=False) + ["https://trek.nasa.gov/mars/TrekWS/rest/cat/metadata/fgdc/html?label=" + L],
        "downloaded": TILE.format(L=L, z=2, ext="png") + " ; zoom 2, 8x4 = 32 tiles, all HTTP 200",
        "processing": "Stitched 32 RGBA PNG tiles (TopLeftCorner -180 90) to 2048x1024. Source is grey (R=G=B checked), so saved as 8-bit grey + alpha PNG; source alpha kept (outside +/-65 deg and gaps are transparent). Coverage from alpha." + (" Gradient cross-correlation against the MOLA DEM peaks at zero offset (0.25 deg grid)." if id_ == "themis-day-ir" else " Trek's zoom-2 and zoom-3 tiles have a stepped hole (about 45W-0, 0-65S) that the higher levels fill. That area was patched from the zoom-5 tiles (lon -45..0, lat -67.5..0, 96 tiles) and the zoom-6 tiles (lon -5.625..0, lat -22.5..0, 16 tiles), using an alpha-weighted block mean (8x8 and 16x16), only where the zoom-2 pixel was not fully opaque. Where both levels have data, the mean difference is about 9/255 grey levels. The thin orbit-track gaps near +/-60 deg are left transparent as in Trek's tiles."),
        "global_note": "Coverage limited to about 65S-65N",
    }, f"layers/global/{id_}.png")
    layers[-1].pop("global_note")

# ---------------- vector detection layers ----------------
AQ = "Aquieous_Mineral_Distribution_Options_clon0"
aq_cols = [("carbonate", "#33cc00"), ("chloride", "#ffff00"), ("phyllosilicate", "#0099ff"), ("silica", "#9900cc"), ("sulfate", "#ff6699")]
add({
    "id": "aqueous-minerals", "title": "Aqueous Mineral Distribution", "group": "materials",
    "trekLayerId": "Aqueous_Mineral_Distribution_Options_clon0", "productId": f"Trek MapServer {AQ}/0 (4572 point features)",
    "mission": "Mars Reconnaissance Orbiter; Mars Express; 2001 Mars Odyssey", "instrument": "CRISM; OMEGA; THEMIS (compilation)",
    "measures": "Locations where minerals that form in water were detected from orbit, by mineral class (presence, not abundance)",
    "units": "none (detection locations)", "verticalDatum": None, "treatment": "qualitative",
    "legend": {"type": "categorical", "stops": [{"value": c, "color": col, "label": c} for c, col in aq_cols],
               "note": "Colours are the jC_fillclr attribute of each Trek feature, which also matches the Trek legend image. The Trek abstract calls sulfates orange; the feature colour is pink (#ff6699). Counts: phyllosilicate 3441, sulfate 387, silica 364, chloride 344, carbonate 36."},
    "global": True, "coverage": {"west": -179.47, "east": 180, "south": -66.45, "north": 68.55},
    "sourceResolution": "point locations (vector)", "shippedResolution": "2048x1024 raster of 5 px dots + GeoJSON points",
    "observationDates": "Compilation published 2014 (Ehlmann and Edwards, Annu. Rev. Earth Planet. Sci. 42, 291-315)",
    "credit": "NASA/JPL-Caltech Mars Trek; Ehlmann and Edwards (2014)", "terms": NASA_TERMS + " Cite the source paper.",
    "sourceUrls": [f"https://trek.nasa.gov/mars/trekarcgis/rest/services/{AQ}/MapServer?f=json", f"https://trek.nasa.gov/mars/trekarcgis/rest/services/{AQ}/MapServer/0?f=json",
                   ABS.format(L="Aqueous_Mineral_Distribution_Options_clon0"), LEG.format(L="Aqueous_Mineral_Distribution_Options_clon0"), SRV.format(U="dd2e18f9-e698-4f8d-b5c7-895992bffbc2")],
    "downloaded": f"https://trek.nasa.gov/mars/trekarcgis/rest/services/{AQ}/MapServer/0/query?where=FID>=a AND FID<=b&outFields=*&f=geojson ; 10 requests of up to 500 features (the server has no pagination; max 1000 per request); 4572 of 4572 object ids. Trek has no WMTS for this layer (capabilities 404).",
    "processing": "Plotted each point as a 5 px dot (class colour, 1 px black outline) on a transparent 2048x1024 equirectangular canvas, x=(lon+180)/360*2048, y=(90-lat)/180*1024; rare classes drawn last. Also wrote GeoJSON with coordinates rounded to 0.001 deg and the Class property. Dots are display markers; their size is not the deposit size.",
    "featuresFile": "layers/global/aqueous-minerals.geojson", "featuresBytes": file_bytes("layers/global/aqueous-minerals.geojson"), "featureCount": 4572,
}, "layers/global/aqueous-minerals.png")

HY = "Hydrous_Mineral_Detections_OMEGA_CRISM_clon0"
add({
    "id": "hydrous-minerals", "title": "Hydrous Mineral Detections (OMEGA, CRISM)", "group": "materials",
    "trekLayerId": "Hydrous_Mineral_Detections_CRISM_clon0", "productId": f"Trek MapServer {HY}/0 (1648 point features)",
    "mission": "Mars Reconnaissance Orbiter; Mars Express", "instrument": "CRISM; OMEGA",
    "measures": "Locations of near-infrared detections of hydrous minerals (clays, hydrated salts and others), coloured by instrument",
    "units": "none (detection locations)", "verticalDatum": None, "treatment": "qualitative",
    "legend": {"type": "categorical", "stops": [{"value": "CRISM", "color": "#ff0000", "label": "CRISM detection (1208)"}, {"value": "OMEGA", "color": "#0099ff", "label": "OMEGA detection (440)"}],
               "note": "Colours are each feature's jC_fillclr attribute. Trek's own renderer draws every point in one purple; the attribute colours are used here so the instrument is visible. Mineral type is not in the attributes."},
    "global": True, "coverage": {"west": -180, "east": 180, "south": -60.64, "north": 82.09},
    "sourceResolution": "point locations (vector)", "shippedResolution": "2048x1024 raster of 5 px dots + GeoJSON points",
    "observationDates": "Survey published 2013 (Carter et al., JGR Planets 118, 831-858)",
    "credit": "NASA/JPL-Caltech Mars Trek; Carter et al. (2013); CRISM (NASA/JHU-APL), OMEGA (ESA/IAS)", "terms": NASA_TERMS + " Cite the source paper.",
    "sourceUrls": [f"https://trek.nasa.gov/mars/trekarcgis/rest/services/{HY}/MapServer?f=json", f"https://trek.nasa.gov/mars/trekarcgis/rest/services/{HY}/MapServer/0?f=json",
                   ABS.format(L="Hydrous_Mineral_Detections_CRISM_clon0"), SRV.format(U="ab0cdc7b-2152-4a91-8023-ae06c09967da")],
    "downloaded": f"https://trek.nasa.gov/mars/trekarcgis/rest/services/{HY}/MapServer/0/query (FID ranges, f=geojson); 4 requests, 1648 of 1648 features. No WMTS (capabilities 404).",
    "processing": "Plotted OMEGA then CRISM points as 5 px dots with a 1 px black outline on a transparent 2048x1024 canvas. Geometry longitudes (-180..180) used; note the source's Longitude and Long_East attributes are swapped relative to their names. GeoJSON keeps the Instrument property.",
    "featuresFile": "layers/global/hydrous-minerals.geojson", "featuresBytes": file_bytes("layers/global/hydrous-minerals.geojson"), "featureCount": 1648,
}, "layers/global/hydrous-minerals.png")

CH = "Chloride_Salt_bearing_Material_THEMIS_clon0"
add({
    "id": "chloride-deposits", "title": "Chloride Salt-bearing Materials", "group": "materials",
    "trekLayerId": "Chloride_Salt-bearing_Material_THEMIS_clon0", "productId": f"Trek MapServer {CH}/0 (642 polygon features)",
    "mission": "2001 Mars Odyssey", "instrument": "THEMIS (IR spectral units)",
    "measures": "Outlines of proposed chloride (salt) deposits detected in THEMIS multispectral thermal-infrared images",
    "units": "none (deposit outlines)", "verticalDatum": None, "treatment": "qualitative",
    "legend": {"type": "categorical", "stops": [{"value": "chloride", "color": "#ffdd00", "label": "chloride-bearing deposit"}],
               "note": "Trek draws these as light-blue outlines with no fill. Here they are filled yellow and each deposit also gets a 5 px marker at its centroid, because most deposits are smaller than one pixel at 2048 px."},
    "global": True, "coverage": {"west": -180, "east": 180, "south": -56.60, "north": 23.55},
    "sourceResolution": "polygons (vector)", "shippedResolution": "2048x1024 raster + GeoJSON polygons",
    "observationDates": "Published 2010 (Osterloo et al., JGR 115, E10012)",
    "credit": "NASA/JPL-Caltech Mars Trek; Osterloo et al. (2010); THEMIS (NASA/JPL-Caltech/ASU)", "terms": NASA_TERMS + " Cite the source paper.",
    "sourceUrls": [f"https://trek.nasa.gov/mars/trekarcgis/rest/services/{CH}/MapServer?f=json", f"https://trek.nasa.gov/mars/trekarcgis/rest/services/{CH}/MapServer/0?f=json",
                   ABS.format(L="Chloride_Salt-bearing_Material_THEMIS_clon0"), SRV.format(U="90039c0f-c667-4cb5-9a47-6b70396190f5")],
    "downloaded": f"https://trek.nasa.gov/mars/trekarcgis/rest/services/{CH}/MapServer/0/query (FID ranges, f=geojson); 2 requests, 642 of 642 features (Polygon and MultiPolygon). No WMTS (capabilities 404).",
    "processing": "Filled each polygon and drew a 5 px centroid marker on a transparent 2048x1024 canvas. GeoJSON keeps the Name property (encodes lat/lon), coordinates rounded to 0.0001 deg.",
    "featuresFile": "layers/global/chloride-deposits.geojson", "featuresBytes": file_bytes("layers/global/chloride-deposits.geojson"), "featureCount": 642,
}, "layers/global/chloride-deposits.png")

# ---------------- GRS (PDS) ----------------
GRSB = "https://pds-geosciences.wustl.edu/ody/ody-m-grs-5-elements-v1/odgm_xxxx/data/smoothed/"
for id_, el, title, meas, smooth in [
    ("grs-silicon", "si", "Mars Odyssey GRS, Silicon Concentration", "Silicon in the top few tens of centimetres of the surface, by weight", "15-degree boxcar smoothing, normalised to the Pathfinder Si values"),
    ("grs-water", "h2o", "Mars Odyssey GRS, Water (H2O) Concentration", "Water-equivalent hydrogen in the top few tens of centimetres, by weight (mid-latitudes only in this product)", "10-degree boxcar smoothing"),
    ("grs-iron", "fe", "Mars Odyssey GRS, Iron Concentration", "Iron in the top few tens of centimetres of the surface, by weight", "10-degree boxcar smoothing")]:
    g = grs[id_]
    rel = f"layers/global/{id_}.png"
    drel = f"layers/global/{id_}-72x36.f32"
    add({
        "id": id_, "title": title, "group": "materials",
        "trekLayerId": None, "productId": f"ODY-M-GRS-5-ELEMENTS-V1.0 / {el.upper()}_SR_5X5 (product version 2.0)",
        "mission": "2001 Mars Odyssey", "instrument": "Gamma Ray Spectrometer (GRS)",
        "measures": meas, "units": "weight percent", "verticalDatum": None, "treatment": "false-color",
        "legend": {"type": "gradient", "stops": g["stops"],
                   "note": f"Colour ramp applied here to the PDS numbers (linear, clipped at the end stops). Data range {g['min']:.2f}-{g['max']:.2f} wt%."},
        "global": False, "coverage": {"west": -180, "east": 180, "south": -60, "north": 60},
        "sourceResolution": f"5 x 5 deg bins ({smooth}); 1508 of 2592 bins have data",
        "shippedResolution": "1440x720 PNG (each 5 deg bin = 20x20 px, nearest neighbour); numeric 72x36 grid",
        "observationDates": "2002-06-04 to 2005-04-03 (PDS label START_TIME/STOP_TIME)",
        "dataFile": drel, "dataBytes": file_bytes(drel),
        "dataFormat": "little-endian float32, 72 columns x 36 rows, row 0 = 90N..85N, column 0 = 180W..175W, NaN = no data, values in weight percent",
        "credit": "NASA/JPL/University of Arizona (Mars Odyssey GRS); PDS Geosciences Node", "terms": NASA_TERMS,
        "sourceUrls": [GRSB + f"{el}_sr_5x5.lbl", GRSB + f"{el}_sr_5x5.tab", "https://pds-geosciences.wustl.edu/missions/odyssey/grs.html"],
        "downloaded": GRSB + f"{el}_sr_5x5.tab (2592 rows) and .lbl; not in Trek (Trek search for GRS, Gamma, Silicon, Hydrogen returned 0 items)",
        "processing": "Parsed the TAB (lat/lon bin centres, lon 0-360E converted to -180..180, NOT_APPLICABLE 9999.999 -> NaN) into a 72x36 grid. Wrote float32 and a 1440x720 RGBA PNG: viridis key colours stretched linearly between the legend end stops, alpha 0 where NaN.",
    }, rel)

# ---------------- regional ----------------
r = reg["h2942_0000_nd3_z6"]
L = "h2942_0000_nd3"; U = "f9c95b2f-8cf9-40ab-b2ec-b74d9c9d0c9f"
add({
    "id": "hrsc-viking1-h2942", "title": "Mars Express HRSC, Viking 1 Landing Site Mosaic (orbit 2942)", "group": "terrain",
    "trekLayerId": L, "productId": L + " (HRSC orbit 2942, nadir channel, level 3 per the name; Trek item f9c95b2f-8cf9-40ab-b2ec-b74d9c9d0c9f)",
    "mission": "Mars Express", "instrument": "High Resolution Stereo Camera (HRSC), nadir",
    "measures": "Visible-light greyscale image of the surface (Chryse Planitia, Viking 1 landing region)",
    "units": "8-bit greyscale", "verticalDatum": None, "treatment": "grayscale",
    "legend": {"type": "none", "stops": []},
    "global": False, "coverage": {k: round(v, 6) for k, v in r["bounds"].items()},
    "sourceResolution": "Trek pyramid to zoom 10 = " + zres(10) + "; native HRSC nadir is finer, but Trek's top level sets what is servable",
    "shippedResolution": f"{r['crop'][0]}x{r['crop'][1]} = " + zres(6),
    "observationDates": "HRSC orbit 2942 (date not given by Trek)",
    "credit": "ESA/DLR/FU Berlin; NASA/JPL-Caltech Mars Trek", "terms": "ESA/DLR/FU Berlin data: credit required; ESA terms apply.",
    "sourceUrls": trek_urls(L, U, legend=False),
    "downloaded": TILE.format(L=L, z=6, ext="png") + f" ; zoom 6, rows {r['rows'][0]}-{r['rows'][1]}, cols {r['cols'][0]}-{r['cols'][1]} = {r['tiles']} tiles, all HTTP 200",
    "processing": "Capabilities bbox -49.5924103, 14.0680405 to -46.3979178, 26.8116326. Stitched the covering zoom-6 tiles and cropped to the bbox, snapped to whole pixels (bounds recorded in coverage). Grey + alpha PNG; the strip's no-data margins stay transparent. Not stretched; place it at the coverage bounds.",
}, "layers/regional/hrsc-viking1-h2942.png")

r = reg["Hebrus_CTX_BlockAdj_dd_z7"]
L = "Hebrus_CTX_BlockAdj_dd"; U = "86588b58-d194-403d-a677-07d45608dfa5"
add({
    "id": "ctx-hebrus-valles", "title": "MRO CTX, Hebrus Valles Mosaic", "group": "terrain",
    "trekLayerId": L, "productId": L + " (CTX block-adjusted mosaic; Trek item 86588b58-d194-403d-a677-07d45608dfa5)",
    "mission": "Mars Reconnaissance Orbiter", "instrument": "Context Camera (CTX)",
    "measures": "Visible-light greyscale image of the surface (Hebrus Valles channels)",
    "units": "8-bit greyscale", "verticalDatum": None, "treatment": "grayscale",
    "legend": {"type": "none", "stops": []},
    "global": False, "coverage": {k: round(v, 6) for k, v in r["bounds"].items()},
    "sourceResolution": "CTX ~6 m/px; Trek pyramid to zoom 12 = " + zres(12),
    "shippedResolution": f"{r['crop'][0]}x{r['crop'][1]} = " + zres(7),
    "observationDates": "Not given by Trek",
    "credit": "NASA/JPL-Caltech/MSSS (CTX); Mars Trek", "terms": NASA_TERMS,
    "sourceUrls": trek_urls(L, U, legend=False),
    "downloaded": TILE.format(L=L, z=7, ext="png") + f" ; zoom 7, rows {r['rows'][0]}-{r['rows'][1]}, cols {r['cols'][0]}-{r['cols'][1]} = {r['tiles']} tiles, all HTTP 200",
    "processing": "Capabilities bbox 124.7528509, 18.2859829 to 128.4529109, 21.8254348. Stitched the zoom-7 tiles and cropped to the bbox, snapped to whole pixels. Grey + alpha PNG; gaps between CTX strips stay transparent. Craters and channels line up with the same area in the MOLA colour hillshade (zoom-6 comparison).",
}, "layers/regional/ctx-hebrus-valles.png")

excluded = [
    {"id": "tes-dust-cover-index-ruff", "title": "MGS TES, Global Dust Index (tes_ruffdust)", "reason": "Duplicates tes-dust-cover. No data is painted grey rather than transparent, and shaded relief is baked into the colours, so no-data can't be separated without guessing. The Trek legend endpoint returns HTTP 500, so there are no values.", "sourceUrl": TREK.format(L="tes_ruffdust")},
    {"id": "crism-carbonate-browse", "title": "MRO CRISM, Carbonate Minerals V1 Fe-Mg (frt_07_brcarj_mtr3_ll) and V2 Mg (frt_07_brcr2j_mtr3_ll)", "reason": "Not a mosaic. These are CRISM FRT footprints (MapServer feature service mars_mro_crism_mtrdr_c0a_humex_frt_sites) linking per-observation browse images. Coverage is scattered small targets with a qualitative browse colour scheme. Carbonate detections are shipped instead as the 'carbonate' class (36 sites) in aqueous-minerals.", "sourceUrl": "https://trek.nasa.gov/mars/trekarcgis/rest/services/mars_mro_crism_mtrdr_c0a_humex_frt_sites/MapServer/0"},
    {"id": "grs-in-trek", "title": "Mars Odyssey GRS element maps in Trek", "reason": "Not in Trek: searchItems for GRS, Gamma, Silicon and Hydrogen returned 0 items. Si, H2O and Fe were shipped from PDS instead (grs-silicon, grs-water, grs-iron). K, Th, Cl and K/Th exist in the same PDS volume but were not shipped (not requested).", "sourceUrl": "https://trek.nasa.gov/mars/TrekServices/ws/index/eq/searchItems?key=GRS&start=0&rows=60"},
    {"id": "mars-mgs-tes-albedo", "title": "MGS TES, Global Surface Albedo", "reason": "Not on the requested list. No legend (HTTP 500), so it could only ship as qualitative, and tes-dust-cover covers the dust question. Could be added later at 1024x512.", "sourceUrl": TREK.format(L="Mars_MGS_TES_Albedo_mosaic_global_7410m")},
    {"id": "mola-hrsc-dem-numeric", "title": "MGS MOLA and Mars Express HRSC, DEM (Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw)", "reason": "A numerical DEM already ships from MOLA (mola-elevation). At 4 px/deg the HRSC contribution (200 m) is averaged away, so a second grid would add size for no visible gain.", "sourceUrl": TREK.format(L="Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw")},
    {"id": "crism-regional-indicators", "title": "MRO CRISM Polyhydrated Sulfate Indicator, USGS Mars Chart 18 (MC18_PolySulfate_Mineral_IndicatorV2_SP); Fe-Mg Smectite Indicator, CRISM tile 1303", "reason": "Regional tiles (MC-18 quadrangle; one 6 x 6 deg tile) found in search but not requested. Not downloaded, and no legend checked.", "sourceUrl": "https://trek.nasa.gov/mars/TrekServices/ws/index/eq/searchItems?key=Sulfate&start=0&rows=60"},
]

on_demand = {
    "template": "https://trek.nasa.gov/tiles/Mars/EQ/<layer>/1.0.0/default/default028mm/{z}/{row}/{col}.jpg",
    "tileMatrix": "TileMatrixSet default028mm, CRS Mars 2000 geographic (WKID 104905), TopLeftCorner (-180, 90) at every level, 256x256 tiles. Level 0 is 2 columns x 1 row (512x256 px, 0.703125 deg/px); each level doubles both, so level z has 2^(z+1) columns x 2^z rows and 180/(256*2^z) deg/px. Rows count down from 90N, columns east from 180W. Use .png instead of .jpg where 'ext' says so. Missing tile = HTTP 404 = no coverage. The ScaleDenominator values assume Earth's 111319.49 m/deg, so derive resolution from the matrix size, not the scale.",
    "maxZoom": 7,
    "maxZoomNote": "maxZoom is for the basemap; per-layer limits are in 'layerDetails'.",
    "cors": "Access-Control-Allow-Origin: * (observed on tile GETs with Origin http://localhost:5173 for .jpg and .png tiles, and on OPTIONS). The ArcGIS ImageServer echoes the request origin with credentials; the TrekServices searchItems index sends no CORS header.",
    "layers": ["Mars_Viking_MDIM21_ClrMosaic_global_232m", "Mars_MGS_MOLA_ClrShade_merge_global_463m", "Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw", "THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018", "THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018", "TES_Thermal_Inertia", "TES_Dust", "TES_Plagioclase", "TES_Clinopyroxene", "TES_Glass_Clay", "mola_roughness", "h2942_0000_nd3", "Hebrus_CTX_BlockAdj_dd"],
    "layerDetails": {
        "Mars_Viking_MDIM21_ClrMosaic_global_232m": {"ext": "jpg", "maxZoom": 7},
        "Mars_MGS_MOLA_ClrShade_merge_global_463m": {"ext": "jpg", "maxZoom": 7},
        "Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw": {"ext": "jpg", "maxZoom": 8},
        "THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018": {"ext": "png", "maxZoom": 9},
        "THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018": {"ext": "png", "maxZoom": 9},
        "TES_Thermal_Inertia": {"ext": "png", "maxZoom": 1}, "TES_Dust": {"ext": "png", "maxZoom": 1},
        "TES_Plagioclase": {"ext": "png", "maxZoom": 1}, "TES_Clinopyroxene": {"ext": "png", "maxZoom": 1},
        "TES_Glass_Clay": {"ext": "png", "maxZoom": 1}, "mola_roughness": {"ext": "png", "maxZoom": 1},
        "h2942_0000_nd3": {"ext": "png", "maxZoom": 10}, "Hebrus_CTX_BlockAdj_dd": {"ext": "png", "maxZoom": 12},
    },
}

manifest = {
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "projection": "Equirectangular (plate carrée), Mars 2000 sphere, lon -180..180, lat 90..-90",
    "basemap": "viking-color",
    "pathsRelativeTo": "public/",
    "onDemandTiles": on_demand,
    "layers": layers,
    "excluded": excluded,
}
out = os.path.join(repo, "data/mars/layers/manifest.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(manifest, open(out, "w"), indent=2, ensure_ascii=False)
open(out, "a").write("\n")
print("layers", len(layers), "excluded", len(excluded))
