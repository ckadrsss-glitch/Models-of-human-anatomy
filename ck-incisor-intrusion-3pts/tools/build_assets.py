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
#     stepped distal extensions, the three alternative tie configurations A / B / C (symmetric pairs), the
#     signed sagittal lever arms d_k = z_k − z_CR and the three end poses (translation along the force +
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

# ---------------------------------------------------------------- V3: LEVELLING & ALIGNMENT COMPLETED (treatment stage)
# The mechanics is shown after levelling and alignment inside the segments: every lower tooth is moved rigidly so that
#   * its rotation about the long axis is corrected (bracket normal = outward normal of the arch form),
#   * its bracket slot lies on ONE smooth anatomical arch form (polar fit r(θ), even in θ: symmetric, curved, not flat),
#   * the slots of each segment are level: the 4 incisors at one common height (= their START height, still
#     over-erupted by EXTR → the intrusion is still needed; the deep bite is NOT corrected), the buccal segments on one
#     straight line from the canine to the second molar (symmetric left/right),
#   * the crowns contact without crowding or spacing (sequential contacts from the midline, gap GAP).
# The bracket point (FA) and its normal are carried with the tooth (material point), so the slots stay exactly on the arch.
GAP = 0.06
H_BR = {'1': 4.0, '2': 4.0, '3': 4.6, '4': 4.6, '5': 4.6, '6': 4.6, '7': 4.6}   # bracket slot height below the (buccal) cusp tip / incisal edge
def rodrigues(k, a):
    k = k / np.linalg.norm(k); K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + math.sin(a) * K + (1 - math.cos(a)) * K @ K
