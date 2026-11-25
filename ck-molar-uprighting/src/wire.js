// ============================================================================
//  Cantilever wire: centre line from a "turtle" program (straight / arc / helix), in the
//  frame of the molar tube (m = mesial along the tube, o = occlusal, b = buccal).
//
//  Fabrication is physically plausible: every bend keeps its developed length and its
//  curvature grows 0 → 1/r with the forming progress (the wire is bent, not morphed);
//  the downstream wire is carried rigidly by each bend.
//
//  Design (illustrative, no dimensions are claimed): fixed end straight through the tube,
//  gingival step (two opposite bends), 2-turn helix coiled gingivally, tip-back bend
//  (gingival, slightly lingual) → working arm, hook curled occlusally over the anchor wire.
//  Passive: the hook lies `delta0` gingival to the anchor wire; activation = the arm lifted
//  to the anchor wire (cantilever-beam deflection, free end) — the tube end then carries
//  a force + a couple, the hook a single force (one-couple system).
// ============================================================================
import { V } from './model.js';

const DEG = Math.PI / 180;
const rot = (v, k, a) => {                         // Rodrigues: rotate v about unit axis k by a
  const c = Math.cos(a), s = Math.sin(a), d = V.dot(k, v), x = V.cross(k, v);
  return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)];
};

/**
 * Program: list of ops in the turtle's local frame (t, n1, n2) starting at (m, o, b).
 *  { op:'line', len }
 *  { op:'arc', axis:'n1'|'n2', ang (deg), r, p (forming progress 0..1), tag }
 *  { op:'helix', axis:'n2', ang (deg), r, pitch (mm per turn, along the initial n2), p, tag }
 * Returns points (tube frame) and per-point tags / arc-length.
 */
export function runTurtle(prog, ds = 0.12) {
  let p = [0, 0, 0], t = [1, 0, 0], n1 = [0, 1, 0], n2 = [0, 0, 1];
  const pts = [p], tags = [''], sArr = [0];
  let s = 0;
  const push = (tag) => { pts.push(p); tags.push(tag || ''); sArr.push(s); };
  for (const o of prog) {
    if (o.op === 'line') {
      const n = Math.max(1, Math.ceil(o.len / ds)), h = o.len / n;
      for (let i = 0; i < n; i++) { p = V.add(p, V.mul(t, h)); s += h; push(o.tag); }
      continue;
    }
    const prog_ = o.p ?? 1;
    const len = Math.abs(o.ang) * DEG * o.r;                 // developed length is conserved
    const n = Math.max(2, Math.ceil(len / ds)), h = len / n;
    const dAng = Math.sign(o.ang) * (h / o.r) * prog_;       // curvature grows with the forming progress
    const hAxis0 = o.axis === 'n1' ? n1 : n2;
    const pitchDir = hAxis0;
    for (let i = 0; i < n; i++) {
      // midpoint rule along the arc
      const k = o.axis === 'n1' ? n1 : n2;
      const tm = rot(t, k, dAng / 2);
      p = V.add(p, V.mul(tm, h));
      if (o.op === 'helix') p = V.add(p, V.mul(pitchDir, (o.pitch / (2 * Math.PI)) * Math.abs(dAng)));
      t = rot(t, k, dAng); n1 = rot(n1, k, dAng); n2 = rot(n2, k, dAng);
      s += h; push(o.tag);
    }
  }
  return { pts, tags, s: sArr, end: { p, t, n1, n2 } };
}

