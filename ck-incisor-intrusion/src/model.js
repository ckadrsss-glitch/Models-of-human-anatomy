// ============================================================================
//  Biomechanical model of the film (pure math, no Three.js) — shared by the player
//  (src/film.js) and the QA script (tools/qa.mjs).
//
//  ARCH FRAME (mm): origin = centre of resistance (CR) of the rigid 4-incisor segment 31-32-41-42
//  in its START pose, +x = patient's left, +y = occlusal, +z = anterior (labial at the incisors).
//  Sagittal view (camera on the patient's right): anterior → screen right, occlusal → up.
//
//  QUALITATIVE model (no FE simulation, no force values in N or Nmm are claimed):
//   • Three-piece segmented mechanics (Burstone): two rigid buccal segments 33–37 / 43–47, one rigid anterior
//     segment 32–42 with stepped distal extensions, two cantilevers from auxiliary tubes on 36 / 46.
//   • Each cantilever = one-couple, statically determinate system (Lindauer & Isaacson 1995): point contact at the
//     anterior segment → a single INTRUSIVE force F/2 (−y); molar tube → EXTRUSIVE force F/2 (+y) + a couple
//     C = (P − T) × (0, F/2, 0) (tip-back: crown distal). ΣF = 0 and ΣM = 0 on each wire.
//   • Symmetric activation: the two F/2 forces → resultant F on the mid-sagittal plane at the mean z of the
//     two tie points. Lever arm d = z_resultant − z_CR (signed, + = anterior/labial of the CR).
//   • Moment about the CR: M = F × d (sagittal component Mx). d > 0 → labial crown tipping (proclination),
//     d ≈ 0 → translation (pure intrusion, idealised), d < 0 → lingual crown tipping (retroclination).
//   • Movement (illustrative): translation along the resultant + rotation about the CR proportional to M.
//     The CR is NOT a fixed axis: the centre of rotation lies where translation and rotation cancel
//     (z_rot = −v/ω relative to the CR).
// ============================================================================

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

/** rigid pose of the incisor segment: rotation theta (deg) about +x through the START CR (origin), then shift */
export const IDENT = { theta: 0, shift: [0, 0, 0] };
export function poseLerp(a, b, s) { return { theta: a.theta + (b.theta - a.theta) * s, shift: V.lerp(a.shift, b.shift, s) }; }
export function apply(pose, p) {
  const c = Math.cos(pose.theta * DEG), s = Math.sin(pose.theta * DEG);
  return [p[0] + pose.shift[0], c * p[1] - s * p[2] + pose.shift[1], s * p[1] + c * p[2] + pose.shift[2]];
}
export function applyDir(pose, d) {
  const c = Math.cos(pose.theta * DEG), s = Math.sin(pose.theta * DEG);
  return [d[0], c * d[1] - s * d[2], s * d[1] + c * d[2]];
}
/** the CR in a pose (it moves with the segment) */
export const crAt = (pose) => apply(pose, [0, 0, 0]);

/**
 * Force system of the two cantilevers for given tie points (world), CR (world) and tube points (world).
 * ties: [P] (point 1: both cantilevers tied at the midline) or [Pleft, Pright]; tubes: [T36, T46].
 * Returns per-cantilever forces, the resultant, the lever arm d and the moment about the CR (F = 1, qualitative).
 */
export function forceSystem(ties, cr, tubes, F = 1) {
  const pair = ties.length === 2 ? ties : [ties[0], ties[0]];
  const f = [0, -F / 2, 0];                                        // on the incisor segment, each cantilever
  const res = { F, f, ties: pair };
  res.resultantAt = [0, (pair[0][1] + pair[1][1]) / 2, (pair[0][2] + pair[1][2]) / 2];   // mid-sagittal
  res.resultant = [0, -F, 0];
  res.d = res.resultantAt[2] - cr[2];                              // signed sagittal lever arm
  // moment about the CR of the two forces (exact 3D sum; x-component = −(−F/2)·Δz sum …)
  let M = [0, 0, 0];
  for (const p of pair) M = V.add(M, V.cross(V.sub(p, cr), f));
  res.M = M;                                                       // M[0] = F·d (sagittal tipping), M[1], M[2] ≈ 0 by symmetry
  // reactions on the buccal segments (each cantilever): +F/2 at the tube and the couple C = (P − T) × (0, F/2, 0)
  res.molar = tubes.map((T, i) => {
    const P = pair[i], fr = [0, F / 2, 0];
    const C = V.cross(V.sub(P, T), fr);
    return { at: T, force: fr, couple: C };
  });
  // equilibrium of each wire: forces sum to 0, moments about the tube sum to 0
  res.equilibrium = pair.map((P, i) => {
    const T = tubes[i], wireOnTooth = [0, F / 2, 0];               // the segment pushes the wire up (+F/2) at P
    const sumF = V.add(wireOnTooth, [0, -F / 2, 0]);               // the tube pushes the wire down (−F/2)
    const sumM = V.add(V.cross(V.sub(P, T), wireOnTooth), V.mul(res.molar[i].couple, -1));
    return { sumF: V.len(sumF), sumM: V.len(sumM) };
  });
  return res;
}

/** instantaneous centre of rotation (sagittal) for a pose step from IDENT: translation v (−y) + rotation ω */
export function centreOfRotation(pose) {
  const w = pose.theta * DEG;
  if (Math.abs(w) < 1e-6) return null;                              // pure translation: centre at infinity
  return [0, 0, pose.shift[1] / w];                                 // v + ω × r = 0 → z = v_y/ω (v_y < 0)
}
