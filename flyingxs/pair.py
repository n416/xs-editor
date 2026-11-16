# 部位ごとの 2 枚組（左＝Tripo、右＝組んだ物）。python pair.py <フォルダ>  → <フォルダ>/pair_<部位>.png（4 方向を縦に並べる）
import sys
from PIL import Image, ImageDraw
d=sys.argv[1]
for rk in ('full','head','torso','arm','legs'):
    rows=[]
    for dk in ('front','side','back','threeq'):
        a=Image.open(f'{d}/tripo_{rk}_{dk}.png').convert('RGB').resize((500,500)); b=Image.open(f'{d}/mine_{rk}_{dk}.png').convert('RGB').resize((500,500))
        r=Image.new('RGB',(1010,500),'white'); r.paste(a,(0,0)); r.paste(b,(510,0)); rows.append(r)
    c=Image.new('RGB',(1010,4*500+3*10),'white')
    for i,r in enumerate(rows): c.paste(r,(0,i*510))
    ImageDraw.Draw(c).text((8,8),f'{rk}  left=Tripo  right=build',fill=(255,200,0))
    c.save(f'{d}/pair_{rk}.png')
print('ok')
