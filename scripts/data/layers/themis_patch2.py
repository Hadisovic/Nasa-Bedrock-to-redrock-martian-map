"""Fill holes in a z2 (2048x1024) LA PNG with an alpha-weighted mean of a higher-zoom crop.
usage: themis_patch2.py BASE_LA_PNG CROP_PNG ZOOM WEST NORTH OUT"""
import sys, numpy as np
from PIL import Image
base, crop, z, W, N, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), sys.argv[6]
b = np.asarray(Image.open(base).convert("LA")).astype(float)
p = np.asarray(Image.open(crop).convert("RGBA")).astype(float)
f = 2 ** (z - 2)
h, w = p.shape[0] // f, p.shape[1] // f
g, a = p[..., 0], p[..., 3] / 255
A = a.reshape(h, f, w, f).sum((1, 3)); Gs = (g * a).reshape(h, f, w, f).sum((1, 3))
gray = np.where(A > 0, Gs / np.maximum(A, 1e-9), 0); alpha = A / (f * f) * 255
y0, x0 = round((90 - N) / 180 * 1024), round((W + 180) / 360 * 2048)
reg = b[y0:y0 + h, x0:x0 + w]
fill = (reg[..., 1] < 255) & (alpha > reg[..., 1])
both = (reg[..., 1] == 255) & (alpha == 255)
print("filled", int(fill.sum()), "overlap mean |diff| %.2f" % (np.abs(reg[..., 0][both] - gray[both]).mean() if both.any() else -1))
reg[..., 0][fill] = gray[fill]; reg[..., 1][fill] = alpha[fill]
b[y0:y0 + h, x0:x0 + w] = reg
Image.fromarray(np.clip(np.round(b), 0, 255).astype(np.uint8), "LA").save(out, optimize=True)
