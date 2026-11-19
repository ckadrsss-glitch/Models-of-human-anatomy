# Export of the head & neck structures from the Z-Anatomy Blender template
# (Models-of-human-anatomy/Z-Anatomy.zip → Z-Anatomy/Startup.blend) to assets/head.glb.
#
# Requires Blender ≥ 4.2 or the `bpy` wheel (pip install bpy). Usage:
#   unzip ../Z-Anatomy.zip Z-Anatomy/Startup.blend -d /tmp/za
#   python3 tools/export_head.py /tmp/za/Z-Anatomy/Startup.blend assets/head.glb
#
# What it does:
#  * bakes modifiers (Subsurf / Mirror / Solidify) of the selected structures,
#  * keeps the enamel/root split of every tooth as two materials ("crown", "root"),
#  * subdivides the low-poly tongue (2 levels),
#  * joins the head/neck skin regions into one "Skin" mesh,
#  * recentres on (0, −0.05, 1.55) m and applies a smooth "childlike" warp that
#    shortens the facial skeleton relative to the neurocranium,
#  * exports a GLB (+Y up, metres). Licence of the output: CC BY-SA 4.0 (Z-Anatomy / BodyParts3D).
import bpy, sys, mathutils
SRC, OUT = sys.argv[1], sys.argv[2]
bpy.ops.wm.open_mainfile(filepath=SRC)
O=bpy.data.objects
pairs=lambda n:[n+".l",n+".r"]
bones=["Frontal bone","Occipital bone","Sphenoid bone","Ethmoid bone","Vomer","Mandible","Hyoid bone","Atlas (C1)","Axis (C2)"]
for n in ["Parietal bone","Temporal bone","Zygomatic bone","Nasal bone","Lacrimal bone","Palatine bone","Inferior nasal concha bone","Maxilla"]: bones+=pairs(n)
teeth=[]
for side in ["l","r"]:
  for jaw in ["Upper","Lower"]:
    for t in ["medial incisor","lateral incisor","canine","first premolar","second premolar","first molar tooth","second molar tooth"]:
      teeth.append(f"{jaw} {t}.{side}")
soft=["Gingiva","Tongue","Soft palate","Uvula of palate","Nasopharynx","Oropharynx","Mucosa of nasal cavity","Nasal septal cartilage","Epiglottis"]
for n in ["Genioglossus muscle","Hyoglossus muscle","Palatine tonsil","Orbicularis oris muscle","Major alar cartilage","Posterior segment of eyeball","Anterior segment of eyeball"]: soft+=pairs(n)
# skin: head/neck regions
skin=[]
for o in O:
  if o.type!='MESH' or not o.users_collection: continue
  if not o.users_collection[0].name.startswith("9:"): continue
  if len(o.data.vertices)<=40 or "Hair" in o.name or o.name.endswith(".g") or "Eyelash" in o.name: continue
  bb=[o.matrix_world@mathutils.Vector(c) for c in o.bound_box]
  if min(v.z for v in bb)>1.40: skin.append(o.name)
print("skin regions:",len(skin), skin)
dg=bpy.context.evaluated_depsgraph_get()
new=bpy.data.collections.new("EXPORT"); bpy.context.scene.collection.children.link(new)
CENTER=mathutils.Vector((0,-0.05,1.55))
def bake(name, outname=None, raw=False):
  o=O.get(name)
  if o is None: print("MISSING",name); return None
  e=o.evaluated_get(dg)
  me=o.data.copy() if raw else bpy.data.meshes.new_from_object(e, preserve_all_data_layers=False, depsgraph=dg)
  me.transform(o.matrix_world)
  me.transform(mathutils.Matrix.Translation(-CENTER))
  if name in TOOTHSET:
    # keep crown/root split as 2 named materials
    names=[ (s.material.name if s.material else '') for s in o.material_slots]
    for i,nm in enumerate(names): me.materials[i]=MATS['root' if 'root' in nm.lower() else 'crown']
  else:
    me.materials.clear()
  warp(me)
  o.name=o.name+"__src"
  ob=bpy.data.objects.new(outname or name, me); new.objects.link(ob)
  return ob
TOOTHSET=set(teeth)
MATS={'crown':bpy.data.materials.new('crown'),'root':bpy.data.materials.new('root')}
t=O['Tongue']; m=t.modifiers.new('ss','SUBSURF'); m.levels=2; m.render_levels=2
dg=bpy.context.evaluated_depsgraph_get()
def sstep(a,b,x):
  t=min(1,max(0,(x-a)/(b-a))); return t*t*(3-2*t)
def warp(me):
  # childlike proportions: shrink the facial skeleton relative to the neurocranium
  for v in me.vertices:
    x,yb,z=v.co; fwd=-yb
    w=sstep(0.075,0.02,z)*sstep(-0.075,-0.035,fwd)
    v.co.z = 0.06+(z-0.06)*(1-0.14*w)
    v.co.y = -(-0.04+(fwd+0.04)*(1-0.07*w))
    v.co.x = x*(1-0.06*w)
for n in bones+teeth+soft: bake(n)
# merge skin into one object
parts=[bake(n,"SKIN_"+n,raw=True) for n in skin]
parts=[p for p in parts if p]
bpy.ops.object.select_all(action='DESELECT')
for p in parts: p.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.object.join(); parts[0].name="Skin"
sk=parts[0]
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0004); bpy.ops.object.mode_set(mode='OBJECT')
for p in bpy.data.objects:
  if p.name not in new.objects: p.hide_set(False)
bpy.ops.object.select_all(action='DESELECT')
for ob in new.objects: ob.select_set(True)
tot=sum(len(ob.data.vertices) for ob in new.objects); print("total verts",tot)
bpy.ops.export_scene.gltf(filepath=OUT, use_selection=True, export_format='GLB', export_apply=False, export_materials='EXPORT', export_normals=True, export_draco_mesh_compression_enable=False, export_yup=True)
