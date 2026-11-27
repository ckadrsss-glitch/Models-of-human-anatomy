// ============================================================================
//  Appliance geometry of the three-piece mechanics (pure JS, arch frame, mm) — shared by the
//  player (src/film.js) and tools/qa.mjs.
//
//  Component A — buccal (anchor) segments 33–37 / 43–47: brackets 33 34 35, double tube on 36 / 46
//                 (main lumen: segment wire; auxiliary gingival lumen: cantilever), tube on 37 / 47,
//                 rigid SS .019 × .025 segment wire through all of them.
//  Component B — anterior segment 32 31 41 42: brackets, rigid SS .019 × .025 sectional wire with stepped
//                 distal extensions (built in tools/build_assets.py): out of the lateral bracket → apical step →
//                 distal run, labial to the canine and the mesial half of the first premolar, gingival to
//                 their brackets (NOT engaged in the canine brackets).
//  Component C — two TMA .017 × .025 cantilevers: fixed end in the auxiliary tube of 36 / 46, tip-back bend,
//                 arm vestibular and below the occlusal plane following the arch; the free end lies labially against
//                 the anterior wire at the chosen tie point and is LIGATED to it (point contact → one force; one-couple
//                 system). A small, smooth terminal bend of the wire itself towards occlusal, just mesial to the tie,
//                 keeps the ligature from slipping off the free end (no separate hook, no loop, no rigid fixation).
//  Wire sections are parameters of the demonstrated construction, not a universal protocol.
// ============================================================================
import { V, apply } from './model.js';

export const WIRE = {
  ss: { w: 0.64, h: 0.48 },        // .019 × .025 in: 0.025 labio-lingual (w), 0.019 occluso-gingival (h)
  tma: { w: 0.64, h: 0.43 },       // .017 × .025 in
};
export const BR_OFF = 1.55, TUBE_OFF = 1.75;
export const AUX = { down: 1.75, out: 0.35 };        // auxiliary lumen: gingival and slightly labial to the main lumen

// ---------------------------------------------------------------- frames
/** bracket/tube frame on a tooth: z = faN (outward), x = mesial direction (towards the midline along the arch), y = z × x */
export function toothFrame(m, mesial) {
  const z = V.norm(m.faN);
  let x = V.sub(mesial, V.mul(z, V.dot(mesial, z))); x = V.norm(x);
  let y = V.cross(z, x);
  // V5 fix: y must point OCCLUSALLY on both sides (on the patient's left the right-handed frame came out upside down,
  // which put the auxiliary tube of 36 occlusal instead of gingival to the main lumen). Rotate 180° about z there.
  if (y[1] < 0) { x = V.mul(x, -1); y = V.mul(y, -1); }
  return { x, y, z, mesial: V.norm(V.sub(mesial, V.mul(z, V.dot(mesial, z)))) };
}
export function mesialDir(hdr, fdi) {
  // along the arch towards the midline: from the distal neighbour's slot to the mesial neighbour's slot
  const q = fdi[0], k = +fdi[1], S = hdr.slots;
  const a = S[q + Math.min(7, k + 1)], b = k === 1 ? [0, S[fdi][1], S[fdi][2] + 0.5] : S[q + (k - 1)];
  const d = V.sub(b, a); d[1] = 0; return V.norm(d);
}

