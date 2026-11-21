// ============================================================================
//  Skeletal morphology model — sagittal (s) × vertical (v)
//
//  s : +1 Skeletal Class II · 0 Class I · −1 Class III
//  v : −1 hypodivergent · 0 normodivergent · +1 hyperdivergent
//
//  The warp is defined once here and emitted both as JavaScript (landmarks,
//  cephalometric lines, QA) and as GLSL (vertex shader), so the drawn lines
//  always sit on the deformed bone. Coordinates: mm, (z = anterior, y = up),
//  x (lateral) is never changed. Landmarks were measured on the exported
//  Z-Anatomy skull (tools/sagittal_plot.py, tools/landmarks.py).
//
//  What changes — and what does NOT:
//   * The cranial base, vault, orbits, nasal bones and the condyles in the
//     glenoid fossae are identical in all nine skulls (same S–N, same TMJ).
//   * Sagittal: mandibular BODY length changes between the ramus and the
//     dentition (ramus and condyle stay in place), and the maxillary
//     basal/alveolar complex moves slightly forward or back below the orbits.
//     Class II = shorter mandibular body + mildly prognathic maxilla;
//     Class III = longer mandibular body + mildly retrusive maxilla. The jaws
//     are never moved as rigid blocks; the relative shift of the dentitions is
//     about one premolar width so the cusps re-interdigitate.
//   * Vertical: gonial angle (body bends about gonion), ramus height,
//     mandibular rotation about the condyle, antegonial notch and symphysis
//     shape; the maxillary dento-alveolar height follows the lower dentition so
//     occlusion is kept (no open/deep bite is introduced by the pattern).
// ============================================================================

export const LM = {            // landmarks on the undeformed (Class I, normodivergent) skull
  S:   [19.0, -3.5],           // sella (centre of the hypophyseal fossa)
  N:   [84.5, 3.0],            // nasion
  ANS: [90.0, -49.0],
  A:   [88.0, -57.0],
  U1:  [92.3, -74.6],          // upper incisor tip
  L1:  [89.0, -73.5],          // lower incisor tip
  B:   [82.0, -91.0],
  Pog: [83.6, -97.0],
  Me:  [77.7, -104.2],
  Go:  [13.0, -76.0],
  Co:  [7.8, -22.2],
  U6:  [66.3, -69.0],          // mesial of upper first molar
  L6:  [66.2, -68.0],
};
const PART_OF = { S: 0, N: 0, ANS: 0, A: 0, U1: 2, L1: 3, B: 1, Pog: 1, Me: 1, Go: 1, Co: 1, U6: 2, L6: 3 };

export const K = {
  occDir: [0.981, -0.196],     // functional occlusal plane direction (posterior → anterior)
  bodyDir: [0.917, -0.400],    // gonion → menton
  // sagittal
  mandBase: 1.5,               // Class I calibration: the source skull's dentition is end-on (slightly distal)
  mandBackII: 5.0, mandFwdIII: 4.5,   // mandibular body length change relative to Class I (mm)
  maxFwdII: 2.0, maxBackIII: 2.5,     // maxillary basal/alveolar shift (mm)
  // vertical (per unit of v)
  rotCo: 2.0,                  // deg, mandibular rotation about the condyle
  bend: 4.0,                   // deg, gonial angle change (body about gonion)
  ramus: 2.5,                  // mm, ramus height change (shorter in hyper)
  notch: 1.3,                  // mm, antegonial notch depth (hyper only)
  apComp: 0,                   // mm per unit v (calibrated below): mandibular body + dentition, keeps A–N–B independent of v
  // incisal / cuspal clearance during sagittal morphs (deg about condyle)
  clearIII: 2.3, clearII: 1.4,
  clearIIIc: -0.3, clearIIIw: 0.28,
};

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** jaw clearance opening (deg) that keeps the incisors/cusps from passing through each other mid-morph */
export function clearance(s) {
  const bump = (c, w) => { const u = (s - c) / w; return u * u < 1 ? (1 - u * u) ** 2 : 0; };
  return K.clearIII * bump(K.clearIIIc, K.clearIIIw) + K.clearII * bump(0.5, 0.45);
}

/** sagittal amounts for s */
export function sagAmounts(s) {
  const L = K.mandBase + (s > 0 ? -K.mandBackII * s : -K.mandFwdIII * s);     // + = forward along occlusal plane
  const M = s > 0 ? K.maxFwdII * s : K.maxBackIII * s;         // + = forward
  return { L, M };
}

