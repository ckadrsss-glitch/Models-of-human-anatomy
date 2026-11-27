# Build the 3D assets of the incisor-intrusion film from the Z-Anatomy / BodyParts3D skull export that
# already exists in the repository (../ck-skeletal-patterns/assets/skull.bin, made from Z-Anatomy.zip).
#
#   python3 -I tools/build_assets.py            (numpy, scipy, scikit-image, trimesh)
#
# Output: assets/dentition.bin + assets/dentition.json
#   * full lower permanent dentition 31–37, 41–47 and upper 11–17, 21–27 as SEPARATE meshes (Loop-subdivided),
#     vertices in the ARCH FRAME (no per-tooth local frame: the player groups them around pivots);
#   * START pose of the active segment (31 32 41 42): over-erupted 2.0 mm along the mean incisor axis (deep bite
#     with a deep curve of Spee). Upper incisors extruded 1.0 mm for the same reason (illustrative deep overbite);
#   * ONE centre of resistance for the rigid 4-incisor segment (mean of the four estimated single-root CRs,
#     on the mid-sagittal plane) = ORIGIN of the arch frame;
#   * mandibular alveolar bone as a closed volume: mandible ∪ sockets of all teeth (incisors in every pose);
#   * bracket landmarks (FA point, outward normal) for every lower tooth, the anterior sectional wire with its
#     stepped distal extensions, the five force-application points (1 midline, 2–5 symmetric pairs), the
#     signed sagittal lever arms d_k = z_k − z_CR and the three/five end poses (translation along the force +
#     rotation about the CR ∝ F·d — qualitative, illustrative magnitudes);
#   * QA: roots inside the MANDIBLE (not the sockets) in every pose, tooth–tooth clearances, deep-bite overlap.
# Frame (mm): origin = CR of the 4-incisor segment (START pose), +x = patient's LEFT, +y = occlusal, +z = anterior.
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

NAMES = {1: 'medial incisor', 2: 'lateral incisor', 3: 'canine', 4: 'first premolar', 5: 'second premolar', 6: 'first molar tooth', 7: 'second molar tooth'}
TEETH = {}
for q, (jaw, side) in {3: ('Lower', 'l'), 4: ('Lower', 'r'), 2: ('Upper', 'l'), 1: ('Upper', 'r')}.items():
    for k, nm in NAMES.items():
        TEETH[f'{q}{k}'] = f'{jaw} {nm}.{side}'
LOWER = [f for f in TEETH if f[0] in '34']
UPPER = [f for f in TEETH if f[0] in '12']
INC = ['31', '32', '41', '42']

def axis_of(v, en):
    X = v - v.mean(0)
    _, _, vt = np.linalg.svd(X, full_matrices=False)
    ax = vt[0]
    if np.dot(v[en > 0.5].mean(0) - v.mean(0), ax) < 0: ax = -ax       # apex → crown
    return ax

T = {}
for fdi, nm in TEETH.items():
    v, t, ao, en = submesh(nm)
    T[fdi] = dict(v=v, t=t, ao=ao, en=en, ax=axis_of(v, en))

# ---------------------------------------------------------------- arch frame (level the lower occlusal plane, keep symmetry)
def tipmax(fdi):
    v, ax = T[fdi]['v'], T[fdi]['ax']; tp = (v - v.mean(0)) @ ax; return v[tp > tp.max() - 1.0].mean(0)
front = 0.5 * (tipmax('31') + tipmax('41'))
back = 0.5 * (tipmax('36') + tipmax('46'))
d = front - back; d[0] = 0; ez = d / np.linalg.norm(d)                 # anterior along the occlusal plane (pitch only)
ex = np.array([1.0, 0, 0])                                              # patient's left
ey = np.cross(ez, ex); ey /= np.linalg.norm(ey)
R = np.stack([ex, ey, ez])

