// QA on the real meshes (same model.js as the player):
//   • occlusion: closing the upper teeth from an open position — the offset at which they first touch
//     47 versus the premolars (premature contact = interference), for every pose of 47;
//   • 47 ↔ 45 distance in every pose (no collision), 47 ↔ upper teeth at their final closure;
//   • force systems (cantilever, cantilever + miniscrew) in the start pose: signs and moment change.
// usage: node tools/qa.mjs
import fs from 'fs';
import { V, apply, poseLerp, START, END_A, END_B, forceSystem } from '../src/model.js';
import { SCENE } from '../src/scene.js';

const hdr = JSON.parse(fs.readFileSync('assets/dentition.json'));
const buf = fs.readFileSync('assets/dentition.bin');
const M = {};
for (const m of hdr.meshes) {
  const pos = new Float32Array(buf.buffer.slice(buf.byteOffset + m.position[0], buf.byteOffset + m.position[0] + m.vertices * 12));
  const en = new Uint8Array(buf.buffer.slice(buf.byteOffset + m.enamel[0], buf.byteOffset + m.enamel[0] + m.vertices));
  const pts = [];
  const cr = m.cr || [0, 0, 0];
  for (let i = 0; i < m.vertices; i++) pts.push({ p: [pos[3 * i] + cr[0], pos[3 * i + 1] + cr[1], pos[3 * i + 2] + cr[2]], e: en[i] > 128 });
  M[m.name] = { ...m, pts };
}
const L47 = M.L47;
const crownPts = (name, pose) => M[name].pts.filter((q) => q.e).map((q) => (pose ? apply(pose, q.p, L47.cr) : q.p));

// spatial hash for nearest-distance queries
function grid(pts, cell = 1.0) {
  const g = new Map();
  for (const p of pts) { const k = p.map((v) => Math.floor(v / cell)).join(','); (g.get(k) || g.set(k, []).get(k)).push(p); }
  return { g, cell };
}
function minDist(A, G, dy = 0) {
  let best = 1e9;
  for (const a0 of A) {
    const a = [a0[0], a0[1] - dy, a0[2]];
    const c = a.map((v) => Math.floor(v / G.cell));
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const l = G.g.get(`${c[0] + i},${c[1] + j},${c[2] + k}`); if (!l) continue;
      for (const b of l) { const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (d < best) best = d; }
    }
  }
  return best;
}
const upper = (names) => names.flatMap((n) => crownPts(n));
/** upper-teeth offset (mm, + = open) at first contact (< 0.25 mm) when closing from 6 mm open */
function contactOffset(lowerPts, upperNames) {
  const G = grid(lowerPts);
  const U = upper(upperNames);
  let dy = 6;
  while (dy > -3 && minDist(U, G, -dy) > 0.25) dy -= 0.05;
  return +dy.toFixed(2);
}
const premol = [...crownPts('L44'), ...crownPts('L45')];
const dP = contactOffset(premol, ['U14', 'U15']);
const report = { premolarContactOffset: dP, poses: {} };
const anat = { theta: 0, shift: [0, 0, 0] };
for (const [k, pose] of Object.entries({ anatomical: anat, start: START, endA: END_A, endB: END_B })) {
  const c47 = crownPts('L47', pose);
  const d47 = contactOffset(c47, ['U16', 'U17']);
  const all47 = M.L47.pts.map((q) => apply(pose, q.p, L47.cr));
  const d45 = minDist(all47, grid(M.L45.pts.map((q) => q.p)));
  report.poses[k] = { contactOffset47: d47, interference_mm: +(d47 - dP).toFixed(2), min47to45: +d45.toFixed(2) };
}
// force systems along the uprighting (start → end) with the scene geometry
for (const s of [0, 0.5, 1]) {
  const poseA = poseLerp(START, END_A, s), poseB = poseLerp(START, END_B, s);
  const fA = forceSystem(L47, poseA, SCENE.hook(hdr));
  const fB = forceSystem(L47, poseB, SCENE.hook(hdr), SCENE.screwHead(hdr));
  report[`forces_s${s}`] = {
    A: { Lmd: +fA.Lmd.toFixed(1), Mc: +fA.Mc.toFixed(2), Mcr: +fA.Mcr.toFixed(2), Fv: fA.Fv },
    B: { Mcr: +fB.Mcr.toFixed(2), dM: +fB.dM.toFixed(2), armToCR: +fB.arm.toFixed(2), Fv: +fB.Fv.toFixed(3), Fs: fB.Fs.map((v) => +v.toFixed(2)), Fh: +fB.Fh.toFixed(2) },
  };
}
report.screw = hdr.screw; report.boneQA = hdr.qa;
console.log(JSON.stringify(report, null, 1));
