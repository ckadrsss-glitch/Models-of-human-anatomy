// QA on the real meshes (same modules as the player): appliance clearances, cantilever below the occlusal plane,
// force directions, moment signs, equilibrium, anchorage reactions.   node tools/qa.mjs  → docs/QA_REPORT.json
import fs from 'fs';
import { V, IDENT, apply, crAt, forceSystem } from '../src/model.js';
import { WIRE, toothFrame, mesialDir, sideWire, pointParams, tieLocal, buccalWire, auxTube, buildEnvelope, cantilever, resample } from '../src/appliance.js';

const hdr = JSON.parse(fs.readFileSync('assets/dentition.json'));
const buf = fs.readFileSync('assets/dentition.bin');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const M = {}, raw = {};
for (const m of hdr.meshes) { M[m.name] = m; raw[m.name] = { pos: new Float32Array(ab, m.position[0], m.vertices * 3), en: new Uint8Array(ab, m.enamel[0], m.vertices) }; }
const pts = (n, pose = null) => { const p = raw[n].pos, out = []; for (let i = 0; i < p.length; i += 3) { const q = [p[i], p[i + 1], p[i + 2]]; out.push(pose ? apply(pose, q) : q); } return out; };
// coarse spatial hash for nearest-distance queries
function grid(points, h = 1.5) {
  const g = new Map(); const key = (x, y, z) => `${Math.floor(x / h)},${Math.floor(y / h)},${Math.floor(z / h)}`;
  for (const p of points) { const k = key(...p); if (!g.has(k)) g.set(k, []); g.get(k).push(p); }
  return (q, r = 3) => { let best = 1e9; const n = Math.ceil(r / h); const [ix, iy, iz] = q.map((v) => Math.floor(v / h));
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) for (let c = -n; c <= n; c++) { const L = g.get(`${ix + a},${iy + b},${iz + c}`); if (L) for (const p of L) { const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d < best) best = d; } }
    return best; };
}
const LOWER = Object.keys(M).filter((n) => n[0] === 'L');
const INC = ['L31', 'L32', 'L41', 'L42'];
// bracket / tube volumes as point clouds (box in the tooth frame)
function boxPts(m, fdi, w, h, d0, d1) {
  const f = toothFrame(m, mesialDir(hdr, fdi)), out = [];
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) for (let k = 0; k <= 4; k++) {
    const a = (i / 6 - 0.5) * w, b = (j / 6 - 0.5) * h, c = d0 + (d1 - d0) * k / 4;
    out.push(V.add(m.fa, V.add(V.mul(f.x, a), V.add(V.mul(f.y, b), V.mul(f.z, c)))));
  }
  return out;
}
const bracketPts = [];
for (const n of LOWER) {
  const fdi = n.slice(1), k = +fdi[1];
  if (k <= 5) bracketPts.push(...boxPts(M[n], fdi, k <= 2 ? 2.5 : 3.1, 3.0, 0, 2.3));
  else if (k === 6) bracketPts.push(...boxPts(M[n], fdi, 4.4, 4.4, 0, 2.6).map((p) => V.add(p, V.mul(toothFrame(M[n], mesialDir(hdr, fdi)).y, -0.85))));
  else bracketPts.push(...boxPts(M[n], fdi, 4.0, 1.6, 0, 2.3));
}
const bracketsInc = []; for (const n of INC) bracketsInc.push(...boxPts(M[n], n.slice(1), 2.5, 3.0, 0, 2.3));
const bracketsBuc = []; for (const n of LOWER.filter((n) => !INC.includes(n))) { const fdi = n.slice(1), k = +fdi[1]; if (k <= 5) bracketsBuc.push(...boxPts(M[n], fdi, 3.1, 3.0, 0, 2.3)); }
const boneG = grid(pts('bone'));
const occlusalY = Math.min(...['L34', 'L35', 'L36', 'L44', 'L45', 'L46'].map((n) => M[n].tip[1]));
const env = buildEnvelope(LOWER.map((n) => raw[n]), [...LOWER.map((n) => V.add(M[n].fa, V.mul(M[n].faN, n.endsWith('6') ? 3.0 : 2.45))),
  ...[1, -1].flatMap((s) => sideWire(hdr, s).map((p) => V.add(p, V.mul(V.norm([p[0] - hdr.archCentre[0], 0, p[2] - hdr.archCentre[2]]), 0.36))))], hdr.archCentre);
