import sys, numpy as np, tifffile
from PIL import Image
raw=sys.argv[1]
dem=tifffile.imread(raw+"/dem/mola_2880,1440.tif").astype(float)
img=Image.open(raw+"/tiles/Mars_MGS_MOLA_ClrShade_merge_global_463m_z3_mosaic.png").convert("L")
lum=np.asarray(img.resize((2880,1440),Image.BILINEAR),float)
g=lambda x: np.hypot(*np.gradient(x))
band=slice(240,1200)
A=g(lum)[band]; A=(A-A.mean())/A.std(); G=g(dem)
out=[]
for dy in range(-3,4):
  for dx in range(-3,4):
    B=np.roll(np.roll(G,dy,0),dx,1)[band]; B=(B-B.mean())/B.std(); out.append(((A*B).mean(),dy,dx))
out.sort(reverse=True); print(out[:4])
