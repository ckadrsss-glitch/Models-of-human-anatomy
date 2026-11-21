# Export of the adult skull (cranium, maxilla, mandible, 28 teeth) from the
# Z-Anatomy Blender template (Models-of-human-anatomy/Z-Anatomy.zip → Startup.blend)
# to a compact binary mesh used by the Three.js player: assets/skull.bin + skull.json
#
# Requires the `bpy` wheel (pip install bpy==5.3.0) or Blender ≥ 4.2 + numpy.
#   unzip ../Z-Anatomy.zip Z-Anatomy/Startup.blend -d /tmp/za
#   python tools/export_skull.py /tmp/za/Z-Anatomy/Startup.blend assets
#
# Output coordinates: millimetres, +Y up, +Z anterior, +X = patient's left.
# Per-vertex data: position, normal, baked ambient occlusion (Cycles, 48 samples),
# part id (0 cranium incl. maxilla, 1 mandible, 2 upper tooth, 3 lower tooth),
# suture flag, tooth crown anchor + "rigidity" (crown 1 → cervical third of the root 0) and enamel flag.
# Licence of the output: CC BY-SA 4.0 (Z-Anatomy / BodyParts3D © DBCLS).
import bpy, sys, os, json, mathutils, numpy as np
SRC, OUTDIR = sys.argv[1], sys.argv[2]
bpy.ops.wm.open_mainfile(filepath=SRC)
O = bpy.data.objects
pairs = lambda n: [n + ".l", n + ".r"]
cranium = ["Frontal bone", "Occipital bone", "Sphenoid bone", "Ethmoid bone", "Vomer"]
for n in ["Parietal bone", "Temporal bone", "Zygomatic bone", "Nasal bone", "Lacrimal bone",
          "Palatine bone", "Inferior nasal concha bone", "Maxilla"]:
    cranium += pairs(n)
TT = ["medial incisor", "lateral incisor", "canine", "first premolar", "second premolar",
      "first molar tooth", "second molar tooth"]
upper = [f"Upper {t}.{s}" for s in "lr" for t in TT]
lower = [f"Lower {t}.{s}" for s in "lr" for t in TT]
groups = [(cranium, 0), (["Mandible"], 1), (upper, 2), (lower, 3)]

dg = bpy.context.evaluated_depsgraph_get()
B2T = mathutils.Matrix(((1000, 0, 0, 0), (0, 0, 1000, 0), (0, -1000, 0, 0), (0, 0, 0, 1)))  # Blender m → mm, Y-up, +Z front

