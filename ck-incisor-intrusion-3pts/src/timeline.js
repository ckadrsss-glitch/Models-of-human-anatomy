// ============================================================================
//  Timeline (60 s, 30 fps). Every value is a pure function of time t (seconds), so playback,
//  scrubbing and frame-by-frame export always give the same frame.
//  01 hook (intrusion or proclination?) → 02 appliance design → 03 position A (proclination) →
//  04 second hook: the cantilevers are untied and moved distally → 05 position B (pure intrusion,
//  idealised) → 06 position C (retroclination) → 07 reciprocal effects on the anchor segments →
//  08 final comparison (three horizontal zones) → 09 brand outro.
//  ONE FORCE · THREE POINTS · THREE OUTCOMES. All events are placed on the spoken words (src/words.js).
// ============================================================================
import { VOICE } from './voice.js';
import { wordTime } from './words.js';
export { VOICE };

export const DURATION = 60;
export const FPS = 30;
export const OUTRO_T0 = 57.0;

export const SCENES = [
  { id: '01', name: 'Hook', t0: 0, t1: 4 },
  { id: '02', name: 'Appliance', t0: 4, t1: 13 },
  { id: '03', name: 'Position A', t0: 13, t1: 23 },
  { id: '04', name: 'Re-tie', t0: 23, t1: 27 },
  { id: '05', name: 'Position B', t0: 27, t1: 37 },
  { id: '06', name: 'Position C', t0: 37, t1: 46 },
  { id: '07', name: 'Reactions', t0: 46, t1: 53 },
  { id: '08', name: 'Comparison', t0: 53, t1: 57 },
  { id: '09', name: 'Outro', t0: 57, t1: 60 },
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
  tilt1: wordTime(0, 'наклоняются')[0], fwd1: wordTime(0, 'вперёд')[0], down1: wordTime(0, 'вниз')[0],
  four2: wordTime(1, 'четыре')[0], unite2: wordTime(1, 'объединяем')[0], seg2: wordTime(1, 'сегмент')[0],
  intr2: wordTime(1, 'интрузивную')[0], cant2: wordTime(1, 'кантилеверами')[0],
  line3: wordTime(2, 'линия')[0], ahead3: wordTime(2, 'впереди')[0], cr3: wordTime(2, 'центра')[0],
  moment3: wordTime(2, 'момент')[0], tilt3: wordTime(2, 'наклоняющий')[0], vest3: wordTime(2, 'вестибулярно')[0],
  what4: wordTime(3, 'что')[0], point4: wordTime(3, 'точку')[0],
  result5: wordTime(4, 'результирующая')[0], through5: wordTime(4, 'через')[0], centre5: wordTime(4, 'центр')[0],
  cond5: wordTime(4, 'создаются')[0], pure5: wordTime(4, 'чистой')[0],
  shift6: wordTime(5, 'смещаем')[0], further6: wordTime(5, 'дальше')[0], opp6: wordTime(5, 'противоположный')[0],
  intr6: wordTime(5, 'интрузия')[0], retro6: wordTime(5, 'ретроклинацией')[0],
  control7: wordTime(6, 'контролировать')[0], reactive7: wordTime(6, 'реактивные')[0], moments7: wordTime(6, 'моменты')[0],
  anchor7: wordTime(6, 'опорных')[0],
  one8: wordTime(7, 'одна')[0], three8: wordTime(7, 'три')[0], point8: wordTime(7, 'точка')[0],
};

// ---------------------------------------------------------------- schedule
// Tie configuration index u: 0 = A (mesial, on the sectional wire), 1 = B (extension, CR level), 2 = C (distal).
export const S = {
  hook: [-1.1, 2.7],                    // 01: proclination with the intrusion (already under way on frame 0)
  // 02 appliance design
  incGlow: [W.four2 - 0.05, W.unite2 + 0.6],
  antWire: [W.unite2, W.unite2 + 0.75],         // gold sectional wire (draw-on)
  extension: [W.seg2, W.seg2 + 0.7],            // stepped distal extensions
  bucR: [W.intr2 - 0.05, W.intr2 + 0.5],        // right anchor segment 43–47
  bucL: [W.intr2 + 0.55, W.intr2 + 1.1],        // left anchor segment 33–37
  insert: [W.cant2, W.cant2 + 0.8],             // cantilevers slid into the auxiliary tubes 36 / 46
  macro: [9.5, 10.6],                           // close-up of the stepped extension
  activate: [10.75, 11.75],                     // free ends lifted to the anterior segment
  tie: 11.85,                                   // ligated at A
  vectors: 12.2,                                // F/2 + F/2 → F
  // 03 position A
  badgeA: 13.25,
  sagIn: [16.5, 17.8],
  moveA: [W.tilt3, 22.6],
  // 04 / 05 re-tie A → B
  resetA: [23.0, 23.6],
  untieB: [W.point4 - 0.05, W.point4 + 0.3],
  deactB: [W.point4 + 0.25, W.point4 + 0.7],
  slideB: [W.point4 + 0.75, 28.2],
  reactB: [28.3, 28.9],
  tieB: 29.0,
  moveB: [32.55, 35.9],
  // 06 re-tie B → C
  resetB: [37.0, 37.6],
  untieC: [37.75, 38.05],
  deactC: [38.0, 38.45],
  slideC: [W.shift6 + 0.05, W.further6 + 0.1],
  reactC: [W.further6 + 0.15, W.further6 + 0.65],
  tieC: W.further6 + 0.72,
  moveC: [W.opp6 + 0.7, 45.0],
  // 07 reactions (configuration B, start pose)
  cut7: 46.0,
  buccalTip: [W.moments7, 52.8],
  // 08 comparison
  final: [53.0, 54.7],
};
export const BUCCAL_TIP = { deg: 2.2, extr: 0.3 };    // illustrative magnitudes (not measured)

