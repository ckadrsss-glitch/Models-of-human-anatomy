// QA of the double-cantilever edit: D distal of the CR, moment signs, compensation, wire clearances.
import fs from 'fs';
import { V, apply, applyDir, poseLerp, START, END_B, END_A } from '../src/model.js';
import { SCENE } from '../src/scene.js';
import { solveDesign, centreLine } from '../src/wire.js';
import { dcGeometry, forceSystemDC, DELTA2 } from '../src/dc.js';
import { solve2, centreLine2, toLocal, toWorld } from '../src/wire2.js';
const hdr = JSON.parse(fs.readFileSync('assets/dentition.json'));
const buf = fs.readFileSync('assets/dentition.bin');
const M = Object.fromEntries(hdr.meshes.map((m) => [m.name, m]));
const L47 = M.L47, G = dcGeometry(hdr), hook = SCENE.hook(hdr);
const verts = (name, pose) => { const m = M[name]; const p = new Float32Array(buf.buffer.slice(buf.byteOffset + m.position[0], buf.byteOffset + m.position[0] + m.vertices * 12)); const out = []; for (let i = 0; i < m.vertices; i += 3) { const q = [p[3 * i] + m.cr[0], p[3 * i + 1] + m.cr[1], p[3 * i + 2] + m.cr[2]]; out.push(pose ? apply(pose, q, L47.cr) : q); } return out; };
const minD = (A, B) => { let b = 1e9; for (const a of A) for (const q of B) { const d = (a[0] - q[0]) ** 2 + (a[1] - q[1]) ** 2 + (a[2] - q[2]) ** 2; if (d < b) b = d; } return Math.sqrt(b); };
// wire 1 (activated) as in film.js
const fz = V.norm(L47.faN), fx = V.norm(V.sub([1, 0, 0], V.mul(fz, fz[0])));
const f0 = { c: V.add(L47.fa, V.mul(L47.faN, SCENE.tubeOff)), m: fx, b: fz }; f0.o = V.cross(f0.b, f0.m);
const tfAt = (pose) => ({ c: apply(pose, f0.c, L47.cr), m: applyDir(pose, f0.m), o: applyDir(pose, f0.o), b: applyDir(pose, f0.b) });
const toT = (tf, p) => { const d = V.sub(p, tf.c); return [V.dot(d, tf.m), V.dot(d, tf.o), V.dot(d, tf.b)]; };
const fromT = (tf, q) => V.add(tf.c, V.add(V.mul(tf.m, q[0]), V.add(V.mul(tf.o, q[1]), V.mul(tf.b, q[2]))));
const tfS = tfAt(START), base = solveDesign(V.add(toT(tfS, hook), [0, -6.5, 0]));
const wire1 = (pose, s) => { const tf = tfAt(pose); const Ht = toT(tf, hook); const dE = 6.5 * (1 - 0.75 * s); const d = solveDesign(V.add(Ht, [0, -dE, 0]), base); return centreLine(d, { step: 1, helix: 1, tip: 1, hook: 1 }, [0, dE, 0]).pts.map((q) => fromT(tf, q)); };
const base2 = solve2(V.add(toLocal(G.S0, apply(START, G.D, L47.cr)), [DELTA2, 0, 0]));
const wire2 = (pose, s, act = 1) => { const Dl = toLocal(G.S0, apply(pose, G.D, L47.cr)); const d2 = DELTA2 * (1 - 0.75 * s); const des = solve2(V.add(Dl, [d2, 0, 0]), base2); return centreLine2(des, d2 * act).pts.map((q) => toWorld(G.S0, q)); };
const out = { base2 };
for (const s of [0, 0.5, 1]) {
  const pose = poseLerp(START, END_B, s);
  const f = forceSystemDC(L47, pose, hook, G, 1);
  const w1 = wire1(pose, s), w2 = wire2(pose, s);
  const ext = [G.E0, G.E1].map((p) => apply(pose, p, L47.cr));
  out[`s${s}`] = {
    D_minus_CR_x: +(f.D[0] - f.cr[0]).toFixed(2), M_molar_total: +f.Mmolar.toFixed(2), M_cant1: +f.Mmolar1.toFixed(2), M_F2: +f.M2F.toFixed(2),
    Fv_molar: f.Fv_molar, Fv_anchor: f.Fv_anchor, M_anchor2: +f.Manchor2.toFixed(2),
    wire1_wire2: +minD(w1, w2).toFixed(2), wire2_47: +minD(w2.slice(40), verts('L47', pose)).toFixed(2), wire2_45: +minD(w2, verts('L45')).toFixed(2), wire2_44: +minD(w2, verts('L44')).toFixed(2),
    wire1_47ext: +minD(w1, ext.length ? (() => { const pts = []; for (let i = 0; i <= 20; i++) pts.push(V.lerp(ext[0], ext[1], i / 20)); return pts; })() : []).toFixed(2),
  };
}
// upper closure at the end (stopB) vs wire 2
const up = verts('U16').concat(verts('U17')).map((p) => [p[0], p[1] - 0.42, p[2]]);
out.wire2_upper_at_closure = +minD(wire2(END_B, 1), up).toFixed(2);
console.log(JSON.stringify(out, null, 1));
