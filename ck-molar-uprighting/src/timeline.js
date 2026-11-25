// ============================================================================
//  Timeline (60 s, 30 fps). Every value is a pure function of time t (seconds), so
//  playback, scrubbing and frame-by-frame export always give the same frame.
//  Story: 01 the problem → 02 cantilever design → 03 insertion & activation →
//  04 force system → 05 the side effect → 06 controlled uprighting (skeletal anchorage)
//  → 07 final result + question → 08 CK BIOMECHANICS outro (brand kit, last 3 s).
// ============================================================================
import { VOICE } from './voice.js';
import { wordTime } from './words.js';
import { START, END_A, END_B, poseLerp } from './model.js';
export { VOICE };

export const DURATION = 60;
export const FPS = 30;
export const OUTRO_T0 = DURATION - 3;

export const SCENES = [
  { id: '01', name: 'Problem', t0: 0, t1: 5 },
  { id: '02', name: 'Design', t0: 5, t1: 14 },
  { id: '03', name: 'Activation', t0: 14, t1: 22 },
  { id: '04', name: 'Forces', t0: 22, t1: 32 },
  { id: '05', name: 'Side effect', t0: 32, t1: 40 },
  { id: '06', name: 'Control', t0: 40, t1: 51 },
  { id: '07', name: 'Result', t0: 51, t1: 57 },
  { id: '08', name: 'Outro', t0: 57, t1: 60 },
];

// Subtitle chunks [start, end, text]: each voice line split by character share, held 0.3 s after the speech
export const SUBS = VOICE.flatMap((v) => {
  const total = v.chunks.reduce((n, c) => n + c.length, 0);
  let t = v.start;
  return v.chunks.map((c, i) => {
    const d = v.speech * c.length / total;
    const cue = [t, i === v.chunks.length - 1 ? v.start + v.speech + 0.3 : t + d, c];
    t += d; return cue;
  });
});

