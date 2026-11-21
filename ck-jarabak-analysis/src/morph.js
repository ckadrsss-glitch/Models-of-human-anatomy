// ============================================================================
//  Vertical facial morphology model for the Björk–Jarabak film
//
//  v : vertical pattern parameter (+ = more vertical / clockwise configuration,
//      − = more horizontal / counter-clockwise configuration). The three
//      illustrative states are found by calibration (see PATTERNS below) so that
//      the Jarabak ratio MEASURED on the deformed bone is exactly 56 / 61 / 67 %.
//  r : extra schematic mandibular rotation about the condyle (deg, + clockwise),
//      used only in the rotation scene.
//
//  The warp is defined once and emitted both as JavaScript (landmarks, lines,
//  numbers, QA) and as GLSL (vertex shader), so every line and number drawn on
//  screen is measured on exactly the geometry that is rendered.
//  Coordinates: mm, [z = anterior, y = up]; x (lateral) is never changed.
//
//  What is identical in every state: cranial vault and base, orbits, nasal
//  bones, S and N, the glenoid fossae and the condyles in the fossae.
//  What changes (morphology, never a uniform vertical scale of the skull):
//    * ramus height (posterior face height) — the body is lowered/raised
//      relative to the condyle, the condyle itself stays in the fossa;
//    * gonial angle — the body bends about gonion;
//    * mandibular inclination — rotation about the condyle;
//    * symphysis height/shape and antegonial notch;
//    * a small anterior shift of the body (keeps the incisors over each other);
//    * the maxillary dento-alveolar process follows the lower dentition, so the
//      teeth stay in occlusion: NO open bite or deep bite is introduced.
// ============================================================================
import { CONTOURS } from './contours.js';

export const LM = {
  S: [19.0, -3.5],      // centre of sella turcica (fixed)
  N: [84.5, 3.0],       // nasion (fixed)
  Co: [9.0, -27.0],     // centre of the condylar head — hinge axis used for mandibular rotation
};

export const K = {
  rotCo: 3.0,   // deg per unit v, rotation about the condyle (clockwise for v > 0)
  bend: 3.2,    // deg per unit v, gonial angle opening (body about gonion)
  ramus: 4.5,   // mm per unit v, ramus shortening (gonion rises toward the condyle)
  sym: 3.0,     // mm per unit v, symphysis elongation (menton lower)
  notch: 1.2,   // mm, antegonial notch deepening (v > 0 only)
  apComp: 0,    // mm per unit v (calibrated below): body/dentition advance that keeps the incisor AP position
};

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rot(p, c, deg) {   // clockwise on screen (face to the right) for deg > 0 → chin moves down and back
  const a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
  const dz = p[0] - c[0], dy = p[1] - c[1];
  return [c[0] + dz * cs + dy * sn, c[1] - dz * sn + dy * cs];
}
const mixp = (a, b, w) => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
const GO0 = [13.0, -76.0];  // gonial bending centre on the undeformed bone (≈ constructed gonion)

/** body region weight (anterior to the ramus) */
const wBody = (wp) => sstep(20, 38, wp[0]);

/** rigid transform of the lower dentate segment (used for the upper dentition, so occlusion is preserved) */
function lowerRigid(p, v, r) {
  let q = [p[0], p[1] + K.ramus * v];
  q = rot(q, [GO0[0], GO0[1] + K.ramus * v], K.bend * v);
  q[0] += K.apComp * v;
  return rot(q, LM.Co, K.rotCo * v + r);
}

/** warp a point; part: 0 cranium(+maxilla) 1 mandible 2 upper tooth 3 lower tooth; wp = weight position */
export function warp2(p, part, v, r = 0, wp = p) {
  if (part === 1 || part === 3) {
    let q = [p[0], p[1]];
    // local morphology: symphysis height / shape, antegonial notch
    const wsym = sstep(60, 74, wp[0]) * sstep(-84, -99, wp[1]);
    q[0] += -0.7 * v * wsym; q[1] += -K.sym * v * wsym;
    const ng = Math.exp(-(((wp[0] - 34) / 9) ** 2 + ((wp[1] + 89) / 5) ** 2));
    q[1] += K.notch * Math.max(v, 0) * ng;
    // ramus height: everything below the condylar neck moves toward / away from the condyle
    q[1] += K.ramus * v * sstep(LM.Co[1] - 6, LM.Co[1] - 30, wp[1]);
    // gonial angle: the body bends about gonion (sector weight)
    const dz = wp[0] - GO0[0], dy = wp[1] - GO0[1], rr = Math.hypot(dz, dy);
    const ang = Math.atan2(dy, dz) * 180 / Math.PI;
    const near = sstep(2, 10, rr);
    const wg = sstep(62, 25, ang) * near + (1 - near) * 0.5;
    q = mixp(q, rot(q, [GO0[0], GO0[1] + K.ramus * v], K.bend * v), wg);
    // sagittal compensation of the body (incisors stay over each other)
    q[0] += K.apComp * v * wBody(wp);
    // rotation about the condyle
    return rot(q, LM.Co, K.rotCo * v + r);
  }
  // cranium / maxilla / upper teeth: the dento-alveolar process follows the lower dentition
  const wa = sstep(-44, -62, wp[1]) * sstep(28, 42, wp[0]);
  return mixp(p, lowerRigid(p, v, r), wa);
}