// ---------------------------------------------------------------------------
// JavaScript implementation (2D: [z, y])
// ---------------------------------------------------------------------------
function rot(p, c, deg) {   // clockwise on screen (face to the right) for deg > 0  → chin down
  const a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
  const dz = p[0] - c[0], dy = p[1] - c[1];
  return [c[0] + dz * cs + dy * sn, c[1] - dz * sn + dy * cs];
}
function mixp(a, b, w) { return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w]; }

function verticalRigid(p, v) {     // composite transform of the lower dentate segment (no clearance)
  const Go = LM.Go, Co = LM.Co;
  let q = [p[0], p[1] + K.ramus * v];
  q = rot(q, [Go[0], Go[1] + K.ramus * v], K.bend * v);
  q = rot(q, Co, K.rotCo * v);
  return q;
}

/** warp a point; part: 0 cranium(+maxilla) 1 mandible 2 upper tooth 3 lower tooth; wp = weight position */
export function warp2(p, part, s, v, open = 0, wp = p) {
  const { L, M } = sagAmounts(s);
  const Go = LM.Go, Co = LM.Co;
  if (part === 1 || part === 3) {
    // 1. sagittal: body length (between ramus and dentition), along the occlusal plane
    const wb = sstep(22, 40, wp[0]) * sstep(-48, -62, wp[1]) + sstep(40, 46, wp[0]) * (1 - sstep(-48, -62, wp[1]));
    let q = [p[0] + L * K.occDir[0] * Math.min(1, wb), p[1] + L * K.occDir[1] * Math.min(1, wb)];
    // 2. local vertical morphology
    const ng = Math.exp(-(((wp[0] - 34) / 9) ** 2 + ((wp[1] + 89) / 5) ** 2));      // antegonial region (inferior border)
    q[1] += K.notch * Math.max(v, 0) * ng;
    const wsym = sstep(62, 74, wp[0]) * sstep(-86, -99, wp[1]);
    if (v > 0) { q[0] += -0.8 * v * wsym; q[1] += -1.8 * v * wsym; } else { q[0] += 1.4 * -v * wsym; q[1] += 0.6 * -v * wsym; }
    // 3. ramus height
    const wr = sstep(Co[1] - 6, Co[1] - 36, wp[1]);
    q[1] += K.ramus * v * wr;
    // 4. gonial angle: body bends about gonion (sector weight)
    const dz = wp[0] - Go[0], dy = wp[1] - Go[1];
    const ang = Math.atan2(dy, dz) * 180 / Math.PI;
    const wg = sstep(62, 25, ang) * sstep(2, 10, Math.hypot(dz, dy)) + (1 - sstep(2, 10, Math.hypot(dz, dy))) * 0.5;
    q = mixp(q, rot(q, [Go[0], Go[1] + K.ramus * v], K.bend * v), wg);
    // 5. rotation about the condyle (+ clearance opening)
    q = rot(q, Co, K.rotCo * v + open);
    q[0] += K.apComp * v * Math.min(1, wb);
    return q;
  }
  // cranium / maxilla / upper teeth
  const wm = sstep(-20, -44, wp[1]) * sstep(36, 50, wp[0]);
  let q = [p[0] + M * wm, p[1]];
  const wa = sstep(-47, -62, wp[1]) * sstep(30, 42, wp[0]);
  q = mixp(q, verticalRigid(q, v), wa);
  // sagittal compensation of the vertical pattern: dentition + alveolar crest only (A point stays basal)
  q[0] += K.apComp * v * sstep(-57, -64, wp[1]) * sstep(30, 42, wp[0]);
  return q;
}

export function landmarks(s, v, open = 0) {
  const out = {};
  for (const k in LM) out[k] = warp2(LM[k], PART_OF[k], s, v, open);
  return out;
}

