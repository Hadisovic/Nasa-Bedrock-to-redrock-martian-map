import sys, os, numpy as np
from PIL import Image, ImageDraw
out=sys.argv[1]; files=sys.argv[2:]
W=512;H=256
sheet=Image.new("RGB",(W*2,(H+14)*((len(files)+1)//2)),(255,0,255))
for i,f in enumerate(files):
    im=Image.open(f).convert("RGBA")
    a=np.asarray(im)
    print(os.path.basename(f), im.size, "alpha0 frac %.3f"%(a[...,3]==0).mean(), "alpha partial %.3f"%((a[...,3]>0)&(a[...,3]<255)).mean())
    bg=Image.new("RGBA",im.size,(255,0,255,255)); bg.alpha_composite(im)
    t=bg.convert("RGB").resize((W,H))
    x=(i%2)*W; y=(i//2)*(H+14)
    sheet.paste(t,(x,y+14)); ImageDraw.Draw(sheet).text((x+2,y),os.path.basename(f)[:70],fill=(255,255,255))
sheet.save(out)
