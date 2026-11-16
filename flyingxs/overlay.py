# 正本の外形（赤い線）を、組んだ物のエディタの絵に同じ背の高さで重ねる。 python overlay.py <フォルダ>
import sys
from PIL import Image, ImageFilter, ImageChops
import numpy as np
d=sys.argv[1]
ref=Image.open('ref/body-3view-D1.png').convert('RGB')
crops={'front':ref.crop((40,40,560,800)),'side':ref.crop((580,40,900,800)),'back':ref.crop((960,40,1450,800))}
def mask_light(im):
    a=np.asarray(im).astype(int); bg=a[3,3]; m=np.abs(a-bg).sum(2)>40; return m
def mask_dark(im):
    a=np.asarray(im).astype(int); m=a.sum(2)>110; return m
def bbox(m):
    ys=np.where(m.any(1))[0]; xs=np.where(m.any(0))[0]; return xs[0],ys[0],xs[-1],ys[-1]
H=900; out=[]
for n in ('front','side','back'):
    r=crops[n]; mr=mask_light(r); x0,y0,x1,y1=bbox(mr); r=r.crop((x0,y0,x1+1,y1+1)); mr=mr[y0:y1+1,x0:x1+1]
    e=Image.open(f'{d}/ed_{n}.png').convert('RGB'); me=mask_dark(e); me[-60:,:]=False  # 床の格子を外す
    X0,Y0,X1,Y1=bbox(me); e=e.crop((X0,Y0,X1+1,Y1+1))
    s=H/r.height; r=r.resize((int(r.width*s),H)); mr=np.asarray(Image.fromarray(mr.astype(np.uint8)*255).resize(r.size))>127
    s2=H/e.height; e=e.resize((int(e.width*s2),H))
    W=max(r.width,e.width)+40; c=Image.new('RGB',(W,H+20),(20,22,26))
    # 左右は、正本の外形と組んだ物の外形の重なり（共通部分 / 和）がいちばん大きくなる位置で合わせる。
    # 箱の真ん中・腰から下の真ん中で合わせると、腕の構えや安定翼の左右差・横のつま先で 0.1 前後ずれた（脚・胴のスレッドが測った、11/14）
    me2=np.asarray(e.convert('RGB')).astype(int).sum(2)>110; me2[-60:,:]=False
    ex=(W-e.width)//2
    A=np.zeros((H,W),bool); A[:,ex:ex+e.width]=me2[:H,:]
    best=(-1,0)
    for dx in range(-(W-r.width), W-r.width+1, 2):
        rx0=(W-r.width)//2+dx
        if rx0<0 or rx0+r.width>W: continue
        B=np.zeros((H,W),bool); B[:,rx0:rx0+r.width]=mr[:H,:]
        iou=(A&B).sum()/max(1,(A|B).sum())
        if iou>best[0]: best=(iou,rx0)
    rx=best[1]
    c.paste(e,(ex,10))
    edge=Image.fromarray(mr.astype(np.uint8)*255).filter(ImageFilter.FIND_EDGES).filter(ImageFilter.MaxFilter(3))
    red=Image.new('RGB',r.size,(255,40,40)); c.paste(red,(rx,10),edge)
    out.append(c)
W=sum(o.width for o in out)+40; C=Image.new('RGB',(W,H+20),'white'); x=0
for o in out: C.paste(o,(x,0)); x+=o.width+20
C.save(f'{d}/overlay.png'); print(C.size)