LEVEL = {}
if os.environ.get('NO_LEVEL') != '1':
    C0 = np.array([0.0, 0.0, 0.5 * (landmarks('36')['tip'][2] + landmarks('46')['tip'][2]) - 6.0])
    ang = lambda p: math.atan2(p[0] - C0[0], p[2] - C0[2])
    TUBE_OFF0, BR_OFF0 = 1.75, 1.55
    off = lambda f: TUBE_OFF0 if f[1] in '67' else BR_OFF0
    V0 = {f: T[f]['v'].copy() for f in LOWER}
    def crown_of(v, f): return v[T[f]['en'] > 0.5]
    def tip_and_fa(v, f, N):
        """buccal cusp tip / incisal edge height and the bracket point (FA) at H_BR below it, on the labial surface,
        centred mesio-distally, with its outward normal turned square to the arch form (bracket bonded on the arch)"""
        cv = crown_of(v, f); cc = cv.mean(0); tg = np.cross([0, 1, 0], N)
        buc = cv[((cv - cc) @ N) > 0]
        ytip = float(buc[:, 1].max())
        yfa = ytip - H_BR[f[1]]
        band = cv[(np.abs(cv[:, 1] - yfa) < 0.35) & (np.abs((cv - cc) @ tg) < 1.2)]
        fa = band[np.argmax(band @ N)].copy()
        # local surface inclination (torque look) from the labial band around the FA point
        up = cv[(np.abs(cv[:, 1] - (yfa + 1.2)) < 0.3) & (np.abs((cv - cc) @ tg) < 1.2)]; dn = cv[(np.abs(cv[:, 1] - (yfa - 1.2)) < 0.3) & (np.abs((cv - cc) @ tg) < 1.2)]
        s = ((up @ N).max() - (dn @ N).max()) / 2.4                  # outward lean of the labial surface per mm of height
        fn = N - s * np.array([0, 1.0, 0]) * 0 + np.array([0, -s, 0]); fn = fn / np.linalg.norm(fn)
        return ytip, fa, fn
    def md_axis(v, f, ax):
        tp = (v - v.mean(0)) @ ax; top = v[tp > tp.max() - (1.2 if f[1] in '123' else 3.0)]
        X = top[:, [0, 2]] - top[:, [0, 2]].mean(0); _, _, vt = np.linalg.svd(X, full_matrices=False)
        return np.array([vt[0][0], 0, vt[0][1]])
    # arch form from the initial (unlevelled) slots, with radial N as provisional normal
    P0 = {}
    for f in LOWER:
        cc = crown_of(V0[f], f).mean(0); Nr = cc - C0; Nr[1] = 0; Nr /= np.linalg.norm(Nr)
        ytip, fa, fn = tip_and_fa(V0[f], f, Nr); P0[f] = dict(ytip=ytip, slot=fa + fn * off(f), cr=landmarks(f)['cr'])
    th0 = np.array([ang(P0[f]['slot']) for f in LOWER]); r0 = np.array([math.hypot(P0[f]['slot'][0] - C0[0], P0[f]['slot'][2] - C0[2]) for f in LOWER])
    A_ = np.stack([np.ones_like(th0), th0 ** 2, th0 ** 4], 1); rc = np.linalg.lstsq(A_, r0, rcond=None)[0]
    rfit = lambda th: rc[0] + rc[1] * th ** 2 + rc[2] * th ** 4
    drfit = lambda th: 2 * rc[1] * th + 4 * rc[2] * th ** 3
    def curve(th):
        r, dr = rfit(th), drfit(th); er = np.array([math.sin(th), 0, math.cos(th)]); et = np.array([math.cos(th), 0, -math.sin(th)])
        nrm = r * er - dr * et; return C0 + r * er, nrm / np.linalg.norm(nrm)
    print('arch form r(θ) =', np.round(rc, 3).tolist(), ' in/out irregularity before (mm):', {f: round(float(r0[i] - rfit(th0[i])), 2) for i, f in enumerate(LOWER)})
    # vertical targets: incisal edges of the 4 incisors level at their mean START height (over-erupted: intrusion still
    # needed, deep bite kept); buccal cusp tips 33–37 on one symmetric straight line in |θ| (levelled curve of Spee)
    yI = float(np.mean([P0[f]['ytip'] for f in INC]))
    bu = [f for f in LOWER if f not in INC]
    lc = np.polyfit([abs(ang(P0[f]['slot'])) for f in bu], [P0[f]['ytip'] for f in bu], 1)
    tb = np.array([abs(ang(P0[f]['slot'])) for f in bu]); lc = np.array([0.35 * lc[0], np.polyval(lc, tb.mean()) - 0.35 * lc[0] * tb.mean()])
    ytipT = lambda f, th: yI if f in INC else float(np.polyval(lc, abs(th)))
    print('cusp-tip / incisal-edge heights before (mm):', {f: round(P0[f]['ytip'], 2) for f in LOWER})
    # derotation about the long axis: incisal edge / crown mesio-distal axis parallel to the arch tangent (incisors,
    # canines, molars). Premolars (round crowns, no reliable mesio-distal axis) only follow the arch-form heading.
    heading = lambda th: math.atan2(*curve(th)[1][[0, 2]])
    ROT0 = {}
    for f in LOWER:
        th = ang(P0[f]['slot']); N = curve(th)[1]; tg = np.cross([0, 1, 0], N)
        if f[1] in '45': ROT0[f] = 0.0
        else:
            md = md_axis(V0[f], f, T[f]['ax']); a = math.degrees(math.atan2(np.cross(md, tg)[1], md @ tg)); ROT0[f] = math.radians((a + 90) % 180 - 90)
        ROT0[f] = (ROT0[f], th)
    def place(f, th):
        a0, thA = ROT0[f]; ax = T[f]['ax']; c = P0[f]['cr']
        rot = a0 + (heading(th) - heading(thA)) * (1 if ax[1] > 0 else -1)
        Rm = rodrigues(ax, rot); v = (V0[f] - c) @ Rm.T + c
        pt, N = curve(th)
        ytip, fa, fn = tip_and_fa(v, f, N)
        d = pt - (fa + fn * off(f)); d[1] = (ytipT(f, th) - H_BR[f[1]]) - (fa + fn * off(f))[1]    # slots exactly level / collinear
        return Rm, c, d, rot, fa + d, fn
    def apply_place(f, th):
        Rm, c, d, rot, fa, fn = place(f, th)
        T[f]['v'] = (V0[f] - c) @ Rm.T + c + d
        LEVEL[f] = dict(fa=fa, faN=fn, th=th, rot=math.degrees(rot), shift=d)
    for f in LOWER: apply_place(f, ang(P0[f]['slot']))
    # sequential contacts from the midline outwards (both sides): march each tooth along the arch form towards the
    # midline until its crown is GAP from the crown of its mesial neighbour (dense surface samples → point-to-surface)
    def crown_samples(f, step=0.12):
        v, t, en = T[f]['v'], T[f]['t'], T[f]['en']; tt = t[(en[t] > 0.5).all(1)]
        a, b, c = v[tt[:, 0]], v[tt[:, 1]], v[tt[:, 2]]
        area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1); cnt = np.maximum(1, (area / (step * step)).astype(int))
        rep = np.repeat(np.arange(len(tt)), cnt); r1, r2 = np.random.default_rng(5).random((2, len(rep))); sq = np.sqrt(r1)
        return (1 - sq)[:, None] * a[rep] + (sq * (1 - r2))[:, None] * b[rep] + (sq * r2)[:, None] * c[rep]
    for q, sg in (('3', 1), ('4', -1)):
        prev = None
        for k in '1234567':
            f = q + k
            if prev is None: dist = lambda: 2 * float(crown_samples(f)[:, 0].min() if sg > 0 else -crown_samples(f)[:, 0].max())
            else:
                tree = cKDTree(crown_samples(prev)); dist = lambda: float(tree.query(crown_samples(f, 0.2))[0].min())
            th = LEVEL[f]['th'] + sg * 0.10
            apply_place(f, th)
            while dist() < GAP + 0.6: th += sg * 0.02; apply_place(f, th)
            stp = 0.004
            while True:
                apply_place(f, th - sg * stp)
                if dist() < GAP: break
                th -= sg * stp
            for _ in range(10):
                stp /= 2; apply_place(f, th - sg * stp)
                if dist() >= GAP: th -= sg * stp
            apply_place(f, th); LEVEL[f]['gap'] = round(dist(), 3); prev = f
    for f in LOWER:
        Lv = LEVEL[f]
        print(f'  {f}: derotation {Lv["rot"]:+.1f}°, shift {np.round(Lv["shift"], 2).tolist()}, θ {math.degrees(Lv["th"]):.1f}°')
    # re-centre: the arch-frame origin stays the CR of the (levelled) 4-incisor segment
    O2 = np.mean([landmarks(f)['cr'] for f in INC], 0); O2[0] = 0.0
    for TT in T.values(): TT['v'] = TT['v'] - O2
    for f in LEVEL: LEVEL[f]['fa'] = LEVEL[f]['fa'] - O2
    O = O + O2 @ R
    cr_ind = {f: landmarks(f)['cr'] for f in INC}
    print('re-centred by', np.round(O2, 2).tolist())
    ARC_C = C0 - O2
    def arch_pt(th, y): p_, n_ = curve(th); p_ = p_ - O2; p_[1] = y; return p_, n_
    def arch_th(p_): return math.atan2(p_[0] - ARC_C[0], p_[2] - ARC_C[2])

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
    fa_p = v[i]
    if fdi in LEVEL: fa_p, fa_n = LEVEL[fdi]['fa'], LEVEL[fdi]['faN']        # levelled: the carried bracket point
    meta[fdi] = dict(fdi=fdi, cr=L['cr'].tolist(), axis=ax.tolist(), apex=L['apex'].tolist(), tip=L['tip'].tolist(),
                     cej=L['cej'].tolist(), rootLen=L['rootLen'], fa=np.asarray(fa_p).tolist(), faN=np.asarray(fa_n).tolist(), out=out.tolist(),
                     crown=cc.tolist(), bmin=v.min(0).tolist(), bmax=v.max(0).tolist())