def landmarks(fdi, v=None, ax=None):
    TT = T[fdi]; v = TT['v'] if v is None else v; ax = TT['ax'] if ax is None else ax; en = TT['en']
    m = v.mean(0); tp = (v - m) @ ax
    t_tip, t_apex = tp.max(), tp.min()
    t_cej = ((v[en > 0.5] - m) @ ax).min()
    root = t_cej - t_apex
    # single-rooted tooth: CR ≈ 0.4 of the root length apical to the alveolar crest (crest ≈ 1.5 mm apical to the CEJ)
    t_cr = (t_cej - 1.5) - 0.40 * (root - 1.5)
    return dict(cr=m + ax * t_cr, apex=m + ax * t_apex, tip=m + ax * t_tip, cej=m + ax * t_cej, rootLen=float(root))

# START pose of the incisors: over-eruption along the mean axis of the four incisors
EXTR = 2.0
mean_ax = np.mean([T[f]['ax'] for f in INC], 0); mean_ax /= np.linalg.norm(mean_ax)
for f in INC: T[f]['v'] = T[f]['v'] + mean_ax * EXTR
UP_EXT, UP_FWD = 2.4, 1.3   # illustrative Class II deep bite: upper incisors extruded and slightly proclined forward (overjet)
for f in ['11', '12', '21', '22']: T[f]['v'] = T[f]['v'] + T[f]['ax'] * UP_EXT + np.array([0, 0, 1.0]) * UP_FWD   # skull frame: +z anterior; ax = apex→crown (down for uppers)

cr_ind = {f: landmarks(f)['cr'] for f in INC}
O = np.mean(list(cr_ind.values()), 0); O[0] = 0.0                       # group CR (mid-sagittal)
toA = lambda p: (np.asarray(p) - O) @ R.T
for TT in T.values():
    TT['v'] = toA(TT['v']); TT['ax'] = TT['ax'] @ R.T
cr_ind = {f: toA(c) for f, c in cr_ind.items()}
print('individual incisor CRs (arch frame):', {f: np.round(c, 2).tolist() for f, c in cr_ind.items()})

# ---------------------------------------------------------------- subdivision
def subdivide(TT, it):
    v, t = TT['v'], TT['t']
    mesh = trimesh.Trimesh(v, t, process=True, validate=True)
    tree = cKDTree(v)
    vol0 = abs(trimesh.Trimesh(v, t).volume)
    mesh = mesh.subdivide_loop(iterations=it)
    nv = np.asarray(mesh.vertices); nt = np.asarray(mesh.faces)
    dd, ii = tree.query(nv, k=4)
    w = 1 / np.maximum(dd, 0.05) ** 2; w /= w.sum(1, keepdims=True)
    ao = (TT['ao'][ii] * w).sum(1); en = (TT['en'][ii] * w).sum(1)
    s = (vol0 / max(abs(mesh.volume), 1e-6)) ** (1 / 3)
    c = nv.mean(0); nv = c + (nv - c) * s
    TT.update(v=nv, t=nt, ao=ao, en=en)
for fdi, TT in T.items():
    subdivide(TT, 2 if fdi in INC + ['33', '43'] else 1)

