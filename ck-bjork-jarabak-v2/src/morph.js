// ============================================================================
//  Björk–Jarabak V2 — parametric skeletal morphology model
//
//  One definition, emitted as JavaScript (landmarks, lines, numbers, QA) and as
//  GLSL (vertex shader), so every line and number on screen is measured on
//  exactly the geometry that is rendered. Coordinates: mm, [z = anterior, y = up].
//
//  Parameters (object P):
//    sad    deg  rigid rotation about S of the posterior cranial base region
//                (glenoid fossae, articulare region) together with the mandible
//                → changes the saddle angle N–S–Ar only (articular & gonial unchanged)
//    pcb    mm   shift of the same region + mandible along S→Ar (posterior cranial base length S–Ar)
//    rot    deg  rotation of the mandible about the hinge axis (centre of the condylar head)
//                → changes the articular angle S–Ar–Go (orientation of the ramus)
//    ramus  mm   ramus height (+ longer): body lowered relative to the condyle
//    bend   deg  gonial angle (+ more obtuse): body bends about gonion
//    body   mm   mandibular body length (+ longer) between ramus and dentition
//    sym    mm   symphysis height (+ taller, narrower)
//    notch  mm   antegonial notch depth
//  Global: SCALE — uniform scale of the whole specimen about S (see docs/SCIENCE.md).
//
//  Positive sad / rot are clockwise on screen (face to the right): chin down and back.
//  The maxillary dento-alveolar process follows the lower dentition, so the teeth
//  stay in occlusion in every configuration (no open bite / deep bite is introduced).
// ============================================================================
import { CONTOURS } from './contours.js';

export const S0 = [19.0, -3.5];       // sella (centre of the hypophyseal fossa) — fixed
export const N0 = [84.5, 3.0];        // nasion
export const C0 = [9.0, -27.0];       // centre of the condylar head (hinge axis)
export const F0 = [8.0, -29.0];       // centre of the posterior-cranial-base region (fossa / articulare)
const GO0 = [13.0, -76.0];            // gonial bending centre on the source bone
const AR0 = [4.56, -33.69];           // articulare on the source bone (from the contours)
const len2 = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => { const l = len2(a); return [a[0] / l, a[1] / l]; };
export const U_SAR = unit([AR0[0] - S0[0], AR0[1] - S0[1]]);
const BODY_DIR = unit([77.5 - GO0[0], -104.6 - GO0[1]]);
export const SN_SOURCE = len2([N0[0] - S0[0], N0[1] - S0[1]]);
// Uniform specimen scale: the BodyParts3D skull is small (S–N 65.8 mm); it is scaled about S so
// that S–N = 71 mm (adult reference used in the film). Angles and ratios are scale-invariant.
export const SCALE = 71.0 / SN_SOURCE;
export const REGION = [12, 34];       // region weight: 1 within 12 mm of F0, 0 beyond 34 mm

export const ZERO = { sad: 0, pcb: 0, rot: 0, ramus: 0, bend: 0, body: 0, sym: 0, notch: 0 };

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rot(p, c, deg) {   // clockwise on screen for deg > 0
  const a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
  const dz = p[0] - c[0], dy = p[1] - c[1];
  return [c[0] + dz * cs + dy * sn, c[1] - dz * sn + dy * cs];
}
const mixp = (a, b, w) => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
const scl = (q) => [S0[0] + SCALE * (q[0] - S0[0]), S0[1] + SCALE * (q[1] - S0[1])];

/** placement of the posterior cranial base region + mandible relative to S */
function place(q, P) { return rot([q[0] + P.pcb * U_SAR[0], q[1] + P.pcb * U_SAR[1]], S0, P.sad); }
function bodyDir(P) { return rot([GO0[0] + BODY_DIR[0], GO0[1] + BODY_DIR[1]], GO0, P.bend).map((v, i) => v - GO0[i]); }

/** rigid transform of the lower dentate segment (used for the upper dentition → occlusion preserved) */
function lowerRigid(p, P) {
  const go = [GO0[0], GO0[1] - P.ramus];
  let q = [p[0], p[1] - P.ramus];
  q = rot(q, go, P.bend);
  const bd = bodyDir(P);
  q = [q[0] + P.body * bd[0], q[1] + P.body * bd[1]];
  q = rot(q, C0, P.rot);
  return place(q, P);
}

