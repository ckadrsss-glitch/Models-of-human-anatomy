// ============================================================================
//  55-second timeline. Every value is a pure function of time t (s), so playback,
//  scrubbing and frame-by-frame export always produce the same frame.
// ============================================================================
export const DURATION = 55;
export const FPS = 30;
export const OUTRO_T0 = DURATION - 3;          // brand-kit outro: exactly the last 3 s

export const SCENES = [
  { id: '01', name: 'Хук', t0: 0, t1: 5 },
  { id: '02', name: 'Где взять место?', t0: 5, t1: 13 },
  { id: '03', name: 'Дистализация', t0: 13, t1: 30 },
  { id: '04', name: 'Ретракция фронта', t0: 30, t1: 43 },
  { id: '05', name: 'Биомеханика', t0: 42.6, t1: 48.2 },
  { id: '06', name: 'Финал', t0: 48.2, t1: 55 },
];

// Voice-over: ElevenLabs, voice «Принц Нури» (gJEfHTTiifXEDmO687lC), eleven_multilingual_v2, one take per line.
// Lines 1, 2, 3, 6, 8, 9 — verbatim from the brief; 4, 5, 7 — short bridges that remove the 8–9 s silent
// stretches during the distalisation and the retraction (viewer-retention).
// `dur` = measured clip length (s), `chunks` = on-screen subtitle lines (timed by character share).
export const VOICE = [
  { file: 'assets/voice/nuri1.mp3', start: 0.3, dur: 2.82, speech: 2.54, text: 'Зубы вышли вперёд? А как вернуть их назад?', chunks: ['Зубы вышли вперёд?', 'А как вернуть их назад?'] },
  { file: 'assets/voice/nuri2.mp3', start: 4.3, dur: 5.85, speech: 5.56, text: 'Казалось бы, просто переместить их назад. Но есть одна проблема. Для этого нужно пространство.', chunks: ['Казалось бы, просто переместить их назад.', 'Но есть одна проблема.', 'Для этого нужно пространство.'] },
  { file: 'assets/voice/nuri3.mp3', start: 11.4, dur: 6.95, speech: 6.65, text: 'Один из вариантов — дистализация. Мы последовательно перемещаем боковые зубы назад, освобождая пространство для передних.', chunks: ['Один из вариантов — дистализация.', 'Мы последовательно перемещаем боковые зубы назад,', 'освобождая пространство для передних.'] },
  { file: 'assets/voice/nuri4.mp3', start: 20.6, dur: 3.58, speech: 3.28, text: 'Каждый зуб идёт своей траекторией — не весь сегмент сразу.', chunks: ['Каждый зуб идёт своей траекторией —', 'не весь сегмент сразу.'] },
  { file: 'assets/voice/nuri5.mp3', start: 26.6, dur: 2.51, speech: 2.4, text: 'И вот оно — место для передних зубов.', chunks: ['И вот оно — место для передних зубов.'] },
  { file: 'assets/voice/nuri6.mp3', start: 30.0, dur: 4.0, speech: 3.7, text: 'Теперь созданное пространство можно использовать для ретракции фронтальной группы.', chunks: ['Теперь созданное пространство', 'можно использовать для ретракции фронтальной группы.'] },
  { file: 'assets/voice/nuri7.mp3', start: 35.6, dur: 4.36, speech: 4.17, text: 'Коронки уходят назад, а корни и наклон резцов остаются под контролем.', chunks: ['Коронки уходят назад,', 'а корни и наклон резцов остаются под контролем.'] },
  { file: 'assets/voice/nuri8.mp3', start: 42.6, dur: 3.89, speech: 3.59, text: 'Но важно не просто переместить коронки, а контролировать корни и опору.', chunks: ['Но важно не просто переместить коронки,', 'а контролировать корни и опору.'] },
  { file: 'assets/voice/nuri9.mp3', start: 47.6, dur: 4.0, speech: 3.65, text: 'В ортодонтии главное — не просто двигать зубы, а понимать биомеханику.', chunks: ['В ортодонтии главное — не просто двигать зубы,', 'а понимать биомеханику.'] },
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
export const SCHEDULE = {
  // sequential distalisation: second molars → first molars → second premolars → first premolars
  dist: { 7: [14.3, 17.0], 6: [17.1, 19.8], 5: [19.9, 22.6], 4: [22.7, 25.4] },
  retr: [31.6, 41.2],            // en-masse retraction of the six anterior teeth
};

// ---------------------------------------------------------------- camera
// Orbit camera around a target: az (deg, 0 = in front, −90 = patient's right side, face to screen right),
// el (deg, −90 = from below = occlusal view of the upper arch, incisors at the top of the frame),
// dist (mm), tgt (mm), fov (deg, vertical). Interpolation is done on these parameters → smooth orbits.
const K = (t, az, el, dist, tgt, fov = 30, ease = 'io') => ({ t, az, el, dist, tgt, fov, ease });
export const CAMERA = [
  K(0.0, -90, 4, 560, [0, -22, 22]),
  K(1.0, -90, 4, 300, [0, -18, 20], 30, 'out'),       // sharp push-in in the first second
  K(4.9, -88, 3, 246, [0, -12, 16], 30, 'lin'),
  K(5.6, -88, 3, 246, [0, -12, 16]),
  K(8.0, 0, -90, 262, [0, -8, 0]),                   // lateral → occlusal
  K(13.0, 0, -90, 256, [0, -8, 0], 30, 'lin'),
  K(14.0, 0, -90, 254, [0, -8, 0]),
  K(25.5, 4, -90, 246, [0, -8, 0], 30, 'lin'),
  K(27.6, -68, -16, 175, [-18, -3, 3]),               // 45° turn: buccal segment, space visible
  K(30.0, -71, -15, 170, [-18, -3, 3], 30, 'lin'),
  K(32.0, -90, -3, 180, [-11, 7, 8]),                  // lateral projection, anterior segment
  K(41.5, -84, -5, 172, [-11, 7, 8], 30, 'lin'),
  K(44.2, -90, 0, 140, [-4, 3, 10]),                   // biomechanics (sagittal)
  K(48.0, -90, 0, 135, [-4, 3, 10], 30, 'lin'),
  K(49.4, -90, -4, 210, [-6, 0, 2]),                  // comparison: profile, start (red) vs end
  K(55.0, -86, -5, 250, [-6, 0, 2], 30, 'lin'),
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
  skin: (t) => 1 - ramp(t, 1.3, 3.2, smooth),                  // soft tissue becomes translucent, then disappears
  lower: (t) => 1 - ramp(t, 5.4, 6.8, smooth),                 // lower jaw (hook only)
  gingiva: (t) => 0.62 * (1 - 0.55 * win(t, 42.8, 48.6, 0.8, 0.8)),
  bone: (t) => 1 + 1.1 * win(t, 30.5, 48.6, 1.0, 0.8),         // bone emphasis in scenes 4–5
  redFront: (t) => win(t, 2.4, 13.6, 0.7, 1.2),               // anterior teeth highlighted
  ghostPost: (t) => win(t, 14.0, 27.6, 0.8, 1.0),              // start positions of 4–7
  ghostAnt: (t) => win(t, 31.2, 43.2, 0.8, 0.8),               // start positions of 1–3
  ghostAll: (t) => win(t, 48.8, OUTRO_T0 + 0.6, 0.8, 0.6),     // comparison
  gaps: (t) => win(t, 14.4, 42.0, 0.5, 0.8),
  cr: (t) => win(t, 44.4, 48.4, 0.5, 0.5),
};

// ---------------------------------------------------------------- overlay text windows
export const TEXT = {
  hook: (t) => win(t, 0.25, 5.3, 0.35, 0.5),
  backArrow: (t) => win(t, 3.0, 5.4, 0.5, 0.5),
  retrArrows: (t) => win(t, 8.2, 13.2, 0.5, 0.6),
  noSpace: (t) => win(t, 10.0, 13.4, 0.35, 0.6),
  spaceCreated: (t) => win(t, 26.5, 30.0, 0.5, 0.6),
  distArrows: (t) => win(t, 14.0, 25.6, 0.3, 0.4),
  tuberosity: (t) => win(t, 15.0, 25.8, 0.8, 0.6),
  retrVec: (t) => win(t, 31.4, 41.6, 0.6, 0.8),
  bio: (t) => win(t, 44.4, 48.4, 0.5, 0.5),
  compare: (t) => win(t, 49.0, OUTRO_T0 + 0.4, 0.7, 0.5),
};