// ---------------------------------------------------------------- polylines
export function fillet(pts, r = 0.6, n = 6) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const la = V.len(V.sub(p, a)), lb = V.len(V.sub(b, p));
    const rr = Math.min(r, la * 0.45, lb * 0.45);
    const d1 = V.norm(V.sub(p, a)), d2 = V.norm(V.sub(b, p));
    if (V.dot(d1, d2) > 0.995) { out.push(p); continue; }
    const p0 = V.sub(p, V.mul(d1, rr)), p2 = V.add(p, V.mul(d2, rr));
    for (let k = 0; k <= n; k++) { const t = k / n; out.push(V.add(V.add(V.mul(p0, (1 - t) * (1 - t)), V.mul(p, 2 * t * (1 - t))), V.mul(p2, t * t))); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
export function resample(pts, n) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + V.len(V.sub(pts[i], pts[i - 1])));
  const tot = L[L.length - 1], out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = tot * i / (n - 1);
    while (j < L.length - 2 && L[j + 1] < s) j++;
    const u = (s - L[j]) / Math.max(1e-9, L[j + 1] - L[j]);
    out.push(V.lerp(pts[j], pts[j + 1], u));
  }
  return out;
}
export function arcLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += V.len(V.sub(pts[i], pts[i - 1])); return s; }
export function atLen(pts, s) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = V.len(V.sub(pts[i], pts[i - 1]));
    if (acc + l >= s || i === pts.length - 1) { const u = Math.min(1, Math.max(0, (s - acc) / Math.max(l, 1e-9))); return V.lerp(pts[i - 1], pts[i], u); }
    acc += l;
  }
  return pts[pts.length - 1];
}
function projLen(pts, p) {               // arc length of the closest polyline point to p
  let best = [1e9, 0], acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], ab = V.sub(b, a), l = V.len(ab);
    const u = Math.min(1, Math.max(0, V.dot(V.sub(p, a), ab) / (l * l || 1)));
    const q = V.add(a, V.mul(ab, u)), d = V.len(V.sub(p, q));
    if (d < best[0]) best = [d, acc + u * l];
    acc += l;
  }
  return best[1];
}

// ---------------------------------------------------------------- component B: anterior segment
/** filleted anterior wire (START pose, incisor-group local frame), right end → left end */
export function anteriorWire(hdr) { return fillet(hdr.wire.anterior, 0.7, 6); }
/** one side of the anterior wire from the midline outwards (for sliding tie points); side = +1 left, −1 right */
export function sideWire(hdr, side) {
  const w = side > 0 ? hdr.wire.left : hdr.wire.right;
  const mid = [0, (hdr.wire.left[0][1] + hdr.wire.right[0][1]) / 2, (hdr.wire.left[0][2] + hdr.wire.right[0][2]) / 2];
  const same = Math.abs(w[0][0]) < 1e-6;                    // V3: the halves start exactly at the midline point
  return fillet(same ? w : [mid, ...w], 0.7, 6);
}
/** arc-length position of each application point on each side (point 1: the midline, s = 0) */
export const TIE_KEYS = ['A', 'B', 'C'];
export function pointParams(hdr) {
  const L = sideWire(hdr, 1), R = sideWire(hdr, -1), out = {};
  for (const k of TIE_KEYS) { const P = hdr.points[k]; out[k] = [projLen(L, P[0]), projLen(R, P[1])]; }
  return { L, R, s: out };
}
/** local (START) tie points for a fractional configuration index u: 0 = A, 1 = B, 2 = C (e.g. 0.4 slides A → B
 *  along the wire: the hook of the cantilever is physically moved along the sectional wire / its extension) */
export function tieLocal(pp, u) {
  const k0 = Math.max(0, Math.min(1, Math.floor(u))), f = Math.min(1, Math.max(0, u - k0));
  const a = pp.s[TIE_KEYS[k0]], b = pp.s[TIE_KEYS[k0 + 1]];
  return [atLen(pp.L, a[0] + (b[0] - a[0]) * f), atLen(pp.R, a[1] + (b[1] - a[1]) * f)];
}

// ---------------------------------------------------------------- component A: buccal segments
export function buccalWire(hdr, q) {
  const S = hdr.slots, s3 = S[q + '3'], s7 = S[q + '7'];
  const d0 = V.norm(V.sub(s3, S[q + '4'])), d1 = V.norm(V.sub(s7, S[q + '6']));
  return [V.add(s3, V.mul(d0, 1.6)), s3, S[q + '4'], S[q + '5'], S[q + '6'], s7, V.add(s7, V.mul(d1, 1.2))];
}
/** auxiliary tube of 36 / 46: lumen centre and mesial axis (world, buccal segment at rest) */
export function auxTube(hdr, M, q) {
  const m = M['L' + q + '6'], fr = toothFrame(m, mesialDir(hdr, q + '6'));
  const main = V.add(m.fa, V.mul(fr.z, TUBE_OFF));
  const c = V.add(main, V.add(V.mul(fr.y, -AUX.down), V.mul(fr.z, AUX.out)));
  return { c, m: fr.mesial, frame: fr, main };
}

