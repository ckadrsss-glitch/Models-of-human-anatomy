// QA of the double-cantilever edit (corrected design): force/moment signs with the hook on the first
// cantilever's distal end, vertical compensation, and clearances of the second cantilever.
import fs from 'fs';
import { V, apply, applyDir, poseLerp, START, END_B } from '../src/model.js';
import { SCENE } from '../src/scene.js';
import { solveDesign, centreLine } from '../src/wire.js';
import { dcGeometry, forceSystemDC, DELTA2 } from '../src/dc.js';
import { solve3, centreLine3, toLocal3, toWorld3 } from '../src/wire3.js';
const hdr = JSON.parse(fs.readFileSync('assets/dentition.json'));
const buf = fs.readFileSync('assets/dentition.bin');
const M = Object.fromEntries(hdr.meshes.map((m) => [m.name, m]));
const L47 = M.L47, G = dcGeometry(hdr), hook = SCENE.hook(hdr);
const verts = (name, pose, step = 2) => { const m = M[name]; const p = new Float32Array(buf.buffer.slice(buf.byteOffset + m.position[0], buf.byteOffset + m.position[0] + m.vertices * 12)); const cr = m.cr || [0, 0, 0]; const out = []; for (let i = 0; i < m.vertices; i += step) { const q = [p[3 * i] + cr[0], p[3 * i + 1] + cr[1], p[3 * i + 2] + cr[2]]; out.push(pose ? apply(pose, q, L47.cr) : q); } return out; };
const minD = (A, B) => { let b = [1e9]; for (const a of A) for (const q of B) { const d = (a[0] - q[0]) ** 2 + (a[1] - q[1]) ** 2 + (a[2] - q[2]) ** 2; if (d < b[0]) b = [d, a, q]; } return [Math.sqrt(b[0]), b[1]]; };
const fz = V.norm(L47.faN), fx = V.norm(V.sub([1, 0, 0], V.mul(fz, fz[0])));
const f0 = { c: V.add(L47.fa, V.mul(L47.faN, SCENE.tubeOff)), m: fx, b: fz }; f0.o = V.cross(f0.b, f0.m);
const tfAt = (pose) => ({ c: apply(pose, f0.c, L47.cr), m: applyDir(pose, f0.m), o: applyDir(pose, f0.o), b: applyDir(pose, f0.b) });
const toT = (tf, p) => { const d = V.sub(p, tf.c); return [V.dot(d, tf.m), V.dot(d, tf.o), V.dot(d, tf.b)]; };
const fromT = (tf, q) => V.add(tf.c, V.add(V.mul(tf.m, q[0]), V.add(V.mul(tf.o, q[1]), V.mul(tf.b, q[2]))));
const base1 = solveDesign(V.add(toT(tfAt(START), hook), [0, -6.5, 0]));
// first cantilever without its distal end (m < −2.2: inside/behind the tube, where the hook engages by design)
const wire1 = (pose, s) => { const tf = tfAt(pose); const Ht = toT(tf, hook); const dE = 6.5 * (1 - 0.75 * s); const d = solveDesign(V.add(Ht, [0, -dE, 0]), base1);
  return centreLine(d, { step: 1, helix: 1, tip: 1, hook: 1 }, [0, dE, 0]).pts.filter((q) => q[0] > 2.3).map((q) => fromT(tf, q)); };
const base3 = solve3(V.add(toLocal3(G.S0, apply(START, G.D, L47.cr)), [-DELTA2, 0, 0]));
const wire2 = (pose, s, keepHook = false) => { const Dl = toLocal3(G.S0, apply(pose, G.D, L47.cr)); const d2 = DELTA2 * (1 - 0.75 * s);
  const des = solve3(V.add(Dl, [-d2, 0, 0]), base3); const cl = centreLine3(des, d2);
  return { all: cl.pts.map((q) => toWorld3(G.S0, q)), arm: cl.pts.filter((_, i) => keepHook || cl.tags[i] !== 'hook').map((q) => toWorld3(G.S0, q)), des, hookC: toWorld3(G.S0, [Dl[0], Dl[1], Dl[2]]) }; };
const out = { base3, slotC: G.slotC.map((v) => +v.toFixed(2)) };
const bone = verts('bone', null, 3);
for (const s of [0, 0.5, 1]) {
  const pose = poseLerp(START, END_B, s);
  const f = forceSystemDC(L47, pose, hook, G, 1);
  const w1 = wire1(pose, s), w2 = wire2(pose, s);
  const plane = (() => { const a = M.L45.tip, b = M.L44.tip; return (x) => a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); })();
  const maxAbove = Math.max(...w2.arm.map((p) => p[1] - plane(p[0])));
  const lowerTeeth = ['L43', 'L44', 'L45'].flatMap((n) => verts(n)).concat(verts('L47', pose));
  out[`s${s}`] = {
    D_minus_CR_x: +(f.D[0] - f.cr[0]).toFixed(2), M_cant1: +f.Mmolar1.toFixed(2), M_F2: +f.M2F.toFixed(2), M_molar_total: +f.Mmolar.toFixed(2), M_couple1: +f.M1c.toFixed(2),
    Fv_molar: f.Fv_molar, Fv_anchor: f.Fv_anchor, M_anchor2: +f.Manchor2.toFixed(2),
    wire2_highest_above_occlusal_plane_mm: +maxAbove.toFixed(2), arm_y_range: [Math.min(...w2.arm.map((p) => p[1])), Math.max(...w2.arm.map((p) => p[1]))].map((v) => +v.toFixed(1)),
    wire1_wire2: +minD(w1, w2.arm)[0].toFixed(2), wire2_teeth: +minD(w2.all, lowerTeeth)[0].toFixed(2), wire2_bone: +minD(w2.arm, bone)[0].toFixed(2),
    hook_to_wire1_end: +V.len(V.sub(w2.hookC, apply(pose, G.D, L47.cr))).toFixed(2), design: Object.fromEntries(Object.entries(w2.des).map(([k, v]) => [k, +v.toFixed(2)])),
  };
}
console.log(JSON.stringify(out, null, 1));
