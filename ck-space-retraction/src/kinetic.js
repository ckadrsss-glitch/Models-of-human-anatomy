// ============================================================================
//  Kinetic typography synchronised to the narration (pure functions of time; no DOM).
//
//  HEAR → READ → SEE: every keyword enters on the spoken word (word-level timing from
//  src/words.js), with a 95 → 100 % scale, opacity fade, directional reveal, subtle
//  tracking and a short motion-blur trail; it holds for readability and leaves softly.
//  While a keyword is on screen the related teeth / vectors are emphasised and secondary
//  labels are dimmed (one focal point at a time).
// ============================================================================
import { wordTime } from './words.js';
import { clamp01, smooth, easeOut } from './timeline.js';

// ---------------------------------------------------------------- synchronised events
export const SYNC = {
  forward: wordTime(0, 'вперёд')[0],          // red accent on the anterior teeth
  problem: wordTime(1, 'проблема')[0],        // retraction arrows start growing
  noSpace: wordTime(1, 'пространство')[0],    // arrows stop + NO SPACE
  sequential: wordTime(2, 'последовательно')[0], // 7 → 6 → 5 → 4 indicator
  place: wordTime(4, 'место')[0],             // SPACE CREATED
  control2: wordTime(7, 'контролировать')[0], // centre of resistance (scene 5)
  roots: wordTime(7, 'корни')[0],
  anchor: wordTime(7, 'опору')[0],
};

/**
 * Keywords. focus: what is emphasised in 3D while the word is shown.
 * place: layout slot resolved by the renderer (palate = empty area inside the arch in the
 * occlusal view; top = upper safe area; low = lower safe area above the subtitles).
 * dir: reveal / drift direction on screen, matching the movement shown.
 */
export const KEYWORDS = [
  { id: 'dist', text: 'ДИСТАЛИЗАЦИЯ', at: wordTime(2, 'дистализация')[0], hold: 1.75, color: 'cyan', place: 'palate', dir: [0, 1], focus: 'posterior', size: 46 },
  { id: 'space', text: 'ПРОСТРАНСТВО', at: wordTime(2, 'пространство')[0], hold: 1.9, color: 'cyan', place: 'palate', dir: [0, 1], focus: 'gaps', size: 46 },
  { id: 'retr', text: 'РЕТРАКЦИЯ', at: wordTime(5, 'ретракции')[0], hold: 1.9, color: 'cyan', place: 'top', dir: [-1, 0], focus: 'anterior', size: 92 },
  { id: 'ctrl', text: 'КОНТРОЛЬ', at: wordTime(6, 'контрол')[0], hold: 1.7, color: 'white', place: 'top', dir: [0, -1], focus: 'control', size: 92 },
  { id: 'anchor', text: 'ОПОРА', at: SYNC.anchor, hold: 1.5, color: 'gold', place: 'anchor', dir: [1, 0], focus: 'anchor', size: 64 },
  { id: 'bio', text: 'БИОМЕХАНИКА', at: wordTime(8, 'биомеханик')[0], hold: 1.35, color: 'white', place: 'top', dir: [0, -1], focus: 'none', size: 84 },
];
export const KW = Object.fromEntries(KEYWORDS.map((k) => [k.id, k]));

const PRE = 0.06;          // enters just before the vowel onset, so it reads "on" the word
const IN = 0.32, OUT = 0.38;

/** animation state of one keyword at time t */
export function keywordState(k, t) {
  const t0 = k.at - PRE, t1 = k.at + k.hold;
  if (t < t0 || t > t1 + OUT) return null;
  const a = Math.min(smooth((t - t0) / IN), 1 - smooth((t - t1) / OUT));
  const e = easeOut((t - t0) / 0.55);                  // entrance progress
  return {
    alpha: a,
    scale: 0.95 + 0.05 * e,                            // 95 % → 100 %
    reveal: easeOut((t - t0) / 0.45),                  // directional wipe 0 → 1
    tracking: 10 * (1 - e) + 3,                        // letter-spacing settles from 13 → 3 px
    drift: 22 * (1 - e) + 8 * smooth((t - t1) / OUT),  // px along dir: settles in, drifts out
    blur: clamp01(1 - (t - t0) / 0.3),                 // motion-blur trail during the entrance
    pulse: Math.exp(-Math.max(0, t - k.at) * 3.2),     // 1 on the word → 0
  };
}

/** strongest keyword envelope at time t (used to dim secondary labels / gently focus the camera) */
export function focusLevel(t, focus = null) {
  let f = 0;
  for (const k of KEYWORDS) {
    if (focus && k.focus !== focus) continue;
    const s = keywordState(k, t); if (s) f = Math.max(f, s.alpha);
  }
  return f;
}

/** keyword active within the subtitle line at time t → stem to highlight in the subtitle */
export function activeStem(t) {
  for (const k of KEYWORDS) { const s = keywordState(k, t); if (s && s.alpha > 0.2) return k.text.slice(0, 4).toLowerCase(); }
  return null;
}