// ---------------------------------------------------------------- component B (V5): configuration-specific length
/** V5: the anterior sectional wire is cut for each alternative configuration — the distal extension ends ≈ 1 mm past
 *  the tie point it carries (A: a short run after the apical step), and each end is finished with a small occlusal
 *  up-bend (quarter circle + short rise). u: 0 = A, 1 = B, 2 = C (fractional: in between, for transitions). */
export const EXT_TIP = { r: 0.4, rise: 0.6, pastTie: 1.0, runA: 1.3 };
export function extensionCut(hdr, pp) {
  const out = [];
  for (const [side, W] of [[1, pp.L], [-1, pp.R]]) {
    const step = (side > 0 ? hdr.wire.left : hdr.wire.right)[hdr.wire.iRun + 1];
    const sStep = projLen(W, step);
    out.push([sStep + EXT_TIP.runA, pp.s.B[side > 0 ? 0 : 1] + EXT_TIP.pastTie, pp.s.C[side > 0 ? 0 : 1] + EXT_TIP.pastTie]);
  }
  return out;                                    // [[sA, sB, sC] left, [...] right] arc-length cut positions
}
export function sideWireCfg(hdr, pp, side, u, cuts = extensionCut(hdr, pp)) {
  const W = side > 0 ? pp.L : pp.R, c = cuts[side > 0 ? 0 : 1];
  const k0 = Math.max(0, Math.min(1, Math.floor(u))), f = Math.min(1, Math.max(0, u - k0));
  const sCut = c[k0] + (c[k0 + 1] - c[k0]) * f;
  const pts = [];
  let acc = 0; pts.push(W[0]);
  for (let i = 1; i < W.length; i++) {
    const l = V.len(V.sub(W[i], W[i - 1]));
    if (acc + l >= sCut) { pts.push(V.lerp(W[i - 1], W[i], (sCut - acc) / l)); break; }
    acc += l; pts.push(W[i]);
  }
  const e = pts[pts.length - 1], pv = atLen(W, Math.max(0, sCut - 0.5));
  const d = V.norm([e[0] - pv[0], 0, e[2] - pv[2]]), r = EXT_TIP.r;
  for (let k = 1; k <= 8; k++) { const a = (Math.PI / 2) * k / 8; pts.push(V.add(e, [d[0] * r * Math.sin(a), r * (1 - Math.cos(a)), d[2] * r * Math.sin(a)])); }
  const top = pts[pts.length - 1];
  for (let k = 1; k <= 3; k++) pts.push(V.add(top, [0, EXT_TIP.rise * k / 3, 0]));
  return pts;
}

// ---------------------------------------------------------------- component C: cantilever (V5)
/**
 * V5 clearance envelope: radial extent of every obstacle around the arch centre, per angle bin AND per height bin
 * (the arm now runs gingival to the brackets, so obstacles count only near the arm's own height).
 *   items: [{ pos: Float32Array | number[], pad: extra radial margin (mm) }]  (arch frame, rest pose)
 */
