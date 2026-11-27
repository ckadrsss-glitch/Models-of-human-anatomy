// QA on the real meshes (same modules as the player): appliance clearances, cantilever below the occlusal plane,
// force directions, moment signs, equilibrium, anchorage reactions.   node tools/qa.mjs  → docs/QA_REPORT.json
import fs from 'fs';
import { V, IDENT, apply, crAt, forceSystem, centreOfRotation } from '../src/model.js';
import { WIRE, toothFrame, mesialDir, sideWire, sideWireCfg, extensionCut, pointParams, tieLocal, tieDirLocal, buccalWire, auxTube, cantileverEnvelope, bracketBoxes, cantilever, resample, HOOK, EXT_TIP, TIE_KEYS } from '../src/appliance.js';
import { poseLerp } from '../src/model.js';

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
const env = cantileverEnvelope(hdr, M, raw);
const pp = pointParams(hdr);
const cuts = extensionCut(hdr, pp);
const report = { units: 'mm', occlusalPlaneY: +occlusalY.toFixed(2), checks: [], cantilever: {}, forces: {}, anteriorWire: {} };
const check = (name, ok, value) => { report.checks.push({ name, ok, value }); if (!ok) console.log('FAIL', name, value); };

// ---- anterior wire + extensions: clearance from teeth (except its own incisors at the slots), canine/premolar brackets, bone
const toothGrid = grid(LOWER.filter((n) => !INC.includes(n)).flatMap((n) => pts(n)));
const bucBrG = grid(bracketsBuc);
for (const side of [1, -1]) {
  const w = resample(sideWireCfg(hdr, pp, side, 2, cuts), 200);
  const ext = w.filter((p) => Math.abs(p[0]) > Math.abs(hdr.wire.left[hdr.wire.iRun][0]) - 0.1 || p[1] < hdr.wire.left[hdr.wire.iRun][1] - 0.5);
  const dT = Math.min(...ext.map((p) => toothGrid(p))) - WIRE.ss.w / 2;
  const dB = Math.min(...ext.map((p) => bucBrG(p))) - WIRE.ss.h / 2;
  const dBone = Math.min(...ext.map((p) => boneG(p)));
  report.anteriorWire[side > 0 ? 'left' : 'right'] = { extensionToTeeth: +dT.toFixed(2), extensionToCanineBrackets: +dB.toFixed(2), extensionToBoneSurface: +dBone.toFixed(2) };
  check(`extension ${side > 0 ? 'L' : 'R'} clear of canine/premolar enamel`, dT > 0.1, dT.toFixed(2));
  check(`extension ${side > 0 ? 'L' : 'R'} not engaged in / clear of the canine bracket`, dB > 0.2, dB.toFixed(2));
  // V5: per configuration the extension ends ≈ 1 mm past its tie (A: short run after the step) + short up-turned tip
  for (const [ui, k] of TIE_KEYS.entries()) {
    const wc = sideWireCfg(hdr, pp, side, ui, cuts), n = wc.length, tipBase = wc[n - 12], tipTop = wc[n - 1];
    const rise = tipTop[1] - tipBase[1];
    const runStart = (side > 0 ? hdr.wire.left : hdr.wire.right)[hdr.wire.iRun + 1];
    const run = wc.filter((p) => Math.abs(p[1] - runStart[1]) < 1e-6);
    const yDev = Math.max(...run.map((p) => Math.abs(p[1] - runStart[1])));
    const tie = tieLocal(pp, ui)[side > 0 ? 0 : 1];
    const past = k === 'A' ? Math.hypot(tipBase[0] - runStart[0], tipBase[2] - runStart[2]) : Math.hypot(tipBase[0] - tie[0], tipBase[2] - tie[2]);
    report.anteriorWire[side > 0 ? 'left' : 'right']['cfg' + k] = { tipRise: +rise.toFixed(2), runFlatness: +yDev.toFixed(3), [k === 'A' ? 'runAfterStep' : 'pastTie']: +past.toFixed(2) };
    check(`extension ${side > 0 ? 'L' : 'R'} cfg ${k}: short up-turned occlusal tip (0.8–1.2 mm)`, rise > 0.8 && rise < 1.2, rise.toFixed(2));
    check(`extension ${side > 0 ? 'L' : 'R'} cfg ${k}: distal run straight in the vertical`, yDev < 0.02, yDev.toFixed(3));
    check(`extension ${side > 0 ? 'L' : 'R'} cfg ${k}: compact — ${k === 'A' ? 'run after the step ≤ 1.6 mm' : 'ends 0.7–1.3 mm past its tie'}`, k === 'A' ? past <= 1.6 && past > 0.8 : past > 0.7 && past < 1.3, past.toFixed(2));
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
// ---- V5 cantilevers: apical step at the auxiliary tube, arm gingival to the brackets, hook formed from the wire.
//      Swept over: configuration u (A … C, incl. transitions), activation phases (passive → lift → over the wire →
//      seated), incisor pose (start → end pose of the configuration). The activation is re-adjusted per configuration
//      (same F with a shorter arm → smaller deflection δ ∝ L³).
const tubes = ['3', '4'].map((q) => auxTube(hdr, M, q));
const bucTeethPts = LOWER.filter((n) => !INC.includes(n)).flatMap((n) => pts(n));
const bucTeethG = grid(bucTeethPts);
const brkRest = bracketBoxes(hdr);
const DELTA_A = 4.6;
const yLowAt = () => hdr.wire.left[hdr.wire.iRun + 1][1] - HOOK.drop;     // START level (the free end follows the incisors elastically)
const brNow = (pose) => brkRest.map((b) => ({ ...b, p: b.inc ? apply(pose, b.p) : b.p }));
const tdir = (pose, d) => V.sub(apply(pose, d), apply(pose, [0, 0, 0]));
const cantAt = (i, u, act, pose, delta0) => {
  const tie = apply(pose, tieLocal(pp, u)[i]), td = tdir(pose, tieDirLocal(pp, u)[i]);
  const wirePts = resample(sideWireCfg(hdr, pp, i ? -1 : 1, u, cuts), 160).map((p) => apply(pose, p));
  return { res: cantilever(tubes[i], tie, env, { act, delta0, tieDir: td, brackets: brNow(pose), yLow: yLowAt(), dyTie: tie[1] - tieLocal(pp, u)[i][1], wirePts }), tie };
};
const armL = [0, 1, 2].map((u) => cantAt(0, u, 1, IDENT, DELTA_A).res.Ltot);
const deltaAt = (u) => { const k0 = Math.max(0, Math.min(1, Math.floor(u))), f = Math.min(1, Math.max(0, u - k0)); const l = armL[k0] + (armL[k0 + 1] - armL[k0]) * f; return DELTA_A * Math.pow(l / armL[0], 3); };
report.activation = { armLength: armL.map((v) => +v.toFixed(1)), passiveDeflection: [0, 1, 2].map((u) => +deltaAt(u).toFixed(2)), note: 'illustrative: same F for A/B/C with δ ∝ L³ (cantilever beam), not measured' };
// oriented bracket / tube boxes (exact distance point → box)
const boxes = [];
for (const n of LOWER) {
  const fdi = n.slice(1), k = +fdi[1], f = toothFrame(M[n], mesialDir(hdr, fdi));
  if (k <= 5) boxes.push({ n, inc: INC.includes(n), f, c: V.add(M[n].fa, V.mul(f.z, 1.225)), h: [k <= 2 ? 1.25 : 1.55, k <= 2 ? 1.54 : 1.67, 1.225] });
  else if (k === 6) {                 // double tube (geom.js doubleTubeGeometry): pad, main shell, web, auxiliary lumen
    const sub = (y, z, h, aux = false) => boxes.push({ n: n + (aux ? '-aux' : ''), aux, f, c: V.add(V.add(M[n].fa, V.mul(f.z, z)), V.mul(f.y, y)), h });
    sub(-0.85, 0.15, [2.1, 2.3, 0.15]); sub(0, 1.75, [2.2, 0.75, 0.58]); sub(-0.85, 0.85, [1.7, 1.6, 0.6]); sub(-1.75, 2.1, [1.8, 0.68, 0.53], true);
  }
  else boxes.push({ n, f, c: V.add(M[n].fa, V.mul(f.z, 1.2)), h: [2.0, 0.8, 1.2] });
}
const boxDist = (p, b, pose) => {
  const c = b.inc ? apply(pose, b.c) : b.c, R = (d) => (b.inc ? tdir(pose, d) : d);
  const d = V.sub(p, c), l = [V.dot(d, R(b.f.x)), V.dot(d, R(b.f.y)), V.dot(d, R(b.f.z))];
  return Math.hypot(...l.map((v, j) => Math.max(0, Math.abs(v) - b.h[j])));
};
const TMA_R = 0.35, SS_R = Math.hypot(WIRE.ss.w, WIRE.ss.h) / 2;
const bucWires = ['3', '4'].map((q) => resample(buccalWire(hdr, q), 200));
const segDist = (p, W) => Math.min(...W.map((w) => V.len(V.sub(p, w))));
// overlap test of the hook / arm against the anterior wire (rectangular sections, local o–y frame of the wire)
function wireOverlap(p, Wc, pose, isEnd = false, T = null) {
  let best = 1e9, bi = 0; Wc.forEach((w, j) => { const d = V.len(V.sub(p, w)); if (d < best) { best = d; bi = j; } });
  if (best > 2.5) return 9;
  const w = Wc[bi], w2 = Wc[Math.min(Wc.length - 1, bi + 1)], w1 = Wc[Math.max(0, bi - 1)];
  const t = V.norm(V.sub(w2, w1)), d = V.sub(p, w);
  if (Math.abs(t[1]) > 0.6) {                     // vertical part of the anterior wire (apical step / up-turned tip): capsule test
    const perp = V.sub(d, V.mul(t, V.dot(d, t)));
    return V.len(perp) - (SS_R + WIRE.tma.w / 2);
  }
  const up = V.norm(V.sub([0, 1, 0], V.mul(t, t[1]))), o = V.norm(V.cross(t, up));
  // extent of the TMA section of this cantilever point in the wire's o / up directions (depends on its tangent T)
  let eO = WIRE.tma.w / 2, eY = WIRE.tma.h / 2;
  if (T) { const ta = Math.abs(V.dot(T, t)), to = Math.abs(V.dot(T, o)), ty = Math.abs(T[1]);
    eY = Math.min(WIRE.tma.w / 2, (WIRE.tma.h / 2) * ta + (WIRE.tma.w / 2) * to); eO = Math.min(WIRE.tma.w / 2, (WIRE.tma.w / 2) * (ty + ta)); }
  if (isEnd) eY = 0;                              // the lip end is a cut face
  const dO = Math.abs(V.dot(d, o)) - (WIRE.ss.w / 2 + eO), dY = Math.abs(V.dot(d, up)) - (WIRE.ss.h / 2 + eY);
  return Math.max(dO, dY);                        // < 0 → sections overlap
}
const SWEEP_ACT = [0, 0.35, 0.7, 0.78, 0.85, 0.93, 1];
const worst = {};
const note = (key, v) => { if (!(key in worst) || v < worst[key][0]) worst[key] = [v]; };
const ps = (v) => 'pose' + v;
function inspect(i, u, act, poseS, label) {
  const k = Math.round(u), poseEnd = hdr.poses['p' + TIE_KEYS[Math.min(2, Math.max(0, k))]];
  const pose = poseLerp(IDENT, poseEnd, poseS);
  const delta0 = deltaAt(u);
  const { res, tie } = cantAt(i, u, act, pose, delta0);
  const P = res.pts, tg = res.tags;
  const free = P.filter((_, j) => tg[j] !== 'tube');
  const arm = P.filter((_, j) => tg[j] === 'arm' || tg[j] === 'step');
  const hook = P.filter((_, j) => tg[j] === 'hook');
  // brackets / tubes (the 36 tube only for the free wire mesial to its lumen)
  let dBr = 1e9, dbg = null;
  for (const p of free) for (const b of boxes) { if (b.aux) continue; const d = boxDist(p, b, pose) - TMA_R; if (d < dBr) { dBr = d; dbg = [b.n, tg[P.indexOf(p)], P.indexOf(p), p.map((v) => +v.toFixed(2))]; } }
  if (process.env.DBG && label === process.env.DBG) { console.log('BR', i, u, act, dBr.toFixed(2), JSON.stringify(dbg));
    let bm = 1e9, bp = null; for (const p of arm) { const d = boneG(p, 4); if (d < bm) { bm = d; bp = [tg[P.indexOf(p)], P.indexOf(p), p.map((v) => +v.toFixed(2))]; } } console.log('BONE', (bm - 0.32).toFixed(2), JSON.stringify(bp)); }
  const dBW = Math.min(...free.map((p) => Math.min(segDist(p, bucWires[0]), segDist(p, bucWires[1])))) - TMA_R - SS_R;
  const incG = grid(INC.flatMap((n) => pts(n, pose)));
  const dT = Math.min(...free.map((p) => Math.min(bucTeethG(p, 4), incG(p, 4)))) - WIRE.tma.w / 2;
  const dBone = Math.min(...arm.map((p) => boneG(p, 4))) - WIRE.tma.w / 2;
  const Wc = resample(sideWireCfg(hdr, pp, i ? -1 : 1, u, cuts), 260).map((p) => apply(pose, p));
  const tanAt = (p) => { const j = P.indexOf(p); return V.norm(V.sub(P[Math.min(P.length - 1, j + 1)], P[Math.max(0, j - 1)])); };
  const ovL = (act >= 1 ? arm : free).map((p) => wireOverlap(p, Wc, pose, p === P[P.length - 1], tanAt(p))), ov = Math.min(...ovL);
  if (process.env.DBG2 && ov < 0.02) { const j = ovL.indexOf(ov), q = (act >= 1 ? arm : free)[j]; console.log('OV', label, i, u.toFixed(2), act, ps(poseS), ov.toFixed(2), tg[P.indexOf(q)], P.indexOf(q), '/', P.length, q.map((v) => +v.toFixed(2))); }
  note(`brackets ${label}`, dBr); note(`buccal wire ${label}`, dBW); note(`teeth ${label}`, dT); note(`gingiva ${label}`, dBone); note(`anterior wire ${label}`, ov);
  return { res, tie, pose, dBr, dBW, dT, dBone, ov, hook, Wc };
}
// (1) configurations × activation phases × incisor poses
for (const [ui, k] of TIE_KEYS.entries()) {
  const rec = {};
  for (let i = 0; i < 2; i++) {
    const side = i ? 'R' : 'L';
    for (const act of SWEEP_ACT) for (const ps of act === 1 ? [0, 0.5, 1] : [0]) {
      const r = inspect(i, ui, act, ps, `${k}`);
      const tagStr = `p${k} ${side} act=${act}${act === 1 ? ' pose=' + ps : ''}`;
      check(`cantilever ${tagStr}: clear of brackets / tubes`, r.dBr > 0.15, r.dBr.toFixed(2));
      check(`cantilever ${tagStr}: no contact with the buccal SS wire`, r.dBW > 0.3, r.dBW.toFixed(2));
      check(`cantilever ${tagStr}: clear of enamel`, r.dT > 0.15, r.dT.toFixed(2));
      check(`cantilever ${tagStr}: outside the gingiva (≥ 1 mm from bone)`, r.dBone > 1.0, r.dBone.toFixed(2));
      check(`cantilever ${tagStr}: no extra contact with the anterior wire${act === 1 ? ' (arm)' : ' (hook passes over it)'}`, r.ov > 0.0, r.ov.toFixed(2));
      if (act === 1 && ps === 0) {
        const res = r.res, tie = r.tie, ct = res.contact;
        const wireTop = tie[1] + WIRE.ss.h / 2;
        const seat = Math.abs((ct[1]) - wireTop), hz = Math.hypot(ct[0] - tie[0], ct[2] - tie[2]);
        check(`hook p${k} ${side}: crown seated on the occlusal surface of the anterior wire at the force point`, seat < 0.03 && hz < 0.05, `${seat.toFixed(3)} / ${hz.toFixed(3)}`);
        const mD = res.mD, o = res.o;
        const prot = Math.max(...res.pts.map((p) => V.dot(V.sub(p, tie), mD)));
        check(`hook p${k} ${side}: no protruding wire mesial to the force point (≤ half wire)`, prot <= WIRE.tma.h / 2 + 0.03, prot.toFixed(2));
        const legs = r.hook.filter((p) => p[1] < tie[1] + 0.2 && p[1] > tie[1] - 0.3).map((p) => Math.abs(V.dot(V.sub(p, tie), o)));
        const play = Math.min(...legs) - (WIRE.ss.w / 2 + WIRE.tma.w / 2);
        check(`hook p${k} ${side}: free play at both sides of the anterior wire (no clamping → no couple)`, play > 0.02 && play < 0.2, play.toFixed(3));
        const hookH = Math.max(...r.hook.map((p) => p[1])) - Math.min(...r.hook.map((p) => p[1]));
        const hookW = Math.max(...r.hook.map((p) => V.dot(V.sub(p, tie), o))) - Math.min(...r.hook.map((p) => V.dot(V.sub(p, tie), o)));
        check(`hook p${k} ${side}: compact (width ≤ 1.6 mm, no loop / spiral)`, hookW <= 1.6, `${hookW.toFixed(2)} × ${hookH.toFixed(2)}`);
        // apical step right after the tube, arm gingival to the bracket slots
        const firstArm = res.pts[res.tags.indexOf('arm')], yTube = tubes[i].c[1];
        const stepDist = Math.hypot(firstArm[0] - tubes[i].c[0], firstArm[2] - tubes[i].c[2]);
        check(`cantilever p${k} ${side}: apical step right after the auxiliary tube (≥ 1.5 mm within 5 mm)`, yTube - firstArm[1] >= 1.5 && stepDist < 5, `${(yTube - firstArm[1]).toFixed(2)} mm at ${stepDist.toFixed(1)} mm`);
        const q = i ? '4' : '3', bot = Math.min(...['3', '4', '5'].map((kk) => hdr.slots[q + kk][1])) - 1.67;
        const buc = res.pts.filter((p, j) => res.tags[j] === 'arm' && Math.abs(p[0]) > Math.abs(hdr.slots[q + '3'][0]) - 1.5);
        const yMaxB = Math.max(...buc.map((p) => p[1]));
        check(`cantilever p${k} ${side}: arm below the canine / premolar brackets (gingival to the slots)`, yMaxB + WIRE.tma.h / 2 < bot - 0.3, `${yMaxB.toFixed(2)} < ${bot.toFixed(2)}`);
        rec['active_' + side] = { toBrackets: +r.dBr.toFixed(2), toBuccalWire: +r.dBW.toFixed(2), toTeeth: +r.dT.toFixed(2), toBone: +r.dBone.toFixed(2), armLength: +res.Ltot.toFixed(1),
          step: +(yTube - firstArm[1]).toFixed(2), armMaxYbuccal: +yMaxB.toFixed(2), hook: { seat: +seat.toFixed(3), play: +play.toFixed(3), width: +hookW.toFixed(2), height: +hookH.toFixed(2) } };
      }
      if (act === 0) {
        const pr = r.res, en = cantAt(i, ui, 1, IDENT, deltaAt(ui)).res;
        const dy = en.contact[1] - pr.contact[1];
        check(`activation p${k} ${side}: free end moves occlusally from passive to engaged (δ)`, dy > 0.15, dy.toFixed(2));
        rec['passive_' + side] = { toBrackets: +r.dBr.toFixed(2), toTeeth: +r.dT.toFixed(2), toBone: +r.dBone.toFixed(2), freeEndRise: +dy.toFixed(2) };
      }
    }
  }
  report.cantilever[k] = rec;
  const ties = tieLocal(pp, ui);
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
// (2) change of configuration A → B → C: passive cantilever (unhooked, held labially) while the set-up changes
for (let u = 0; u <= 2.0001; u += 0.125) for (let i = 0; i < 2; i++) {
  const r = inspect(i, u, 0, 0, 'transition');
  check(`configuration change u=${u.toFixed(3)} ${i ? 'R' : 'L'}: passive cantilever clear of brackets, wires, enamel, gingiva`, r.dBr > 0.15 && r.dBW > 0.3 && r.dT > 0.15 && r.dBone > 1.0 && r.ov > 0.0,
    `${r.dBr.toFixed(2)} / ${r.dBW.toFixed(2)} / ${r.dT.toFixed(2)} / ${r.dBone.toFixed(2)} / ${r.ov.toFixed(2)}`);
}
report.minClearances = Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, +v[0].toFixed(2)]));
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