P, N, I, PART, SUT, ANC, RIG, ENA, OBJ = [], [], [], [], [], [], [], [], []
base = 0
objs_for_ao = []
for names, part in groups:
    for name in names:
        o = O[name]
        e = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(e, preserve_all_data_layers=True, depsgraph=dg)
        me.transform(B2T @ o.matrix_world)
        me.calc_loop_triangles()
        nv = len(me.vertices)
        pos = np.zeros(nv * 3, np.float32); me.vertices.foreach_get("co", pos); pos = pos.reshape(-1, 3)
        # smooth vertex normals
        nrm = np.zeros(nv * 3, np.float32); me.vertices.foreach_get("normal", nrm); nrm = nrm.reshape(-1, 3)
        tris = np.zeros(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get("vertices", tris)
        mats = [(s.material.name if s.material else "") for s in o.material_slots]
        tmat = np.zeros(len(me.loop_triangles), np.int32); me.loop_triangles.foreach_get("material_index", tmat)
        sut = np.zeros(nv, np.float32); ena = np.zeros(nv, np.float32)
        for k, mn in enumerate(mats):
            vs = tris.reshape(-1, 3)[tmat == k].ravel()
            if mn.startswith("Suture"): sut[vs] = 1
            if mn == "Teeth": ena[vs] = 1
        anc = np.zeros((nv, 3), np.float32); rig = np.zeros(nv, np.float32)
        if part >= 2:
            crown = pos[ena > 0]
            c = crown.mean(0)
            # long axis by PCA, oriented from apex to crown; rigid crown, root follows the bone
            X = pos - pos.mean(0); _, _, vt = np.linalg.svd(X, full_matrices=False); ax = vt[0]
            if np.dot(c - pos.mean(0), ax) < 0: ax = -ax
            t = X @ ax; t = (t - t.min()) / (t.max() - t.min())
            rig = np.clip((t - 0.42) / 0.16, 0, 1); rig = rig * rig * (3 - 2 * rig)
            anc[:] = c
        P.append(pos); N.append(nrm); I.append(tris + base)
        PART.append(np.full(nv, part, np.float32)); SUT.append(sut); ANC.append(anc); RIG.append(rig); ENA.append(ena)
        OBJ.append((name, part, base, nv))
        base += nv
        ob = bpy.data.objects.new("AO_" + name, me); bpy.context.scene.collection.objects.link(ob)
        objs_for_ao.append(ob)

P = np.concatenate(P); N = np.concatenate(N); I = np.concatenate(I)
print("verts", len(P), "tris", len(I) // 3)

# ---- ambient occlusion bake (Cycles → colour attribute) on the joined export mesh ----
for o in list(bpy.context.scene.objects):
    if o not in objs_for_ao:
        o.hide_render = True
        try: o.hide_set(True)
        except RuntimeError: pass
bpy.ops.object.select_all(action='DESELECT')
for ob in objs_for_ao: ob.select_set(True)
bpy.context.view_layer.objects.active = objs_for_ao[0]
bpy.ops.object.join()
J = bpy.context.view_layer.objects.active
J.data.materials.clear()
mat = bpy.data.materials.new("ao"); J.data.materials.append(mat)
J.data.color_attributes.new("AO", 'FLOAT_COLOR', 'POINT'); J.data.color_attributes.active_color_name = "AO"
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 48
sc.world = sc.world or bpy.data.worlds.new("w")
bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', margin=0)
ao = np.zeros(len(J.data.vertices) * 4, np.float32)
J.data.color_attributes["AO"].data.foreach_get("color", ao)
ao = ao.reshape(-1, 4)[:, 0]
assert len(ao) == len(P), (len(ao), len(P))  # join keeps vertex order

# ---- recentre: origin at the centre of the lateral bounding box ----
lo, hi = P.min(0), P.max(0)
C = np.array([0.0, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], np.float32)
P = P - C; ANC = np.concatenate(ANC); ANC[np.concatenate(RIG) > -1] -= C
PART = np.concatenate(PART)
ANC[PART < 2] = 0

os.makedirs(OUTDIR, exist_ok=True)
q = lambda a: np.clip(np.round(a * 127), -127, 127).astype(np.int8)
chunks = [("position", P.astype(np.float32)), ("normal", q(N / np.linalg.norm(N, axis=1, keepdims=True))),
          ("ao", np.clip(ao * 255, 0, 255).astype(np.uint8)), ("part", PART.astype(np.uint8)),
          ("suture", np.concatenate(SUT).astype(np.uint8)), ("enamel", np.concatenate(ENA).astype(np.uint8)),
          ("rigid", np.clip(np.concatenate(RIG) * 255, 0, 255).astype(np.uint8)), ("anchor", ANC.astype(np.float32)),
          ("index", I.astype(np.uint32))]
hdr = {"vertices": int(len(P)), "triangles": int(len(I) // 3), "units": "mm", "up": "+Y", "front": "+Z",
       "source": "Z-Anatomy (CC BY-SA 4.0), derived from BodyParts3D (c) DBCLS (CC BY-SA 2.1 JP)",
       "bbox": [P.min(0).tolist(), P.max(0).tolist()], "objects": [list(o) for o in OBJ], "chunks": []}
off = 0
with open(os.path.join(OUTDIR, "skull.bin"), "wb") as f:
    for name, a in chunks:
        b = a.tobytes(); pad = (-len(b)) % 4
        hdr["chunks"].append({"name": name, "offset": off, "bytes": len(b), "dtype": str(a.dtype), "shape": list(a.shape)})
        f.write(b + b"\0" * pad); off += len(b) + pad
json.dump(hdr, open(os.path.join(OUTDIR, "skull.json"), "w"), indent=1)
np.savez_compressed(os.path.join(OUTDIR, "..", "build", "skull_debug.npz") if os.path.isdir(os.path.join(OUTDIR, "..", "build")) else "/dev/null", P=P, part=PART, ena=np.concatenate(ENA), anc=ANC)
print("written", off, "bytes; bbox", hdr["bbox"])
