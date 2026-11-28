// ============================================================================
//  Björk–Jarabak V2 — 80-second timeline. Every value is a pure function of time t,
//  so playback, scrubbing and export render identical frames. Visual events are
//  anchored to the spoken words (src/words.js) of the actual narration.
// ============================================================================
import { VOICE as VOICE_RU } from './voice.js';
import { WORDS } from './words.js';
import { LANG, VOICE as VOICE_OUT, WORDS_ACTIVE, warp } from './lang.js';
import { STATES } from './states.js';

export const DURATION = 80;
export const FPS = 30;
export const OUTRO_T0 = DURATION - 3;

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const easeOut = (x) => { const t = clamp01(x); return 1 - Math.pow(1 - t, 3); };
export const easeInOut = (x) => { const t = clamp01(x); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const lerp = (a, b, t) => a + (b - a) * t;
export const ramp = (t, a, b, ease = easeInOut) => ease((t - a) / (b - a));
/** fade in over [a, a+fi], hold, fade out over [b-fo, b] */
export const win = (t, a, b, fi = 0.4, fo = 0.4) => Math.min(smooth((t - a) / fi), 1 - smooth((t - (b - fo)) / fo));

const norm = (s) => s.toLowerCase().replace(/[.,?!—«»]/g, '');
function wordAt(words, voice, line, stem, nth) {
  const ws = words[line - 1].filter((x) => norm(x[0]).startsWith(stem));
  if (!ws[nth]) throw new Error(`word ${stem} not in line ${line}`);
  return voice[line - 1].start + ws[nth][1];
}
/** absolute start (animation clock) of the n-th word in narration line `line` (1-based) beginning with `stem` (Russian) */
export function W(line, stem, nth = 0) { return +wordAt(WORDS, VOICE_RU, line, stem, nth).toFixed(3); }
/** anchor in the active language: RU word on the animation clock, or the EN word onset mapped onto it */
function A(line, ru, en, ruNth = 0, enNth = 0) {
  if (LANG !== 'en') return W(line, ru, ruNth);
  return +warp(wordAt(WORDS_ACTIVE, VOICE_OUT, line, en, enNth)).toFixed(3);
}

export const SCENES = [
  { id: '01', name: 'Hook', t0: 0, t1: 4.9 },
  { id: '02', name: 'Polygon', t0: 4.9, t1: 10.9 },
  { id: '03', name: 'Saddle', t0: 10.9, t1: 17.0 },
  { id: '04', name: 'Articular', t0: 17.0, t1: 23.0 },
  { id: '05', name: 'Gonial', t0: 23.0, t1: 31.2 },
  { id: '06', name: 'Rehook', t0: 31.2, t1: 39.0 },
  { id: '07', name: 'Linear', t0: 39.0, t1: 48.4 },
  { id: '08', name: 'Jarabak ratio', t0: 48.4, t1: 56.6 },
  { id: '09', name: 'Patterns', t0: 56.6, t1: 63.4 },
  { id: '10', name: 'Payoff', t0: 63.4, t1: 71.6 },
  { id: '11', name: 'Question + outro', t0: 71.6, t1: 80 },
];

// ---------------------------------------------------------------- key word times
export const T = {
  same: A(1, 'одинаковая', 'same'), length: A(1, 'длина', 'length'), why: A(1, 'почему', 'why'), diff: A(1, 'разные', 'different'), prof: A(1, 'профили', 'profiles'),
  bjork: A(2, 'бьёрка', 'björk'), jarabak: A(2, 'джарабака', 'björk'), sizes: A(2, 'размеры', 'size'), geom: A(2, 'геометрию', 'geometry'),
  saddle: A(3, 'седловидный', 'saddle'), base3: A(3, 'основания', 'base'), affects: A(3, 'влияет', 'influences'), pos3: A(3, 'положение', 'position'),
  art: A(4, 'артикулярный', 'articular'), ramus4: A(4, 'ветви', 'ramus'), post4: A(4, 'заднего', 'posterior'),
  gon: A(5, 'гониальный', 'gonial'), ramus5: A(5, 'ветви', 'ramus'), body5: A(5, 'тела', 'body'), split: A(5, 'разделение', 'splitting'), detail: A(5, 'детальнее', 'detail'),
  catch: A(6, 'подвох', 'catch'), even: A(6, 'даже', 'even'), sum6: A(6, 'сумма', 'sum'), hide: A(6, 'скрывать', 'hide'), diff6: A(6, 'разную', 'different'),
  base7: A(7, 'основания', 'base'), ramus7: A(7, 'высоту', 'ramus'), body7: A(7, 'длину', 'body', 1, 0), comp7: A(7, 'компоненты', 'components'),
  post8: A(8, 'задней', 'posterior'), ant8: A(8, 'передней', 'anterior'), help8: A(8, 'помогает', 'helps'), vert8: A(8, 'вертикальные', 'vertical'), morph8: A(8, 'морфологии', 'morphology'),
  low9: A(9, 'низкий', 'low'), vert9: A(9, 'вертикального', 'vertical'), high9: A(9, 'высокий', 'high'), hor9: A(9, 'горизонтального', 'horizontal'),
  analyse: A(10, 'анализируйте', 'analyze'), numbers: A(10, 'цифры', 'numbers'), rel: A(10, 'взаимосвязь', 'relate'), morph10: A(10, 'морфологию', 'morphology'),
  which: A(11, 'какой', 'which'), trg: A(11, 'тэ-эр-гэ', 'cephalometric'), use: A(11, 'используете', 'use'),
};

// ---------------------------------------------------------------- layouts (world mm, scaled specimen)
export const L = {
  single: { k: 4.1, cz: 15, cy: -12 },
  stack: { k: 2.35, cz: 10, cy: 0, dyA: 151.2, dyB: -104.1 },
  trio: { k: 1.5, cz: 0, cy: -98, colX: [190, 540, 890] },
};
const trioZ = (c) => (L.trio.colX[c] - 540) / L.trio.k;

export const lerpP = (A, B, u) => Object.fromEntries(Object.keys(A).map((k) => [k, lerp(A[k], B[k], u)]));
export const ST = STATES;

/** piecewise state keys: [[t, STATE], ...] with eased transitions */
function stateKeys(t, ks) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) return lerpP(ks[i - 1][1], ks[i][1], easeInOut((t - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0])));
  return ks[ks.length - 1][1];
}
const mixCam = (A, B, u) => ({ k: Math.exp(lerp(Math.log(A.k), Math.log(B.k), u)), cz: lerp(A.cz, B.cz, u), cy: lerp(A.cy, B.cy, u) });

