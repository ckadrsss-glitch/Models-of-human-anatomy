// ============================================================================
//  Second cantilever, corrected design (DOUBLE CANTILEVER MECHANICS):
//   • fixed end in the VERTICAL slot of the anchor segment, entering from occlusal and leaving the
//     slot at its gingival end;
//   • working arm vestibular, BELOW the occlusal plane at the cervical level, buccal to the first
//     cantilever's helix and tube (no contact with it, the teeth or the alveolar bone); a short lingual
//     offset distal to the tube brings it to the first cantilever's distal end;
//   • free end bent up into a hook that engages DIRECTLY the distal free end of the first
//     cantilever where it leaves the 47 tube (no extra wire, extension or attachment on the molar).
//  Passive: the hook lies delta OCCLUSAL to the first cantilever's distal end; activation = the hook
//  pulled down onto it (cantilever-beam deflection) → through the first cantilever and the tube a
//  single intrusive force on 47; force + couple in the vertical slot (one-couple system).
//
//  Turtle local frame: local +x = world DOWN (gingival), local +y = world distal (−x), local +z = buccal.
// ============================================================================
import { V } from './model.js';
import { runTurtle } from './wire.js';

export const toWorldDir3 = (q) => [-q[1], -q[0], q[2]];
export const toWorld3 = (S0, q) => V.add(S0, toWorldDir3(q));
export const toLocal3 = (S0, p) => { const d = V.sub(p, S0); return [-d[1], -d[0], d[2]]; };

export const RISER = 0.25;      // mm, riser of the hook just distal to the tube
export function program3({ L, o, rise }) {
  return [
    { op: 'line', len: 3.3, tag: 'slot' },                          // fixed end: down through the vertical slot
    { op: 'arc', axis: 'n2', ang: 90, r: 1.0, tag: 'bend' },        // → distal, at the cervical level
    { op: 'arc', axis: 'n2', ang: rise, r: 3.0, tag: 'bend' },       // passive inclination of the arm (solved): after activation it lies at the cervical level
    { op: 'line', len: L, tag: 'arm' },                             // vestibular working arm, buccal to the 1st cantilever's helix and tube
    { op: 'arc', axis: 'n1', ang: 30, r: 0.8, tag: 'offset' },      // short lingual offset distal to the tube …
    { op: 'line', len: Math.max(0, o), tag: 'offset' },
    { op: 'arc', axis: 'n1', ang: -30, r: 0.8, tag: 'offset' },
    { op: 'arc', axis: 'n2', ang: 90 - rise, r: 0.6, tag: 'hook' },   // … up …
    { op: 'line', len: RISER, tag: 'hook' },                        // riser just distal to the tube
    { op: 'arc', axis: 'n1', ang: 180, r: 0.55, tag: 'hook' },      // … and over the 1st cantilever's distal end (lingually), pressing it down
    { op: 'line', len: 0.5, tag: 'hook' },
  ];
}
/** hook-curl centre (local): the curl's highest point (min local x) + radius */
export function hookCentre3(run) {
  const pts = run.pts.filter((_, i) => run.tags[i] === 'hook');
  const top = pts.reduce((m, q) => (q[0] < m[0] ? q : m));
  return [top[0] + 0.55, top[1], top[2]];
}
export function solve3(target, init = null) {
  let x = init ? { ...init } : { L: 14, o: 1.0, rise: 15 };
  const f = (x) => hookCentre3(runTurtle(program3(x), 0.2));
  for (let it = 0; it < 50; it++) {
    const c = f(x), e = V.sub(target, c);
    if (V.len(e) < 0.02) break;
    const J = [];
    for (const [k, d] of [['L', 0.2], ['o', 0.1], ['rise', 0.5]]) { const y = { ...x, [k]: x[k] + d }; J.push(V.mul(V.sub(f(y), c), 1 / d)); }
    const A = [[J[0][0], J[1][0], J[2][0]], [J[0][1], J[1][1], J[2][1]], [J[0][2], J[1][2], J[2][2]]];
    const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const D = det(A); if (Math.abs(D) < 1e-9) break;
    const sol = [0, 1, 2].map((c) => { const M = A.map((r, i) => r.map((v, j) => (j === c ? e[i] : v))); return det(M) / D; });
    x = { L: Math.max(3, x.L + sol[0] * 0.8), o: Math.max(0, x.o + sol[1] * 0.8), rise: x.rise + sol[2] * 0.8 };
  }
  return x;
}
/** centre line (local) with the hook pulled DOWN by dDown mm (beam profile along the arm) */
export function centreLine3(design, dDown = 0, ds = 0.12) {
  const run = runTurtle(program3(design), ds);
  const a = run.tags.indexOf('arm'), b = run.tags.lastIndexOf('arm');
  const pts = run.pts.map((q) => [...q]);
  if (dDown > 1e-6 && a >= 0) {
    const s0 = run.s[a], L = run.s[b] - s0;
    for (let i = a; i < pts.length; i++) {
      const s = Math.min(run.s[i] - s0, L), w = i > b ? 1 : (s * s * (3 * L - s)) / (2 * L * L * L);
      pts[i][0] += dDown * w;            // local +x = world down
    }
  }
  return { pts, tags: run.tags, run };
}
