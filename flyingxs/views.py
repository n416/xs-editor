# 使い方: blender -b -P views.py -- in.glb outprefix
import bpy, sys, mathutils, math
glb,out=sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
ms=[o for o in bpy.context.scene.objects if o.type=='MESH']
pts=[o.matrix_world@mathutils.Vector(c) for o in ms for c in o.bound_box]
mn=mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); mx=mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
c=(mn+mx)/2; H=(mx.z-mn.z)*1.08
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sc.render.resolution_x=600; sc.render.resolution_y=800
sc.display.shading.light='STUDIO'; sc.display.shading.color_type='MATERIAL'
sc.world=bpy.data.worlds.new('w'); sc.world.color=(0.85,0.86,0.88)
cam=bpy.data.cameras.new('c'); cam.type='ORTHO'; co=bpy.data.objects.new('c',cam); sc.collection.objects.link(co); sc.camera=co; cam.clip_end=1000
D=50
def shot(n,loc,rot,s=H,res=(600,800)):
    sc.render.resolution_x,sc.render.resolution_y=res
    co.location=loc; co.rotation_euler=rot; cam.ortho_scale=s; sc.render.filepath=f'{out}_{n}.png'; bpy.ops.render.render(write_still=True)
shot('front',(c.x,mn.y-D,c.z),(math.pi/2,0,0))
shot('side',(mn.x-D,c.y,c.z),(math.pi/2,0,-math.pi/2))
shot('back',(c.x,mx.y+D,c.z),(math.pi/2,0,math.pi))
shot('top',(c.x,c.y,mx.z+D),(0,0,0),max(mx.x-mn.x,mx.y-mn.y)*1.15,(800,800))
v=mathutils.Vector((-1,-1,0.35)).normalized(); co.location=c+v*D; co.rotation_euler=(-v).to_track_quat('-Z','Y').to_euler(); cam.ortho_scale=H; sc.render.resolution_x,sc.render.resolution_y=600,800; sc.render.filepath=f'{out}_45.png'; bpy.ops.render.render(write_still=True)
# 頭の上から
hz=mx.z-(mx.z-mn.z)*0.12
shot('headtop',(c.x,c.y,mx.z+D),(0,0,0),(mx.z-mn.z)*0.2,(600,600))
