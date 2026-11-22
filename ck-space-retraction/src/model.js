// ============================================================================
//  Tooth-movement model — pure math, no Three.js (shared by the player and tools/qa.mjs).
//
//  FINAL pose  = the Z-Anatomy dentition as segmented (a well-aligned adult arch).
//  START pose  = a schematic protrusion derived from it:
//      * every posterior tooth (4-7) sits D mm mesial along the arch,
//      * the canine sits D mm mesial along the arch,
//      * incisors are proclined about a pivot close to the apex and moved slightly forward,
//        so the six anterior teeth use D mm more arch perimeter per side.
//  Treatment shown = sequential distalisation 7 → 6 → 5 → 4 (each tooth on its own path),
//  then en-masse retraction of the six anterior teeth into the space created, with torque
//  control (incisor inclination returns to the final value; apices move only slightly).
//  D is a conventional value for the visualisation, not a clinical protocol, and is never shown.
//
//  A pose is { T, axis, angle, pivot }: x_world = R(axis, angle)·(x_final − pivot) + pivot + T
// ============================================================================
import { SCHEDULE, ramp, easeInOut, smooth } from './timeline.js';

export const D = 2.6;                         // mm of space per side (conventional)
// incisor / canine protrusion of the start pose (deg of proclination, mm forward)
export const PRO = {
  1: { deg: 11.0, fwd: 1.25, mes: 0.7 },
  2: { deg: 9.0, fwd: 1.0, mes: 1.45 },
  3: { deg: 3.0, fwd: 0.35, mes: D - 0.45 },
};
export const PIVOT_FRAC = 0.78;               // proclination pivot: fraction of root length from CEJ towards apex

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const V = { sub, add, mul, dot, cross, norm };

/** Rodrigues rotation of vector v about unit axis k by angle a (rad) */
export function rot(v, k, a) {
  if (!a) return v;
  const c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), kd = dot(k, v);
  return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)];
}

/** Build the arch model from dentition.json tooth entries (U11..U17, U21..U27). */
export function buildModel(teethMeta) {
  const byFdi = Object.fromEntries(teethMeta.map((m) => [m.fdi, m]));
  const teeth = teethMeta.map((m) => {
    const q = m.fdi[0], k = +m.fdi[1];
    const other = q === '1' ? '2' : '1';
    const mes = k === 1 ? byFdi[other + '1'] : byFdi[q + (k - 1)];
    const dis = k === 7 ? m : byFdi[q + (k + 1)];
    // mesio-distal direction (horizontal), pointing mesially along the arch
    let md = sub(mes.crown, dis.crown); md[1] = 0; md = norm(md);
    // facial direction (horizontal, pointing out of the arch)
    let f = norm(cross([0, 1, 0], md));
    if (dot(f, sub(m.crown, [0, m.crown[1], -14])) < 0) f = mul(f, -1);
    // proclination axis: crown (below the pivot) moves facially
    let ax = norm(md);
    if (dot(cross(ax, [0, -1, 0]), f) < 0) ax = mul(ax, -1);
    const pivot = add(m.cej, mul(sub(m.apex, m.cej), PIVOT_FRAC));
    return { ...m, k, side: q === '1' ? -1 : 1, md, f, procAxis: ax, pivot };
  });
  return { teeth, byFdi: Object.fromEntries(teeth.map((t) => [t.fdi, t])) };
}

/** Start-pose offset of a tooth (scaled by s: 1 = start / protruded, 0 = final). */
function offset(th, sMes, sPro) {
  const k = th.k;
  if (k >= 4) return { T: mul(th.md, D * sMes), angle: 0 };
  const p = PRO[k];
  const T = add(mul(th.md, p.mes * sMes), mul([0, 0, 1], p.fwd * sPro));
  return { T, angle: (p.deg * Math.PI / 180) * sPro };
}

/** Progress of each phase at time t (0…1) */
export function progress(t) {
  const S = SCHEDULE;
  const dist = {};
  for (const k of [7, 6, 5, 4]) dist[k] = ramp(t, S.dist[k][0], S.dist[k][1], easeInOut);
  const u = (t - S.retr[0]) / (S.retr[1] - S.retr[0]);
  // translation slightly leads, inclination follows smoothly: controlled, not uncontrolled tipping
  const retrT = easeInOut(u);
  const retrR = easeInOut(Math.min(1, Math.max(0, u * 1.04 - 0.02)));
  return { dist, retrT, retrR, retr: retrT };
}

/** Pose of tooth th at time t: { T, axis, angle, pivot } */
export function poseAt(th, t, P = progress(t)) {
  if (th.k >= 4) {
    const o = offset(th, 1 - P.dist[th.k], 0);
    return { T: o.T, axis: th.procAxis, angle: 0, pivot: th.pivot };
  }
  const sT = 1 - P.retrT, sR = 1 - P.retrR;
  const o = offset(th, sT, th.k === 3 ? sT : sR);
  const fwd = offset(th, sT, sT).T;   // translation part follows retrT
  return { T: fwd, axis: th.procAxis, angle: o.angle, pivot: th.pivot };
}
/** start (fully protruded) pose */
export const startPose = (th) => poseAt(th, -1, { dist: { 7: 0, 6: 0, 5: 0, 4: 0 }, retrT: 0, retrR: 0 });
export const finalPose = (th) => ({ T: [0, 0, 0], axis: th.procAxis, angle: 0, pivot: th.pivot });

/** transform a final-pose point by a pose */
export function apply(pose, x) {
  return add(add(rot(sub(x, pose.pivot), pose.axis, pose.angle), pose.pivot), pose.T);
}

/** extra space (mm along the arch) between tooth a (mesial) and b (distal) at time t, relative to the start */
export function gapBetween(a, b, t, P = progress(t)) {
  const mesOf = (th) => {
    if (th.k >= 4) return D * (1 - P.dist[th.k]);
    if (th.k === 3) return PRO[3].mes * (1 - P.retrT);
    return null;
  };
  const ma = mesOf(a), mb = mesOf(b);
  if (ma === null || mb === null) return 0;
  return Math.max(0, ma - mb);
}
export { smooth };