/** warp a point (unscaled model space → scaled film space). part: 0 cranium 1 mandible 2 upper tooth 3 lower tooth */
export function warp2(p, part, P, wp = p) {
  if (part === 1 || part === 3) {
    let q = [p[0], p[1]];
    const wsym = sstep(60, 74, wp[0]) * sstep(-84, -99, wp[1]);
    q[0] += -0.23 * P.sym * wsym; q[1] += -P.sym * wsym;
    const ng = Math.exp(-(((wp[0] - 34) / 9) ** 2 + ((wp[1] + 89) / 5) ** 2));
    q[1] += P.notch * ng;
    q[1] += -P.ramus * sstep(C0[1] - 2, C0[1] - 26, wp[1]);
    const dz = wp[0] - GO0[0], dy = wp[1] - GO0[1], rr = Math.hypot(dz, dy);
    const ang = Math.atan2(dy, dz) * 180 / Math.PI;
    const near = sstep(2, 10, rr);
    const wg = sstep(62, 25, ang) * near + (1 - near) * 0.5;
    q = mixp(q, rot(q, [GO0[0], GO0[1] - P.ramus], P.bend), wg);
    const wb = sstep(20, 38, wp[0]), bd = bodyDir(P);
    q = [q[0] + P.body * bd[0] * wb, q[1] + P.body * bd[1] * wb];
    q = rot(q, C0, P.rot);
    return scl(place(q, P));
  }
  const d = Math.hypot(wp[0] - F0[0], wp[1] - F0[1]);
  const wP = 1 - sstep(REGION[0], REGION[1], d);
  let q = mixp(p, place(p, P), wP);
  const wa = sstep(-38, -62, wp[1]) * sstep(26, 40, wp[0]);
  q = mixp(q, lowerRigid(p, P), wa);
  return scl(q);
}

// ---------------------------------------------------------------------------
// Cephalometric construction on the deformed bone
// ---------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const dist = (a, b) => len2(sub(a, b));
export function angle(a, o, b) {
  const u = sub(a, o), w = sub(b, o);
  return Math.acos(Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1]) / len2(u) / len2(w)))) * 180 / Math.PI;
}
function segX(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])] : null;
}
function lineX(a, da, b, db) {
  const d = da[0] * db[1] - da[1] * db[0];
  const t = ((b[0] - a[0]) * db[1] - (b[1] - a[1]) * db[0]) / d;
  return [a[0] + da[0] * t, a[1] + da[1] * t];
}

/**
 * Landmarks and measurements of the Björk–Jarabak analysis for parameter set P.
 *  S   centre of sella turcica                     N   nasion
 *  Ar  articulare: intersection of the posterior border of the condylar process with the
 *      inferior contour of the cranial base (radiographic construction point)
 *  Go  constructed gonion: bisector of the angle between the ramus tangent (through Ar) and
 *      the mandibular tangent (lower border) meets the mandibular contour
 *  Me  menton: lowest point of the symphysis       Pog pogonion: most anterior point of the chin
 */
export function ceph(P) {
  const post = CONTOURS.mandible.post.map((p) => warp2(p, 1, P));
  const inf = CONTOURS.mandible.inf.map((p) => warp2(p, 1, P));
  const ant = CONTOURS.mandible.ant.map((p) => warp2(p, 1, P));
  const base = CONTOURS.base.inf.map((p) => warp2(p, 0, P));
  const S = scl(S0), N = scl(N0);
  let Ar = null;
  for (let i = 0; i < post.length - 1 && !Ar; i++) {
    for (let j = 0; j < base.length - 1 && !Ar; j++) Ar = segX(post[i], post[i + 1], base[j], base[j + 1]);
  }
  let Me = null;
  for (const p of inf) if (p[0] > S[0] + 30 && (!Me || p[1] < Me[1])) Me = p;
  // pogonion: most anterior point of the chin, measured perpendicular to the S–N line
  const sn = unit(sub(N, S));
  let Pog = null, bestP = -Infinity;
  for (const p of ant) {
    if (p[1] > Me[1] + 17 || p[1] < Me[1] + 2) continue;   // chin region only (below the B-point concavity)
    const a = (p[0] - S[0]) * sn[0] + (p[1] - S[1]) * sn[1];
    if (a > bestP) { bestP = a; Pog = p; }
  }
  let T1 = null, best = Infinity;
  for (const p of post) {
    if (p[1] > Ar[1] - 8) continue;
    const phi = Math.atan2(p[0] - Ar[0], Ar[1] - p[1]);
    if (phi < best) { best = phi; T1 = p; }
  }
  const hull = [];
  for (const p of inf) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2], b = hull[hull.length - 1];
      if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) <= 0) hull.pop(); else break;
    }
    hull.push(p);
  }
  // hull edge bridging the antegonial region (spans the midpoint between the ramus and menton)
  const zm = (T1[0] + Me[0]) / 2;
  let T2 = hull[0], T3 = hull[hull.length - 1];
  for (let i = 0; i < hull.length - 1; i++) if (hull[i][0] <= zm && hull[i + 1][0] > zm) { T2 = hull[i]; T3 = hull[i + 1]; }
  const X = lineX(Ar, sub(T1, Ar), T3, sub(T2, T3));
  const u1 = sub(Ar, X), u2 = sub(T3, X);
  const bis = unit([u1[0] / len2(u1) + u2[0] / len2(u2), u1[1] / len2(u1) + u2[1] / len2(u2)]);
  // Go: first intersection of the bisector ray (from X into the bone) with the mandibular contour
  let Go = null; best = Infinity;
  const far = [X[0] + bis[0] * 40, X[1] + bis[1] * 40];
  for (const poly of [post, inf]) for (let i = 0; i < poly.length - 1; i++) {
    const h = segX(X, far, poly[i], poly[i + 1]);
    if (h) { const dd = dist(h, X); if (dd < best) { best = dd; Go = h; } }
  }
  const saddle = angle(N, S, Ar), articular = angle(S, Ar, Go), gonial = angle(Ar, Go, Me);
  return {
    S, N, Ar, Go, Me, Pog, X, T1, T2, T3, post, inf, ant, base,
    SN: dist(S, N), SAr: dist(S, Ar), ArGo: dist(Ar, Go), GoMe: dist(Go, Me),
    SGo: dist(S, Go), NMe: dist(N, Me), ratio: dist(S, Go) / dist(N, Me) * 100,
    saddle, articular, gonial, sum: saddle + articular + gonial,
    upperGonial: angle(Ar, Go, N), lowerGonial: angle(N, Go, Me),
    pogAP: bestP,                       // chin projection along S–N (mm from S)
  };
}