// ---------------------------------------------------------------- camera (orbit: az 0 = frontal, −90 = from the patient's right)
const K = (t, az, el, dist, tgt, fov = 30, ease = 'io') => ({ t, az, el, dist, tgt, fov, ease });
export const SAG = { az: -84, el: 4, dist: 128, tgt: [0, 5.0, 5.0] };            // sagittal analysis view
const sag = (t, ease = 'io', d = 0) => K(t, SAG.az, SAG.el, SAG.dist + d, SAG.tgt, 30, ease);
export const CAMERA = [
  K(0, -86, 4, 130, [0, 5.0, 5.0]), K(3.99, -82, 4, 124, [0, 5.0, 5.0], 30, 'lin'),
  K(4.0, 22, 20, 272, [0, 5, -12], 30, 'lin'),              // cut: whole lower arch, 3/4 frontal
  K(7.0, 10, 16, 262, [0, 5, -12]),
  K(8.4, -8, 24, 266, [0, 5, -12]),
  K(9.5, 0, 22, 262, [0, 5, -12]),
  K(10.55, 46, 3, 180, [13, 6, -4]),                       // macro: stepped extension (left), passive cantilever
  K(11.95, 42, 3, 172, [13, 6, -4]),
  K(12.95, 12, 10, 252, [0, 6, -9]),                        // both sides: F/2 + F/2
  K(14.0, 0, 6, 236, [0, 6, -8]),                           // 03: frontal — position A
  K(14.9, 0, 74, 250, [0, 8, -3]),                          // occlusal
  K(15.8, 30, 14, 150, [5, 9, 6]),                        // macro: hook over the sectional wire at A
  K(16.5, 26, 12, 144, [5, 9, 6], 30, 'lin'),
  sag(17.8),
  sag(23.6, 'lin'),
  K(24.9, -42, 20, 112, [-11, 8, 3]),                         // 04: close to the tie point (3/4, right side)
  K(25.9, -48, 18, 118, [-12, 8, 2]),
  sag(27.3),
  sag(37.0, 'lin'),
  K(38.4, -58, 20, 120, [-11, 6, -2]),                        // 06: 3/4 — the tie moves further distal
  sag(39.9),
  sag(46.0, 'lin'),
  K(46.0, -24, 24, 300, [-1, 4, -15], 30, 'lin'),           // cut: whole lower arch, both anchor segments
  K(53.0, -16, 22, 292, [-1, 4, -15], 30, 'lin'),
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
/** final comparison: three horizontal zones, identical camera, scale and start position */
export const ZONE = { y0: 282, h: 390 };
export const ZONE_CAM = { az: -86, el: 2, dist: 82, tgt: [0, 4.6, -12.0], fov: 30 };
export const split = (t) => t >= 53.0 && t < 60;

// ---------------------------------------------------------------- visibility (0…1)
const SAG_ON = [16.5, 46.0];
export const VIS = {
  sagittal: (t) => (t < 4 ? 1 : win(t, SAG_ON[0], SAG_ON[1], 1.0, 0.05)),       // buccal teeth fade, bone cropped
  boneClear: (t) => (t < 4 ? 1 : Math.max(win(t, SAG_ON[0], SAG_ON[1], 1.0, 0.05), 0.3 * win(t, 13.0, 16.6, 0.5, 0.4))),
  cantilever: (t) => (t < 4 ? 0 : t < S.insert[0] ? 0 : 1) * (1 - 0.62 * win(t, SAG_ON[0] + 0.6, SAG_ON[1], 0.6, 0.05)),
  disclaimer: (t) => win(t, 4.3, OUTRO_T0, 0.6, 0.5),
};
