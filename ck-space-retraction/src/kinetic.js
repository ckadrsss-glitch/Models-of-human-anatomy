// ============================================================================
//  Kinetic typography synchronised to the narration (pure functions of time; no DOM).
//
//  HEAR → READ → SEE: every keyword enters on the spoken word (word-level timing from
//  src/words.js), with a 95 → 100 % scale, opacity fade, directional reveal, subtle
//  tracking and a short motion-blur trail; it holds for readability and leaves softly.
//  While a keyword is on screen the related teeth / vectors are emphasised and secondary
//  labels are dimmed (one dominant keyword at a time).
// ============================================================================
import { wordTime } from './words.js';
import { clamp01, smooth, easeOut } from './timeline.js';

// ---------------------------------------------------------------- synchronised events (absolute seconds)
export const SYNC = {
  forward: wordTime(0, 'вперёд')[0],          // red accent on the anterior teeth
  horse: wordTime(0, 'как')[0],               // stylised horse-incisor comparison
  space: wordTime(1, 'пространство')[0],      // space region expands
  distal: wordTime(2, 'дистализация')[0],     // molars start moving
  anatomy: wordTime(2, 'анатомические')[0],   // tuberosity limit
  extraction: wordTime(3, 'удаление')[0],     // premolar highlighted
  indication: wordTime(3, 'показаниям')[0],
  extSpace: wordTime(3, 'пространство')[0],
  retraction: wordTime(3, 'ретракции')[0],
  enamel: wordTime(4, 'уменьшаем')[0],        // enamel reduction
  little: wordTime(4, 'немного')[0],          // measurement indicator
  diagnosis: wordTime(5, 'диагностики')[0],
  space2: wordTime(5, 'пространство')[0],
  control: wordTime(5, 'контролировать')[0],
};

/**
 * Keywords. kicker = small line above (with its own entrance time), note = small line below.
 * place: layout slot resolved by the renderer (top = upper safe area, palate = empty area inside
 * the arch in the occlusal view). dir: reveal / drift direction (matches the movement shown).
 * from: entrance accent colour that settles into `color` (red accent → standard palette).
 */
export const KEYWORDS = [
  { id: 'hook1', text: 'ЗУБЫ ВПЕРЁД?', at: wordTime(0, 'зубы')[0], hold: 2.35, color: 'white', from: 'red', place: 'top', dir: [0, -1], focus: 'anterior', size: 96 },
  { id: 'hook2', text: 'КАК У ЛОШАДИ?', at: SYNC.horse, hold: 1.85, color: 'white', from: 'red', place: 'top', dir: [0, -1], focus: 'none', size: 88 },
  { id: 'space', text: 'ПРОСТРАНСТВО', kicker: 'СОЗДАТЬ', kickerAt: wordTime(1, 'создать')[0], at: SYNC.space, hold: 2.9, color: 'cyan', place: 'top', dir: [0, -1], focus: 'gaps', size: 92 },
  { id: 'dist', text: 'ДИСТАЛИЗАЦИЯ', kicker: '01', kickerAt: wordTime(2, 'первый')[0], at: SYNC.distal, hold: 2.3, color: 'cyan', place: 'palate', dir: [0, 1], focus: 'posterior', size: 46 },
  { id: 'ext', text: 'УДАЛЕНИЕ', kicker: '02', kickerAt: wordTime(3, 'второй')[0], note: 'по показаниям', noteAt: SYNC.indication, at: SYNC.extraction, hold: 2.1, color: 'white', from: 'red', place: 'palate', dir: [0, 1], focus: 'extraction', size: 56 },
  { id: 'ipr', text: 'СЕПАРАЦИЯ', kicker: '03', kickerAt: wordTime(4, 'третий')[0], note: 'IPR', noteAt: SYNC.enamel - 0.6, at: wordTime(4, 'сепарация')[0], hold: 2.9, color: 'cyan', place: 'top', dir: [1, 0], focus: 'ipr', size: 88 },
  { id: 'diag', text: 'ДИАГНОСТИКА', at: SYNC.diagnosis, hold: 1.55, color: 'white', place: 'top', dir: [0, -1], focus: 'none', size: 84 },
  { id: 'space2', text: 'ПРОСТРАНСТВО', at: SYNC.space2, hold: 0.5, out: 0.18, color: 'cyan', place: 'top', dir: [0, -1], focus: 'gaps', size: 84 },
  { id: 'ctrl', text: 'КОНТРОЛЬ', at: SYNC.control, hold: 2.3, color: 'white', place: 'top', dir: [-1, 0], focus: 'control', size: 92 },
];
export const KW = Object.fromEntries(KEYWORDS.map((k) => [k.id, k]));

const PRE = 0.06;          // enters just before the vowel onset, so it reads "on" the word
const IN = 0.3, OUT = 0.35;

function envelope(t, t0, t1, out) {
  if (t < t0 || t > t1 + out) return null;
  const a = Math.min(smooth((t - t0) / IN), 1 - smooth((t - t1) / out));
  const e = easeOut((t - t0) / 0.55);
  return {
    alpha: a,
    scale: 0.95 + 0.05 * e,                            // 95 % → 100 %
    reveal: easeOut((t - t0) / 0.45),                  // directional wipe 0 → 1
    tracking: 10 * (1 - e) + 3,                        // letter-spacing settles from 13 → 3 px
    drift: 22 * (1 - e) + 8 * smooth((t - t1) / out),  // px along dir: settles in, drifts out
    blur: clamp01(1 - (t - t0) / 0.3),                 // motion-blur trail during the entrance only
    accent: 1 - smooth((t - t0 - 0.35) / 0.5),         // red accent → standard colour
  };
}

/** animation state of one keyword (main line) at time t */
export function keywordState(k, t) { return envelope(t, k.at - PRE, k.at + k.hold, k.out ?? OUT); }
/** state of the kicker / note lines (enter on their own word, leave with the keyword) */
export function kickerState(k, t) { return k.kicker ? envelope(t, k.kickerAt - PRE, k.at + k.hold, k.out ?? OUT) : null; }
export function noteState(k, t) { return k.note ? envelope(t, k.noteAt - PRE, k.at + k.hold, k.out ?? OUT) : null; }

/** strongest keyword envelope at time t (dims secondary labels, gently focuses the camera) */
export function focusLevel(t, focus = null) {
  let f = 0;
  for (const k of KEYWORDS) {
    if (focus && k.focus !== focus) continue;
    const s = keywordState(k, t); if (s) f = Math.max(f, s.alpha);
  }
  return f;
}

/** keyword active right now → stem to highlight in the subtitle */
export function activeStem(t) {
  for (const k of KEYWORDS) { const s = keywordState(k, t); if (s && s.alpha > 0.2) return k.text.slice(0, 4).toLowerCase(); }
  return null;
}
