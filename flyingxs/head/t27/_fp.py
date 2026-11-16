import sys
from PIL import Image
d=sys.argv[1]
crops={'front':(150,230,650,600),'threeq':(100,250,600,620),'side':(0,250,500,620)}
rows=[]
for v,c in crops.items():
  a=Image.open(f'{d}/tripo_head_{v}.png').crop(c); b=Image.open(f'{d}/mine_head_{v}.png').crop(c)
  r=Image.new('RGB',(1010,a.height),'white'); r.paste(a,(0,0)); r.paste(b,(510,0)); rows.append(r)
o=Image.new('RGB',(1010,sum(r.height for r in rows)+20),'white'); y=0
for r in rows: o.paste(r,(0,y)); y+=r.height+10
o.save(f'{d}/face_pair.png')
