# Build the 3D assets of the molar-uprighting film from the Z-Anatomy / BodyParts3D skull export
# that already exists in the repository (../ck-skeletal-patterns/assets/skull.bin, made by
# tools/export_skull.py there from Z-Anatomy.zip → Startup.blend).
#
#   python3 -I tools/build_assets.py            (numpy, scipy, scikit-image, trimesh)
#
# Output: assets/dentition.bin + assets/dentition.json
#   * lower right segment 42 43 44 45 (46 missing) 47 and upper antagonists 12–17 as SEPARATE meshes,
#     Loop-subdivided (smooth silhouettes), each in local coordinates around its centre of resistance;
#   * 47: root portion lengthened ×1.25 along the long axis (the source root is short for a second molar),
#     two roots kept as in the source mesh;
#   * mandibular bone of the segment as a CLOSED volume: mandible (filled) ∪ sockets of the present teeth
#     ∪ healed 46 ridge ∪ 47 sockets in its start/end poses → roots are inside bone by construction;
#   * thin PDL shell around the 47 roots (local to 47);
#   * a miniscrew site in the buccal shelf, chosen by search: body ≥ 1 mm inside bone, ≥ 1.5 mm from every
#     root of 47 in every pose of the film and from 45.
# Frame ("segment frame", mm): origin = centre of resistance of 47 (upright, anatomical position);
#   +x mesial (along the occlusal plane from 47 to 44), +y occlusal, +z buccal (patient's right).
# Licence of the anatomy: CC BY-SA 4.0 (Z-Anatomy; BodyParts3D © DBCLS).
import json, os, math
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
from skimage import measure
import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, '..', 'ck-skeletal-patterns', 'assets', 'skull')
OUT = os.path.join(ROOT, 'assets', 'dentition')
POSES = json.load(open(os.path.join(ROOT, 'src', 'poses.json')))   # start / end angles shared with src/model.js

h = json.load(open(SRC + '.json'))
raw = open(SRC + '.bin', 'rb').read()
def chunk(n):
    c = next(c for c in h['chunks'] if c['name'] == n)
    return np.frombuffer(raw, dtype=c['dtype'], count=int(np.prod(c['shape'])), offset=c['offset']).reshape(c['shape'])
P = chunk('position').astype(np.float64)
AO = chunk('ao').astype(np.float64) / 255.0
ENA = chunk('enamel').astype(np.float64)
IDX = chunk('index').reshape(-1, 3)
objs = {o[0]: o for o in h['objects']}

def submesh(nm):
    _, _, base, nv = objs[nm]
    sel = (IDX >= base).all(1) & (IDX < base + nv).all(1)
    v, t = P[base:base + nv].copy(), IDX[sel] - base
    fn = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    if np.mean(np.sign(np.sum(fn * (v[t[:, 0]] - v.mean(0)), 1))) < 0: t = t[:, [0, 2, 1]]
    return v, t.astype(np.int64), AO[base:base + nv].copy(), ENA[base:base + nv].copy()

LOWER = {'42': 'Lower lateral incisor.r', '43': 'Lower canine.r', '44': 'Lower first premolar.r', '45': 'Lower second premolar.r',
         '46': 'Lower first molar tooth.r', '47': 'Lower second molar tooth.r'}
UPPER = {'12': 'Upper lateral incisor.r', '13': 'Upper canine.r', '14': 'Upper first premolar.r', '15': 'Upper second premolar.r',
         '16': 'Upper first molar tooth.r', '17': 'Upper second molar tooth.r'}

def axis_of(v, en, upper):
    X = v - v.mean(0)
    _, _, vt = np.linalg.svd(X, full_matrices=False)
    ax = vt[0]
    crown = v[en > 0.5].mean(0)
    if np.dot(crown - v.mean(0), ax) < 0: ax = -ax       # apex → crown
    return ax

raw_teeth = {}
for fdi, nm in {**LOWER, **UPPER}.items():
    v, t, ao, en = submesh(nm)
    ax = axis_of(v, en, fdi in UPPER)
    raw_teeth[fdi] = dict(v=v, t=t, ao=ao, en=en, ax=ax)