// ---------------------------------------------------------------------------
// Cephalometric construction on the deformed bone
// ---------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a) => Math.hypot(a[0], a[1]);
export const dist = (a, b) => len(sub(a, b));
export function angle(a, o, b) {
  const u = sub(a, o), w = sub(b, o);
  return Math.acos(Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1]) / len(u) / len(w)))) * 180 / Math.PI;
}
function segX(p1, p2, p3, p4) {   // segment intersection
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
 * All landmarks and measurements of the Björk–Jarabak analysis for state (v, r).
 *  S, N   — fixed cranial landmarks
 *  Ar     — articulare: intersection of the posterior border of the condylar process with the
 *           inferior contour of the cranial base (radiographic definition)
 *  Me     — menton: lowest point of the symphysis
 *  Go     — constructed gonion: the bisector of the angle between the ramus tangent (through Ar)
 *           and the mandibular tangent (lower border) meets the mandibular contour
 */
export function ceph(v, r = 0) {
  const post = CONTOURS.mandible.post.map((p) => warp2(p, 1, v, r));
  const inf = CONTOURS.mandible.inf.map((p) => warp2(p, 1, v, r));
  const base = CONTOURS.base.inf;
  const { S, N } = LM;
  // Ar
  let Ar = null;
  for (let i = 0; i < post.length - 1 && !Ar; i++) {
    if (post[i][1] < -50) break;
    for (let j = 0; j < base.length - 1 && !Ar; j++) Ar = segX(post[i], post[i + 1], base[j], base[j + 1]);
  }
  // Me
  let Me = null;
  for (const p of inf) if (p[0] > 50 && (!Me || p[1] < Me[1])) Me = p;
  // ramus tangent through Ar (most posterior support line of the posterior border below Ar)
  let T1 = null, best = Infinity;
  for (const p of post) {
    if (p[1] > Ar[1] - 8) continue;
    const phi = Math.atan2(p[0] - Ar[0], Ar[1] - p[1]);
    if (phi < best) { best = phi; T1 = p; }
  }
  // mandibular tangent: lower support line of the inferior border (convex-hull edge bridging the
  // antegonial region, touching the border near the angle and near the symphysis)
  const hull = [];
  for (const p of inf) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2], b = hull[hull.length - 1];
      if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) <= 0) hull.pop(); else break;
    }
    hull.push(p);
  }
  let T2 = hull[0], T3 = hull[hull.length - 1];
  for (let i = 0; i < hull.length - 1; i++) if (hull[i][0] <= 42 && hull[i + 1][0] > 42) { T2 = hull[i]; T3 = hull[i + 1]; }
  const d1 = sub(T1, Ar), d2 = sub(T2, T3);
  const X = lineX(Ar, d1, T3, d2);                         // intersection of the two tangents
  const u1 = sub(Ar, X), u2 = sub(T3, X);
  const bis = [u1[0] / len(u1) + u2[0] / len(u2), u1[1] / len(u1) + u2[1] / len(u2)];
  const bl = len(bis), bn = [bis[0] / bl, bis[1] / bl];
  // Go: contour point closest to the bisector (on the bone side of X)
  let Go = null; best = Infinity;
  for (const p of post.concat(inf)) {
    const w = sub(p, X), along = w[0] * bn[0] + w[1] * bn[1];
    if (along < 0 || along > 25) continue;
    const perp = Math.abs(w[0] * bn[1] - w[1] * bn[0]);
    if (perp < best) { best = perp; Go = p; }
  }
  const SGo = dist(S, Go), NMe = dist(N, Me);
  const saddle = angle(N, S, Ar), articular = angle(S, Ar, Go), gonial = angle(Ar, Go, Me);
  return {
    S, N, Ar, Go, Me, X, T1, T2, T3, post, inf,
    SGo, NMe, ratio: SGo / NMe * 100,
    saddle, articular, gonial, sum: saddle + articular + gonial,
  };
}

