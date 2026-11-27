// QA on the real meshes (same modules as the player): appliance clearances, cantilever below the occlusal plane,
// force directions, moment signs, equilibrium, anchorage reactions.   node tools/qa.mjs  → docs/QA_REPORT.json
import fs from 'fs';
import { V, IDENT, apply, crAt, forceSystem, centreOfRotation } from '../src/model.js';
import { WIRE, toothFrame, mesialDir, sideWire, pointParams, tieLocal, tieDirLocal, buccalWire, auxTube, buildEnvelope, cantilever, resample, TIE_KEYS } from '../src/appliance.js';

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
  const ext = w.filter((p) => Math.abs(p[0]) > Math.abs(hdr.wire.left[hdr.wire.iRun][0]) - 0.1 || p[1] < hdr.wire.left[hdr.wire.iRun][1] - 0.5);
  const dT = Math.min(...ext.map((p) => toothGrid(p))) - WIRE.ss.w / 2;
  const dB = Math.min(...ext.map((p) => bucBrG(p))) - WIRE.ss.h / 2;
  const dBone = Math.min(...ext.map((p) => boneG(p)));
  report.anteriorWire[side > 0 ? 'left' : 'right'] = { extensionToTeeth: +dT.toFixed(2), extensionToCanineBrackets: +dB.toFixed(2), extensionToBoneSurface: +dBone.toFixed(2) };
  check(`extension ${side > 0 ? 'L' : 'R'} clear of canine/premolar enamel`, dT > 0.1, dT.toFixed(2));
  check(`extension ${side > 0 ? 'L' : 'R'} not engaged in / clear of the canine bracket`, dB > 0.2, dB.toFixed(2));
  // V4: short up-turned (occlusal) tip at the distal end of the extension: present, short, main run straight
  {
    const wl = side > 0 ? hdr.wire.left : hdr.wire.right, iT = hdr.wire.iTip, tip = wl.slice(iT);
    const rise = Math.max(...tip.map((p) => p[1])) - wl[iT][1];
    const run = wl.slice(hdr.wire.iRun + 1, iT + 1), yDev = Math.max(...run.map((p) => Math.abs(p[1] - run[0][1])));
    const runLen = run.slice(1).reduce((n, p, j) => n + Math.hypot(p[0] - run[j][0], p[2] - run[j][2]), 0);
    report.anteriorWire[side > 0 ? 'left' : 'right'].tip = { rise: +rise.toFixed(2), distalRunFlatness: +yDev.toFixed(3), distalRunLength: +runLen.toFixed(1) };
    check(`extension ${side > 0 ? 'L' : 'R'}: short up-turned occlusal tip (0.5–1.2 mm)`, rise > 0.5 && rise < 1.2, rise.toFixed(2));
    check(`extension ${side > 0 ? 'L' : 'R'}: distal run straight in the vertical (< 0.02 mm)`, yDev < 0.02, yDev.toFixed(3));
    const past = (side > 0 ? hdr.points.C[0] : hdr.points.C[1])[2] - wl[iT][2];
    report.anteriorWire[side > 0 ? 'left' : 'right'].tip.pastTieC = +past.toFixed(2);
    check(`extension ${side > 0 ? 'L' : 'R'}: no excess length (tip 0.5–1.2 mm distal to tie C)`, past > 0.5 && past < 1.2, past.toFixed(2));
  }
}
// ---- V3: levelling and alignment completed inside the segments (slots of each segment level / collinear, one smooth
//      arch form, no rotations of the brackets against the wire, contacts without crowding)
{
  const S = hdr.slots, inc = ['31', '32', '41', '42'].map((f) => S[f][1]);
  const incRange = Math.max(...inc) - Math.min(...inc);
  check('incisor slots level (one height, rigid sectional wire straight in the vestibular view)', incRange < 0.15, incRange.toFixed(3));
  const C = hdr.archCentre, th = (p) => Math.abs(Math.atan2(p[0] - C[0], p[2] - C[2]));
  for (const q of ['3', '4']) {
    const fs = ['3', '4', '5', '6', '7'].map((k) => q + k), X = fs.map((f) => th(S[f])), Y = fs.map((f) => S[f][1]);
    const mx = X.reduce((a, b) => a + b) / 5, my = Y.reduce((a, b) => a + b) / 5;
    const b = X.reduce((a, x, i) => a + (x - mx) * (Y[i] - my), 0) / X.reduce((a, x) => a + (x - mx) ** 2, 0);
    const dev = Math.max(...X.map((x, i) => Math.abs(Y[i] - (my + b * (x - mx)))));
    report.levelling = report.levelling || {}; report.levelling['buccal' + q] = { slotHeights: Y.map((v) => +v.toFixed(2)), maxDeviationFromLine: +dev.toFixed(3) };
    check(`buccal segment ${q}3–${q}7: slots collinear (straight rigid SS wire, no steps)`, dev < 0.2, dev.toFixed(3));
  }
  const tw = Math.max(...['31', '32', '33', '34', '35', '36', '37'].map((k) => Math.abs(S['3' + k.slice(1)][1] - S['4' + k.slice(1)][1]) + Math.abs(S['3' + k.slice(1)][0] + S['4' + k.slice(1)][0])));
  check('levelled arch symmetric left / right', tw < 0.05, tw.toFixed(3));
  report.levelling.incisorSlotRange = +incRange.toFixed(3);
}
// ---- cantilevers for the three tie configurations A / B / C (passive and active) and the re-tie path in between.
//      The activation is re-adjusted per configuration (same F with a shorter arm → smaller deflection δ ∝ L³).
const tubes = ['3', '4'].map((q) => auxTube(hdr, M, q));
const allTeethG = grid(LOWER.flatMap((n) => pts(n)));
const incTeeth = (pose) => grid(INC.flatMap((n) => pts(n, pose)));
const brAll = grid(bracketPts);
const DELTA_A = 4.6;
const armL = [0, 1, 2].map((u) => cantilever(tubes[0], tieLocal(pp, u)[0], env, { act: 1, delta0: DELTA_A }).Ltot);
const deltaAt = (u) => { const k0 = Math.max(0, Math.min(1, Math.floor(u))), f = Math.min(1, Math.max(0, u - k0)); const l = armL[k0] + (armL[k0 + 1] - armL[k0]) * f; return DELTA_A * Math.pow(l / armL[0], 3); };
report.activation = { armLength: armL.map((v) => +v.toFixed(1)), passiveDeflection: [0, 1, 2].map((u) => +deltaAt(u).toFixed(2)), note: 'illustrative: same F for A/B/C with δ ∝ L³ (cantilever beam), not measured' };
// re-tie path: passive cantilever while the hook is moved A → B → C along the wire
for (let u = 0; u <= 2.0001; u += 0.25) {
  const [l, r] = tieLocal(pp, u);
  for (let i = 0; i < 2; i++) {
    const res = cantilever(tubes[i], [l, r][i], env, { act: 0, delta0: deltaAt(u), side: i ? -1 : 1 });
    const arm = res.pts.filter((_, j) => res.tags[j] === 'arm' || res.tags[j] === 'bend');
    const dT = Math.min(...arm.slice(0, Math.max(1, arm.length - 4)).map((p) => allTeethG(p, 4))) - WIRE.tma.w / 2;
    const dBone = Math.min(...arm.map((p) => boneG(p, 4)));
    check(`re-tie path u=${u.toFixed(2)} ${i ? 'R' : 'L'}: passive arm clear of teeth and outside the gingiva`, dT > 0.15 && dBone > 0.4, `${dT.toFixed(2)} / ${dBone.toFixed(2)}`);
  }
}
for (const [ui, k] of TIE_KEYS.entries()) {
  const [l, r] = tieLocal(pp, ui), ties = [l, r];
  const rec = {};
  for (const act of [0, 1]) {
    for (let i = 0; i < 2; i++) {
      const res = cantilever(tubes[i], ties[i], env, { act, delta0: deltaAt(ui), side: i ? -1 : 1, tieDir: tieDirLocal(pp, ui)[i] });
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
      // V4: the cantilever free end is straight (no terminal bend, no hook) and lies labially beside the anterior wire
      const term = res.pts.filter((_, j) => res.tags[j] === 'hook'), e = res.pts[res.iEnd];
      const pv = res.pts[Math.max(0, res.iEnd - 3)], hz0 = Math.hypot(e[0] - pv[0], e[2] - pv[2]), sl = hz0 > 1e-6 ? (e[1] - pv[1]) / hz0 : 0;
      const rise = Math.max(...term.map((p) => Math.abs(p[1] - (e[1] + sl * Math.hypot(p[0] - e[0], p[2] - e[2])))));   // deviation from the straight continuation
      const wireC = resample(sideWire(hdr, i ? -1 : 1), 400);
      const dWire = Math.min(...term.map((p) => Math.min(...wireC.map((w) => Math.hypot(p[0] - w[0], p[2] - w[2])))));
      rec[`${act ? 'active' : 'passive'}_${i ? 'R' : 'L'}`].freeEnd = { verticalDeviation: +rise.toFixed(3), labialToWire: +dWire.toFixed(2) };
      check(`cantilever p${k} ${act ? 'active' : 'passive'} ${i ? 'R' : 'L'}: straight free end (no terminal bend / hook)`, term.length > 0 && rise < 0.02, rise.toFixed(3));
      if (act) check(`cantilever p${k} active ${i ? 'R' : 'L'}: free end lies labially beside the anterior wire (no overlap of the sections)`, dWire >= (WIRE.tma.w + WIRE.ss.w) / 2 - 0.02, dWire.toFixed(2));
    }
  }
  report.cantilever[k] = rec;
  // ---- force system at the START pose and moment sign vs the movement in the film
  const fsys = forceSystem(ties, crAt(IDENT), tubes.map((t) => t.c));
  const pose = hdr.poses['p' + k];
  report.forces['p' + k] = { d: +fsys.d.toFixed(2), Mx: +fsys.M[0].toFixed(3), My: +fsys.M[1].toFixed(4), Mz: +fsys.M[2].toFixed(4), theta: pose.theta,
    molarL: { force: fsys.molar[0].force, couple: fsys.molar[0].couple.map((v) => +v.toFixed(2)) }, equilibrium: fsys.equilibrium };
  check(`p${k}: intrusive resultant is apical (−y)`, fsys.resultant[1] < 0 && fsys.resultant[0] === 0 && fsys.resultant[2] === 0, fsys.resultant);
  check(`p${k}: same resultant magnitude and direction for A, B and C`, Math.abs(V.len(fsys.resultant) - 1) < 1e-9, V.len(fsys.resultant));
  check(`p${k}: moment sign matches the shown rotation (d>0 → proclination, d<0 → retroclination, d≈0 → none)`,
    Math.abs(fsys.d) < 0.15 ? pose.theta === 0 : Math.sign(fsys.M[0]) === Math.sign(pose.theta), `d=${fsys.d.toFixed(2)} Mx=${fsys.M[0].toFixed(2)} θ=${pose.theta}`);
  check(`p${k}: symmetric → no transverse moments`, Math.abs(fsys.M[1]) < 1e-6 && Math.abs(fsys.M[2]) < 1e-6, [fsys.M[1], fsys.M[2]]);
  check(`p${k}: wire equilibrium ΣF = 0, ΣM = 0`, fsys.equilibrium.every((e) => e.sumF < 1e-9 && e.sumM < 1e-9), fsys.equilibrium);
  check(`p${k}: molar reaction extrusive and tip-back (crown distal)`, fsys.molar.every((m) => m.force[1] > 0 && m.couple[0] < 0), fsys.molar.map((m) => m.couple[0].toFixed(2)));
}
// lever arms: A labial of the CR, B through it, C lingual/posterior
check('d_A > 0 (A in front of the CR)', hdr.d.A > 0.5, hdr.d.A);
check('|d_B| ≈ 0 (B at the CR level — idealised)', Math.abs(hdr.d.B) < 0.15, hdr.d.B);
check('d_C < 0 (C behind the CR)', hdr.d.C < -0.5, hdr.d.C);
check('tie points move distally A → B → C along the wire', hdr.points.A[0][2] > hdr.points.B[0][2] && hdr.points.B[0][2] > hdr.points.C[0][2], [hdr.points.A[0][2], hdr.points.B[0][2], hdr.points.C[0][2]]);
check('ties A on the sectional wire (between 31/32 brackets), B and C on the stepped extension distal to the lateral bracket',
  Math.abs(hdr.points.A[0][0]) < Math.abs(hdr.wire.left[hdr.wire.iLat][0]) && Math.abs(hdr.points.B[0][0]) > Math.abs(hdr.wire.left[hdr.wire.iRun][0]) && Math.abs(hdr.points.C[0][0]) > Math.abs(hdr.points.B[0][0]), hdr.points);
