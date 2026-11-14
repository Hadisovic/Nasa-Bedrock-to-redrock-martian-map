"""Fill Trek's zoom-2 THEMIS night IR pyramid hole with zoom-5 data (alpha-weighted 8x8 mean). usage: themis_patch.py RAW OUTPNG"""
import sys, numpy as np
from PIL import Image
raw, out = sys.argv[1:]
z2 = np.asarray(Image.open(f"{raw}/tiles/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018_z2_mosaic.png").convert("RGBA")).astype(float)
p = np.asarray(Image.open(f"{raw}/region/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018_z5_crop.png").convert("RGBA")).astype(float)
assert p.shape[:2] == (3072, 2048), p.shape
g, a = p[..., 0], p[..., 3] / 255
A = a.reshape(384, 8, 256, 8).sum((1, 3))
Gs = (g * a).reshape(384, 8, 256, 8).sum((1, 3))
gray = np.where(A > 0, Gs / np.maximum(A, 1e-9), 0)
alpha = A / 64 * 255
y0, x0 = 512, 768  # (90-0)/180*1024, (180-45)/360*2048
reg = z2[y0:y0 + 384, x0:x0 + 256]
fill = (reg[..., 3] < 255) & (alpha > reg[..., 3])
# compare where both have data (consistency of the two pyramid levels)
both = (reg[..., 3] == 255) & (alpha == 255)
print("pixels filled", int(fill.sum()), "overlap px", int(both.sum()), "mean |diff| on overlap %.2f" % np.abs(reg[..., 0][both] - gray[both]).mean())
reg[..., 0][fill] = gray[fill]; reg[..., 1][fill] = gray[fill]; reg[..., 2][fill] = gray[fill]; reg[..., 3][fill] = alpha[fill]
z2[y0:y0 + 384, x0:x0 + 256] = reg
z2 = np.clip(np.round(z2), 0, 255).astype(np.uint8)
Image.fromarray(np.dstack([z2[..., 0], z2[..., 3]]), "LA").save(out, optimize=True)
print("transparent frac after", round(float((z2[..., 3] == 0).mean()), 4))