// ---------------------------------------------------------------------------
// GLSL implementation (same maths). Per-skull uniforms; p.zy = (anterior, up)
// ---------------------------------------------------------------------------
const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const v2 = (a) => `vec2(${f(a[0])}, ${f(a[1])})`;
export const WARP_GLSL = /* glsl */`
uniform float uSad; uniform float uPcb; uniform float uRot; uniform float uRamus; uniform float uBend;
uniform float uBody; uniform float uSym; uniform float uNotch;
vec2 rotCW(vec2 p, vec2 c, float deg){ float a = radians(deg); float cs = cos(a), sn = sin(a);
  vec2 d = p - c; return vec2(c.x + d.x*cs + d.y*sn, c.y - d.x*sn + d.y*cs); }
vec2 placeQ(vec2 q){ return rotCW(q + uPcb*${v2(U_SAR)}, ${v2(S0)}, uSad); }
vec2 bodyD(){ return rotCW(${v2(GO0)} + ${v2(BODY_DIR)}, ${v2(GO0)}, uBend) - ${v2(GO0)}; }
vec2 lowerRigid(vec2 p){
  vec2 go = ${v2(GO0)} - vec2(0.0, uRamus);
  vec2 q = vec2(p.x, p.y - uRamus);
  q = rotCW(q, go, uBend);
  q += uBody*bodyD();
  q = rotCW(q, ${v2(C0)}, uRot);
  return placeQ(q);
}
vec3 warpPoint(vec3 P, float part, vec3 anc, float rig){
  vec2 p = P.zy;
  vec2 wp = mix(P, anc, rig).zy;
  vec2 q;
  if (part > 0.5 && part < 1.5 || part > 2.5) {
    q = p;
    float wsym = smoothstep(60.0, 74.0, wp.x)*smoothstep(-84.0, -99.0, wp.y);
    q += vec2(-0.23, -1.0)*uSym*wsym;
    float ng = exp(-(pow((wp.x-34.0)/9.0, 2.0) + pow((wp.y+89.0)/5.0, 2.0)));
    q.y += uNotch*ng;
    q.y -= uRamus*smoothstep(${f(C0[1] - 2)}, ${f(C0[1] - 26)}, wp.y);
    vec2 d = wp - ${v2(GO0)};
    float r = length(d);
    float ang = degrees(atan(d.y, d.x));
    float near = smoothstep(2.0, 10.0, r);
    float wg = smoothstep(62.0, 25.0, ang)*near + (1.0-near)*0.5;
    q = mix(q, rotCW(q, ${v2(GO0)} - vec2(0.0, uRamus), uBend), wg);
    q += uBody*bodyD()*smoothstep(20.0, 38.0, wp.x);
    q = rotCW(q, ${v2(C0)}, uRot);
    q = placeQ(q);
  } else {
    float wP = 1.0 - smoothstep(${f(REGION[0])}, ${f(REGION[1])}, length(wp - ${v2(F0)}));
    q = mix(p, placeQ(p), wP);
    float wa = smoothstep(-38.0, -62.0, wp.y)*smoothstep(26.0, 40.0, wp.x);
    q = mix(q, lowerRigid(p), wa);
  }
  q = ${v2(S0)} + ${f(SCALE)}*(q - ${v2(S0)});
  return vec3(P.x*${f(SCALE)}, q.y, q.x);
}
`;
