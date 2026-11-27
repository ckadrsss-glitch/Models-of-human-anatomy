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
//                 arm vestibular and below the occlusal plane following the arch, hook over the anterior segment
//                 at the chosen tie point (point contact → one force; one-couple system).
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
  const y = V.cross(z, x);
  return { x, y, z };
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
  return fillet([mid, ...w], 0.7, 6);
}
/** arc-length position of each application point on each side (point 1: the midline, s = 0) */
export function pointParams(hdr) {
  const L = sideWire(hdr, 1), R = sideWire(hdr, -1), out = {};
  for (const k of ['1', '2', '3', '4', '5']) {
    const P = hdr.points[k];
    out[k] = k === '1' ? [0, 0] : [projLen(L, P[0]), projLen(R, P[1])];
  }
  return { L, R, s: out };
}
/** local (START) tie points for a fractional point index (1…5; e.g. 2.4 slides between 2 and 3) */
export function tieLocal(pp, k) {
  const k0 = Math.max(1, Math.min(5, Math.floor(k))), k1 = Math.min(5, k0 + 1), u = Math.min(1, Math.max(0, k - k0));
  const sL = pp.s[k0][0] + (pp.s[k1][0] - pp.s[k0][0]) * u, sR = pp.s[k0][1] + (pp.s[k1][1] - pp.s[k0][1]) * u;
  return [atLen(pp.L, sL), atLen(pp.R, sR)];
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
  return { c, m: fr.x, frame: fr, main };
}

// ---------------------------------------------------------------- component C: cantilever
/**
 * Radial clearance envelope of the lower dentition around the arch centre (built once from the meshes):
 * max radius of crown + bracket surfaces in the height band of the cantilever, per angle bin.
 * meshes: [{ pos: Float32Array, en: Uint8Array }] (arch frame); brackets: [[x, y, z], …] (outermost bracket points).
 */
export function buildEnvelope(meshes, brackets, C, y0 = 3, y1 = 13.5) {
  const a0 = -Math.PI, n = 1440, da = 2 * Math.PI / n, r = new Float32Array(n);
  const put = (x, z, rad) => { const a = Math.atan2(x - C[0], z - C[2]); const i = Math.floor((a - a0) / da) % n; if (rad > r[i]) r[i] = rad; };
  for (const m of meshes) {
    for (let i = 0; i < m.pos.length / 3; i++) {
      const y = m.pos[3 * i + 1]; if (y < y0 || y > y1) continue;
      const x = m.pos[3 * i], z = m.pos[3 * i + 2];
      put(x, z, Math.hypot(x - C[0], z - C[2]));
    }
  }
  for (const b of brackets) put(b[0], b[2], Math.hypot(b[0] - C[0], b[2] - C[2]));
  // dilate (wire half-width + clearance tolerance) and smooth
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let m = 0; for (let k = -10; k <= 10; k++) m = Math.max(m, r[(i + k + n) % n]); out[i] = m; }
  const sm = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0, w = 0; for (let k = -8; k <= 8; k++) { const g = Math.exp(-(k * k) / 18); s += out[(i + k + n) % n] * g; w += g; } sm[i] = Math.max(s / w, out[i]); }
  return { C, a0, da, n, r: sm };
}
export function envAt(env, a) { const i = Math.floor((a - env.a0) / env.da); return env.r[((i % env.n) + env.n) % env.n]; }

const beam = (x) => x * x * (3 - x) / 2;                         // cantilever beam deflection shape (free end)

/**
 * Cantilever centre line (world).
 *   tube: { c, m }  aux-tube lumen centre and mesial axis (world, current buccal-segment pose)
 *   tie:  tie point on the anterior wire (world, current incisor pose)
 *   env:  clearance envelope; opts: { act 0…1, delta0 (passive drop of the free end, mm), clear (mm),
 *          form: { arch, tip, hook } fabrication progress 0…1 (null = finished), grow 0…1 (straight wire draw-on),
 *          offset [x,y,z] (pre-insertion displacement), side ±1 }
 * Returns { pts, tags } — tags: 'tube' | 'bend' | 'arm' | 'hook'.
 */
