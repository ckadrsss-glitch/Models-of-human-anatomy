# Build the 3D assets of this film from the Z-Anatomy / BodyParts3D skull export that is already
# in the repository (../ck-skeletal-patterns/assets/skull.bin, made by tools/export_skull.py there
# from Z-Anatomy.zip → Startup.blend).
#
#   python3 -I tools/build_assets.py        (numpy, scipy, scikit-image)
#
# Output: assets/dentition.bin + assets/dentition.json
#   * 14 upper teeth as SEPARATE meshes (local coordinates around each tooth's schematic centre of
#     resistance), with per-tooth landmarks: long axis, apex, incisal/cusp tip, cervical level;
#   * upper alveolar bone = Maxilla.l + Maxilla.r (rendered translucent, cropped in the shader);
#   * lower jaw (mandible + 14 lower teeth, static, hook scene only);
#   * a SCHEMATIC soft-tissue envelope of the lower third of the face — procedural (offset surface
#     of the bone + teeth, smoothed), NOT a scan; used only as a translucent "skin" in the hook.
# Coordinates: mm, +Y up, +Z anterior, +X patient's left; origin moved to the upper arch centre.
# Licence of the anatomy: CC BY-SA 4.0 (Z-Anatomy; BodyParts3D © DBCLS).
import json, os, sys
import numpy as np
from scipy import ndimage
from skimage import measure

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, '..', 'ck-skeletal-patterns', 'assets', 'skull')
OUT = os.path.join(ROOT, 'assets', 'dentition')

h = json.load(open(SRC + '.json'))
raw = open(SRC + '.bin', 'rb').read()
def chunk(n):
    c = next(c for c in h['chunks'] if c['name'] == n)
    return np.frombuffer(raw, dtype=c['dtype'], count=int(np.prod(c['shape'])), offset=c['offset']).reshape(c['shape'])
P = chunk('position').astype(np.float64)
N = chunk('normal').astype(np.float32) / 127.0
AO = chunk('ao')
ENA = chunk('enamel')
IDX = chunk('index').reshape(-1, 3)
objs = {o[0]: o for o in h['objects']}

ORIGIN = np.array([0.0, -60.0, 70.0])   # roughly the centre of the upper arch

def submesh(names):
    """vertices/normals/ao/enamel/triangles of the given objects (re-indexed)"""
    vs, ns, ao, en, tr = [], [], [], [], []
    off = 0
    for nm in names:
        _, _, base, nv = objs[nm]
        sel = (IDX >= base).all(1) & (IDX < base + nv).all(1)
        v_, n_, t_ = P[base:base + nv], N[base:base + nv], IDX[sel] - base
        # the mirrored (.l) objects of the source have inverted winding/normals: make them outward
        fn = np.cross(v_[t_[:, 1]] - v_[t_[:, 0]], v_[t_[:, 2]] - v_[t_[:, 0]])
        if np.mean(np.sign(np.sum(fn * (v_[t_[:, 0]] - v_.mean(0)), 1))) < 0 or (nm.endswith('.l') and nm.startswith('Maxilla')):
            t_ = t_[:, [0, 2, 1]]; n_ = -n_
        vs.append(v_); ns.append(n_); ao.append(AO[base:base + nv]); en.append(ENA[base:base + nv])
        tr.append(t_ + off); off += nv
    return np.concatenate(vs), np.concatenate(ns), np.concatenate(ao), np.concatenate(en), np.concatenate(tr)

