// ============================================================================
//  Timeline (60 s, 30 fps). Every value is a pure function of time t (seconds), so playback,
//  scrubbing and frame-by-frame export always give the same frame.
//  01 triple hook (split screen) → 02 segmented arch → 03 cantilever design → 04 five application
//  points + CR → 05 intrusion + proclination → 06 second hook / pure intrusion → 07 intrusion +
//  retroclination → 08 reciprocal side effects → 09 final comparison (split screen) → 10 brand outro.
//  All events are placed on the spoken words (src/words.js, ElevenLabs Scribe).
// ============================================================================
import { VOICE } from './voice.js';
import { wordTime } from './words.js';
export { VOICE };

export const DURATION = 60;
export const FPS = 30;
export const OUTRO_T0 = 57.2;

export const SCENES = [
  { id: '01', name: 'Hook', t0: 0, t1: 5.2 },
  { id: '02', name: 'Segments', t0: 5.2, t1: 10.2 },
  { id: '03', name: 'Cantilevers', t0: 10.2, t1: 18.8 },
  { id: '04', name: '5 points', t0: 18.8, t1: 25.1 },
  { id: '05', name: 'Proclination', t0: 25.1, t1: 31.6 },
  { id: '06', name: 'Pure intrusion', t0: 31.6, t1: 41.4 },
  { id: '07', name: 'Retroclination', t0: 41.4, t1: 48.3 },
  { id: '08', name: 'Reactions', t0: 48.3, t1: 53.4 },
  { id: '09', name: 'Comparison', t0: 53.4, t1: 57.2 },
  { id: '10', name: 'Outro', t0: 57.2, t1: 60 },
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
  sila0: wordTime(0, 'сила')[0], five: wordTime(0, 'пять')[0], three: wordTime(0, 'три')[0],
  segm: wordTime(1, 'сегментарной')[0], four: wordTime(1, 'четыре')[0], rezca: wordTime(1, 'резца')[0],
  unite: wordTime(1, 'объединяются')[0], rigid: wordTime(1, 'жёсткий')[0],
  cant: wordTime(2, 'кантилевера')[0], intrForce: wordTime(2, 'интрузивную')[0], direction: wordTime(2, 'направление')[0],
  part: wordTime(2, 'часть')[0],
  passes4: wordTime(3, 'проходит')[0], line4: wordTime(3, 'линия')[0], cr4: wordTime(3, 'центра')[0],
  ahead: wordTime(4, 'впереди')[0], intr5: wordTime(4, 'интрузией')[0], vest: wordTime(4, 'вестибулярный')[0],
  what: wordTime(5, 'а')[0], point6: wordTime(5, 'точку')[0],
  result7: wordTime(6, 'результирующая')[0], through: wordTime(6, 'через')[0], centre7: wordTime(6, 'центр')[0],
  conditions: wordTime(6, 'создаются')[0], pure: wordTime(6, 'чистой')[0],
  line8: wordTime(7, 'линия')[0], behind: wordTime(7, 'позади')[0], opposite: wordTime(7, 'противоположный')[0],
  intr8: wordTime(7, 'интрузия')[0], retro: wordTime(7, 'ретроклинацией')[0],
  control9: wordTime(8, 'контролировать')[0], reactive: wordTime(8, 'реактивные')[0], moments9: wordTime(8, 'моменты')[0],
  anchor9: wordTime(8, 'опоре')[0],
  one10: wordTime(9, 'одна')[0], three10: wordTime(9, 'три')[0], bio10: wordTime(9, 'биомеханика')[0],
};