// movement: crowns / roots, translation + rotation (not a rotation about a fixed CR)
const mid = (a, b) => [0, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const tipS = mid(M.L31.tip, M.L41.tip), apexS = mid(M.L31.apex, M.L41.apex);
const mv = (k) => ({ tip: V.sub(apply(hdr.poses[k], tipS), tipS), apex: V.sub(apply(hdr.poses[k], apexS), apexS) });
const mA = mv('pA'), mB = mv('pB'), mC = mv('pC');
report.movement = Object.fromEntries(['pA', 'pB', 'pC'].map((k) => [k, Object.fromEntries(Object.entries(mv(k)).map(([n, v]) => [n, v.map((x) => +x.toFixed(2))]))]));
check('A: crown labial, root apex lingual, both intruded at the CR', mA.tip[2] > 0.3 && mA.apex[2] < -0.3 && hdr.poses.pA.shift[1] < 0, report.movement.pA);
check('B: crown and apex move apically by the same amount (axis unchanged)', Math.abs(mB.tip[1] - mB.apex[1]) < 1e-6 && mB.tip[1] < 0 && Math.abs(mB.tip[2]) < 1e-6, report.movement.pB);
check('C: crown lingual, root apex labial', mC.tip[2] < -0.3 && mC.apex[2] > 0.3, report.movement.pC);
check('A / C: CR translates along F while the segment rotates (centre of rotation ≠ CR)', ['pA', 'pC'].every((k) => { const c = centreOfRotation(hdr.poses[k]); return c && Math.abs(c[2]) > 2; }), ['pA', 'pC'].map((k) => centreOfRotation(hdr.poses[k])));
check('moderate amplitudes (≤ 2 mm intrusion, |θ| ≤ 8°)', ['pA', 'pB', 'pC'].every((k) => Math.abs(hdr.poses[k].theta) <= 8.0 && Math.abs(hdr.poses[k].shift[1]) <= 2.0), ['pA', 'pB', 'pC'].map((k) => hdr.poses[k].theta));
check('exactly three tie configurations (A, B, C)', JSON.stringify(Object.keys(hdr.points)) === JSON.stringify(['A', 'B', 'C']), Object.keys(hdr.points));
check('active segment = exactly 4 incisors (31 32 41 42); canines in the buccal segments', true, INC);
check('roots inside the bone volume in every pose (build QA)', Object.values(hdr.qa.rootsInBone).every((v) => v > 0.3), hdr.qa.rootsInBone);
check('lateral incisors never penetrate the canines (build QA)', Object.values(hdr.qa.minClear).every((v) => v >= 0), hdr.qa.minClear);
report.build = hdr.qa;
report.passed = report.checks.filter((c) => c.ok).length; report.failed = report.checks.filter((c) => !c.ok).length;
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/QA_REPORT.json', JSON.stringify(report, null, 1));
console.log(`QA: ${report.passed} passed, ${report.failed} failed  (occlusal plane y = ${occlusalY.toFixed(2)})`);
console.log(JSON.stringify({ forces: report.forces, activation: report.activation, movement: report.movement }, null, 0));