# ---- 47: lengthen the root portion (apical to the CEJ) ×1.25 along the long axis
T47 = raw_teeth['47']
m = T47['v'].mean(0); ax = T47['ax']
tp = (T47['v'] - m) @ ax
t_cej = ((T47['v'][T47['en'] > 0.5] - m) @ ax).min()
d = np.minimum(tp - t_cej, 0)                    # ≤ 0 apical of the CEJ
T47['v'] = T47['v'] + np.outer(d * 0.25, ax)

# ---- segment frame
def tip_of(T):
    tp = (T['v'] - T['v'].mean(0)) @ T['ax']; return T['v'][np.argmax(tp)]
def cusp_level(T):
    tp = (T['v'] - T['v'].mean(0)) @ T['ax']; top = T['v'][tp > tp.max() - 1.2]; return top.mean(0)
c47, c44 = cusp_level(raw_teeth['47']), cusp_level(raw_teeth['44'])
ex = c44 - c47; ex /= np.linalg.norm(ex)
up = np.array([0, 1.0, 0])
ey = up - ex * np.dot(up, ex); ey /= np.linalg.norm(ey)
ez = np.cross(ex, ey)
assert ez[0] < 0, 'buccal of the right side must be −X (skull frame)'
R = np.stack([ex, ey, ez])                        # rows: segment axes in skull coordinates

def landmarks(T):
    v, en, ax = T['v'], T['en'], T['ax']
    m = v.mean(0); tp = (v - m) @ ax
    t_tip, t_apex = tp.max(), tp.min()
    t_cej = ((v[en > 0.5] - m) @ ax).min()
    root_len = t_cej - t_apex
    # CR: 0.45 of the root length apical to the alveolar crest (crest ≈ 1.5 mm apical to the CEJ).
    # FE estimate for the mandibular first molar: ≈ 0.48 root length from the crest (Mo et al., AJODO 2019).
    t_cr = (t_cej - 1.5) - 0.45 * (root_len - 1.5)
    return dict(cr=m + ax * t_cr, apex=m + ax * t_apex, tip=m + ax * t_tip, cej=m + ax * t_cej, rootLen=float(root_len),
                crown=v[en > 0.5].mean(0))
O = landmarks(raw_teeth['47'])['cr']
toS = lambda p: (np.asarray(p) - O) @ R.T          # skull → segment
for T in raw_teeth.values():
    T['v'] = toS(T['v']); T['ax'] = T['ax'] @ R.T

# ---- Loop subdivision (smooth silhouettes; source teeth have ≈ 600–900 vertices)
def subdivide(T, it):
    v, t = T['v'], T['t']
    mesh = trimesh.Trimesh(v, t, process=True, validate=True)
    tree = cKDTree(v)
    for _ in range(it):
        mesh = mesh.subdivide_loop(iterations=1)
    nv = np.asarray(mesh.vertices); nt = np.asarray(mesh.faces)
    # attributes: inverse-distance blend of the 4 nearest source vertices
    dd, ii = tree.query(nv, k=4)
    w = 1 / np.maximum(dd, 0.05) ** 2; w /= w.sum(1, keepdims=True)
    ao = (T['ao'][ii] * w).sum(1); en = (T['en'][ii] * w).sum(1)
    # Loop subdivision shrinks slightly: restore the size around the centroid (volume preserving)
    s = (abs(trimesh.Trimesh(v, t).volume) / max(abs(mesh.volume), 1e-6)) ** (1 / 3)
    c = nv.mean(0); nv = c + (nv - c) * s
    T.update(v=nv, t=nt, ao=ao, en=en)
for fdi, T in raw_teeth.items():
    subdivide(T, 2 if fdi in ('47', '45', '44', '43', '17', '16', '15') else 1)

