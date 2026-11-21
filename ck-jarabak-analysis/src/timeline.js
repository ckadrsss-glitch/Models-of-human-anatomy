// ============================================================================
//  60-second timeline — every value is a pure function of time t (seconds),
//  so any frame renders identically in playback, scrubbing and export.
// ============================================================================
import { PATTERNS } from './morph.js';

export const DURATION = 60;
export const FPS = 30;

export const SCENES = [
  { id: '01', name: 'Intro', t0: 0, t1: 6.5 },
  { id: '02', name: 'Facial heights', t0: 6.5, t1: 17.5 },
  { id: '03', name: 'Three patterns', t0: 17.5, t1: 30.5 },
  { id: '04', name: 'Björk sum', t0: 30.5, t1: 43.3 },
  { id: '05', name: 'Rotation', t0: 43.3, t1: 53.3 },
  { id: '06', name: 'Conclusion', t0: 53.3, t1: 57 },
  { id: '07', name: 'Outro', t0: 57, t1: 60 },
];

// voice-over (ElevenLabs, voice “Evgeniy Rybakov”) — start times in seconds
export const VOICE = [
  { file: 'assets/voice/vo1.mp3', start: 0.5, text: 'Почему при похожем прикусе у пациентов могут быть разные пропорции лица? Разберём анализ Ярабак.' },
  { file: 'assets/voice/vo2.mp3', start: 7.5, text: 'Мы сравниваем заднюю высоту лица, от Sella до Gonion, с передней — от Nasion до Menton.', tts: 'Мы сравниваем заднюю высоту лица, от Селла до Гонион, с передней — от Назион до Ментон.' },
  { file: 'assets/voice/vo3.mp3', start: 18.6, text: 'Меньшее соотношение характерно для вертикального паттерна, большее — для горизонтального. Между ними — нейтральный вариант.' },
  { file: 'assets/voice/vo4.mp3', start: 31.4, text: 'Дополнительно оценивают сумму трёх углов Бьёрка. Она помогает описать вертикальную конфигурацию лицевого скелета.' },
  { file: 'assets/voice/vo5.mp3', start: 44.2, text: 'Ротация нижней челюсти влияет на положение подбородка и профиль. Но по одному снимку нельзя достоверно предсказать её дальнейшее направление.' },
  { file: 'assets/voice/vo6.mp3', start: 53.6, text: 'Поэтому показатели оценивают вместе с клинической картиной.' },
];

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const easeInOut = (x) => { const t = clamp01(x); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const lerp = (a, b, t) => a + (b - a) * t;
export const ramp = (t, a, b, ease = easeInOut) => ease((t - a) / (b - a));
/** fade in over [a, a+fi], hold, fade out over [b-fo, b] */
export const win = (t, a, b, fi = 0.5, fo = 0.5) => Math.min(smooth((t - a) / fi), 1 - smooth((t - (b - fo)) / fo));
export function keys(t, k, ease = easeInOut) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return lerp(k[i - 1][1], k[i][1], ease((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0])));
  return k[k.length - 1][1];
}

export const [VERT, NEUT, HORI] = PATTERNS;          // calibrated states (56 / 61 / 67 %)
export const TRIO = { k: 1.62, colX: [188, 540, 892], y: 860 };   // three-skull layout (px per mm, cell centres)
const trioZ = (c) => (TRIO.colX[c] - 540) / TRIO.k;   // world offset of a cell (camera centred on the middle cell)

// ---------------------------------------------------------------- camera keyframes [t, k, cz, cy]
// (cz, cy) = world point (mm) at the frame centre, k = px per mm. Orthographic, strictly lateral.
const CAM = {
  single: { k: 4.3, cz: 15, cy: -30 },
  trio: { k: TRIO.k, cz: 0, cy: (TRIO.y - 960) / TRIO.k },
};
function camAt(t) {
  const S = CAM.single, T = CAM.trio;
  if (t < 6.5) return { k: lerp(3.6, 3.95, ramp(t, 0, 6.5, smooth)), cz: 15, cy: lerp(-14, -22, ramp(t, 0, 6.5, smooth)) };
  if (t < 17.5) { const u = ramp(t, 6.4, 7.6); return { k: lerp(3.95, S.k, u), cz: 15, cy: lerp(-22, S.cy, u) }; }
  if (t < 30.5) { const u = ramp(t, 23.6, 24.9); return mixCam(S, T, u); }
  if (t < 43.2) {
    const a = ramp(t, 30.4, 31.6), b = ramp(t, 38.4, 39.7);
    return mixCam(mixCam(T, S, a), T, b);
  }
  if (t < 53.2) return { k: 2.72, cz: 0, cy: 0 };
  return { k: 3.0, cz: 0, cy: -2 };
}
/** zoom between a single skull (cell 1 centred) and the trio, interpolated in log-scale for an even zoom */
function mixCam(A, B, u) {
  const k = Math.exp(lerp(Math.log(A.k), Math.log(B.k), u));
  // keep the screen position of the middle skull's reference point moving linearly
  const w = (1 / k - 1 / A.k) / (1 / B.k - 1 / A.k || 1);
  return { k, cz: lerp(A.cz, B.cz, w), cy: lerp(A.cy, B.cy, w) };
}

// ---------------------------------------------------------------- 3D fade (through the identical brand background)
export function layerAlpha(t) {
  if (t < 3) return smooth((t - 0.2) / 1.8);
  const dip = (a, b) => Math.min(1, Math.max(smooth((a - t) / 0.4), smooth((t - b) / 0.4)));
  return Math.min(dip(43.0, 43.6), dip(53.0, 53.6));
}