/** incisor tip of the lower central incisor (for the AP compensation) */
const L1 = [89.0, -73.5];

function calibrateAP() {   // lower incisor tip keeps its AP position at v = 1
  let lo = -10, hi = 10;
  for (let i = 0; i < 50; i++) { K.apComp = (lo + hi) / 2; (warp2(L1, 3, 1)[0] > L1[0]) ? (hi = K.apComp) : (lo = K.apComp); }
}

/** v for a target Jarabak ratio (bisection; ratio decreases monotonically with v) */
export function vForRatio(target) {
  let lo = -3, hi = 3;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; (ceph(m).ratio > target) ? (lo = m) : (hi = m); }
  return (lo + hi) / 2;
}

// The coefficients above are fixed by hand (balance between ramus height, gonial angle, rotation and
// symphysis); only the AP compensation is calibrated. The three states are then located purely by
// their measured Jarabak ratio; the Björk sums are whatever their geometry yields (see tools/qa.mjs).
calibrateAP(); K.apComp = +K.apComp.toFixed(4);

export const PATTERNS = [
  { key: 'vertical', label: 'VERTICAL PATTERN', target: 56 },
  { key: 'neutral', label: 'NEUTRAL PATTERN', target: 61 },
  { key: 'horizontal', label: 'HORIZONTAL PATTERN', target: 67 },
].map((p) => ({ ...p, v: +vForRatio(p.target).toFixed(5) }));

// ---------------------------------------------------------------------------
// GLSL implementation (same maths). p.zy = (anterior, up)
// ---------------------------------------------------------------------------
const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const v2 = (a) => `vec2(${f(a[0])}, ${f(a[1])})`;
export const WARP_GLSL = /* glsl */`
uniform float uV; uniform float uR;
vec2 rotCW(vec2 p, vec2 c, float deg){ float a = radians(deg); float cs = cos(a), sn = sin(a);
  vec2 d = p - c; return vec2(c.x + d.x*cs + d.y*sn, c.y - d.x*sn + d.y*cs); }
vec2 lowerRigid(vec2 p, float v){
  vec2 q = vec2(p.x, p.y + ${f(K.ramus)}*v);
  q = rotCW(q, ${v2(GO0)} + vec2(0.0, ${f(K.ramus)}*v), ${f(K.bend)}*v);
  q.x += ${f(K.apComp)}*v;
  return rotCW(q, ${v2(LM.Co)}, ${f(K.rotCo)}*v + uR);
}
vec3 warpPoint(vec3 P, float part, vec3 anc, float rig){
  float v = uV;
  vec2 p = P.zy;
  vec2 wp = mix(P, anc, rig).zy;
  vec2 q;
  if (part > 0.5 && part < 1.5 || part > 2.5) {
    q = p;
    float wsym = smoothstep(60.0, 74.0, wp.x)*smoothstep(-84.0, -99.0, wp.y);
    q += vec2(-0.7, -${f(K.sym)})*v*wsym;
    float ng = exp(-(pow((wp.x-34.0)/9.0, 2.0) + pow((wp.y+89.0)/5.0, 2.0)));
    q.y += ${f(K.notch)}*max(v, 0.0)*ng;
    q.y += ${f(K.ramus)}*v*smoothstep(${f(LM.Co[1] - 6)}, ${f(LM.Co[1] - 30)}, wp.y);
    vec2 d = wp - ${v2(GO0)};
    float r = length(d);
    float ang = degrees(atan(d.y, d.x));
    float near = smoothstep(2.0, 10.0, r);
    float wg = smoothstep(62.0, 25.0, ang)*near + (1.0-near)*0.5;
    q = mix(q, rotCW(q, ${v2(GO0)} + vec2(0.0, ${f(K.ramus)}*v), ${f(K.bend)}*v), wg);
    q.x += ${f(K.apComp)}*v*smoothstep(20.0, 38.0, wp.x);
    q = rotCW(q, ${v2(LM.Co)}, ${f(K.rotCo)}*v + uR);
  } else {
    float wa = smoothstep(-44.0, -62.0, wp.y)*smoothstep(28.0, 42.0, wp.x);
    q = mix(p, lowerRigid(p, v), wa);
  }
  return vec3(P.x, q.y, q.x);
}
`;