// ---------------------------------------------------------------- helpers
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const easeInOut = (x) => { const t = clamp01(x); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
export const lerp = (a, b, t) => a + (b - a) * t;
export const ramp = (t, a, b, ease = easeInOut) => ease((t - a) / (b - a));
/** fade in over [a, a+fi], hold, fade out over [b-fo, b] */
export const win = (t, a, b, fi = 0.5, fo = 0.5) => Math.min(smooth((t - a) / fi), 1 - smooth((t - (b - fo)) / fo));

// ---------------------------------------------------------------- word-synchronised events (absolute s)
export const W = {
  occlusion: wordTime(0, 'окклюзию')[0],
  cantilever: wordTime(1, 'кантилевер')[0],
  activation: wordTime(2, 'активации')[0],
  system: wordTime(2, 'система')[0],
  moment: wordTime(2, 'момент')[0],
  upMoment: wordTime(3, 'выпрямляющим')[0],
  extrusive: wordTime(3, 'экструзивная')[0],
  intrusive: wordTime(3, 'интрузивная')[0],
  anchor: wordTime(3, 'опорный')[0],
  problem: wordTime(4, 'проблема')[0],
  vertical: wordTime(4, 'вертикальный')[0],
  interference: wordTime(4, 'интерференцию')[0],
  additional: wordTime(5, 'дополнительная')[0],
  skeletal: wordTime(5, 'интрузивная')[0],
  compensate: wordTime(5, 'компенсировать')[0],
  control: wordTime(5, 'контролировать')[0],
  trajectory: wordTime(5, 'траекторию')[0],
  important: wordTime(6, 'важно')[0],
  move: wordTime(6, 'двигаться')[0],
  question: wordTime(7, 'а')[0],
  extrusion: wordTime(7, 'экструзия')[0],
};

// ---------------------------------------------------------------- schedule
export const S = {
  hookUpright: [0.8, 2.5],            // 01: quick uprighting with extrusion
  hookClose: [2.35, 3.3],             // 01: antagonist closes → premature contact (on «окклюзию» 3.39 s)
  fab: {                              // 02: wire fabrication (in place, teeth hidden)
    straight: [5.25, 6.0], step: [6.05, 6.95], helix: [7.0, 8.45], arm: [8.5, 9.35], hook: [9.4, 10.3],
  },
  insert: [14.25, 15.25],             // 03: fixed end into the molar tube
  activate: [15.45, 16.95],           // 03: free arm lifted to the anchor segment (on «активации» 15.46)
  engage: 17.0,
  upA: [26.2, 31.8, 35.0],            // 04 → 05: uprighting with extrusion (0 → 0.9), slow motion 0.9 → 1 in 05
  anchorIntr: [27.6, 35.0],           // reciprocal intrusion of the anchor segment (small)
  close5: [36.6, 37.95],              // 05: antagonist closes → interference (on «интерференцию» 38.32)
  reset: [39.9, 40.9],                // 06: back to the start position
  screw: [41.0, 42.25],               // 06: miniscrew placement
  elastic: [42.3, 42.95],
  upB: [45.2, 50.2],                  // 06: controlled uprighting (on «контролировать» 45.03)
  close6: [50.0, 50.75],
};
export const ANCHOR_INTRUSION = 0.35;   // mm, schematic; not exaggerated

/** pose of 47 at time t → { pose, scen: 'A' | 'B', s (progress of the current uprighting) } */
export function pose47At(t) {
  if (t < 4.9) { const s = ramp(t, ...S.hookUpright); return { pose: poseLerp(START, END_A, s), scen: 'A', s }; }
  if (t < 26.2) return { pose: START, scen: 'A', s: 0 };
  if (t < 39.9) {
    const s = t < S.upA[1] ? 0.9 * ramp(t, S.upA[0], S.upA[1]) : 0.9 + 0.1 * ramp(t, S.upA[1], S.upA[2], easeOut);
    return { pose: poseLerp(START, END_A, s), scen: 'A', s };
  }
  if (t < 45.2) { const s = 1 - ramp(t, ...S.reset); return { pose: poseLerp(START, END_A, s), scen: s > 0.001 ? 'A' : 'B', s }; }
  const s = ramp(t, ...S.upB);
  return { pose: poseLerp(START, END_B, s), scen: 'B', s };
}
export function anchorIntrusionAt(t) {
  if (t < 26) return 0;
  if (t < 39.9) return ANCHOR_INTRUSION * ramp(t, ...S.anchorIntr);
  if (t < 45.2) return ANCHOR_INTRUSION * (1 - ramp(t, ...S.reset));
  return ANCHOR_INTRUSION * ramp(t, ...S.upB);      // the anchor segment still receives the reactive intrusive force
}

// upper antagonists: vertical offset (mm, + = open) and visibility
export const UPPER = { open: 3.8, stopA: 1.28, stopB: -0.42, mi: -0.6 };   // stops from tools/qa.mjs (first contact while closing)
export function upperAt(t) {
  let dy = UPPER.open, a = 0;
  if (t < 5) { a = 1 - smooth((t - 4.45) / 0.5); dy = lerp(UPPER.open, UPPER.stopA, ramp(t, ...S.hookClose, easeOut)); }
  else if (t >= 34.0 && t < 41) { a = win(t, 34.0, 40.6, 0.7, 0.6); dy = lerp(UPPER.open, UPPER.stopA, ramp(t, ...S.close5, easeOut)); if (t > 39.6) dy = lerp(UPPER.stopA, UPPER.open, ramp(t, 39.6, 40.3)); }
  else if (t >= 48.6) { a = smooth((t - 48.6) / 0.7) * (1 - smooth((t - 51.3) / 0.7)); dy = lerp(UPPER.open, UPPER.stopB, ramp(t, ...S.close6, easeOut)); }
  return { dy, a };
}

// ---------------------------------------------------------------- visibility of layers (0…1)
export const VIS = {
  lower: (t) => (t < 5 ? 1 - smooth((t - 4.55) / 0.45) : smooth((t - 13.75) / 0.8)),
  bone: (t) => (t < 5 ? 1 - smooth((t - 4.55) / 0.45) : smooth((t - 13.75) / 0.8)),
  boneClear: (t) => smooth((t - 21.8) / 1.0),                     // 0 = normal translucency, 1 = see-through (roots visible)
  pdl: (t) => win(t, 22.6, 39.9, 0.9, 0.6) + win(t, 44.6, 50.8, 0.6, 0.6) * 0.8,
  appliance: (t) => (t < 13.75 ? 0 : smooth((t - 13.75) / 0.8)) * (1 - 0.75 * smooth((t - 51.0) / 0.8)),
  cantilever: (t) => (t < 5.2 ? 0 : 1) * (1 - smooth((t - 51.0) / 0.7)),
  screw: (t) => (t < S.screw[0] - 0.4 ? 0 : smooth((t - S.screw[0] + 0.4) / 0.4)) * (1 - smooth((t - 51.0) / 0.7)),
  ghostStart: (t) => Math.max(win(t, 26.4, 39.7, 0.6, 0.6), win(t, 45.4, 57.2, 0.6, 0.5), win(t, 0.9, 4.6, 0.4, 0.4) * 0.8),
  ghostA: (t) => 1.7 * win(t, 51.2, 57.2, 0.7, 0.5),
  passiveGhost: (t) => win(t, 15.4, 21.5, 0.4, 0.8),
  red47: (t) => Math.max(win(t, 3.25, 4.75, 0.15, 0.4), win(t, 38.15, 39.8, 0.15, 0.5)),
};

// ---------------------------------------------------------------- camera
// Orbit camera around a target: az (deg, 0 = buccal view, + = towards mesial), el (deg, + = from occlusal),
// dist (mm), tgt (mm, segment frame), fov (deg). Keys 0.01 s apart = cut.
const K = (t, az, el, dist, tgt, fov = 30, ease = 'io') => ({ t, az, el, dist, tgt, fov, ease });
export const CAMERA = [
  K(0.0, -24, 6, 100, [6, 9, 1]),                     // first frame: mesially tipped 47 under its antagonist
  K(2.3, -13, 4, 112, [9, 10, 1]),
  K(4.95, -6, 3, 122, [11, 10, 2], 30, 'lin'),
  K(4.96, -4, 2, 120, [30, 3, 5], 30, 'lin'),          // cut (teeth hidden): the wire in space
  K(10.2, 10, 6, 112, [30, 3, 5]),
  K(11.9, 58, 20, 92, [26, 4, 5]),                  // mesio-occlusal: helix and hook in depth
  K(13.4, -34, 12, 104, [24, 4, 5]),
  K(14.4, -16, 7, 150, [18, 5, 2]),                   // insertion / activation (buccal three-quarter)
  K(17.6, -10, 4, 154, [18, 5, 2], 30, 'lin'),
  K(21.7, -6, 3, 158, [18, 4.5, 2], 30, 'lin'),
  K(23.2, 6, 1, 100, [6, 3, 0]),                      // translucent bone: roots, CR
  K(27.4, 9, 1, 152, [18, 4, 0]),                   // + anchor segment (reciprocal intrusion)
  K(31.8, 2, 0, 146, [16, 5, 0], 30, 'lin'),
  K(35.2, -7, -2, 168, [17, 9.5, 0]),                  // occlusal plane and antagonists
  K(39.8, -9, -2, 172, [17, 9.5, 0], 30, 'lin'),
  K(41.2, 30, 34, 112, [6, 4, 5]),                    // mesio-bucco-occlusal: the miniscrew in the buccal shelf
  K(44.8, 16, 16, 108, [6, 5, 3]),
  K(50.4, 0, 2, 136, [11, 8, 1]),
  K(51.6, -8, 3, 128, [6, 4.5, 0]),                    // comparison
  K(57.0, 10, 5, 134, [6, 4.5, 0], 30, 'lin'),
  K(60.0, 11, 5, 135, [6, 4.5, 0], 30, 'lin'),
];
const EASE = { io: easeInOut, out: easeOut, lin: (x) => clamp01(x) };
export function cameraAt(t) {
  const C = CAMERA;
  if (t <= C[0].t) return C[0];
  for (let i = 1; i < C.length; i++) {
    if (t <= C[i].t) {
      const a = C[i - 1], b = C[i], u = EASE[b.ease]((t - a.t) / (b.t - a.t));
      return { az: lerp(a.az, b.az, u), el: lerp(a.el, b.el, u), dist: Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), u)),
        tgt: [0, 1, 2].map((k) => lerp(a.tgt[k], b.tgt[k], u)), fov: lerp(a.fov, b.fov, u) };
    }
  }
  return C[C.length - 1];
}