// ---------------------------------------------------------------- schedule
export const S = {
  hookMove: [0.45, 3.7],                 // 01: the three outcomes, simultaneously
  upperFade: [6.0, 7.0],                 // 02: upper dentition becomes transparent
  incGlow: [W.rezca - 0.6, W.rigid + 0.9],
  buccalWire: [6.9, 7.55],               // 02: rigid buccal segments
  antWire: [W.unite - 0.05, W.unite + 0.75],  // 02: anterior sectional wire
  extension: [8.45, 9.25],               // 02: stepped distal extensions
  segLabels: [9.0, 10.15],
  fab: { grow: [10.35, 10.9], tip: [10.95, 11.5], arch: [11.55, 12.25], hook: [12.3, 12.78] },   // 03: one cantilever
  mirror: [12.8, 13.3],                  // 03: symmetric copy
  insert: [13.3, 13.85],                 // 03: into the auxiliary tubes of 36 / 46
  activate: [13.95, W.intrForce - 0.02], // 03: free ends lifted to the anterior segment
  tie: W.intrForce - 0.0,
  points: [19.45, 19.8, 20.15, 20.5, 20.85],          // 04: points 1…5 appear (occlusal view)
  crIn: W.cr4,
  hl123: [25.35, 25.8, 26.25],          // 05: points 1, 2, 3 highlighted in turn
  move5: [W.intr5 + 0.1, 30.95],        // 05: intrusion + proclination (point 2)
  reset6: [31.6, 32.3],
  slide4: [W.point6 + 1.45, 36.65],     // 06: tie points slide 2 → 4 (after the question)
  move6: [38.6, 41.0],                  // 06: pure intrusion (point 4)
  reset7: [41.4, 41.9],
  slide5: [42.2, W.behind],             // 07: 4 → 5, the line passes behind the CR on «позади»
  move7: [W.opposite + 0.95, 48.0],     // 07: intrusion + retroclination (point 5)
  back8: [48.3, 49.3],                  // 08: back to the pure-intrusion configuration
  buccalTip: [W.moments9, 53.2],        // 08: possible reactive tipping of the buccal segments
  final: [53.4, 54.0],                  // 09: comparison
};
export const BUCCAL_TIP = { deg: 2.2, extr: 0.3 };    // illustrative magnitudes (not measured)

// ---------------------------------------------------------------- camera (orbit: az 0 = frontal, −90 = from the patient's right)
const K = (t, az, el, dist, tgt, fov = 30, ease = 'io') => ({ t, az, el, dist, tgt, fov, ease });
export const CAMERA = [
  K(5.2, 0, 4, 236, [0, 6.5, -8]),
  K(10.18, 0, 6, 214, [0, 6.5, -8], 30, 'lin'),
  K(10.2, 62, 16, 132, [16, 15, -5], 30, 'lin'),          // cut: macro of the fabrication (left side)
  K(12.75, 50, 14, 124, [16, 15, -5]),
  K(13.35, 20, 14, 226, [0, 6.5, -10]),                  // both sides
  K(14.6, 14, 10, 214, [0, 7, -9]),
  K(16.6, 7, 8, 208, [0, 7, -9]),
  K(19.6, 0, 6, 214, [0, 7, -9]),
  K(21.0, 0, 76, 222, [0, 8, -8]),                       // occlusal
  K(21.95, 0, 78, 216, [0, 8, -8], 30, 'lin'),
  K(22.95, -84, 4, 150, [0, 4.5, 1]),                      // sagittal: the CR of the segment
  K(31.6, -82, 4, 146, [0, 4, 1], 30, 'lin'),
  K(W.point6 + 1.45, -82, 4, 146, [0, 4, 1], 30, 'lin'),   // camera stops during the question
  K(36.05, -56, 24, 138, [0, 4, -1.5]),                  // 3/4: tie points slide along the extension
  K(37.25, -84, 4, 148, [0, 4, 1]),
  K(41.9, -84, 4, 148, [0, 4, 1], 30, 'lin'),
  K(42.75, -60, 21, 138, [0, 4, -2.5]),
  K(43.7, -84, 4, 148, [0, 4, 1]),
  K(48.3, -86, 4, 148, [0, 4, 1], 30, 'lin'),
  K(49.95, -24, 26, 272, [-1, 4, -15]),                   // whole lower arch
  K(53.4, -18, 24, 266, [-1, 4, -15], 30, 'lin'),
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
/** split-screen column cameras (scenes 01 and 09) */
export const COLUMN_CAM = { az: -80, el: 5, dist: 96, tgt: [0, 3.5, 1.5], fov: 30 };
export const split = (t) => t < 5.2 || (t >= 53.4 && t < 60);

// ---------------------------------------------------------------- visibility (0…1)
export const VIS = {
  upper: (t) => (t >= 5.2 && t < 7.2 ? 1 - smooth((t - S.upperFade[0]) / (S.upperFade[1] - S.upperFade[0])) : 0),
  sagittal: (t) => win(t, 22.2, 48.9, 0.8, 0.7),                        // sagittal analysis: buccal teeth fade, bone cropped
  boneClear: (t) => Math.max(win(t, 22.2, 48.9, 0.8, 0.7), 0.35 * win(t, 13.2, 22.4, 0.6, 0.4)),
  cantilever: (t) => (t < 10.3 ? 0 : 1) * (1 - 0.62 * win(t, 19.2, 22.6, 0.4, 0.5)) * (1 - 0.45 * win(t, 22.6, 48.6, 0.5, 0.6)),
  passiveGhost: (t) => win(t, 13.9, 16.6, 0.15, 0.7),
  disclaimer: (t) => win(t, 5.4, OUTRO_T0, 0.6, 0.5),
};
