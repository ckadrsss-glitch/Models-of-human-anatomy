// Geometry QA of the movement model on the real Z-Anatomy tooth meshes.
//   node tools/qa.mjs
// For each pair of neighbouring teeth: closest distance and max interpenetration (signed distance via
// nearest vertex + its normal), in the anatomical final pose, the protruded start pose and at key times.
// Also checks that every space opened by distalisation is closed again at the end.
import fs from 'fs';
import { buildModel, poseAt, startPose, finalPose, apply, gapBetween, D } from '../src/model.js';
import { SCHEDULE } from '../src/timeline.js';

const hdr = JSON.parse(fs.readFileSync('assets/dentition.json'));
const bin = fs.readFileSync('assets/dentition.bin');
const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
const teethMeta = hdr.meshes.filter((m) => m.fdi);
const model = buildModel(teethMeta);
const geo = {};
for (const m of teethMeta) {
  const P = new Float32Array(ab, m.position[0], m.vertices * 3), Nn = new Int8Array(ab, m.normal[0], m.vertices * 3);
  const pts = [], nrm = [];
  for (let i = 0; i < m.vertices; i++) {
    pts.push([P[3 * i] + m.cr[0], P[3 * i + 1] + m.cr[1], P[3 * i + 2] + m.cr[2]]);
    nrm.push([Nn[3 * i] / 127, Nn[3 * i + 1] / 127, Nn[3 * i + 2] / 127]);
  }
  geo[m.fdi] = { pts, nrm };
}
const rotOnly = (pose, n) => { const o = apply({ ...pose, T: [0, 0, 0], pivot: [0, 0, 0] }, n); return o; };
function placed(fdi, pose) {
  const g = geo[fdi];
  return { pts: g.pts.map((p) => apply(pose, p)), nrm: g.nrm.map((n) => rotOnly(pose, n)) };
}
function pair(A, B) {
  let dmin = 1e9, pen = 0;
  for (const p of A.pts) {
    let best = 1e9, bi = -1;
    for (let j = 0; j < B.pts.length; j++) {
      const q = B.pts[j], d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
      if (d < best) { best = d; bi = j; }
    }
    best = Math.sqrt(best); dmin = Math.min(dmin, best);
    if (best < 2) {
      const q = B.pts[bi], n = B.nrm[bi];
      const s = (p[0] - q[0]) * n[0] + (p[1] - q[1]) * n[1] + (p[2] - q[2]) * n[2];
      if (s < 0) pen = Math.max(pen, -s);
    }
  }
  return { dmin, pen };
}
const order = ['17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27'];
function report(label, poseFn) {
  const P = Object.fromEntries(order.map((f) => [f, placed(f, poseFn(model.byFdi[f]))]));
  const rows = [];
  for (let i = 0; i < order.length - 1; i++) {
    const a = order[i], b = order[i + 1];
    const r1 = pair(P[a], P[b]), r2 = pair(P[b], P[a]);
    rows.push(`${a}-${b}: gap ${Math.min(r1.dmin, r2.dmin).toFixed(2)}  pen ${Math.max(r1.pen, r2.pen).toFixed(2)}`);
  }
  console.log(`\n== ${label}\n` + rows.join('\n'));
}
report('FINAL (anatomy)', finalPose);
report('START (protruded)', startPose);
for (const t of [SCHEDULE.dist[7][1], SCHEDULE.dist[5][1], SCHEDULE.dist[4][1], (SCHEDULE.retr[0] + SCHEDULE.retr[1]) / 2]) report(`t = ${t}`, (th) => poseAt(th, t));

// space bookkeeping
const g = (a, b, t) => gapBetween(model.byFdi[a], model.byFdi[b], t);
console.log(`\nspace 13-14 after distalisation: ${g('13', '14', SCHEDULE.dist[4][1] + 0.1).toFixed(2)} mm (D = ${D})`);
console.log(`space 13-14 after retraction:    ${g('13', '14', SCHEDULE.retr[1] + 0.1).toFixed(2)} mm`);
// incisor movement (start → final): incisal tip and apex displacement, inclination change
const t11 = model.byFdi['11'], s = startPose(t11);
const dTip = apply(s, t11.tip).map((v, k) => v - t11.tip[k]), dApex = apply(s, t11.apex).map((v, k) => v - t11.apex[k]);
console.log(`11 start vs final: incisal tip +${Math.hypot(...dTip).toFixed(2)} mm, apex +${Math.hypot(...dApex).toFixed(2)} mm, inclination ${(s.angle * 180 / Math.PI).toFixed(1)}°`);