export function cantilever(tube, tie, env, opts = {}) {
  const { act = 1, delta0 = 4.6, clear = 1.05, form = null, grow = 1, offset = [0, 0, 0], side = 1 } = opts;
  const C = env.C;
  const ang = (p) => Math.atan2(p[0] - C[0], p[2] - C[2]);
  const rad = (p) => Math.hypot(p[0] - C[0], p[2] - C[2]);
  const T = tube.c, mT = V.norm([tube.m[0], 0, tube.m[2]]);
  const STRAIGHT = 3.2;                                           // straight part from the tube exit to the tip-back bend
  const out = V.norm([tie[0] - C[0], 0, tie[2] - C[2]]);          // radial outward at the tie point
  const HOOK_R = 0.9;
  const end = V.add(tie, V.mul(out, HOOK_R));                     // the arm ends labial to the anterior wire; the hook curls over it
  // ---- planform: straight run along the tube axis, then the envelope radius (+ clearance), blended into the end radius
  const Tb = V.add(T, V.mul(mT, STRAIGHT));
  const aB = ang(Tb), aE = ang(end), rB = rad(Tb), rE = rad(end);
  const nA = 120, plan = [[T[0], T[2]]];
  const tubeExit = V.add(T, V.mul(mT, 1.4));
  plan.push([tubeExit[0], tubeExit[2]], [Tb[0], Tb[2]]);
  for (let i = 1; i <= nA; i++) {
    const u = i / nA, a = aB + (aE - aB) * u;
    const wB = Math.min(1, u / 0.12), wE = Math.min(1, (1 - u) / 0.085);
    const sB = wB * wB * (3 - 2 * wB), sE = wE * wE * (3 - 2 * wE);
    const rEnv = envAt(env, a) + clear;
    let r = Math.max(rEnv, rB + (rE - rB) * u);
    r = rB * (1 - sB) + r * sB;
    r = rE * (1 - sE) + r * sE;
    plan.push([C[0] + r * Math.sin(a), C[2] + r * Math.cos(a)]);
  }
  // planform segment lengths and headings (for the length-conserving arch-form morph during fabrication)
  const segL = [], head = [];
  for (let i = 1; i < plan.length; i++) {
    const dx = plan[i][0] - plan[i - 1][0], dz = plan[i][1] - plan[i - 1][1];
    segL.push(Math.hypot(dx, dz)); head.push(Math.atan2(dx, dz));
  }
  for (let i = 1; i < head.length; i++) { while (head[i] - head[i - 1] > Math.PI) head[i] -= 2 * Math.PI; while (head[i] - head[i - 1] < -Math.PI) head[i] += 2 * Math.PI; }
  const lam = form ? form.arch : 1;
  const P2 = [[T[0], T[2]]];
  for (let i = 0; i < segL.length; i++) {
    const h = head[0] + (head[i] - head[0]) * lam, p = P2[P2.length - 1];
    P2.push([p[0] + segL[i] * Math.sin(h), p[1] + segL[i] * Math.cos(h)]);
  }
  // cumulative arc length
  const S = [0]; for (let i = 0; i < segL.length; i++) S.push(S[i] + segL[i]);
  const Ltot = S[S.length - 1], sBend = S[2];
  // ---- vertical profile: tube level → tip-back bend → passive line to (end − delta0); activation lifts the arm (beam)
  const yT = T[1], yEndP = end[1] - delta0, tip = form ? form.tip : 1;
  const yAt = (s) => {
    if (s <= sBend) return yT;
    const x = (s - sBend) / (Ltot - sBend);
    const passive = yT + (yEndP - yT) * x;                         // straight passive arm after the tip-back bend
    return yT + (passive - yT) * tip + act * delta0 * beam(x) * tip;
  };
  const pts = [], tags = [];
  for (let i = 0; i < P2.length; i++) {
    const s = S[i];
    // vestibular stand-off: where the arm hangs below the tie level (passive), it lies further out in the vestibule
    const y = yAt(s), drop = Math.max(0, end[1] - y), xr = (s - sBend) / (Ltot - sBend);
    const wO = Math.min(1, Math.max(0, (xr - 0.35) / 0.35)), ro = 0.62 * drop * wO * wO * (3 - 2 * wO);
    const rd = V.norm([P2[i][0] - C[0], 0, P2[i][1] - C[2]]);
    pts.push([P2[i][0] + rd[0] * ro, y, P2[i][1] + rd[2] * ro]);
    tags.push(i <= 1 ? 'tube' : s <= sBend + 1.5 ? 'bend' : 'arm');
  }
  // ---- hook: arc in the plane (outward, up) around the anterior wire, from the labial side over the top
  const hk = form ? form.hook : 1;
  if (hk > 0.001) {
    const last = pts[pts.length - 1];
    const cen = V.sub(last, V.mul(out, HOOK_R));                    // = tie (current activation height)
    const sweep = 200 * hk, n = 16;
    for (let k = 1; k <= n; k++) {
      const a = (k / n) * sweep * Math.PI / 180;
      pts.push(V.add(cen, V.add(V.mul(out, HOOK_R * Math.cos(a)), [0, HOOK_R * Math.sin(a), 0])));
      tags.push('hook');
    }
  }
  // draw-on (straight wire appearing) and pre-insertion offset
  let res = pts;
  if (grow < 1) { const L = arcLen(pts) * Math.max(0.02, grow); const cut = []; let acc = 0; cut.push(pts[0]);
    for (let i = 1; i < pts.length; i++) { const l = V.len(V.sub(pts[i], pts[i - 1])); if (acc + l > L) { cut.push(V.lerp(pts[i - 1], pts[i], (L - acc) / l)); break; } acc += l; cut.push(pts[i]); }
    res = cut; }
  if (offset[0] || offset[1] || offset[2]) res = res.map((p) => V.add(p, offset));
  return { pts: res, tags: tags.slice(0, res.length), end, Ltot };
}

/** convenience: all tie points (world) for point k and an incisor pose */
export function tiesWorld(pp, k, pose) {
  const [L, R] = tieLocal(pp, k);
  return k <= 1.0001 ? [apply(pose, L), apply(pose, L)] : [apply(pose, L), apply(pose, R)];
}
