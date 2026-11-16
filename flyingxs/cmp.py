import sys
from PIL import Image
d=sys.argv[1]
ref=Image.open('ref/body-3view-D1.png').convert('RGB')
crops=[ref.crop((40,40,560,800)),ref.crop((580,40,900,800)),ref.crop((960,40,1450,800))]
def trim(im):
    import PIL.ImageChops as C
    bg=Image.new('RGB',im.size,im.getpixel((2,2))); b=C.difference(im,bg).convert('L').point(lambda v:255 if v>18 else 0).getbbox()
    return im.crop(b) if b else im
m0=(1000-1000/1.12)/2
mine=[Image.open(f'{d}/ed_{n}.png').convert('RGB').crop((0,int(m0),800,int(1000-m0))) for n in ('front','side','back')]
crops=[trim(x) for x in crops]
h=600
rs=lambda im: im.resize((max(1,int(im.width*h/im.height)),h))
r1=[rs(x) for x in crops]; r2=[rs(x) for x in mine]
w=max(sum(i.width+20 for i in r1),sum(i.width+20 for i in r2))
c=Image.new('RGB',(w,2*h+20),'white')
for row,y in ((r1,0),(r2,h+20)):
    x=0
    for i in row: c.paste(i,(x,y)); x+=i.width+20
c.save(f'{d}/cmp-3view.png'); print(c.size)