// ---------------------------------------------------------------- per-skull state
const V_KEYS = [[17.7, NEUT.v], [18.7, VERT.v], [20.6, VERT.v], [21.3, NEUT.v], [21.9, NEUT.v], [22.6, HORI.v], [23.6, HORI.v]];
export const ROT = { t0: 44.7, t1: 47.5, deg: 7.0 };   // schematic rotation scene
export const STACK = { k: 2.72, y: [660, 1290], cz: -12 };

export function stateAt(t) {
  const cam = camAt(t);
  const skulls = [];
  if (t < 17.5) {
    skulls.push({ v: NEUT.v, r: 0, z: 0, y: 0, depth: 0, role: 'single' });
  } else if (t < 43.2) {
    // middle cell (index 1) is the "single" skull; the two others sit at their trio positions,
    // emerge from behind the middle skull in scene 3, and stay in place (off-screen when zoomed in).
    const vMid = t < 23.6 ? keys(t, V_KEYS) : lerp(HORI.v, NEUT.v, ramp(t, 23.7, 24.8));
    // scene 4: while the camera is zoomed on the middle skull the side skulls slide outward (out of frame)
    const zoom4 = t < 30.5 ? 0 : ramp(t, 30.4, 31.6) * (1 - ramp(t, 38.4, 39.7));
    const spread = (t < 30.5 ? ramp(t, 23.7, 24.9) : 1) * (1 + 1.6 * zoom4);
    const morphOut = t < 30.5 ? ramp(t, 23.7, 24.8) : 1;
    // the single skull is the horizontal one at 23.6 s: it slides to the right cell while morphing to neutral is
    // done by the copy that takes the middle; implemented as: middle = morphs H→N, right copy = H, left copy = H→V
    skulls.push({ v: vMid, r: 0, z: 0, y: 0, depth: 0, role: 'mid' });
    skulls.push({ v: lerp(HORI.v, VERT.v, morphOut), r: 0, z: trioZ(0) * spread, y: 0, depth: 60, role: 'left' });
    skulls.push({ v: HORI.v, r: 0, z: trioZ(2) * spread, y: 0, depth: 90, role: 'right' });
  } else if (t < 53.2) {
    const u = ramp(t, ROT.t0, ROT.t1);
    const wy = (py) => -(py - 960) / STACK.k;
    skulls.push({ v: NEUT.v, r: ROT.deg * u, z: STACK.cz, y: wy(STACK.y[0]), depth: 0, role: 'cw' });
    skulls.push({ v: NEUT.v, r: -ROT.deg * u, z: STACK.cz, y: wy(STACK.y[1]), depth: 0, role: 'ccw' });
  } else {
    skulls.push({ v: NEUT.v, r: 0, z: 0, y: 60, depth: 0, role: 'final' });
  }
  return { t, cam, skulls, alpha: layerAlpha(t) };
}

// ---------------------------------------------------------------- overlay timing (alpha windows)
export const TEXT = {
  title: (t) => win(t, 1.0, 6.3, 1.2, 0.6),
  subtitle: (t) => win(t, 1.8, 6.3, 1.0, 0.6),
  // scene 2
  pts: { S: 7.7, N: 8.15, Go: 8.6, Me: 9.05 },
  sgo: 9.5, nme: 11.5,
  formula: (t) => win(t, 12.9, 17.4, 0.7, 0.5),
  numbers: (t) => win(t, 14.2, 17.4, 0.7, 0.5),
  heights: (t) => win(t, 7.7, 17.4, 0.6, 0.5),
  // scene 3
  s3lines: (t) => win(t, 17.5, 23.7, 0.5, 0.4),
  s3head: (t) => win(t, 17.6, 30.3, 0.6, 0.4),
  vert: (t) => win(t, 18.5, 21.05, 0.45, 0.35),
  neut: (t) => win(t, 21.15, 22.05, 0.3, 0.3),
  hori: (t) => win(t, 22.45, 23.7, 0.35, 0.35),
  trioLabels: (t) => win(t, 24.6, 30.3, 0.7, 0.4),
  trioLines: (t) => win(t, 25.0, 30.3, 0.8, 0.4),
  rangesNote: (t) => win(t, 25.8, 30.3, 0.8, 0.4),
  // scene 4
  s4head: (t) => win(t, 31.0, 43.0, 0.6, 0.4),
  pts4: { N: 31.7, S: 32.1, Ar: 32.5, Go: 32.9, Me: 33.3 },
  poly: 33.5,
  arcs: { saddle: 34.5, articular: 35.4, gonial: 36.3 },
  single4: (t) => win(t, 31.6, 38.6, 0.5, 0.5),
  sumPanel: (t) => win(t, 37.0, 38.6, 0.6, 0.5),
  trio4: (t) => win(t, 39.5, 43.0, 0.8, 0.4),
  // scene 5
  s5: (t) => win(t, 43.7, 53.0, 0.6, 0.4),
  s5note: (t) => win(t, 45.0, 53.0, 0.8, 0.4),
  // scene 6
  s6a: (t) => win(t, 53.7, 57.6, 0.6, 0.3),
  s6b: (t) => win(t, 54.3, 57.6, 0.6, 0.3),
  s6c: (t) => win(t, 54.9, 57.6, 0.6, 0.3),
};
export const OUTRO_T0 = DURATION - 3;  // brand-kit outro: exactly the last 3 s