def smooth_normals(v, t):
    n = np.zeros_like(v)
    fn = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    for k in range(3): np.add.at(n, t[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)

# ---------------------------------------------------------------- per-tooth landmarks, FA point (outward = away from the arch centre)
lower_tips = np.array([landmarks(f)['tip'] for f in LOWER])
ARCH_C = np.array([0.0, 0.0, 0.5 * (landmarks('36')['tip'][2] + landmarks('46')['tip'][2]) - 6.0])
meta = {}
for fdi, TT in T.items():
    L = landmarks(fdi)
    v, en, ax = TT['v'], TT['en'], TT['ax']
    n = smooth_normals(v, TT['t']); TT['n'] = n
    tp = (v - L['cr']) @ ax
    t_cej = (L['cej'] - L['cr']) @ ax; t_tip = (L['tip'] - L['cr']) @ ax
    cc = v[en > 0.5].mean(0)
    out = cc - ARCH_C; out[1] = 0; out /= np.linalg.norm(out)
    if fdi[0] in '12': out = out                                         # upper: same outward sense
    frac = {'1': 0.45, '2': 0.45, '3': 0.6, '4': 0.58, '5': 0.56}.get(fdi[1], 0.5)   # canine / premolar brackets slightly occlusal: room for the stepped extension
    mid = t_cej + frac * (t_tip - t_cej)
    sl = (np.abs(tp - mid) < 0.7) & (en > 0.5)
    i = np.argmax(np.where(sl, v @ out, -1e9))
    near = np.linalg.norm(v - v[i], axis=1) < 1.5
    fa_n = n[near].mean(0); fa_n /= np.linalg.norm(fa_n)
    meta[fdi] = dict(fdi=fdi, cr=L['cr'].tolist(), axis=ax.tolist(), apex=L['apex'].tolist(), tip=L['tip'].tolist(),
                     cej=L['cej'].tolist(), rootLen=L['rootLen'], fa=v[i].tolist(), faN=fa_n.tolist(), out=out.tolist(),
                     crown=cc.tolist(), bmin=v.min(0).tolist(), bmax=v.max(0).tolist())
for f in INC: meta[f]['crSingle'] = cr_ind[f].tolist()

BR_OFF, TUBE_OFF = 1.55, 1.75
def slot(fdi, off=None):
    m = meta[fdi]; return np.array(m['fa']) + np.array(m['faN']) * (off if off is not None else (TUBE_OFF if fdi[1] in '67' else BR_OFF))

# ---------------------------------------------------------------- anterior sectional wire with stepped distal extensions (START pose)
def hdir(a, b):
    d = np.asarray(b) - np.asarray(a); d[1] = 0; return d / np.linalg.norm(d)
STEP_H = 3.6          # apical step at the distal of the lateral incisor bracket
RUN0 = 2.2            # straight run distal to the lateral slot before the step
EXT_OFF = 1.45        # labial clearance of the extension from the enamel (centre line)
Z_END = -5.6          # distal end of the extension (CR at z = 0)
Z5 = -4.5             # point 5
def side_wire(sg):
    q = '3' if sg > 0 else '4'
    sC, sL, s3 = slot(q + '1'), slot(q + '2'), slot(q + '3')
    tdir = hdir(sC, sL)
    A = sL + tdir * RUN0
    B = A + np.array([0, -STEP_H, 0])
    # extension: runs distally at the level of B, labial to the canine and the mesial half of the first premolar
    # (gingival to their brackets), at EXT_OFF clearance from the enamel; ends at z = Z_END (distal to the CR level)
    band = np.concatenate([T[q + k]['v'][np.abs(T[q + k]['v'][:, 1] - B[1]) < 0.6] for k in '234'])
    ang = lambda p: math.atan2(p[0] - ARCH_C[0], p[2] - ARCH_C[2])
    bandA = np.array([ang(p) for p in band]); bandR = np.hypot(band[:, 0] - ARCH_C[0], band[:, 2] - ARCH_C[2])
    a0 = ang(B); rB = math.hypot(B[0] - ARCH_C[0], B[2] - ARCH_C[2])
    A_ = np.linspace(a0, a0 + sg * 1.2, 241)
    rr = np.array([(bandR[np.abs(bandA - a) < 0.035].max() if (np.abs(bandA - a) < 0.035).any() else 0) + EXT_OFF for a in A_])
    rr = ndimage.maximum_filter1d(rr, 9); rr = ndimage.gaussian_filter1d(rr, 3) + 0.15
    w = np.clip((A_ - a0) * sg / 0.10, 0, 1); w = w * w * (3 - 2 * w)
    rr = rB * (1 - w) + np.maximum(rr, 0) * w
    pts = [sC.copy(), sL.copy(), A.copy(), B.copy()]
    k = 0
    for a, r in zip(A_[1:], rr[1:]):
        k += 1
        p = np.array([ARCH_C[0] + r * math.sin(a), B[1], ARCH_C[2] + r * math.cos(a)])
        if k % 8 == 0: pts.append(p)
        if p[2] < Z_END: pts.append(p); break
    return pts
wL, wR = side_wire(+1), side_wire(-1)
anterior = [p.tolist() for p in reversed(wR)] + [p.tolist() for p in wL]   # right end → left end (polyline control points)
# five application points (START pose)
def on_ext(pts, zt):
    ext = pts[3:]
    for a, b in zip(ext[:-1], ext[1:]):
        if (a[2] - zt) * (b[2] - zt) <= 0: u = (zt - a[2]) / (b[2] - a[2]); return a + (b - a) * u
    return None
POINTS = {}
POINTS['1'] = [0.5 * (wL[0] + wR[0])]
POINTS['2'] = [0.5 * (wL[0] + wL[1]), 0.5 * (wR[0] + wR[1])]
POINTS['3'] = [wL[1] + (wL[2] - wL[1]) * 0.78, wR[1] + (wR[2] - wR[1]) * 0.78]
P4 = [on_ext(wL, 0.0), on_ext(wR, 0.0)]
assert all(p is not None for p in P4), 'the extension does not reach the CR level — lengthen it'
POINTS['4'] = P4
POINTS['5'] = [on_ext(wL, Z5), on_ext(wR, Z5)]
dk = {k: float(np.mean([p[2] for p in v])) for k, v in POINTS.items()}       # signed sagittal lever arm (CR at z = 0)
print('lever arms d_k (mm, + = anterior to CR):', {k: round(v, 2) for k, v in dk.items()})

# ---------------------------------------------------------------- poses of the rigid incisor segment
# displacement = translation along the resultant (−y, intrusion) + rotation about +x through the CR, θ = c·d
# (qualitative: the same compliance scale for all five points, so θ ∝ M = F·d; values illustrative)
INTR = 2.0
C_ROT = 10.0 / dk['1']                                                   # deg per mm of lever arm (point 1 → 10°)
POSES = {'start': dict(theta=0.0, shift=[0, 0, 0])}
for k in '12345':
    th = C_ROT * dk[k] if abs(dk[k]) > 1e-6 else 0.0
    if k == '4': th = 0.0                                                # d ≈ 0 by construction in this model
    POSES['p' + k] = dict(theta=round(th, 3), shift=[0, -INTR, 0], d=round(dk[k], 3))
print('poses:', POSES)
def rotx(a):
    c, s = math.cos(a), math.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def pose_fn(p):
    Rx = rotx(math.radians(p['theta'])); sh = np.asarray(p['shift'], float)
    return lambda q: np.asarray(q) @ Rx.T + sh

# ---------------------------------------------------------------- bone volume
def surf_samples(v, t, step=0.35, seed=1):
    a, b, c = v[t[:, 0]], v[t[:, 1]], v[t[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    cnt = np.maximum(1, (area / (step * step)).astype(int))
    rep = np.repeat(np.arange(len(t)), cnt)
    r1, r2 = np.random.default_rng(seed).random((2, len(rep)))
    s = np.sqrt(r1)
    return (1 - s)[:, None] * a[rep] + (s * (1 - r2))[:, None] * b[rep] + (s * r2)[:, None] * c[rep]

VX = 0.45
mv, mt, _, _ = submesh('Mandible'); mv = toA(mv)
lo = np.array([-33.0, -36.0, -48.0]); hi = np.array([33.0, 8.0, 12.0])
shape = np.ceil((hi - lo) / VX).astype(int) + 1
gx, gy, gz = np.meshgrid(*[lo[k] + VX * np.arange(shape[k]) for k in range(3)], indexing='ij')
a_, b_, c_ = mv[mt[:, 0]], mv[mt[:, 1]], mv[mt[:, 2]]
fn_ = np.cross(b_ - a_, c_ - a_); area = 0.5 * np.linalg.norm(fn_, axis=1); fn_ /= np.maximum(2 * area[:, None], 1e-12)
if np.mean(np.sum(fn_ * (a_ - mv.mean(0)), 1)) < 0: fn_ = -fn_
cnt = np.maximum(1, (area / 0.06).astype(int)); rep = np.repeat(np.arange(len(mt)), cnt)
r1, r2 = np.random.default_rng(3).random((2, len(rep))); sq = np.sqrt(r1)
smp = (1 - sq)[:, None] * a_[rep] + (sq * (1 - r2))[:, None] * b_[rep] + (sq * r2)[:, None] * c_[rep]
gp = np.stack([gx.ravel(), gy.ravel(), gz.ravel()], 1)
dd, ii = cKDTree(smp).query(gp, workers=-1)
mand = (np.sum((gp - smp[ii]) * fn_[rep[ii]], 1) < 0).reshape(shape)
mand = ndimage.binary_opening(mand, iterations=1)
print('mandible voxels', int(mand.sum()))
sd_m_in = ndimage.distance_transform_edt(mand) * VX; sd_m_out = ndimage.distance_transform_edt(~mand) * VX
def mand_depth(p):
    ij = (np.asarray(p) - lo) / VX
    return ndimage.map_coordinates(sd_m_in, ij.T, order=1, mode='nearest') - ndimage.map_coordinates(sd_m_out, ij.T, order=1, mode='nearest')

def occ(pts):
    o = np.zeros(shape, bool); ij = np.round((pts - lo) / VX).astype(int)
    ok = ((ij >= 0) & (ij < shape)).all(1); o[tuple(ij[ok].T)] = True; return o
def solid_of(v, t):
    o = occ(surf_samples(v, t)); o = ndimage.binary_closing(o, iterations=1); return ndimage.binary_fill_holes(o)
def root_solid(fdi, fn=None, crest=1.5, dil=0.8):
    TT = T[fdi]; M = meta[fdi]
    v = TT['v'] if fn is None else fn(TT['v'])
    s = ndimage.binary_dilation(solid_of(v, TT['t']), iterations=max(1, int(round(dil / VX))))
    ax = np.array(M['axis']); cej = np.array(M['cej'])
    if fn is not None: ax = fn(cej + ax) - fn(cej); cej = fn(cej)
    tp = (gx - cej[0]) * ax[0] + (gy - cej[1]) * ax[1] + (gz - cej[2]) * ax[2]
    return s & (tp < -crest)
bone = mand.copy()
for f in LOWER:
    if f in INC:
        for k, p in POSES.items(): bone |= root_solid(f, pose_fn(p), crest=1.6, dil=1.25)
    else: bone |= root_solid(f, dil=1.1)
bone = ndimage.binary_closing(bone, iterations=2)
bone = ndimage.binary_fill_holes(bone)
field = ndimage.gaussian_filter(bone.astype(np.float32), 1.4)
bv, bf, _, _ = measure.marching_cubes(field, 0.5, spacing=(VX, VX, VX))
bv = bv + lo; bf = bf[:, [0, 2, 1]]
bn = smooth_normals(bv, bf)
if np.mean(np.sum((bv - bv.mean(0)) * bn, 1)) < 0: bn = -bn; bf = bf[:, [0, 2, 1]]
print('bone', len(bv), 'verts', len(bf), 'tris')

# ---------------------------------------------------------------- QA
qa = {'rootsInMandible': {}, 'minClear': {}}
for k, p in POSES.items():
    fn = pose_fn(p); worst = 1e9
    for f in INC:
        v = T[f]['v']; M = meta[f]
        tp = (v - np.array(M['cej'])) @ np.array(M['axis'])
        rp = v[tp < -3.0]                       # apical part of the root (below the crest region)
        worst = min(worst, float(mand_depth(fn(rp)).min()))
    qa['rootsInMandible'][k] = round(worst, 2)
# rest pose of the other lower teeth
def apical(f, frac=0.6):
    v = T[f]['v']; M = meta[f]; tp = (v - np.array(M['cej'])) @ np.array(M['axis']); return v[tp < tp.min() * frac]
qa['rootsInMandibleRest'] = {f: round(float(mand_depth(apical(f)).min()), 2) for f in LOWER if f not in INC}
trees = {f: cKDTree(T[f]['v']) for f in ['33', '43']}
for k, p in POSES.items():
    fn = pose_fn(p)
    qa['minClear'][k] = round(min(float(trees['33'].query(fn(T['32']['v']))[0].min()), float(trees['43'].query(fn(T['42']['v']))[0].min())), 2)
up_inc = np.concatenate([T[f]['v'] for f in ['11', '12', '21', '22']]); lo_inc = np.concatenate([T[f]['v'] for f in INC])
qa['upperLowerIncisorClear'] = round(float(cKDTree(up_inc).query(lo_inc)[0].min()), 2)
qa['overbite'] = round(float(np.max(lo_inc[:, 1]) - np.min(up_inc[:, 1])), 2)
qa['upperLowerMolarClear'] = round(float(cKDTree(np.concatenate([T[f]['v'] for f in ['16', '26']])).query(np.concatenate([T[f]['v'] for f in ['36', '46']]))[0].min()), 2)
sd_in = ndimage.distance_transform_edt(field > 0.5) * VX; sd_out = ndimage.distance_transform_edt(field <= 0.5) * VX
def bone_depth(p):
    ij = (np.asarray(p) - lo) / VX
    return ndimage.map_coordinates(sd_in, ij.T, order=1, mode='nearest') - ndimage.map_coordinates(sd_out, ij.T, order=1, mode='nearest')
qa['rootsInBone'] = {}
for k, p in POSES.items():
    fn = pose_fn(p)
    qa['rootsInBone'][k] = round(min(float(bone_depth(fn(apical(f, 0.75))).min()) for f in INC), 2)
qa['rootsInBoneRest'] = round(min(float(bone_depth(apical(f, 0.75)).min()) for f in LOWER if f not in INC), 2)
qa['note'] = 'rootsInMandible: depth in the source mandible only (thin, low-poly); rootsInBone: depth in the film bone volume (mandible ∪ alveolar walls around every root in every pose)'
print('QA', json.dumps(qa))

# ---------------------------------------------------------------- write
hdr = {'units': 'mm', 'frame': 'arch frame: origin = CR of the 4-incisor segment (START), +x patient left, +y occlusal, +z anterior',
       'skull_to_arch': {'origin': O.tolist(), 'R_rows': R.tolist()}, 'archCentre': ARCH_C.tolist(),
       'source': 'Z-Anatomy (CC BY-SA 4.0), derived from BodyParts3D (c) DBCLS (CC BY-SA 2.1 JP); bone procedural from it',
       'extrusionStart': EXTR, 'intrusion': INTR, 'cRot': C_ROT, 'poses': POSES, 'qa': qa,
       'wire': {'anterior': anterior, 'left': [p.tolist() for p in wL], 'right': [p.tolist() for p in wR], 'stepH': STEP_H},
       'points': {k: [p.tolist() for p in v] for k, v in POINTS.items()}, 'd': dk,
       'slots': {f: slot(f).tolist() for f in LOWER}, 'auxTube': {f: slot(f, TUBE_OFF).tolist() for f in ['36', '46']},
       'meshes': []}
blob = bytearray()
def add(a):
    b = np.ascontiguousarray(a).tobytes(); off = len(blob); blob.extend(b); blob.extend(b'\0' * ((-len(b)) % 4)); return off, len(b)
def write(name, v, n, ao, en, t, meta_=None):
    nn = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
    e = {'name': name, 'vertices': int(len(v)), 'triangles': int(len(t)), **(meta_ or {})}
    e['position'] = add(v.astype(np.float32)); e['normal'] = add(np.clip(np.round(nn * 127), -127, 127).astype(np.int8))
    e['ao'] = add(np.round(np.clip(ao, 0, 1) * 255).astype(np.uint8)); e['enamel'] = add(np.round(np.clip(en, 0, 1) * 255).astype(np.uint8))
    e['index'] = add(t.astype(np.uint32)); hdr['meshes'].append(e)
for fdi in LOWER + UPPER:
    TT = T[fdi]
    write(('L' if fdi in LOWER else 'U') + fdi, TT['v'], TT['n'], TT['ao'], TT['en'], TT['t'], meta[fdi])
write('bone', bv, bn, np.ones(len(bv)), np.zeros(len(bv)), bf)
open(OUT + '.bin', 'wb').write(bytes(blob))
json.dump(hdr, open(OUT + '.json', 'w'), indent=1)
print('written', round(len(blob) / 1e6, 2), 'MB', len(hdr['meshes']), 'meshes')