export function buildEnvelope(items, C, { y0 = -6, y1 = 18, dy = 0.5, n = 720 } = {}) {
  const a0 = -Math.PI, da = 2 * Math.PI / n, ny = Math.round((y1 - y0) / dy) + 1;
  const r = new Float32Array(n * ny);
  for (const it of items) {
    const P = it.pos, pad = it.pad || 0;
    for (let i = 0; i < P.length / 3; i++) {
      const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
      const j = Math.round((y - y0) / dy); if (j < 0 || j >= ny) continue;
      const a = Math.atan2(x - C[0], z - C[2]), k = ((Math.floor((a - a0) / da) % n) + n) % n;
      const rad = Math.hypot(x - C[0], z - C[2]) + pad;
      if (rad > r[k * ny + j]) r[k * ny + j] = rad;
    }
  }
  // angular dilation ±1.5° (fills gaps between sparse vertices)
  const out = new Float32Array(n * ny);
  for (let k = 0; k < n; k++) for (let j = 0; j < ny; j++) {
    let m = 0; for (let q = -3; q <= 3; q++) m = Math.max(m, r[(((k + q) % n) + n) % n * ny + j]); out[k * ny + j] = m;
  }
  return { C, a0, da, n, y0, dy, ny, r: out };
}
/** max obstacle radius at angle a within the height band [ya, yb] */
export function envAt(env, a, ya, yb) {
  const f = (a - env.a0) / env.da, i = Math.floor(f), w = f - i, n = env.n;
  const j0 = Math.max(0, Math.floor((ya - env.y0) / env.dy)), j1 = Math.min(env.ny - 1, Math.ceil((yb - env.y0) / env.dy));
  let m0 = 0, m1 = 0; const k0 = ((i % n) + n) % n, k1 = (((i + 1) % n) + n) % n;
  for (let j = j0; j <= j1; j++) { m0 = Math.max(m0, env.r[k0 * env.ny + j]); m1 = Math.max(m1, env.r[k1 * env.ny + j]); }
  return m0 * (1 - w) + m1 * w;
}
/** bracket boxes (rest pose) for the cantilever height limits: slot centre, occluso-gingival bottom, mesio-distal half width */
export function bracketBoxes(hdr) {
  const out = [];
  for (const q of ['3', '4']) {
    for (const k of ['1', '2']) out.push({ fdi: q + k, inc: true, p: hdr.slots[q + k], bot: 1.54, half: 1.24 });
    for (const k of ['3', '4', '5']) out.push({ fdi: q + k, inc: false, p: hdr.slots[q + k], bot: 1.67, half: 1.55 });
  }
  return out;
}

const beam = (x) => x * x * (3 - x) / 2;                         // cantilever beam deflection shape (free end)
const sstep = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
/** hook formed from the cantilever wire itself (mm, in the plane through the tie point ⟂ to the anterior wire):
 *  short occlusal up-bend → straight leg labial to the anterior wire → rounded corner → flat crown resting on the
 *  occlusal surface of the anterior wire (point contact: intrusive force only) → rounded corner → short lingual lip.
 *  Free play of 0.08 mm at both sides of the 0.64 × 0.48 wire → no clamping, no couple through the joint.
 *  lab: leg offset from the wire centre; rc: centre-line corner radius; top: crown centre line above the wire centre;
 *  lip: lowest point of the lingual lip above the wire centre. */
export const HOOK = { lab: 0.72, rc: 0.36, top: 0.56, lip: 0.09, bendR: 0.5, minLeg: 0.5 };
HOOK.drop = -(HOOK.top - HOOK.rc) + HOOK.bendR + HOOK.minLeg;    // arm level below the wire centre for the shortest leg
export const END = { lab: HOOK.lab };                            // (compat)
export const ARM = { ceilGap: 0.45, half: 0.215, unhook: 1.55, lift: 0.25, molarRise: 0.9 };

/**
 * Cantilever centre line (world).
 *   tube: { c, m }  auxiliary-tube lumen centre and mesial axis (current buccal-segment pose)
 *   tie:  application point on the anterior wire (current incisor pose); tieDir: mesial direction of that wire
 *   env:  clearance envelope (buildEnvelope); brackets: [{ p, bot, half }] in the CURRENT pose (height limits)
 *   opts: act 0 (passive) … 1 (engaged), delta0 (passive drop of the free end), yLow (arm level along the buccal
 *         segment: the extension level − HOOK.drop), grow, offset
 * Engaged shape  = design shape + δ·(beam(x) − x)   (elastic bending, zero at both ends);
 * Passive shape  = design shape − δ·x               (the permanent tip-back bend: straight rotation about the step).
 * Activation: the free end is lifted (beam) with a small overshoot while held labially, moved over the anterior wire
 * and seated on it (act 0.7 → 0.85 → 1).
 * Returns { pts, tags ('tube' | 'step' | 'arm' | 'hook'), iEnd (hook crown = contact), contact, Ltot, yArmEnd }.
 */
