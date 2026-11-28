// ============================================================================
//  Timeline (60 s, 30 fps). Every value is a pure function of time t (seconds), so playback,
//  scrubbing and frame-by-frame export always give the same frame.
//  01 hook (intrusion or proclination?) → 02 appliance design → 03 position A (proclination) →
//  04 second hook: the cantilevers are untied and moved distally → 05 position B (pure intrusion,
//  idealised) → 06 position C (retroclination) → 07 reciprocal effects on the anchor segments →
//  08 final comparison (three horizontal zones) → 09 brand outro.
//  V4: new narration («А вы знаете, как интрузировать нижние резцы, не изменяя их наклон?» …). The animation is
//  authored on the ANIMATION timeline (a = V3 seconds); the film plays it through WARP, a monotone piecewise-linear
//  map output time → animation time, so the spoken words land on their visual events. Word-synchronised events are
//  stored in animation time: W.x = toAnim(output time of the word).
// ============================================================================
import { VOICE } from './voice.js';
import { wordTime } from './words.js';
import { LANG } from './lang.js';
export { VOICE };

export const DURATION = 60;
export const FPS = 30;
export const OUTRO_T0 = 57.0;          // animation time (output 57.5 s)

// ---------------------------------------------------------------- output → animation time map (knots [out, anim])
export const WARP = [
  [0, 0], [9.5, 9.5],          // 01 hook + 02 appliance build (1:1)
  [12.5, 13.0],                // 02 macro / activation / tie (slightly faster)
  [13.4, 14.0],                // 03 frontal: both cantilevers tied at A
  [15.2, 16.5],                // 03 close-ups: free end at A, up-turned tip of the extension
  [21.3, 22.6], [21.6, 23.0],  // 03 sagittal: variant 1 (1:1)
  [25.2, 29.0],                // 04 re-tie A → B (faster)
  [32.6, 36.4], [33.0, 37.0],  // 05 variant 2 (1:1)
  [42.3, 46.0],                // 06 re-tie B → C + variant 3
  [45.8, 53.0],                // 07 reactive load on the anchor segments (faster)
  [57.5, 57.0],                // 08 comparison of all three (slow, under the last two lines)
  [60, 60],                    // 09 brand outro
];
const pw = (k0, k1) => (x) => {
  if (x <= WARP[0][k0]) return WARP[0][k1];
  for (let i = 1; i < WARP.length; i++) if (x <= WARP[i][k0]) {
    const a = WARP[i - 1], b = WARP[i]; return a[k1] + (b[k1] - a[k1]) * (x - a[k0]) / (b[k0] - a[k0]);
  }
  return WARP[WARP.length - 1][k1];
};
export const toAnim = pw(0, 1);        // output (film / audio) time → animation time
export const toOut = pw(1, 0);         // animation time → output time

export const SCENES = [            // output time
  { id: '01', name: 'Hook', t0: 0, t1: 4 },
  { id: '02', name: 'Appliance', t0: 4, t1: 12.5 },
  { id: '03', name: 'Variant 1 (A)', t0: 12.5, t1: 21.6 },
  { id: '04', name: 'Re-tie', t0: 21.6, t1: 24.3 },
  { id: '05', name: 'Variant 2 (B)', t0: 24.3, t1: 33.0 },
  { id: '06', name: 'Variant 3 (C)', t0: 33.0, t1: 42.3 },
  { id: '07', name: 'Reactions', t0: 42.3, t1: 45.8 },
  { id: '08', name: 'Comparison', t0: 45.8, t1: 57.5 },
  { id: '09', name: 'Outro', t0: 57.5, t1: 60 },
];