for f in INC: meta[f]['crSingle'] = cr_ind[f].tolist()
if LEVEL:
    sl_ = {f: np.array(meta[f]['fa']) + np.array(meta[f]['faN']) * (1.75 if f[1] in '67' else 1.55) for f in LOWER}
    print('slot heights after (mm):', {f: round(float(sl_[f][1]), 2) for f in LOWER})
    print('contact gaps (mm):', {f: LEVEL[f].get('gap') for f in LOWER})
if os.environ.get('QUICK') == '1': raise SystemExit(0)

BR_OFF, TUBE_OFF = 1.55, 1.75
def slot(fdi, off=None):
    m = meta[fdi]; return np.array(m['fa']) + np.array(m['faN']) * (off if off is not None else (TUBE_OFF if fdi[1] in '67' else BR_OFF))

# ---------------------------------------------------------------- anterior sectional wire with stepped distal extensions (START pose)
def hdir(a, b):
    d = np.asarray(b) - np.asarray(a); d[1] = 0; return d / np.linalg.norm(d)
RUN0 = 2.0            # straight run distal to the lateral slot before the step
EXT_OFF = 1.45        # labial clearance of the extension from the enamel (centre line)
Z_END = -4.8          # distal end of the extension (CR at z = 0) — V4: only ≈0.8 mm past tie C (no excess length)
Z_C = -4.0            # tie configuration C (distal, on the extension)
TIP_R = 0.4           # V4: radius of the small occlusal up-bend at the distal tip of each extension
TIP_RISE = 0.6       # V4: short straight rise after the quarter circle (total tip height ≈ 1.0 mm)
BR_HALF = 1.6         # occluso-gingival half-height of the canine / premolar bracket body + tie wings (geom.js)
def side_wire(sg):
    """one half of the rigid anterior SS sectional wire, midline → distal end:
    smooth arch-form curve through the central and lateral slots (levelled: one height) → short straight run →
    apical STEP (functional: room for the extension under the canine / premolar brackets) → distal extension"""
    q = '3' if sg > 0 else '4'
    sC, sL = slot(q + '1'), slot(q + '2')
    thL = arch_th(sL); yS = 0.5 * (sC[1] + sL[1])
    pts = [arch_pt(thL * u, yS)[0] for u in np.linspace(0, 1, 13)]      # θ = 0 (midline) … lateral slot, on the arch form
    pts[-1] = np.array([sL[0], yS, sL[2]])
    tdir = hdir(arch_pt(thL - sg * 0.02, yS)[0], arch_pt(thL, yS)[0])
    A = pts[-1] + tdir * RUN0
    ext_y = min(slot(q + '3')[1], slot(q + '4')[1]) - BR_HALF - 0.32 - 0.35   # extension clears the canine / premolar brackets
    B = A + np.array([0, ext_y - A[1], 0])
    band = np.concatenate([T[q + k]['v'][np.abs(T[q + k]['v'][:, 1] - B[1]) < 0.6] for k in '234'])
    ang_ = lambda p: math.atan2(p[0] - ARCH_C[0], p[2] - ARCH_C[2])
    bandA = np.array([ang_(p) for p in band]); bandR = np.hypot(band[:, 0] - ARCH_C[0], band[:, 2] - ARCH_C[2])
    a0 = ang_(B); rB = math.hypot(B[0] - ARCH_C[0], B[2] - ARCH_C[2])
    A_ = np.linspace(a0, a0 + sg * 1.2, 241)
    rr = np.array([(bandR[np.abs(bandA - a) < 0.035].max() if (np.abs(bandA - a) < 0.035).any() else 0) + EXT_OFF for a in A_])
    rr = ndimage.maximum_filter1d(rr, 9); rr = ndimage.gaussian_filter1d(rr, 3) + 0.15
    w = np.clip((A_ - a0) * sg / 0.10, 0, 1); w = w * w * (3 - 2 * w)
    rr = rB * (1 - w) + np.maximum(rr, 0) * w
    iB = len(pts) + 1
    pts = pts + [A.copy(), B.copy()]
    k = 0
    for a, r in zip(A_[1:], rr[1:]):
        k += 1
        p = np.array([ARCH_C[0] + r * math.sin(a), B[1], ARCH_C[2] + r * math.cos(a)])
        if k % 8 == 0: pts.append(p)
        if p[2] < Z_END: pts.append(p); break
    # V4: the distal tip of the extension is turned up (occlusally) — a short, smooth bend of the extension itself that
    # keeps the cantilever ligature from slipping off distally (cf. Machado-type designs). Main run stays straight.
    e, f = pts[-1], pts[-2]
    d = np.array([e[0] - f[0], 0.0, e[2] - f[2]]); d /= np.linalg.norm(d)
    for k in range(1, 9):
        a = (math.pi / 2) * k / 8
        pts.append(e + d * TIP_R * math.sin(a) + np.array([0, TIP_R * (1 - math.cos(a)), 0]))
    top = pts[-1]
    pts.append(top + np.array([0, TIP_RISE, 0]))
    return pts, iB