const pp = pointParams(hdr);
const report = { units: 'mm', occlusalPlaneY: +occlusalY.toFixed(2), checks: [], cantilever: {}, forces: {}, anteriorWire: {} };
const check = (name, ok, value) => { report.checks.push({ name, ok, value }); if (!ok) console.log('FAIL', name, value); };

// ---- anterior wire + extensions: clearance from teeth (except its own incisors at the slots), canine/premolar brackets, bone
const toothGrid = grid(LOWER.filter((n) => !INC.includes(n)).flatMap((n) => pts(n)));
const bucBrG = grid(bracketsBuc);
for (const side of [1, -1]) {
  const w = resample(sideWire(hdr, side), 200);
  const ext = w.filter((p) => Math.abs(p[0]) > Math.abs(hdr.wire.left[2][0]) - 0.1 || p[1] < hdr.wire.left[2][1] - 0.5);
  const dT = Math.min(...ext.map((p) => toothGrid(p))) - WIRE.ss.w / 2;
  const dB = Math.min(...ext.map((p) => bucBrG(p))) - WIRE.ss.h / 2;
  const dBone = Math.min(...ext.map((p) => boneG(p)));
  report.anteriorWire[side > 0 ? 'left' : 'right'] = { extensionToTeeth: +dT.toFixed(2), extensionToCanineBrackets: +dB.toFixed(2), extensionToBoneSurface: +dBone.toFixed(2) };
  check(`extension ${side > 0 ? 'L' : 'R'} clear of canine/premolar enamel`, dT > 0.1, dT.toFixed(2));
  check(`extension ${side > 0 ? 'L' : 'R'} not engaged in / clear of the canine bracket`, dB > 0.2, dB.toFixed(2));
}
// ---- cantilevers for every point, passive and active
const tubes = ['3', '4'].map((q) => auxTube(hdr, M, q));
const allTeethG = grid(LOWER.flatMap((n) => pts(n)));
const incTeeth = (pose) => grid(INC.flatMap((n) => pts(n, pose)));
const brAll = grid(bracketPts);
for (const k of [1, 2, 3, 4, 5]) {
  const [l, r] = tieLocal(pp, k), ties = [l, r];
  const rec = {};
  for (const act of [0, 1]) {
    for (let i = 0; i < 2; i++) {
      const res = cantilever(tubes[i], ties[i], env, { act, side: i ? -1 : 1 });
      // exclude the part inside the tube and the hook (it touches the anterior wire by design)
      const arm = res.pts.filter((_, j) => res.tags[j] === 'arm' || res.tags[j] === 'bend');
      const armFar = arm.slice(0, Math.max(1, arm.length - 4));
      const dTeeth = Math.min(...armFar.map((p) => allTeethG(p, 4))) - WIRE.tma.w / 2;
      const dBr = Math.min(...arm.slice(3, arm.length - 6).map((p) => brAll(p, 4))) - WIRE.tma.w / 2;
      const dBone = Math.min(...arm.map((p) => boneG(p, 4)));
      const yMax = Math.max(...res.pts.map((p) => p[1]));
      rec[`${act ? 'active' : 'passive'}_${i ? 'R' : 'L'}`] = { toTeeth: +dTeeth.toFixed(2), toBrackets: +dBr.toFixed(2), toBone: +dBone.toFixed(2), yMax: +yMax.toFixed(2), length: +res.Ltot.toFixed(1) };
      check(`cantilever p${k} ${act ? 'active' : 'passive'} ${i ? 'R' : 'L'} clear of teeth`, dTeeth > 0.15, dTeeth.toFixed(2));
      check(`cantilever p${k} ${act ? 'active' : 'passive'} ${i ? 'R' : 'L'} clear of brackets/tubes`, dBr > 0.1, dBr.toFixed(2));
      check(`cantilever p${k} ${act ? 'active' : 'passive'} ${i ? 'R' : 'L'} outside bone/gingiva`, dBone > 0.4, dBone.toFixed(2));
      check(`cantilever p${k} ${act ? 'active' : 'passive'} ${i ? 'R' : 'L'} below the occlusal plane`, yMax < occlusalY - 1.0, `${yMax.toFixed(2)} < ${occlusalY.toFixed(2)}`);
    }
  }
  report.cantilever['p' + k] = rec;
  // ---- force system at the START pose and moment sign vs the movement in the film
  const fsys = forceSystem(k === 1 ? [l] : ties, crAt(IDENT), tubes.map((t) => t.c));
  const pose = hdr.poses['p' + k];
  report.forces['p' + k] = { d: +fsys.d.toFixed(2), Mx: +fsys.M[0].toFixed(3), My: +fsys.M[1].toFixed(4), Mz: +fsys.M[2].toFixed(4), theta: pose.theta,
    molarL: { force: fsys.molar[0].force, couple: fsys.molar[0].couple.map((v) => +v.toFixed(2)) }, equilibrium: fsys.equilibrium };
  check(`p${k}: intrusive resultant is apical (−y)`, fsys.resultant[1] < 0 && fsys.resultant[0] === 0 && fsys.resultant[2] === 0, fsys.resultant);
  check(`p${k}: same resultant magnitude for every point`, Math.abs(V.len(fsys.resultant) - 1) < 1e-9, V.len(fsys.resultant));
  check(`p${k}: moment sign matches the shown rotation (d>0 → proclination, d<0 → retroclination, d≈0 → none)`,
    Math.abs(fsys.d) < 0.15 ? pose.theta === 0 : Math.sign(fsys.M[0]) === Math.sign(pose.theta), `d=${fsys.d.toFixed(2)} Mx=${fsys.M[0].toFixed(2)} θ=${pose.theta}`);
  check(`p${k}: symmetric → no transverse moments`, Math.abs(fsys.M[1]) < 1e-6 && Math.abs(fsys.M[2]) < 1e-6, [fsys.M[1], fsys.M[2]]);
  check(`p${k}: wire equilibrium ΣF = 0, ΣM = 0`, fsys.equilibrium.every((e) => e.sumF < 1e-9 && e.sumM < 1e-9), fsys.equilibrium);
  check(`p${k}: molar reaction extrusive and tip-back (crown distal)`, fsys.molar.every((m) => m.force[1] > 0 && m.couple[0] < 0), fsys.molar.map((m) => m.couple[0].toFixed(2)));
}
// proclined crowns move labially: incisal edge z increases for p2
const tipS = M.L31.tip, tip2 = apply(hdr.poses.p2, tipS), apex2 = apply(hdr.poses.p2, M.L31.apex);
check('p2: crown labial, root lingual', tip2[2] > tipS[2] && apex2[2] < M.L31.apex[2], [tip2[2] - tipS[2], apex2[2] - M.L31.apex[2]]);
const tip5 = apply(hdr.poses.p5, tipS), apex5 = apply(hdr.poses.p5, M.L31.apex);
check('p5: crown lingual, root labial', tip5[2] < tipS[2] && apex5[2] > M.L31.apex[2], [tip5[2] - tipS[2], apex5[2] - M.L31.apex[2]]);
check('active segment = exactly 4 incisors (31 32 41 42); canines in the buccal segments', true, INC);
check('roots inside the bone volume in every pose (build QA)', Object.values(hdr.qa.rootsInBone).every((v) => v > 0.3), hdr.qa.rootsInBone);
check('lateral incisors never penetrate the canines (build QA)', Object.values(hdr.qa.minClear).every((v) => v >= 0), hdr.qa.minClear);
report.build = hdr.qa;
report.passed = report.checks.filter((c) => c.ok).length; report.failed = report.checks.filter((c) => !c.ok).length;
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/QA_REPORT.json', JSON.stringify(report, null, 1));
console.log(`QA: ${report.passed} passed, ${report.failed} failed  (occlusal plane y = ${occlusalY.toFixed(2)})`);
console.log(JSON.stringify({ forces: report.forces.p2, anterior: report.anteriorWire, cant: report.cantilever.p3 }, null, 0));
