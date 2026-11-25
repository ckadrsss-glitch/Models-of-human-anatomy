// ============================================================================
//  Second cantilever (DOUBLE CANTILEVER MECHANICS): fixed end in a VERTICAL slot rigidly
//  attached to the anchor-segment wire, working arm along the first cantilever (occlusal
//  and buccal to it), free end hooked from above onto the distal extension of the wire
//  bonded to 47 (distal to the molar's CR).
//
//  Local frame of the turtle: local +x = world up (occlusal), local +y = world distal (−x),
//  local +z = buccal. Same physically plausible turtle as src/wire.js (developed length
//  conserved). Passive: the hook lies delta2 OCCLUSAL to the extension; activation = the arm
//  pressed down onto the extension (beam deflection, free end) → on 47 a single intrusive force,
//  in the vertical slot a force + a couple (one-couple system).
// ============================================================================
import { V } from './model.js';
import { runTurtle } from './wire.js';

/** local → world direction / point (origin = slot bottom S0) */
export const toWorldDir = (q) => [-q[1], q[0], q[2]];
export const toWorld = (S0, q) => V.add(S0, toWorldDir(q));
export const toLocal = (S0, p) => { const d = V.sub(p, S0); return [d[1], -d[0], d[2]]; };

export function program2({ a2, b2, L2 }, f = { ins: 1 }) {
  return [
    { op: 'line', len: 3.6, tag: 'slot' },                         // fixed end, vertical, through the slot
    { op: 'arc', axis: 'n2', ang: 90, r: 0.9, tag: 'bend' },       // → distal
    { op: 'line', len: 0.5 },
    { op: 'arc', axis: 'n2', ang: a2, r: 1.3, tag: 'tip' },        // arm angle (passive)
    { op: 'arc', axis: 'n1', ang: b2, r: 3.0, tag: 'tip' },        // bucco-lingual convergence
    { op: 'line', len: L2, tag: 'arm' },                           // working arm, along the first cantilever
    { op: 'arc', axis: 'n2', ang: -(90 + a2), r: 0.55, tag: 'hook' },   // hook: up …
    { op: 'arc', axis: 'n1', ang: 180, r: 0.62, tag: 'hook' },     // … and over the extension wire (lingually), pressing down
    { op: 'line', len: 0.6, tag: 'hook' },
  ];
}
/** hook-curl centre in local coordinates (local x = up) */
export function hookCentre2(run) {
  const pts = run.pts.filter((_, i) => run.tags[i] === 'hook');
  const top = pts.reduce((m, q) => (q[0] > m[0] ? q : m));
  return [top[0] - 0.62, top[1], top[2]];
}
export function solve2(target, init = null) {
  let x = init ? { ...init } : { a2: 10, b2: 0, L2: 18 };
  const f = (x) => hookCentre2(runTurtle(program2(x), 0.2));
  for (let it = 0; it < 40; it++) {
    const c = f(x), e = V.sub(target, c);
    if (V.len(e) < 0.02) break;
    const J = [];
    for (const [k, d] of [['a2', 0.5], ['b2', 0.5], ['L2', 0.2]]) { const y = { ...x, [k]: x[k] + d }; J.push(V.mul(V.sub(f(y), c), 1 / d)); }
    const A = [[J[0][0], J[1][0], J[2][0]], [J[0][1], J[1][1], J[2][1]], [J[0][2], J[1][2], J[2][2]]];
    const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const D = det(A); if (Math.abs(D) < 1e-9) break;
    const sol = [0, 1, 2].map((c) => { const M = A.map((r, i) => r.map((v, j) => (j === c ? e[i] : v))); return det(M) / D; });
    x = { a2: x.a2 + sol[0] * 0.8, b2: x.b2 + sol[1] * 0.8, L2: Math.max(4, x.L2 + sol[2] * 0.8) };
  }
  return x;
}
/** centre line (local) with downward deflection `dDown` (mm) applied with the cantilever-beam profile */
export function centreLine2(design, dDown = 0, ds = 0.12) {
  const run = runTurtle(program2(design), ds);
  const a = run.tags.indexOf('arm'), b = run.tags.lastIndexOf('arm');
  const pts = run.pts.map((q) => [...q]);
  if (dDown > 1e-6 && a >= 0) {
    const s0 = run.s[a], L = run.s[b] - s0;
    for (let i = a; i < pts.length; i++) {
      const s = Math.min(run.s[i] - s0, L), w = i > b ? 1 : (s * s * (3 * L - s)) / (2 * L * L * L);
      pts[i][0] -= dDown * w;
    }
  }
  return { pts, tags: run.tags, run };
}