// calibrate the AP compensation so that the sagittal jaw relationship (A–N–B) does not drift with the
// vertical pattern — every row of the matrix keeps its sagittal class (bisection on K.apComp)
export function anb(L) {
  const ang = (a, o, b) => { const v1 = [a[0] - o[0], a[1] - o[1]], v2 = [b[0] - o[0], b[1] - o[1]];
    return Math.acos((v1[0] * v2[0] + v1[1] * v2[1]) / Math.hypot(...v1) / Math.hypot(...v2)) * 180 / Math.PI; };
  return ang(L.S, L.N, L.A) - ang(L.S, L.N, L.B);
}
{
  const target = anb(landmarks(0, 0));
  let lo = -8, hi = 8;
  for (let i = 0; i < 40; i++) { K.apComp = (lo + hi) / 2; (anb(landmarks(0, 1)) > target) ? (lo = K.apComp) : (hi = K.apComp); }
  K.apComp = +K.apComp.toFixed(3);
}

// ---------------------------------------------------------------------------
// GLSL implementation (same maths). p.zy = (anterior, up)
// ---------------------------------------------------------------------------
const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const v2 = (a) => `vec2(${f(a[0])}, ${f(a[1])})`;
export const WARP_GLSL = /* glsl */`
uniform float uS; uniform float uV; uniform float uOpen;
vec2 rotCW(vec2 p, vec2 c, float deg){ float a = radians(deg); float cs = cos(a), sn = sin(a);
  vec2 d = p - c; return vec2(c.x + d.x*cs + d.y*sn, c.y - d.x*sn + d.y*cs); }
vec2 vertRigid(vec2 p, float v){
  vec2 q = vec2(p.x, p.y + ${f(K.ramus)}*v);
  q = rotCW(q, ${v2(LM.Go)} + vec2(0.0, ${f(K.ramus)}*v), ${f(K.bend)}*v);
  return rotCW(q, ${v2(LM.Co)}, ${f(K.rotCo)}*v);
}
vec3 warpPoint(vec3 P, float part, vec3 anc, float rig){
  float s = uS, v = uV;
  float L = ${f(K.mandBase)} + (s > 0.0 ? -${f(K.mandBackII)}*s : -${f(K.mandFwdIII)}*s);
  float M = s > 0.0 ?  ${f(K.maxFwdII)}*s :  ${f(K.maxBackIII)}*s;
  vec2 p = P.zy;
  vec2 wp = mix(P, anc, rig).zy;
  vec2 q;
  if (part > 0.5 && part < 1.5 || part > 2.5) {
    float lo = smoothstep(-48.0, -62.0, wp.y);
    float wb = min(1.0, smoothstep(22.0, 40.0, wp.x)*lo + smoothstep(40.0, 46.0, wp.x)*(1.0-lo));
    q = p + L*${v2(K.occDir)}*wb;
    float ng = exp(-(pow((wp.x-34.0)/9.0, 2.0) + pow((wp.y+89.0)/5.0, 2.0)));
    q.y += ${f(K.notch)}*max(v, 0.0)*ng;
    float wsym = smoothstep(62.0, 74.0, wp.x)*smoothstep(-86.0, -99.0, wp.y);
    q += (v > 0.0 ? vec2(-0.8, -1.8)*v : vec2(1.4, 0.6)*(-v))*wsym;
    q.y += ${f(K.ramus)}*v*smoothstep(${f(LM.Co[1] - 6)}, ${f(LM.Co[1] - 36)}, wp.y);
    vec2 d = wp - ${v2(LM.Go)};
    float r = length(d);
    float ang = degrees(atan(d.y, d.x));
    float near = smoothstep(2.0, 10.0, r);
    float wg = smoothstep(62.0, 25.0, ang)*near + (1.0-near)*0.5;
    q = mix(q, rotCW(q, ${v2(LM.Go)} + vec2(0.0, ${f(K.ramus)}*v), ${f(K.bend)}*v), wg);
    q = rotCW(q, ${v2(LM.Co)}, ${f(K.rotCo)}*v + uOpen);
    q.x += ${f(K.apComp)}*v*wb;
  } else {
    float wm = smoothstep(-20.0, -44.0, wp.y)*smoothstep(36.0, 50.0, wp.x);
    q = vec2(p.x + M*wm, p.y);
    float wa = smoothstep(-47.0, -62.0, wp.y)*smoothstep(30.0, 42.0, wp.x);
    q = mix(q, vertRigid(q, v), wa);
    q.x += ${f(K.apComp)}*v*smoothstep(-57.0, -64.0, wp.y)*smoothstep(30.0, 42.0, wp.x);
  }
  return vec3(P.x, q.y, q.x);
}
`;