/** the design program for given forming progress f = {step, helix, tip, hook} and arm geometry */
export function program({ alpha, beta, L }, f = { step: 1, helix: 1, tip: 1, hook: 1 }) {
  const hk1 = Math.min(1, f.hook * 2), hk2 = Math.max(0, f.hook * 2 - 1);
  return [
    { op: 'line', len: 6.4, tag: 'tube' },                                  // fixed end (through the tube, −3.2 … +3.2)
    { op: 'arc', axis: 'n2', ang: -38, r: 0.9, p: f.step, tag: 'step' },     // gingival step
    { op: 'line', len: 0.9, tag: 'step' },
    { op: 'arc', axis: 'n2', ang: 38, r: 0.9, p: f.step, tag: 'step' },
    { op: 'line', len: 0.7 },
    { op: 'helix', axis: 'n2', ang: -720, r: 1.25, pitch: 0.55, p: f.helix, tag: 'helix' },   // 2 turns, coiled gingivally
    { op: 'line', len: 0.35 },
    { op: 'arc', axis: 'n2', ang: -alpha, r: 1.1, p: f.tip, tag: 'tip' },    // tip-back bend (gingival)
    { op: 'arc', axis: 'n1', ang: beta, r: 2.5, p: f.tip, tag: 'tip' },      // slight lingual convergence to the arch
    { op: 'line', len: L, tag: 'arm' },                                      // working arm
    { op: 'arc', axis: 'n2', ang: 90 + alpha, r: 0.55, p: hk1, tag: 'hook' },  // hook: up …
    { op: 'arc', axis: 'n1', ang: 180, r: 0.62, p: hk2, tag: 'hook' },       // … and over the anchor wire (lingually)
    { op: 'line', len: 0.6, tag: 'hook' },
  ];
}
export const X0 = [-3.2, 0, 0];                    // wire start in the tube frame (distal end)

/** index range of the arm and hook in a run */
function segIndex(run, tag) { const a = run.tags.indexOf(tag), b = run.tags.lastIndexOf(tag); return [a, b]; }

/** hook centre (centre of the curl = where the anchor wire sits) for a run */
export function hookCentre(run) {
  const [a, b] = segIndex(run, 'hook');
  const top = run.pts.slice(a, b + 1).reduce((m, q) => (q[1] > m[1] ? q : m));
  // radius of the curl: centre lies 0.62 below the top along −n1 at the top ≈ −o (curl is in the o–b plane)
  return [top[0], top[1] - 0.62, top[2]];
}

/**
 * Solve the arm geometry (alpha, beta, L) so that the passive hook centre lands on `target`
 * (tube frame) — target = anchor-wire hook point − delta0 · o.
 */
export function solveDesign(target, init = null) {
  let x = init ? { ...init } : { alpha: 26, beta: 6, L: 16 };
  const f = (x) => V.add(hookCentre(runTurtle(program(x), 0.2)), X0);
  for (let it = 0; it < 30; it++) {
    const c = f(x), e = V.sub(target, c);
    if (V.len(e) < 0.02) break;
    const J = [];
    for (const [k, d] of [['alpha', 0.5], ['beta', 0.5], ['L', 0.2]]) {
      const y = { ...x, [k]: x[k] + d }; J.push(V.mul(V.sub(f(y), c), 1 / d));
    }
    // solve J * dx = e (3×3)
    const A = [[J[0][0], J[1][0], J[2][0]], [J[0][1], J[1][1], J[2][1]], [J[0][2], J[1][2], J[2][2]]];
    const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const D = det(A); if (Math.abs(D) < 1e-9) break;
    const sol = [0, 1, 2].map((c) => { const M = A.map((r, i) => r.map((v, j) => (j === c ? e[i] : v))); return det(M) / D; });
    x = { alpha: x.alpha + sol[0] * 0.8, beta: x.beta + sol[1] * 0.8, L: Math.max(4, x.L + sol[2] * 0.8) };
  }
  return x;
}

/**
 * Centre line (tube frame) of the wire.
 *  design: {alpha, beta, L}; f: forming progress; defl: deflection vector (tube frame) applied to the
 *  arm with the cantilever-beam profile y(s) = δ·s²(3L − s)/(2L³) and carried by the hook.
 */
export function centreLine(design, f, defl = [0, 0, 0], ds = 0.12) {
  const run = runTurtle(program(design, f), ds);
  const [a, b] = segIndex(run, 'arm');
  const pts = run.pts.map((q) => V.add(q, X0));
  if (V.len(defl) > 1e-6 && a >= 0) {
    const s0 = run.s[a], L = run.s[b] - s0;
    for (let i = a; i < pts.length; i++) {
      const s = Math.min(run.s[i] - s0, L);
      const w = (s * s * (3 * L - s)) / (2 * L * L * L);
      pts[i] = V.add(pts[i], V.mul(defl, i > b ? 1 : w));
    }
  }
  return { pts, tags: run.tags, run };
}
