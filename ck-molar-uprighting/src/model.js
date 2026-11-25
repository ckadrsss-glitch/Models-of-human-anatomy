// ============================================================================
//  Biomechanical model of the film (pure math, no Three.js) — shared by the player
//  (src/film.js) and the QA script (tools/qa.mjs).
//
//  Frame ("segment frame", mm): origin = centre of resistance (CR) of 47 in its anatomical
//  position, +x mesial (along the occlusal plane 47 → 44), +y occlusal, +z buccal (patient's right).
//  The sagittal (buccal) view therefore shows mesial → screen right, occlusal → up, and a
//  counter-clockwise moment (+z) tips the 47 crown DISTALLY (= uprighting).
//
//  QUALITATIVE model (no FE simulation, no force values in mm/N are claimed):
//   • single cantilever = one-couple, statically determinate system: the end engaged in the 47 tube
//     receives a force + a couple, the point contact on the anchor segment receives a single force
//     (Lindauer & Isaacson 1995; Kuhlberg 2001). For a wire hooked on the anchor segment occlusally to
//     its passive position: on 47 — extrusive force F (+y) and a couple M = F·L (+z, crown distal);
//     on the anchor segment — intrusive force F (−y). L = mesio-distal distance tube → hook.
//   • movement: rotation about the CR proportional to the net moment at the CR + translation along the
//     net force → the centre of ROTATION is not fixed at the CR (it shifts by v/ω).
//   • skeletal anchorage: an elastic from a buccal-shelf miniscrew to the 47 tube hook. Its line of action
//     (hook → screw head) defines the extra intrusive component and the change of moment about the CR.
// ============================================================================
import POSES from './poses.json' with { type: 'json' };

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
};
const DEG = Math.PI / 180;
export { POSES };

/** rigid pose {theta (deg, about +z through the moving CR), shift [mm]} */
export function poseLerp(a, b, s) { return { theta: a.theta + (b.theta - a.theta) * s, shift: V.lerp(a.shift, b.shift, s) }; }
export const START = POSES.start, END_A = POSES.endA, END_B = POSES.endB;
/** apply a pose of 47 to a point given in its anatomical (segment) coordinates; cr = anatomical CR */
export function apply(pose, p, cr) {
  const c = Math.cos(pose.theta * DEG), s = Math.sin(pose.theta * DEG);
  const x = p[0] - cr[0], y = p[1] - cr[1];
  return [cr[0] + c * x - s * y + pose.shift[0], cr[1] + s * x + c * y + pose.shift[1], p[2] + pose.shift[2]];
}
/** direction (no translation) */
export function applyDir(pose, d) {
  const c = Math.cos(pose.theta * DEG), s = Math.sin(pose.theta * DEG);
  return [c * d[0] - s * d[1], s * d[0] + c * d[1], d[2]];
}

/**
 * Force system of the single cantilever + optional skeletal intrusive elastic, for 47 in `pose`.
 *   L47:   landmarks of 47 (anatomical) — cr, fa (tube), …
 *   hook:  point of the cantilever hook on the anchor wire (world)
 *   screw: miniscrew head (world) or null
 * Unit cantilever force (F = 1, qualitative). Returns forces, moments about the current CR, and
 * the vertical resultant; kS scales the elastic so that its vertical component equals `balance`·F.
 */
export function forceSystem(L47, pose, hook, screw = null, balance = 1) {
  const cr = V.add(L47.cr, pose.shift);
  const tube = apply(pose, L47.fa, L47.cr);
  const Lmd = hook[0] - tube[0];                          // mesio-distal lever arm (mm)
  const F = 1;
  const Fc = [0, F, 0];                                     // extrusive on 47 (wire hooked occlusally to its passive position)
  const Mc = F * Lmd;                                       // couple from the bracket end: +z = crown distal
  const r = V.sub(tube, cr);
  const MFcr = r[0] * Fc[1] - r[1] * Fc[0];                 // moment of Fc about the CR
  const out = { cr, tube, Lmd, Fc, Mc, Mcr_c: Mc + MFcr, anchor: [0, -F, 0], hook };
  if (screw) {
    const u = V.norm(V.sub(screw, tube));                  // pull of the elastic on 47: towards the screw head
    const k = balance * F / Math.max(1e-6, -u[1]);           // vertical component = −balance·F
    const Fs = V.mul(u, k);
    const dM = r[0] * Fs[1] - r[1] * Fs[0];                  // sagittal moment of the elastic about the CR
    // perpendicular distance of the line of action from the CR in the sagittal plane
    const u2 = V.norm([u[0], u[1], 0]);
    const arm = r[0] * u2[1] - r[1] * u2[0];
    Object.assign(out, { Fs, u, k, dM, arm, Fv: Fc[1] + Fs[1], Mcr: Mc + MFcr + dM, Fh: Fs[0] });
  } else Object.assign(out, { Fv: Fc[1], Mcr: Mc + MFcr, Fh: 0 });
  // instantaneous centre of rotation (sagittal): r_x = −v_y/ω relative to the CR (ω ∝ Mcr, v ∝ Fv; same compliance scale)
  out.crot = [cr[0] - (out.Fv / Math.max(1e-6, out.Mcr)) * 6.0, cr[1] + (out.Fh / Math.max(1e-6, out.Mcr)) * 6.0, cr[2]];
  return out;
}