export function cantilever(tube, tie, env, opts = {}) {
  const { act = 1, delta0 = 4.6, grow = 1, offset = [0, 0, 0], tieDir = null, brackets = [], dyTie = 0, wirePts = null } = opts;
  const C = env.C;
  const ang = (p) => Math.atan2(p[0] - C[0], p[2] - C[2]);
  const rad = (p) => Math.hypot(p[0] - C[0], p[2] - C[2]);
  const T = tube.c, mT = V.norm([tube.m[0], 0, tube.m[2]]), yT = T[1];
  let mD = tieDir ? V.norm([tieDir[0], 0, tieDir[2]]) : null;
  const radial = V.norm([tie[0] - C[0], 0, tie[2] - C[2]]);
  if (!mD) { mD = V.norm(V.cross(radial, [0, 1, 0])); if (V.dot(mD, [-tie[0], 0, 0]) < 0) mD = V.mul(mD, -1); }
  let o = V.norm(V.cross([0, 1, 0], mD)); if (V.dot(o, radial) < 0) o = V.mul(o, -1);
  const tieR = [tie[0], tie[1] - dyTie, tie[2]];                // tie at its START height (the design is made there)
  const H = HOOK, yHB = tieR[1] - H.drop, y0 = opts.yLow != null ? Math.min(opts.yLow, yHB + 50) : yHB;
  // ---- activation phases
  const ab = Math.min(1, act / 0.7);                                          // beam activation
  const lift = ARM.lift * (act <= 0.7 ? sstep(act / 0.7) : act <= 0.85 ? 1 : 1 - sstep((act - 0.85) / 0.15));
  const offO = ARM.unhook * (act <= 0.7 ? 1 : 1 - sstep((act - 0.7) / 0.15));
  // ---- straight part along the tube axis: inside the tube, exit, apical STEP right after the exit
  const H_IN = -2.3, H_EXIT = 1.8, H_S0 = 2.3, H_S1 = 4.1, H_B = 4.5;
  const Tb = V.add(T, V.mul(mT, H_B));
  const Pend = V.add(V.add(tie, V.mul(o, H.lab)), V.mul(mD, -H.bendR));         // planform end: start of the up-bend
  const aB = ang(Tb), aE = ang(Pend), rB = rad(Tb), rE = rad(Pend);
  const nA = 150;
  // ---- ceilings (bracket bottoms − clearance) along the arm angles
  const bAng = brackets.map((b) => ({ a: ang(b.p), span: (b.half + 0.25) / rad(b.p), y: b.p[1] - b.bot - ARM.half - ARM.ceilGap }));
  const ceil = [];
  for (let i = 0; i <= nA; i++) {
    const a = aB + (aE - aB) * i / nA; let c = 1e3;
    for (const b of bAng) if (Math.abs(a - b.a) < b.span) c = Math.min(c, b.y);
    ceil.push(c);
  }
  // planform builder for a radius profile
  const planOf = (rr) => {
    const P = [];
    for (let i = 0; i <= nA; i++) { const a = aB + (aE - aB) * i / nA; P.push([C[0] + rr[i] * Math.sin(a), C[2] + rr[i] * Math.cos(a)]); }
    const S = [0]; for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    return { P, S };
  };
  // vertical design along the arm (arc length s from Tb): flat at y0, rising towards the hook base where needed,
  // never above the smoothed lower envelope of the bracket ceilings
  const heights = (S) => {
    const L = S[S.length - 1], ds = L / nA, kw = Math.max(1, Math.round(1.6 / ds));
    // smooth lower envelope of the ceilings: Gaussian (±2σ) of a min-filter widened by 2σ → smooth and ≤ the ceiling
    const cap = Math.max(yHB, y0) + 3, sg = Math.max(1, Math.round(0.9 / ds)), kw2 = kw + 2 * sg;
    const cfw = ceil.map((_, i) => { let m = cap; for (let k = -kw2; k <= kw2; k++) m = Math.min(m, ceil[Math.min(nA, Math.max(0, i + k))]); return m; });
    const cs = cfw.map((_, i) => { let s = 0, w = 0; for (let k = -2 * sg; k <= 2 * sg; k++) { const g = Math.exp(-(k * k) / (2 * sg * sg)); s += cfw[Math.min(nA, Math.max(0, i + k))] * g; w += g; } return s / w; });
    // near the molar the arm starts a little higher (gingival clearance at the first molar) and descends gently
    const smin = (a, b, k = 0.35) => -k * Math.log(Math.exp(-a / k) + Math.exp(-b / k));   // smooth minimum (≤ min)
    const design = S.map((s, i) => { const mr = ARM.molarRise * (1 - sstep(s / 12));
      return smin(smin(y0 + mr + (yHB - y0) * sstep((s - (L - 8.2)) / 7.6), cs[i]), yHB + mr + 0.6); });
    // engaged / passive / current
    const cur = [], lo = [], hi = [];
    for (let i = 0; i <= nA; i++) {
      const x = S[i] / L, d = design[i];
      cur.push(d - delta0 * x + ab * delta0 * beam(x) + (lift + dyTie) * beam(x));
      lo.push(d - delta0 * x + Math.min(0, dyTie) * beam(x)); hi.push(d + (lift + ARM.lift + Math.max(0, dyTie)) * beam(x));
    }
    return { design, cur, lo, hi, L };
  };
  // the anterior sectional wire in its CURRENT pose / cut (moves with the incisors): an extra radial obstacle
  const WP = wirePts ? wirePts.map((p) => [ang(p), p[1], rad(p) + WIRE.ss.w / 2 + WIRE.tma.w / 2 + 0.12]) : [];
  const wireR = (a, ya, yb) => { let m = 0; for (const w of WP) if (Math.abs(w[0] - a) < 0.03 && w[1] >= ya - 0.5 && w[1] <= yb + 0.5) m = Math.max(m, w[2]); return m; };
  // pass 1: provisional planform (straight radius blend), pass 2: radius from the height-aware envelope
  let rr = Array.from({ length: nA + 1 }, (_, i) => rB + (rE - rB) * i / nA);
  let pl = planOf(rr), hv = heights(pl.S);
  for (let pass = 0; pass < 2; pass++) {
    const raw = [];
    for (let i = 0; i <= nA; i++) {
      const a = aB + (aE - aB) * i / nA;
      const ya = Math.min(hv.lo[i], hv.cur[i]) - 0.7, yb = Math.max(hv.hi[i], hv.cur[i]) + 0.7;
      raw.push(Math.max(envAt(env, a, ya, yb), wireR(a, ya, yb), rB + (rE - rB) * i / nA - 4));
    }
    // drape a smooth curve over the obstacles (string-like relaxation, never inside an obstacle), ends held at the
    // tube axis (rB) and at the hook (rE); the last 4 % (the approach to the hook) is free of the bound
    // the bound relaxes towards the hook over the last 18 % (there the obstacle is the anterior wire the hook straddles)
    const sgR = 5, kwR = 4 + 2 * sgR;                                         // smooth upper envelope of the obstacles (≥ raw)
    const rmx = raw.map((_, i) => { let m = -Infinity; for (let k = -kwR; k <= kwR; k++) m = Math.max(m, raw[Math.min(nA, Math.max(0, i + k))]); return m; });
    const rsm = rmx.map((_, i) => { let s = 0, w = 0; for (let k = -2 * sgR; k <= 2 * sgR; k++) { const g = Math.exp(-(k * k) / (2 * sgR * sgR)); s += rmx[Math.min(nA, Math.max(0, i + k))] * g; w += g; } return s / w; });
    const lb = rsm.map((r, i) => { const u = i / nA, w = sstep((u - 0.82) / 0.18); if (u >= 0.999) return -Infinity; let v = r > rE ? r + (rE - r) * w : r; const w0 = sstep(u / 0.18); return v > rB ? rB + (v - rB) * w0 : v; });
    let cur = raw.map((r, i) => { const u = i / nA, w = sstep(Math.min(1, u / 0.2)) * sstep(Math.min(1, (1 - u) / 0.16));
      return Math.max(rB + (rE - rB) * u, w > 0.5 ? r : -Infinity, lb[i]); });
    cur[0] = rB; cur[nA] = rE;
    for (let it = 0; it < 260; it++) {
      const nx = cur.slice();
      for (let i = 1; i < nA; i++) nx[i] = Math.max(0.25 * cur[i - 1] + 0.5 * cur[i] + 0.25 * cur[i + 1], lb[i]);
      cur = nx;
    }
    // straight start along the tube axis: hold the first samples on the tube-axis radius profile
    rr = cur.map((v, i) => { const w = sstep(Math.min(1, (i / nA) / 0.12)); return rB * (1 - w) + v * w; });
    // final smoothing (odd reflection at both ends keeps rB / rE and the end tangents) + smooth make-up of any deficit
    const g4 = (f, sg) => f.map((_, i) => { let s = 0, w = 0; for (let k = -3 * sg; k <= 3 * sg; k++) { const j = i + k, g = Math.exp(-(k * k) / (2 * sg * sg));
      const v = j < 0 ? 2 * f[0] - f[-j] : j > nA ? 2 * f[nA] - f[2 * nA - j] : f[j]; s += v * g; w += g; } return s / w; });
    const gR = g4(rr, 4);
    const def = gR.map((v, i) => Math.max(0, lb[i] - v));
    const defM = def.map((_, i) => { let m = 0; for (let k = -8; k <= 8; k++) m = Math.max(m, def[Math.min(nA, Math.max(0, i + k))]); return m; });
    const defS = defM.map((_, i) => { let s = 0, w = 0; for (let k = -12; k <= 12; k++) { const g = Math.exp(-(k * k) / 32); s += defM[Math.min(nA, Math.max(0, i + k))] * g; w += g; } return s / w; });
    rr = gR.map((v, i) => v + defS[i] * (i === 0 || i === nA ? 0 : 1));
    if (opts.debug) opts.debug.push({ raw: raw.slice(), lb: lb.slice(), rr: rr.slice() });
    pl = planOf(rr); hv = heights(pl.S);
  }
  // ---- assemble: straight tube part with the step, the arm, the hook
  const pts = [], tags = [];
  const yD0 = hv.cur[0];
  for (let h = H_IN; h < H_B - 1e-6; h += 0.2) {
    const w = (h - H_S0) / (H_S1 - H_S0), y = h <= H_S0 ? yT : h >= H_S1 ? yD0 : yT + (yD0 - yT) * (1 - Math.cos(Math.PI * w)) / 2;
    const p = V.add(T, V.mul(mT, h)); pts.push([p[0], y, p[2]]); tags.push(h <= H_EXIT ? 'tube' : 'step');
  }
  const L = hv.L;
  // the last ≈3 mm of the arm runs straight along the anterior wire into the hook's up-bend (tangent-continuous)
  { const K = Math.max(6, Math.round(3.0 / (L / nA)));
    for (let i = nA - K; i <= nA; i++) { const d = pl.S[nA] - pl.S[i], w = sstep((i - (nA - K)) / K);
      pl.P[i] = [pl.P[i][0] * (1 - w) + (Pend[0] - mD[0] * d) * w, pl.P[i][1] * (1 - w) + (Pend[2] - mD[2] * d) * w]; } }
  for (let i = 0; i <= nA; i++) {
    const x = pl.S[i] / L, wo = offO * sstep((x - 0.72) / 0.28);
    pts.push([pl.P[i][0] + o[0] * wo, hv.cur[i], pl.P[i][1] + o[2] * wo]); tags.push(i === 0 ? 'step' : 'arm');
  }
  const yArmEnd = hv.cur[nA];
  const shift = [o[0] * offO, yArmEnd - hv.design[nA], o[2] * offO];          // rigid displacement of the hook
  const base = [Pend[0], hv.design[nA], Pend[2]];
  const yCorner = tieR[1] + H.top - H.rc;                                       // centre height of the two corners
  const hk = [];
  for (let k = 1; k <= 8; k++) { const a = (Math.PI / 2) * k / 8; hk.push(V.add(base, [mD[0] * H.bendR * Math.sin(a), H.bendR * (1 - Math.cos(a)), mD[2] * H.bendR * Math.sin(a)])); }
  const legBot = hk[hk.length - 1], nLeg = Math.max(1, Math.round((yCorner - legBot[1]) / 0.3));
  for (let k = 1; k <= nLeg; k++) hk.push([legBot[0], legBot[1] + (yCorner - legBot[1]) * k / nLeg, legBot[2]]);
  const at = (oo, yy) => [tie[0] + o[0] * oo, yy, tie[2] + o[2] * oo];   // (y given at the START height)
  const cx = H.lab - H.rc;
  for (let k = 1; k <= 6; k++) { const th = (Math.PI / 2) * k / 6; hk.push(at(cx + H.rc * Math.cos(th), yCorner + H.rc * Math.sin(th))); }
  let iCrown = 0;
  for (let k = 1; k <= 4; k++) { hk.push(at(cx - 2 * cx * k / 4, tieR[1] + H.top)); if (k === 2) iCrown = hk.length - 1; }
  for (let k = 1; k <= 6; k++) { const th = Math.PI / 2 + (Math.PI / 2) * k / 6; hk.push(at(-cx + H.rc * Math.cos(th), yCorner + H.rc * Math.sin(th))); }
  hk.push(at(-H.lab, tieR[1] + H.lip));
  const Cc = [tie[0], tieR[1] + H.top, tie[2]];
  const i0 = pts.length;
  for (const p of hk) { pts.push(V.add(p, shift)); tags.push('hook'); }
  const iEnd = i0 + iCrown;
  let res = pts;
  if (grow < 1) { const Lg = arcLen(pts) * Math.max(0.02, grow); const cut = []; let acc = 0; cut.push(pts[0]);
    for (let i = 1; i < pts.length; i++) { const l = V.len(V.sub(pts[i], pts[i - 1])); if (acc + l > Lg) { cut.push(V.lerp(pts[i - 1], pts[i], (Lg - acc) / l)); break; } acc += l; cut.push(pts[i]); }
    res = cut; }
  if (offset[0] || offset[1] || offset[2]) res = res.map((p) => V.add(p, offset));
  const contact = V.add(V.add(Cc, [0, -WIRE.tma.w / 2, 0]), shift);
  return { pts: res, tags: tags.slice(0, res.length), end: pts[iEnd], contact, Ltot: L, iEnd: Math.min(iEnd, res.length - 1), yArmEnd, design: hv.design, o, mD };
}

