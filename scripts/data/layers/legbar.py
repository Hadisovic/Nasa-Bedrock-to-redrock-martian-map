import sys, numpy as np
from PIL import Image
a=np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(int)
sat=(a.max(2)-a.min(2))
# rows with many saturated pixels -> bar rows
rows=np.where((sat>40).sum(1)>a.shape[1]*0.5)[0]
print(sys.argv[1].split('/')[-1], a.shape, "bar rows", rows.min() if len(rows) else None, rows.max() if len(rows) else None)
if len(rows):
    r0,r1=rows.min(),rows.max()
    cols=np.where((sat[r0:r1+1]>40).mean(0)>0.5)[0]
    print(" bar cols", cols.min(), cols.max())