(wL, iBL), (wR, iBR) = side_wire(+1), side_wire(-1)
MIR = np.array([-1.0, 1.0, 1.0])
wR = [p * MIR for p in wL]; iBR = iBL                                  # exact bilateral symmetry of the bent wire (no transverse moments)
STEP_H = float(wL[iBL - 1][1] - wL[iBL][1])
print('apical step of the extension (mm):', round(STEP_H, 2))
anterior = [p.tolist() for p in reversed(wR)] + [p.tolist() for p in wL[1:]]   # both halves start at the same midline point   # right end → left end (polyline control points)
# three alternative tie configurations of the two cantilevers (START pose) — demonstration configurations of THIS
# model, not universal anatomical landmarks:
#   A — mesial: on the anterior sectional wire, between the central and the lateral incisor brackets (labial of the CR)
#   B — on the stepped extension at the sagittal level of the segment CR (idealised: line of action through the CR)
#   C — further distal on the extension (line of action lingual/posterior to the CR)
def on_ext(pts, zt):
    ext = pts[(iBL if pts is wL else iBR):]
    for a, b in zip(ext[:-1], ext[1:]):
        if (a[2] - zt) * (b[2] - zt) <= 0: u = (zt - a[2]) / (b[2] - a[2]); return a + (b - a) * u
    return None