/** mesial direction along the anterior wire at the tie points (local, horizontal, towards the midline) */
export function tieDirLocal(pp, u) {
  const k0 = Math.max(0, Math.min(1, Math.floor(u))), f = Math.min(1, Math.max(0, u - k0));
  const a = pp.s[TIE_KEYS[k0]], b = pp.s[TIE_KEYS[k0 + 1]];
  return [0, 1].map((i) => { const W = i ? pp.R : pp.L, sl = a[i] + (b[i] - a[i]) * f;
    const d = V.sub(atLen(W, Math.max(0, sl - 0.6)), atLen(W, sl + 0.6)); d[1] = 0; return V.norm(d); });
}
/** convenience: both tie points (world) for configuration index u and an incisor pose */
export function tiesWorld(pp, u, pose) {
  const [L, R] = tieLocal(pp, u);
  return [apply(pose, L), apply(pose, R)];
}

/** V5: the obstacle set of the cantilever arm (rest pose) → buildEnvelope.
 *  raw: { name: { pos } } meshes (lower teeth + 'bone'); radial pads = wire half-width + clearance (bone: + gingiva) */
export function cantileverEnvelope(hdr, M, raw) {
  const items = [];
  for (const n of Object.keys(raw)) {
    if (n[0] === 'L') items.push({ pos: raw[n].pos, pad: WIRE.tma.w / 2 + 0.5 });
    if (n === 'bone') items.push({ pos: raw[n].pos, pad: WIRE.tma.w / 2 + 0.5 + 1.0 });   // + ≈1 mm attached gingiva
  }
  // brackets: box samples (wings included)
  const br = [];
  for (const n of Object.keys(M).filter((k) => k[0] === 'L')) {
    const fdi = n.slice(1), k = +fdi[1]; if (k > 5) continue;
    const m = M[n], f = toothFrame(m, mesialDir(hdr, fdi)), w = k <= 2 ? 2.5 : 3.1, h = k <= 2 ? 3.08 : 3.34;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) for (let q = 0; q <= 3; q++)
      br.push(...V.add(m.fa, V.add(V.mul(f.x, (i / 8 - 0.5) * w), V.add(V.mul(f.y, (j / 8 - 0.5) * h), V.mul(f.z, 2.45 * q / 3)))));
  }
  items.push({ pos: br, pad: WIRE.tma.w / 2 + 0.4 });
  // anterior wire blank (full length, both sides)
  const wp = [];
  for (const s of [1, -1]) for (const p of resample(sideWire(hdr, s), 400)) wp.push(...p);
  items.push({ pos: wp, pad: WIRE.ss.w / 2 + WIRE.tma.w / 2 + 0.12 });
  return buildEnvelope(items, hdr.archCentre);
}