// Subtitle chunks [start, end, text] in ANIMATION time: each voice line split by character share, held 0.3 s after the speech
export const SUBS = VOICE.flatMap((v) => {
  const total = v.chunks.reduce((n, c) => n + c.length, 0);
  let t = v.start;
  return v.chunks.map((c, i) => {
    const d = v.speech * c.length / total;
    const cue = [toAnim(t), toAnim(i === v.chunks.length - 1 ? v.start + v.speech + 0.3 : t + d), c];
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
const EN_STEM = { 'интрузировать': 'intrude', 'наклон': 'inclination', 'линия': 'line', 'где': 'where', 'центра': 'center', 'сила': 'force',
  'впереди': 'front', 'него': 'it', 'возникает': ['incisors', 'arises'], 'тенденция': 'tend', 'вестибулярному': 'labially', 'через': 'through',
  'центр': 'center', 'получаем': 'get', 'преимущественно': 'predominantly', 'корпусную': 'bodily', 'что': 'what', 'сместить': 'shift',
  'позади': 'behind', 'противоположный': 'opposite', 'лингвальному': 'lingual', 'один': 'one', 'три': 'three', 'биомеханических': 'biomechanical',
  'контролировать': 'control', 'величину': 'magnitude', 'точку': 'point', 'направление': 'direction' };
const enStem = (line, stem) => { const e = EN_STEM[stem]; return Array.isArray(e) ? (line === 2 ? e[0] : e[1]) : e; };
const wa = (line, stem, nth = 0) => toAnim(wordTime(line, LANG === 'en' ? enStem(line, stem) : stem, nth)[0]);   // word onset in animation time
export const W = {
  // 01 hook / 02 appliance build: the V3 animation beats are kept as they are (animation time)
  tilt1: 0.905, fwd1: 1.462, down1: 3.261,
  four2: 4.4, unite2: 5.457, seg2: 6.397, intr2: 7.07, cant2: 8.591,
  intr1: wa(0, 'интрузировать'), tiltQ1: wa(0, 'наклон'),
  line2: wa(1, 'линия'), where2: wa(1, 'где'), cr2: wa(1, 'центра'),
  // 03 variant 1 — anterior to the CR
  line3: wa(2, 'сила'), ahead3: wa(2, 'впереди'), cr3: wa(2, 'него'), moment3: wa(2, 'возникает'), tilt3: wa(2, 'тенденция'),
  vest3: wa(2, 'вестибулярному'),
  // 04 re-tie (silent action, V3 beats)
  what4: 23.921, point4: 25.116,
  // 05 variant 2 — through the CR
  result5: wa(3, 'линия'), through5: wa(3, 'через'), centre5: wa(3, 'центр'), cond5: wa(3, 'получаем'),
  pred5: wa(3, 'преимущественно'), pure5: wa(3, 'корпусную'),
  // 06 variant 3 — posterior to the CR
  what6: wa(4, 'что'), shift6: wa(4, 'сместить'), further6: wa(4, 'позади'), opp6: wa(5, 'противоположный'),
  intr6: wa(5, 'возникает'), retro6: wa(5, 'лингвальному'),
  // 07 reactions (silent action, V3 beats)
  control7: 48.504, reactive7: 49.131, moments7: 49.979, anchor7: 50.547,
  // 08 comparison
  one8: wa(6, 'один'), three8: wa(6, 'три'), effects8: wa(6, 'биомеханических'),
  control9: wa(7, 'контролировать'), magn9: wa(7, 'величину'), point9: wa(7, 'точку'), dir9: wa(7, 'направление'),
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
  closeOcc: [14.75, 15.35],                     // occlusal close-up of the free end at A (terminal bend + ligature)
  closeVes: [15.95, 16.5],                      // vestibular close-up of the free end at A
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
  moveC: [W.opp6 + 0.7, 45.4],
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
  K(14.75, 14, 64, 112, [5.4, 12.6, 9.6]),                 // occlusal close-up of the free end at A (terminal bend + ligature)
  K(15.35, 20, 66, 106, [5.4, 12.6, 9.6], 30, 'lin'),
  K(15.95, 40, 5, 88, [7.0, 12.0, 9.8]),                   // vestibular close-up of the free end at A
  K(16.5, 36, 5, 92, [7.0, 12.0, 9.8], 30, 'lin'),
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
