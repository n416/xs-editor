import sys
from PIL import Image, ImageDraw, ImageFont
d='head-twin'
try: F=ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc',26)
except: F=None
def pair(keys, name, crop=None):
  rows=[]
  for k,lab in keys:
    a=Image.open(f'{d}/mono_{k}.png').convert('RGB'); b=Image.open(f'{d}/twin_{k}.png').convert('RGB')
    if crop: a=a.crop(crop); b=b.crop(crop)
    w,h=a.size; r=Image.new('RGB',(2*w+10,h+40),'white'); r.paste(a,(0,40)); r.paste(b,(w+10,40))
    g=ImageDraw.Draw(r); g.text((8,4),f'前（モノアイ）  {lab}',fill='black',font=F); g.text((w+18,4),f'今（ツインアイ）  {lab}',fill='black',font=F)
    rows.append(r)
  W=max(r.width for r in rows); o=Image.new('RGB',(W,sum(r.height for r in rows)+10*len(rows)),'white'); y=0
  for r in rows: o.paste(r,(0,y)); y+=r.height+10
  o.save(f'{d}/{name}.png'); print(name,o.size)
pair([('face_front','頭の寄り・正面'),('face_threeq','頭の寄り・斜め'),('face_top','頭の寄り・上から（上が前）')],'head_pair')
pair([('head_front','頭・正面'),('head_threeq','頭・斜め'),('head_top','頭・上から（上が前）')],'head_wide_pair')
pair([('full_front','全身・正面')],'full_pair')
import os
os.makedirs(d,exist_ok=True)
for k in ('face_top','face_front'):
  for s in ('twinNH','monoNH'): pass
def pair2(keys,name):
  rows=[]
  for k,lab in keys:
    a=Image.open(f'{d}/monoNH_{k}.png').convert('RGB'); b=Image.open(f'{d}/twinNH_{k}.png').convert('RGB')
    w,h=a.size; r=Image.new('RGB',(2*w+10,h+40),'white'); r.paste(a,(0,40)); r.paste(b,(w+10,40))
    g=ImageDraw.Draw(r); g.text((8,4),f'前（モノアイ）  {lab}',fill='black',font=F); g.text((w+18,4),f'今（ツインアイ）  {lab}',fill='black',font=F); rows.append(r)
  o=Image.new('RGB',(rows[0].width,sum(r.height+10 for r in rows)),'white'); y=0
  for r in rows: o.paste(r,(0,y)); y+=r.height+10
  o.save(f'{d}/{name}.png'); print(name,o.size)
pair2([('face_top','兜・つば・後ろ頭を外して上から（上が前）'),('face_front','兜を外して正面')],'top_nohelm_pair')