POINTS = {}
def on_arch(sg):                                                        # A: on the arch-form part, midway between the central and lateral slots
    q = '3' if sg > 0 else '4'; th = 0.5 * (arch_th(slot(q + '1')) + arch_th(slot(q + '2'))); w = wL if sg > 0 else wR
    return arch_pt(th, w[0][1])[0]
POINTS['A'] = [on_arch(1), on_arch(1) * MIR]
PB = [on_ext(wL, 0.0), on_ext(wL, 0.0) * MIR]
assert all(p is not None for p in PB), 'the extension does not reach the CR level — lengthen it'
POINTS['B'] = PB
POINTS['C'] = [on_ext(wL, Z_C), on_ext(wL, Z_C) * MIR]
dk = {k: float(np.mean([p[2] for p in v])) for k, v in POINTS.items()}       # signed sagittal lever arm (CR at z = 0)
print('lever arms d_k (mm, + = anterior to CR):', {k: round(v, 2) for k, v in dk.items()})

# ---------------------------------------------------------------- poses of the rigid incisor segment
# displacement = translation of the CR along the resultant (−y, intrusion) + rotation about +x through the CR, θ = c·d
# (qualitative: the same compliance scale for the three configurations, so θ ∝ M = F·d; values illustrative and
#  deliberately moderate — the film uses camera magnification, not exaggerated amplitudes)
INTR = 2.0
C_ROT = 0.77                                                             # deg per mm of lever arm (illustrative; θ_A ≈ 8°)
POSES = {'start': dict(theta=0.0, shift=[0, 0, 0])}
for k in 'ABC':
    th = C_ROT * dk[k] if abs(dk[k]) > 1e-6 else 0.0
    if k == 'B': th = 0.0                                                # d ≈ 0 by construction in this model
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
# the source mandible is not watertight (open alveoli): the nearest-surface test can flag empty space next to a
# socket wall as "inside". Re-test the doubtful voxels of the alveolar part with the generalized winding number.
doubt = (mand.ravel() & (dd > 1.6) & (gp[:, 1] > -8)).nonzero()[0]
def winding(q):
    a = a_[None] - q[:, None]; b = b_[None] - q[:, None]; c = c_[None] - q[:, None]
    la, lb, lc = [np.linalg.norm(x, axis=2) for x in (a, b, c)]
    det = np.einsum('ijk,ijk->ij', a, np.cross(b, c))
    den = la * lb * lc + np.einsum('ijk,ijk->ij', a, b) * lc + np.einsum('ijk,ijk->ij', b, c) * la + np.einsum('ijk,ijk->ij', c, a) * lb
    return np.abs(np.sum(2 * np.arctan2(det, den), 1) / (4 * np.pi))
flat = mand.ravel().copy(); removed = 0
for k in range(0, len(doubt), 96):
    ids = doubt[k:k + 96]; w = winding(gp[ids])
    out = ids[w < 0.5]; flat[out] = False; removed += len(out)
mand = flat.reshape(shape)
print('doubtful voxels', len(doubt), 'removed (outside by winding number)', removed)
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
       'wire': {'anterior': anterior, 'left': [p.tolist() for p in wL], 'right': [p.tolist() for p in wR], 'stepH': STEP_H, 'iLat': iBL - 2, 'iRun': iBL - 1, 'iTip': len(wL) - 10},
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