// saddle demo / ramus demo morph keys
export const SAD_KEYS = [[12.3, ST.REF], [13.1, ST.SAD_LO], [14.3, ST.SAD_LO], [15.2, ST.SAD_HI], [16.25, ST.SAD_HI], [16.95, ST.REF]];
// ramus comparison starts after the Go–Me measurement has appeared (language-independent)
const RAM0 = Math.max(44.0, T.body7 + 0.7), RAMK = Math.min(4.0, 48.25 - RAM0) / 4.0;
export const RAM_KEYS = [[0, ST.REF], [0.8, ST.RAM_S], [1.6, ST.RAM_S], [2.5, ST.RAM_L], [3.3, ST.RAM_L], [4.0, ST.REF]].map(([d, P]) => [RAM0 + d * RAMK, P]);

/** 3D layer opacity (fade through the identical brand background at the hard cuts) */
export function layerAlpha(t) {
  const dip = (a) => Math.min(1, smooth(Math.abs(t - a) / 0.32));
  let a = Math.min(dip(31.25), dip(56.65), dip(63.45));
  if (t > 71.6) a *= lerp(1, 0.28, ramp(t, 71.6, 72.4));
  return a;
}

export function stateAt(t) {
  const skulls = [];
  let cam;
  const S1 = L.single, SK = L.stack;
  if (t < 4.9) {                                                     // 01 hook — two skulls, same Go–Me
    const push = ramp(t, 0, 4.9, smooth);
    cam = { k: lerp(2.3, 2.38, push), cz: SK.cz, cy: SK.cy };
    skulls.push({ P: ST.HYPO, z: 0, y: SK.dyA, role: 'A' }, { P: ST.HYPER, z: 0, y: SK.dyB, role: 'B' });
  } else if (t < 31.25) {                                            // 02–05 single reference skull
    const u = ramp(t, 4.9, 6.1);
    const base = mixCam({ k: 2.38, cz: SK.cz, cy: SK.cy }, S1, u);
    // gentle framing per scene: cranial base → ramus → gonial region
    const f3 = ramp(t, 10.9, 11.8) * (1 - ramp(t, 16.6, 17.4));
    const f4 = ramp(t, 17.0, 17.8) * (1 - ramp(t, 22.6, 23.4));
    const f5 = ramp(t, 23.0, 23.8) * (1 - ramp(t, 30.4, 31.2));
    cam = { k: base.k * (1 + 0.04 * (f3 + f4 + f5)), cz: base.cz + 5 * f3 - 2 * f4 + 4 * f5, cy: base.cy };
    let P = t < 6.1 ? lerpP(ST.HYPO, ST.REF, u) : ST.REF;
    if (t > 12 && t < 17.2) P = stateKeys(t, SAD_KEYS);
    skulls.push({ P, z: 0, y: lerp(SK.dyA, 0, u), role: 'single' });
    if (t < 6.1) skulls.push({ P: ST.HYPER, z: 0, y: lerp(SK.dyB, -420, u), role: 'B' });
  } else if (t < 39.0) {                                             // 06 rehook — same sum, different anatomy
    cam = { k: SK.k, cz: SK.cz, cy: SK.cy };
    skulls.push({ P: ST.REF, z: 0, y: SK.dyA, role: 'A' }, { P: ST.COMP, z: 0, y: SK.dyB, role: 'B' });
  } else if (t < 56.65) {                                            // 07–08 single reference skull
    const u = ramp(t, 39.0, 40.0);
    cam = mixCam({ k: SK.k, cz: SK.cz, cy: SK.cy }, S1, u);
    const f8 = ramp(t, 48.4, 49.4);
    cam.k *= 1 - 0.04 * f8; cam.cy += 2 * f8;
    const P = t > RAM_KEYS[0][0] - 0.05 && t < RAM_KEYS[5][0] + 0.05 ? stateKeys(t, RAM_KEYS) : ST.REF;
    skulls.push({ P, z: 0, y: lerp(SK.dyA, 0, u), role: 'single' });
    if (t < 40.0) skulls.push({ P: ST.COMP, z: 0, y: lerp(SK.dyB, -420, u), role: 'B' });
  } else if (t < 63.45) {                                            // 09 three skeletal patterns
    cam = { k: L.trio.k, cz: L.trio.cz, cy: L.trio.cy };
    const rise = (t0) => (1 - easeOut((t - t0) / 0.8)) * -260;      // slide up into the cell
    const order = [[ST.HYPER, T.low9 - 0.1], [ST.REF, T.vert9 + 0.25], [ST.HYPO, T.high9 - 0.1]];
    order.forEach(([P, t0], c) => { if (t > t0 - 0.05) skulls.push({ P, z: trioZ(c), y: rise(t0), role: 'trio' + c, appear: smooth((t - t0) / 0.5) }); });
  } else {                                                           // 10 payoff + 11 question
    cam = { k: SK.k, cz: SK.cz, cy: SK.cy };
    skulls.push({ P: ST.HYPO, z: 0, y: SK.dyA, role: 'A' }, { P: ST.HYPER, z: 0, y: SK.dyB, role: 'B' });
  }
  return { t, cam, skulls, alpha: layerAlpha(t) };
}