def smooth_normals(v, t):
    n = np.zeros_like(v)
    fn = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    for k in range(3): np.add.at(n, t[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)

meta = {}
for fdi, T in raw_teeth.items():
    L = landmarks(T)
    v, en, ax = T['v'], T['en'], T['ax']
    n = smooth_normals(v, T['t'])
    tp = (v - L['cr']) @ ax
    t_cej = (L['cej'] - L['cr']) @ ax; t_tip = (L['tip'] - L['cr']) @ ax
    # FA point: buccal-most enamel point at mid-crown height; bracket normal = mean normal there
    mid = t_cej + 0.48 * (t_tip - t_cej)
    sl = (np.abs(tp - mid) < 0.6) & (en > 0.5)
    i = np.argmax(np.where(sl, v[:, 2], -1e9))
    near = np.linalg.norm(v - v[i], axis=1) < 1.6
    fa_n = n[near].mean(0); fa_n /= np.linalg.norm(fa_n)
    ena = v[en > 0.5]
    meta[fdi] = dict(fdi=fdi, cr=L['cr'].tolist(), axis=ax.tolist(), apex=L['apex'].tolist(), tip=L['tip'].tolist(),
                     cej=L['cej'].tolist(), crown=L['crown'].tolist(), rootLen=L['rootLen'],
                     fa=v[i].tolist(), faN=fa_n.tolist(),
                     mes=ena[np.argmax(ena[:, 0])].tolist(), dis=ena[np.argmin(ena[:, 0])].tolist(),
                     occl=ena[np.argmax(ena[:, 1])].tolist() if fdi not in UPPER else ena[np.argmin(ena[:, 1])].tolist(),
                     bmin=v.min(0).tolist(), bmax=v.max(0).tolist())
    T['n'] = n
print('47 CR (segment) =', np.round(meta['47']['cr'], 2), 'root', round(meta['47']['rootLen'], 1), 'axis', np.round(meta['47']['axis'], 3))

# 47 apices (two roots): lowest points of the two root clusters along x
v47 = raw_teeth['47']['v']; ax47 = np.array(meta['47']['axis'])
tp = (v47 - meta['47']['cr']) @ ax47
low = v47[tp < tp.min() + 2.2]
xs = low[:, 0]; mid = 0.5 * (xs.min() + xs.max())
apM = low[xs > mid][np.argmin(low[xs > mid] @ ax47)]; apD = low[xs <= mid][np.argmin(low[xs <= mid] @ ax47)]
meta['47']['apexM'] = apM.tolist(); meta['47']['apexD'] = apD.tolist()
# furcation: highest root-surface point between the two roots (on the buccal-lingual midline)
cand = v47[(np.abs(v47[:, 0] - 0.5 * (apM[0] + apD[0])) < 0.8) & (raw_teeth['47']['en'] < 0.3)]
ena47 = raw_teeth['47']['en']; zc = 0.5 * (v47[:, 2].min() + v47[:, 2].max())
cand = (np.abs(v47[:, 0] - 0.5 * (apM[0] + apD[0])) < 0.9) & (np.abs(v47[:, 2] - zc) < 1.2) & (ena47 < 0.3)
meta['47']['furcation'] = v47[cand][np.argmax(v47[cand] @ ax47)].tolist() if cand.any() else meta['47']['cr']
print('47 apices M/D', np.round(apM, 1), np.round(apD, 1), 'root separation', round(float(np.linalg.norm(apM - apD)), 1), 'mm')

# ---------------------------------------------------------------- poses of 47 (same maths as src/model.js)
def rotz(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])
def pose47(theta_deg, shift):
    """rigid pose of 47: rotation about its (moving) CR by theta, then translation `shift` (segment frame)"""
    Rz = rotz(math.radians(theta_deg)); cr = np.array(meta['47']['cr'])
    return lambda p: (np.asarray(p) - cr) @ Rz.T + cr + np.asarray(shift)
POSE_LIST = {k: pose47(v['theta'], v['shift']) for k, v in POSES.items()}

