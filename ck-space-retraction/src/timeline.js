// ============================================================================
//  V4 timeline (60 s). Every value is a pure function of time t (seconds), so
//  playback, scrubbing and frame-by-frame export always give the same frame.
//  Story: hook → the real problem → three ways to obtain space (01 distalisation,
//  02 extraction when indicated, 03 IPR) → conclusion + controlled anterior
//  retraction → CK BIOMECHANICS outro.
// ============================================================================
export const DURATION = 60;
export const FPS = 30;
export const OUTRO_T0 = DURATION - 3;          // brand-kit outro: exactly the last 3 s

export const SCENES = [
  { id: '01', name: 'Хук', t0: 0, t1: 5.6 },
  { id: '02', name: 'Проблема', t0: 5.6, t1: 11.6 },
  { id: '03', name: 'Дистализация', t0: 11.6, t1: 24.4 },
  { id: '04', name: 'Удаление', t0: 24.4, t1: 36.0 },
  { id: '05', name: 'Сепарация', t0: 36.0, t1: 46.4 },
  { id: '06', name: 'Вывод', t0: 46.4, t1: 57 },
  { id: '07', name: 'Финал', t0: 57, t1: 60 },
];

// Voice-over: ElevenLabs, voice «Принц Нури» (gJEfHTTiifXEDmO687lC), eleven_multilingual_v2, one take per line.
// `speech` = end of the last word (Scribe), `chunks` = on-screen subtitle lines.
export const VOICE = [
  { file: 'assets/voice/v4_1.mp3', start: 0.25, dur: 3.60, speech: 3.58, text: 'Зубы вышли вперёд? Боишься, что улыбка станет как у лошади?', chunks: ['Зубы вышли вперёд?', 'Боишься, что улыбка станет как у лошади?'] },
  { file: 'assets/voice/v4_2.mp3', start: 5.4, dur: 5.28, speech: 5.25, text: 'Чтобы вернуть передние зубы назад, сначала нужно создать пространство. Но где его взять?', chunks: ['Чтобы вернуть передние зубы назад,', 'сначала нужно создать пространство.', 'Но где его взять?'] },
  { file: 'assets/voice/v4_3.mp3', start: 12.0, dur: 6.22, speech: 6.18, text: 'Первый способ — дистализация. Перемещаем боковые зубы назад, если позволяют анатомические условия.', chunks: ['Первый способ — дистализация.', 'Перемещаем боковые зубы назад,', 'если позволяют анатомические условия.'] },
  { file: 'assets/voice/v4_4.mp3', start: 24.8, dur: 5.67, speech: 5.62, text: 'Второй — удаление зубов по показаниям. Полученное пространство можно использовать для ретракции.', chunks: ['Второй — удаление зубов по показаниям.', 'Полученное пространство', 'можно использовать для ретракции.'] },
  { file: 'assets/voice/v4_5.mp3', start: 36.4, dur: 6.35, speech: 6.32, text: 'Третий — сепарация. Контролируемо уменьшаем эмаль между зубами и получаем немного дополнительного места.', chunks: ['Третий — сепарация.', 'Контролируемо уменьшаем эмаль между зубами', 'и получаем немного дополнительного места.'] },
  { file: 'assets/voice/v4_6.mp3', start: 46.8, dur: 7.60, speech: 7.57, text: 'Какой способ выбрать — зависит от диагностики. Главное — создать необходимое пространство и контролировать движение зубов.', chunks: ['Какой способ выбрать — зависит от диагностики.', 'Главное — создать необходимое пространство', 'и контролировать движение зубов.'] },
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

// ---------------------------------------------------------------- tooth-movement schedule
// (word onsets in comments come from src/words.js; tools/qa.mjs checks them)
export const SCHEDULE = {
  // 01 distalisation, sequential: second molars → first molars → second premolars → first premolars
  // starts on «дистализация» (13.15 s)
  dist: { 7: [13.15, 14.95], 6: [15.0, 16.8], 5: [16.85, 18.65], 4: [18.7, 20.5] },
  // 02 extraction (illustrative premolar 14/24): highlight on «удаление» (25.69), removal after «по показаниям»,
  // partial retraction into the space after «ретракции» (29.49) — the space is NOT closed instantly
  ext: { highlight: 25.69, remove: [26.95, 27.75], retr: [29.5, 34.8] },
  // 03 IPR on 11 | 21: enamel reduction on «уменьшаем эмаль» (38.95–39.73), indicator on «немного» (40.88)
  ipr: { reduce: [38.6, 40.5], measure: 40.88 },
  // conclusion: anterior retraction into the space created by distalisation
  retr: [51.0, 55.6],
};
export const IPR_MM = 0.3;   // schematic proximal enamel reduction per surface (never shown as a number)

/**
 * Scenario at time t: tooth-movement progress P (for model.poseAt), which teeth are hidden,
 * IPR amount, 3D layer alpha (soft dips between demonstrations) and the scenario id.
 */
export function storyAt(t) {
  const S = SCHEDULE;
  const zero = { dist: { 7: 0, 6: 0, 5: 0, 4: 0 }, retrT: 0, retrR: 0 };
  const dist = (t0) => { const d = {}; for (const k of [7, 6, 5, 4]) d[k] = ramp(t0, S.dist[k][0], S.dist[k][1]); return d; };
  const retrP = (u) => ({ retrT: easeInOut(u), retrR: easeInOut(Math.min(1, Math.max(0, u * 1.04 - 0.02))) });
  let scen, P, removed = 0, lift = 0, ipr = 0;
  if (t < 24.4) { scen = t < 11.6 ? 'start' : 'dist'; P = { ...zero, dist: dist(t) }; }
  else if (t < 36.0) {
    scen = 'ext';
    const r = (t - S.ext.retr[0]) / (S.ext.retr[1] - S.ext.retr[0]);
    P = { dist: zero.dist, ...retrP(clamp01(r)) };
    removed = ramp(t, S.ext.remove[0], S.ext.remove[1], smooth);
    lift = ramp(t, S.ext.remove[0], S.ext.remove[1], easeInOut);
  } else if (t < 46.4) { scen = 'ipr'; P = zero; ipr = ramp(t, S.ipr.reduce[0], S.ipr.reduce[1]); }
  else {
    scen = t < 50.6 ? 'cards' : 'retr';
    const r = (t - S.retr[0]) / (S.retr[1] - S.retr[0]);
    P = { dist: { 7: 1, 6: 1, 5: 1, 4: 1 }, ...retrP(clamp01(r)) };
  }
  // 3D layer: dips between demonstrations (camera cuts happen inside the dips); cards = 2D summary
  const dip = (a, b) => Math.min(1, Math.max(smooth((a - t) / 0.4), smooth((t - b) / 0.4)));
  let layer = Math.min(dip(24.0, 24.8), dip(35.6, 36.4));
  if (t >= 46.0 && t <= 51.0) layer = Math.max(1 - smooth((t - 46.0) / 0.4), smooth((t - 50.6) / 0.4));
  layer *= 1 - 0.78 * win(t, 3.0, 3.95, 0.12, 0.18);          // the horse comparison takes over for ~0.9 s
  return { scen, P, removed, lift, ipr, layer };
}

// ---------------------------------------------------------------- camera
// Orbit camera: az (deg, 0 = in front, −90 = patient's right, face to screen right), el (deg, −90 = occlusal
// view of the upper arch from below), dist (mm), tgt (mm), fov (deg). Keys 0.01 s apart = cut (inside a dip).
const K = (t, az, el, dist, tgt, fov = 30, ease = 'io') => ({ t, az, el, dist, tgt, fov, ease });
export const CAMERA = [
  K(0.0, -90, 4, 290, [0, -13, 18]),                    // first frame: protruded incisors, lateral
  K(5.4, -86, 3, 222, [0, -10, 16], 30, 'lin'),         // slow approach towards the incisors
  K(7.3, -38, -32, 248, [0, -6, 0]),                    // three-quarter view of the upper arch
  K(9.5, -42, -32, 240, [0, -6, 0], 30, 'lin'),
  K(11.2, -68, -26, 205, [-16, -5, -3]),                // towards the posterior segment
  K(12.6, 0, -90, 246, [0, -8, -9]),                    // 01 occlusal view
  K(20.5, 4, -90, 238, [0, -8, -9], 30, 'lin'),
  K(22.8, -68, -16, 175, [-18, -3, 3]),                 // turn: the space in the buccal segment
  K(24.39, -70, -15, 170, [-18, -3, 3], 30, 'lin'),
  K(24.4, 0, -90, 240, [0, -8, -6], 30, 'lin'),         // cut (dip) → 02 occlusal
  K(29.2, 0, -90, 236, [0, -8, -6], 30, 'lin'),
  K(31.2, -64, -24, 188, [-15, -4, 3]),                 // retraction into the extraction space
  K(35.99, -67, -22, 182, [-15, -4, 3], 30, 'lin'),
  K(36.0, 0, -4, 128, [0, -2.5, 25], 30, 'lin'),         // cut (dip) → 03 macro of the 11 | 21 contact
  K(40.5, 0, -4, 98, [0, -3.5, 25]),
  K(46.39, 0, -4, 94, [0, -3.5, 25], 30, 'lin'),
  K(46.4, -90, -3, 182, [-11, 7, 8], 30, 'lin'),        // (hidden behind the summary cards)
  K(50.6, -90, -3, 182, [-11, 7, 8], 30, 'lin'),
  K(57.0, -84, -5, 170, [-11, 7, 8], 30, 'lin'),        // conclusion: controlled anterior retraction
  K(60.0, -84, -5, 168, [-11, 7, 8], 30, 'lin'),
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

// ---------------------------------------------------------------- visibility of layers (0…1)
export const VIS = {
  skin: () => 0,                                               // the first frame shows the dentition directly
  lower: (t) => 1 - ramp(t, 4.8, 6.2, smooth),                 // lower jaw: overjet in the hook
  gingiva: (t) => 0.55 * (1 - 0.5 * win(t, 36.2, 46.2, 0.6, 0.6)),
  bone: (t) => 1.15 + 0.9 * win(t, 50.8, 57.2, 0.8, 0.6),
  redFront: (t) => win(t, 0.86, 6.6, 0.4, 0.8),                // on «вперёд?» (0.89 s), brief, then cyan
  cyanFront: (t) => win(t, 6.2, 9.6, 0.5, 0.8),                // anterior segment highlighted (planned retraction)
  ghostPost: (t) => win(t, 13.3, 24.1, 0.6, 0.6),              // start positions of 4–7 (before / after)
  ghostAnt: (t) => Math.max(win(t, 29.8, 35.7, 0.6, 0.5), win(t, 51.2, 56.9, 0.6, 0.5)),
  gaps: (t) => Math.max(win(t, 13.3, 24.2, 0.4, 0.5), win(t, 50.8, 56.8, 0.5, 0.5)),
  extGap: (t) => win(t, 27.6, 35.7, 0.4, 0.5),
};

// ---------------------------------------------------------------- overlay windows
export const TEXT = {
  horse: (t) => win(t, 3.0, 3.95, 0.12, 0.18),                 // «как у лошади» (2.87–3.58 s)
  plannedRetr: (t) => win(t, 6.0, 11.4, 0.5, 0.5),             // planned direction of anterior retraction
  spaceZone: (t) => win(t, 8.18, 11.4, 0.4, 0.5),              // on «пространство» (8.23 s)
  distArrows: (t) => win(t, 13.1, 20.8, 0.3, 0.4),
  stepper: (t) => win(t, 14.6, 21.0, 0.4, 0.4),
  tuberosity: (t) => win(t, 16.7, 21.2, 0.5, 0.5),             // on «анатомические» (16.76 s)
  beforeAfter: (t) => win(t, 21.0, 24.1, 0.5, 0.5),
  anchorage: (t) => win(t, 31.0, 35.6, 0.5, 0.5),
  measure: (t) => win(t, 40.82, 46.1, 0.35, 0.5),              // on «немного» (40.88 s)
  cards: (t) => win(t, 46.6, 50.9, 0.4, 0.4),
  retrVec: (t) => win(t, 51.0, 56.6, 0.5, 0.6),
  disclaimer: (t) => win(t, 55.2, 57.1, 0.5, 0.4),
};