def smooth_normals(v, t):
    n = np.zeros_like(v)
    fn = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    for k in range(3): np.add.at(n, t[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)

TYPES = ['medial incisor', 'lateral incisor', 'canine', 'first premolar', 'second premolar', 'first molar tooth', 'second molar tooth']
FDI_T = ['1', '2', '3', '4', '5', '6', '7']

meshes = []   # (name, dict of arrays, meta)

# ------------------------------------------------------------------ upper teeth (separate)
for side, q in (('r', '1'), ('l', '2')):
    for k, tt in enumerate(TYPES):
        nm = f'Upper {tt}.{side}'
        v, n, ao, en, tr = submesh([nm])
        crown = v[en > 0]
        c_crown = crown.mean(0)
        X = v - v.mean(0)
        _, _, vt = np.linalg.svd(X, full_matrices=False)
        ax = vt[0]
        if np.dot(c_crown - v.mean(0), ax) < 0: ax = -ax   # apex → crown
        if ax[1] > 0: ax = -ax                              # upper teeth: crown points down
        tproj = X @ ax
        t_tip, t_apex = tproj.max(), tproj.min()
        t_cej = (X[en > 0] @ ax).min()                      # cervical end of the enamel
        root_len = t_cej - t_apex
        # schematic centre of resistance: ~40 % of the root length apical to the alveolar crest
        # (crest ≈ 1.5 mm apical to the CEJ)
        t_cr = (t_cej - 1.5) - 0.40 * (root_len - 1.5)
        m = v.mean(0)
        cr = m + ax * t_cr
        apex = m + ax * t_apex
        tip = m + ax * t_tip
        cej = m + ax * t_cej
        meshes.append((f'U{q}{FDI_T[k]}', dict(v=v - cr, n=n, ao=ao, en=en, t=tr), dict(
            fdi=f'{q}{FDI_T[k]}', object=nm, type=k, side=side,
            cr=(cr - ORIGIN).tolist(), axis=ax.tolist(), apex=(apex - ORIGIN).tolist(), tip=(tip - ORIGIN).tolist(),
            cej=(cej - ORIGIN).tolist(), crown=(c_crown - ORIGIN).tolist(), rootLen=float(root_len),
            bmin=(v.min(0) - ORIGIN).tolist(), bmax=(v.max(0) - ORIGIN).tolist())))

# ------------------------------------------------------------------ upper alveolar bone
v, n, ao, en, tr = submesh(['Maxilla.r', 'Maxilla.l'])
meshes.append(('maxilla', dict(v=v - ORIGIN, n=n, ao=ao, en=en * 0, t=tr), dict()))

# ------------------------------------------------------------------ lower jaw (static)
low = ['Mandible'] + [f'Lower {tt}.{s}' for s in 'rl' for tt in TYPES]
v, n, ao, en, tr = submesh(['Mandible'])
meshes.append(('mandible', dict(v=v - ORIGIN, n=n, ao=ao, en=en * 0, t=tr), dict()))
v, n, ao, en, tr = submesh(low[1:])
meshes.append(('lowerteeth', dict(v=v - ORIGIN, n=n, ao=ao, en=en, t=tr), dict()))

# ------------------------------------------------------------------ schematic soft-tissue envelope
# Offset surface (≈ 11 mm) of maxilla + mandible + all teeth, with the upper anterior teeth pushed
# forward like in the film's protruded start pose, so the lips sit over the proclined incisors.
def surface_samples(names, dz_fn=None, step=0.7):
    v, _, _, _, tr = submesh(names)
    a, b, c = v[tr[:, 0]], v[tr[:, 1]], v[tr[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    cnt = np.maximum(1, (area / (step * step)).astype(int))
    rep = np.repeat(np.arange(len(tr)), cnt)
    r1, r2 = np.random.default_rng(1).random((2, len(rep)))
    s = np.sqrt(r1)
    pts = (1 - s)[:, None] * a[rep] + (s * (1 - r2))[:, None] * b[rep] + (s * r2)[:, None] * c[rep]
    if dz_fn is not None: pts = dz_fn(pts)
    return pts
upper_ant = [f'Upper {tt}.{s}' for s in 'rl' for tt in TYPES[:3]]
upper_post = [f'Upper {tt}.{s}' for s in 'rl' for tt in TYPES[3:]]
def protrude(p):
    q = p.copy()
    w = np.exp(-(p[:, 0] / 14.0) ** 2)            # strongest at the midline
    q[:, 2] += 4.5 * w * np.clip((-p[:, 1] - 48) / 22, 0, 1)   # crowns forward, apices nearly fixed
    return q
pts = np.concatenate([surface_samples(['Maxilla.r', 'Maxilla.l', 'Mandible'] + low[1:] + upper_post), surface_samples(upper_ant, protrude)])
lo_b = np.array([-66.0, -118.0, -5.0]); hi_b = np.array([66.0, -10.0, 122.0]); vox = 1.0
shape = np.ceil((hi_b - lo_b) / vox).astype(int) + 1
occ = np.zeros(shape, bool)
ijk = np.round((pts - lo_b) / vox).astype(int)
ok = ((ijk >= 0) & (ijk < shape)).all(1)
occ[tuple(ijk[ok].T)] = True
dist = ndimage.distance_transform_edt(~occ) * vox
OFFSET = 11.0
solid = dist < OFFSET
solid = ndimage.binary_fill_holes(solid)
lab, nl = ndimage.label(solid)
if nl > 1:
    sizes = ndimage.sum(solid, lab, range(1, nl + 1))
    solid = lab == (1 + int(np.argmax(sizes)))
field = ndimage.gaussian_filter(solid.astype(np.float32), 2.6)
sv, sf, sn, _ = measure.marching_cubes(field, 0.5, spacing=(vox, vox, vox), step_size=1)
sv = sv + lo_b
# keep the lower third of the face, in front of the rami
keep_v = (sv[:, 1] < -30) & (sv[:, 2] > 18)
keep_f = keep_v[sf].all(1)
sf = sf[keep_f]
used = np.unique(sf)
remap = -np.ones(len(sv), int); remap[used] = np.arange(len(used))
sv = sv[used]; sf = remap[sf]
sf = sf[:, [0, 2, 1]]      # outward winding
sn = smooth_normals(sv, sf)
# make sure normals point outwards (away from the bone centroid)
ctr = np.array([0, -70, 55.0])
if np.mean(np.sum((sv - ctr) * sn, 1)) < 0: sn = -sn; sf = sf[:, [0, 2, 1]]
meshes.append(('skin', dict(v=sv - ORIGIN, n=sn.astype(np.float32), ao=np.full(len(sv), 255, np.uint8), en=np.zeros(len(sv), np.uint8), t=sf), dict()))
print('skin', len(sv), 'verts', len(sf), 'tris')

# ------------------------------------------------------------------ gingiva (procedural) + skinning weights
# Gingiva = smoothed offset surface (1.3 mm) of the upper teeth roots/cervical third + alveolar bone,
# trimmed at the gingival margin (≈ 1 mm coronal to the enamel–cement junction of the nearest tooth).
from scipy.spatial import cKDTree
tooth_ids = [m[0] for m in meshes[:14]]
samples, owner, is_ena = [], [], []
for ti, nm in enumerate([m[2]['object'] for m in meshes[:14]]):
    v, _, _, en, tr = submesh([nm])
    a, b, c = v[tr[:, 0]], v[tr[:, 1]], v[tr[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    cnt = np.maximum(1, (area / 0.16).astype(int))
    rep = np.repeat(np.arange(len(tr)), cnt)
    r1, r2 = np.random.default_rng(ti).random((2, len(rep)))
    s_ = np.sqrt(r1)
    pts_t = (1 - s_)[:, None] * a[rep] + (s_ * (1 - r2))[:, None] * b[rep] + (s_ * r2)[:, None] * c[rep]
    e_t = en[tr[rep]].sum(1) >= 2
    samples.append(pts_t); owner.append(np.full(len(pts_t), ti)); is_ena.append(e_t)
TS = np.concatenate(samples); TO = np.concatenate(owner); TE = np.concatenate(is_ena)
tree_all = cKDTree(TS)
tree_root = cKDTree(TS[~TE])
ena_to_root = np.full(len(TS), 0.0); ena_to_root[TE] = tree_root.query(TS[TE])[0]
bone_pts = surface_samples(['Maxilla.r', 'Maxilla.l'], step=0.6)
lo_g = np.array([-40.0, -82.0, 30.0]); hi_g = np.array([40.0, -30.0, 100.0]); vg = 0.5
shp = np.ceil((hi_g - lo_g) / vg).astype(int) + 1
def occ_of(pts):
    o = np.zeros(shp, bool); ij = np.round((pts - lo_g) / vg).astype(int)
    ok = ((ij >= 0) & (ij < shp)).all(1); o[tuple(ij[ok].T)] = True; return o
d_teeth = ndimage.distance_transform_edt(~occ_of(TS)) * vg
d_bone = ndimage.distance_transform_edt(~occ_of(bone_pts)) * vg
solid_g = (d_teeth < 1.3) | (d_bone < 1.0)
solid_g = ndimage.binary_fill_holes(solid_g)
fg = ndimage.gaussian_filter(solid_g.astype(np.float32), 1.4)
gv, gf, _, _ = measure.marching_cubes(fg, 0.5, spacing=(vg, vg, vg))
gv = gv + lo_g
gf = gf[:, [0, 2, 1]]
d_near, i_near = tree_all.query(gv)
near_ena = TE[i_near]
sm = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
cej_y = np.array([m[2]['cej'][1] + ORIGIN[1] for m in meshes[:14]])[TO[i_near]]
f_marg = np.where(near_ena, 1 - sm((ena_to_root[i_near] - 0.35) / 0.9), 1.0)   # gingival margin ≈ 1 mm coronal to the CEJ
f_h = 1 - sm((gv[:, 1] - (cej_y + 3.5)) / 4.0)                                # attached gingiva band, fades apically
f_d = 1 - sm((d_near - 2.2) / 1.4)                                             # only close to the teeth
fade = f_marg * f_h * f_d
keep = fade > 0.004
keep_f = keep[gf].any(1)
gf = gf[keep_f]; used = np.unique(gf); remap = -np.ones(len(gv), int); remap[used] = np.arange(len(used))
gv = gv[used]; gf = remap[gf]; fade = fade[used]
# drop tiny islands
lab = np.arange(len(gv))
def find(x):
    while lab[x] != x: lab[x] = lab[lab[x]]; x = lab[x]
    return x
for a_, b_, c_ in gf:
    ra, rb, rc = find(a_), find(b_), find(c_); lab[rb] = ra; lab[find(rc)] = ra
roots_ = np.array([find(i) for i in range(len(gv))]); cnts = np.bincount(roots_)
big = cnts[roots_] > 2000
kf = big[gf].all(1); gf = gf[kf]; used = np.unique(gf); remap = -np.ones(len(gv), int); remap[used] = np.arange(len(used)); gv = gv[used]; gf = remap[gf]; fade = fade[used]
gn = smooth_normals(gv, gf)
if np.mean(np.sum((gv - np.array([0, -55, 70.0])) * gn, 1)) < 0: gn = -gn; gf = gf[:, [0, 2, 1]]
print('gingiva', len(gv), 'verts', len(gf), 'tris')

def skin_weights(v, sigma, reach):
    """two nearest teeth (index 0..13) and weights: soft tissue / bone within `reach` mm follows the tooth"""
    D = np.full((len(v), 14), 1e9)
    for ti in range(14):
        tr_ = cKDTree(TS[TO == ti]); D[:, ti] = tr_.query(v, distance_upper_bound=reach * 3)[0]
    order = np.argsort(D, 1)[:, :2]
    d2 = np.take_along_axis(D, order, 1)
    w = np.exp(-(np.maximum(d2 - 0.3, 0) / sigma) ** 2) * (d2 < reach)
    s_ = w.sum(1, keepdims=True); w = np.where(s_ > 1, w / np.maximum(s_, 1e-9), w)
    return order.astype(np.uint8), np.round(np.clip(w, 0, 1) * 255).astype(np.uint8)
gi, gw = skin_weights(gv, 2.6, 7.0)
# gingiva: the ao channel carries the opacity fade (margin, apical band)
meshes.append(('gingiva', dict(v=gv - ORIGIN, n=gn.astype(np.float32), ao=np.round(fade * 255).astype(np.uint8), en=np.zeros(len(gv), np.uint8), t=gf, si=gi, sw=gw), dict()))
mx = next(m for m in meshes if m[0] == 'maxilla')
mi, mw = skin_weights(mx[1]['v'] + ORIGIN, 2.6, 6.0)
mx[1]['si'] = mi; mx[1]['sw'] = mw

# ------------------------------------------------------------------ write
hdr = {'units': 'mm', 'up': '+Y', 'front': '+Z', 'left': '+X', 'origin_in_skull_coords': ORIGIN.tolist(),
       'source': 'Z-Anatomy (CC BY-SA 4.0), derived from BodyParts3D (c) DBCLS (CC BY-SA 2.1 JP); skin = procedural envelope',
       'meshes': []}
blob = bytearray()
def add(a):
    b = np.ascontiguousarray(a).tobytes()
    off = len(blob); blob.extend(b); blob.extend(b'\0' * ((-len(b)) % 4)); return off, len(b)
for name, d, meta in meshes:
    nv = len(d['v'])
    nn = d['n'] / np.maximum(np.linalg.norm(d['n'], axis=1, keepdims=True), 1e-9)
    e = {'name': name, 'vertices': nv, 'triangles': int(len(d['t'])), **meta}
    e['position'] = add(d['v'].astype(np.float32))
    e['normal'] = add(np.clip(np.round(nn * 127), -127, 127).astype(np.int8))
    e['ao'] = add(d['ao'].astype(np.uint8))
    e['enamel'] = add(d['en'].astype(np.uint8))
    e['index'] = add(d['t'].astype(np.uint32))
    if 'si' in d:
        e['skinIndex'] = add(d['si'].astype(np.uint8)); e['skinWeight'] = add(d['sw'].astype(np.uint8))
    hdr['meshes'].append(e)
open(OUT + '.bin', 'wb').write(bytes(blob))
json.dump(hdr, open(OUT + '.json', 'w'), indent=1)
print('written', len(blob), 'bytes,', len(meshes), 'meshes')
for name, d, meta in meshes[:14]:
    print(name, 'CR', np.round(meta['cr'], 1), 'axis', np.round(meta['axis'], 2), 'root', round(meta['rootLen'], 1))