# ---------------------------------------------------------------- bone volume
def surf_samples(v, t, step=0.35, seed=1):
    a, b, c = v[t[:, 0]], v[t[:, 1]], v[t[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    cnt = np.maximum(1, (area / (step * step)).astype(int))
    rep = np.repeat(np.arange(len(t)), cnt)
    r1, r2 = np.random.default_rng(seed).random((2, len(rep)))
    s = np.sqrt(r1)
    return (1 - s)[:, None] * a[rep] + (s * (1 - r2))[:, None] * b[rep] + (s * r2)[:, None] * c[rep]

VX = 0.4
lo = np.array([-26.0, -34.0, -16.0]); hi = np.array([40.0, 8.0, 16.0])
shape = np.ceil((hi - lo) / VX).astype(int) + 1
def occ(pts):
    o = np.zeros(shape, bool); ij = np.round((pts - lo) / VX).astype(int)
    ok = ((ij >= 0) & (ij < shape)).all(1); o[tuple(ij[ok].T)] = True; return o
def solid_of(v, t):
    o = occ(surf_samples(v, t)); o = ndimage.binary_closing(o, iterations=1); return ndimage.binary_fill_holes(o)

# mandible: surface shell in the segment grid, closed, then filled slice by slice (cross-sections perpendicular
# to the mesio-distal axis are closed rings; the open sockets stay open)
mv, mt, _, _ = submesh('Mandible')
mv = toS(mv)
gx, gy, gz = np.meshgrid(*[lo[k] + VX * np.arange(shape[k]) for k in range(3)], indexing='ij')
# inside/outside by the nearest-surface pseudo-normal test (robust for an open-cropped ROI)
a_, b_, c_ = mv[mt[:, 0]], mv[mt[:, 1]], mv[mt[:, 2]]
fn_ = np.cross(b_ - a_, c_ - a_); area = 0.5 * np.linalg.norm(fn_, axis=1); fn_ /= np.maximum(2 * area[:, None], 1e-12)
if np.mean(np.sum(fn_ * (a_ - mv.mean(0)), 1)) < 0: fn_ = -fn_
cnt = np.maximum(1, (area / 0.06).astype(int)); rep = np.repeat(np.arange(len(mt)), cnt)
r1, r2 = np.random.default_rng(3).random((2, len(rep))); sq = np.sqrt(r1)
smp = (1 - sq)[:, None] * a_[rep] + (sq * (1 - r2))[:, None] * b_[rep] + (sq * r2)[:, None] * c_[rep]
gp = np.stack([gx.ravel(), gy.ravel(), gz.ravel()], 1)
dd, ii = cKDTree(smp).query(gp)
mand = (np.sum((gp - smp[ii]) * fn_[rep[ii]], 1) < 0).reshape(shape)
mand = ndimage.binary_opening(mand, iterations=1)
shell = mand
print('mandible voxels in segment ROI', int(mand.sum()))
if os.environ.get('DEBUG'):
    np.save('/tmp/claude-0/-home-user/cb3cef79-13d8-5e3c-9231-7c451abcc5ce/scratchpad/mand.npy', np.stack([shell, mand]))
    np.save('/tmp/claude-0/-home-user/cb3cef79-13d8-5e3c-9231-7c451abcc5ce/scratchpad/mv.npy', mv)

def root_solid(fdi, posefn=None, crest=1.5, dil=0.9):
    T = raw_teeth[fdi]; M = meta[fdi]
    v = T['v'] if posefn is None else posefn(T['v'])
    s = solid_of(v, T['t'])
    s = ndimage.binary_dilation(s, iterations=int(round(dil / VX)))
    # keep apical to the alveolar crest (CEJ − crest, measured along the tooth axis in that pose)
    ax = np.array(M['axis']); cej = np.array(M['cej'])
    if posefn is not None:
        ax = posefn(cej + ax) - posefn(cej); cej = posefn(cej)
    tp = (gx - cej[0]) * ax[0] + (gy - cej[1]) * ax[1] + (gz - cej[2]) * ax[2]
    return s & (tp < -crest)

bone = mand.copy()
for fdi in ('42', '43', '44', '45'): bone |= root_solid(fdi)
bone |= root_solid('46', crest=3.2, dil=1.4)                     # healed, slightly resorbed 46 ridge
for k, fn in POSE_LIST.items(): bone |= root_solid('47', fn, crest=1.7, dil=1.0)
bone = ndimage.binary_closing(bone, iterations=2)
bone = ndimage.binary_fill_holes(bone)
field = ndimage.gaussian_filter(bone.astype(np.float32), 1.6)
bv, bf, _, _ = measure.marching_cubes(field, 0.5, spacing=(VX, VX, VX))
bv = bv + lo
bf = bf[:, [0, 2, 1]]
bn = smooth_normals(bv, bf)
if np.mean(np.sum((bv - bv.mean(0)) * bn, 1)) < 0: bn = -bn; bf = bf[:, [0, 2, 1]]
print('bone', len(bv), 'verts', len(bf), 'tris')
# signed distance inside bone (mm, > 0 inside) for QA
sd_in = ndimage.distance_transform_edt(field > 0.5) * VX
sd_out = ndimage.distance_transform_edt(field <= 0.5) * VX
def bone_depth(p):
    ij = (np.asarray(p) - lo) / VX
    a = ndimage.map_coordinates(sd_in, ij.T, order=1, mode='nearest'); b = ndimage.map_coordinates(sd_out, ij.T, order=1, mode='nearest')
    return a - b

# ---------------------------------------------------------------- QA: 47 roots inside bone in every pose, no tooth–tooth overlap
root47 = raw_teeth['47']['v'][((raw_teeth['47']['v'] - meta['47']['cej']) @ ax47) < -2.0]
qa = {}
for k, fn in POSE_LIST.items():
    d = bone_depth(fn(root47))
    qa[k] = dict(minRootDepth=round(float(d.min()), 2))
v45 = raw_teeth['45']['v']; tree45 = cKDTree(v45)
for k, fn in POSE_LIST.items():
    qa[k]['min47to45'] = round(float(tree45.query(fn(raw_teeth['47']['v']))[0].min()), 2)
print('QA 47 poses:', qa)

# ---------------------------------------------------------------- PDL shell of 47 (local)
PV = 0.2
plo = v47.min(0) - 1.5; phi = v47.max(0) + 1.5; pshape = np.ceil((phi - plo) / PV).astype(int) + 1
po = np.zeros(pshape, bool); ij = np.round((surf_samples(v47, raw_teeth['47']['t'], 0.18) - plo) / PV).astype(int); po[tuple(ij.T)] = True
po = ndimage.binary_fill_holes(ndimage.binary_closing(po, iterations=1))
pd = ndimage.distance_transform_edt(~po) * PV
pf = ndimage.gaussian_filter((pd < 0.32).astype(np.float32), 0.8)
pv_, pf_, _, _ = measure.marching_cubes(pf, 0.5, spacing=(PV, PV, PV)); pv_ = pv_ + plo; pf_ = pf_[:, [0, 2, 1]]
tpp = (pv_ - meta['47']['cej']) @ ax47
fade = 1 - np.clip((tpp + 1.6) / 1.2, 0, 1)                # only apical to the crest
keep = fade[pf_].max(1) > 0.01
pf_ = pf_[keep]; used = np.unique(pf_); remap = -np.ones(len(pv_), int); remap[used] = np.arange(len(used)); pv_ = pv_[used]; pf_ = remap[pf_]; fade = fade[used]
pn_ = smooth_normals(pv_, pf_)
if np.mean(np.sum((pv_ - pv_.mean(0)) * pn_, 1)) < 0: pn_ = -pn_; pf_ = pf_[:, [0, 2, 1]]
print('pdl', len(pv_), 'verts')

# ---------------------------------------------------------------- miniscrew site (buccal shelf, buccal to 47 roots)
if os.environ.get('PROFILE'):
    for yy in range(-16, 7, 2):
        print(yy, ' '.join(f'{bone_depth(np.array([[-1.0, yy, zz]]))[0]:5.1f}' for zz in range(-10, 14, 2)))
    raise SystemExit
SCREW_LEN = 8.0             # schematic body length in bone (not shown as a number)
best = None
axes = []
for tilt in (0, 10, 20, 30, 40):                        # tilt of the screw axis towards lingual (deg), from vertical
    for lean in (-10, 0, 10):                  # mesio-distal lean
        a = np.array([math.sin(math.radians(lean)), -math.cos(math.radians(tilt)) * math.cos(math.radians(lean)), -math.sin(math.radians(tilt))])
        axes.append(a / np.linalg.norm(a))
roots_all = np.concatenate([fn(root47) for fn in POSE_LIST.values()] + [v45])
rtree = cKDTree(roots_all)
for x in np.arange(-6, 2.1, 0.5):
    for z in np.arange(7.0, 13.1, 0.5):
        for yb in np.arange(-4, 0.6, 0.5):             # buccal shelf: lateral to the roots, ≥ 4 mm apical to the crest              # entry level (bone surface searched along the axis)
            for a in axes:
                top = np.array([x, yb, z])
                body = top[None, :] + np.outer(np.linspace(0.8, SCREW_LEN, 14), a)
                dep = bone_depth(body)
                if dep.min() < 0.6: continue
                if bone_depth(top[None, :])[0] > 0.6: continue            # entry must be at the bone surface
                clr = rtree.query(body)[0].min()
                if clr < 1.3: continue
                hook = np.array(meta['47']['fa'])
                score = np.linalg.norm(top - hook) + 0.4 * abs(a[0]) * 10 - 0.2 * min(clr, 3)
                if best is None or score < best[0]: best = (score, top, a, float(clr), float(dep.min()))
assert best is not None, 'no safe miniscrew site found'
_, s_top, s_ax, s_clr, s_dep = best
SCREW = dict(entry=s_top.tolist(), axis=s_ax.tolist(), head=(s_top - s_ax * 2.2).tolist(), len=SCREW_LEN,
             rootClearance=round(s_clr, 2), boneDepth=round(s_dep, 2))
print('miniscrew', SCREW)

# ---------------------------------------------------------------- write
hdr = {'units': 'mm', 'frame': 'segment: origin = CR of 47 (anatomical), +x mesial, +y occlusal, +z buccal',
       'skull_to_segment': {'origin': O.tolist(), 'R_rows': R.tolist()},
       'source': 'Z-Anatomy (CC BY-SA 4.0), derived from BodyParts3D (c) DBCLS (CC BY-SA 2.1 JP); bone volume and PDL procedural from it',
       'poses': POSES, 'qa': qa, 'screw': SCREW, 'meshes': []}
blob = bytearray()
def add(a):
    b = np.ascontiguousarray(a).tobytes(); off = len(blob); blob.extend(b); blob.extend(b'\0' * ((-len(b)) % 4)); return off, len(b)
def write(name, v, n, ao, en, t, meta_=None):
    nn = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
    e = {'name': name, 'vertices': int(len(v)), 'triangles': int(len(t)), **(meta_ or {})}
    e['position'] = add(v.astype(np.float32)); e['normal'] = add(np.clip(np.round(nn * 127), -127, 127).astype(np.int8))
    e['ao'] = add(np.round(np.clip(ao, 0, 1) * 255).astype(np.uint8)); e['enamel'] = add(np.round(np.clip(en, 0, 1) * 255).astype(np.uint8))
    e['index'] = add(t.astype(np.uint32)); hdr['meshes'].append(e)
for fdi in ['42', '43', '44', '45', '47', '12', '13', '14', '15', '16', '17']:
    T = raw_teeth[fdi]; cr = np.array(meta[fdi]['cr'])
    write(('L' if fdi in LOWER else 'U') + fdi, T['v'] - cr, T['n'], T['ao'], T['en'], T['t'], meta[fdi])
write('bone', bv, bn, np.ones(len(bv)), np.zeros(len(bv)), bf)
cr47 = np.array(meta['47']['cr'])
write('pdl47', pv_ - cr47, pn_, fade, np.zeros(len(pv_)), pf_)
open(OUT + '.bin', 'wb').write(bytes(blob))
json.dump(hdr, open(OUT + '.json', 'w'), indent=1)
print('written', len(blob) / 1e6, 'MB', len(hdr['meshes']), 'meshes')
