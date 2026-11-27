// ============================================================================
//  Kinetic typography synchronised to the narration (pure functions of time; no DOM).
//  HEAR → READ → SEE: every keyword enters on the spoken word (word-level timing from
//  src/words.js), with a 95 → 100 % scale, opacity fade, directional reveal, settling
//  tracking and a short motion-blur trail; it holds for readability and leaves softly.
//  English scientific terms on screen, Russian narration (same engine as the series).
// ============================================================================
import { W, S, clamp01, smooth, easeOut } from './timeline.js';

/**
 * place: 'top' (upper safe area under the brand line) | 'mid'.
 * color: blue (intrusive force) | gold (CR, lever arm) | red (side effects) | green (controlled) | purple (moments) | white.
 */
export const KEYWORDS = [
  { id: 'one', text: 'ONE FORCE', at: -0.3, hold: W.five - 0.45, color: 'blue', place: 'top', dir: [0, -1], size: 96 },
  { id: 'five', text: 'FIVE POINTS', at: W.five, hold: W.three - W.five - 0.42, color: 'white', place: 'top', dir: [1, 0], size: 96 },
  { id: 'three', text: 'THREE OUTCOMES', at: W.three, hold: 1.6, color: 'white', place: 'top', dir: [0, -1], size: 88 },
  { id: 'seg', text: 'SEGMENTED ARCH', at: W.segm, hold: W.four - W.segm - 0.4, color: 'white', place: 'top', dir: [0, -1], size: 84, kicker: 'BURSTONE · THREE-PIECE MECHANICS', kickerAt: W.segm },
  { id: 'four', text: 'FOUR INCISORS', at: W.four, hold: 3.0, color: 'white', place: 'top', dir: [1, 0], size: 86, kicker: '32 · 31 · 41 · 42 — ONE RIGID UNIT', kickerAt: W.rigid },
  { id: 'tma', text: 'TMA .017 × .025', at: W.cant, hold: W.intrForce - W.cant - 0.38, color: 'white', place: 'top', dir: [1, 0], size: 84, kicker: 'TWO CANTILEVERS · 36 / 46', kickerAt: W.cant },
  { id: 'intr', text: 'INTRUSIVE FORCE', at: W.intrForce, hold: 2.6, color: 'blue', place: 'top', dir: [0, 1], size: 84 },
  { id: 'pfa', text: 'POINT OF FORCE', text2: 'APPLICATION', at: W.passes4, hold: W.cr4 - W.passes4 - 0.4, color: 'white', place: 'top', dir: [0, -1], size: 72 },
  { id: 'cr', text: 'CENTER OF RESISTANCE', at: W.cr4, hold: 1.85, color: 'gold', place: 'top', dir: [0, -1], size: 66, kicker: 'ONE CR · RIGID 4-INCISOR SEGMENT', kickerAt: W.cr4 + 0.3 },
  { id: 'mfd', text: 'M = F × d', at: W.ahead, hold: W.intr5 - W.ahead - 0.4, color: 'purple', place: 'top', dir: [-1, 0], size: 96 },
  { id: 'procl', text: 'PROCLINATION', at: W.vest, hold: 1.95, color: 'white', place: 'top', dir: [1, 0], size: 92, kicker: 'INTRUSION +', kickerAt: W.intr5 },
  { id: 'same', text: 'SAME FORCE', at: W.what + 0.25, hold: 2.35, color: 'blue', place: 'top', dir: [0, -1], size: 86, kicker: 'NEW POINT OF APPLICATION?', kickerAt: W.point6 },
  { id: 'd0', text: 'd ≈ 0', at: W.through, hold: 0.85, color: 'gold', place: 'top', dir: [-1, 0], size: 104 },
  { id: 'm0', text: 'M ≈ 0', at: W.centre7 + 0.55, hold: W.pure - W.centre7 - 0.95, color: 'purple', place: 'top', dir: [-1, 0], size: 104 },
  { id: 'pure', text: 'PURE INTRUSION', at: W.pure, hold: 1.45, color: 'green', place: 'top', dir: [0, 1], size: 86 },
  { id: 'retro', text: 'RETROCLINATION', at: W.retro, hold: 1.4, color: 'white', place: 'top', dir: [-1, 0], size: 86, kicker: 'INTRUSION +', kickerAt: W.intr8 },
  { id: 'recip', text: 'RECIPROCAL FORCES', at: W.reactive, hold: W.anchor9 - W.reactive - 0.4, color: 'red', place: 'top', dir: [0, -1], size: 74 },
  { id: 'anch', text: 'ANCHORAGE CONTROL', at: W.anchor9, hold: 1.0, color: 'white', place: 'top', dir: [1, 0], size: 74 },
  { id: 'q', text: 'WHERE WOULD YOU APPLY THE FORCE?', at: W.bio10 + 0.05, hold: 1.45, out: 0.45, color: 'white', place: 'top', dir: [0, -1], size: 50 },
];
export const KW = Object.fromEntries(KEYWORDS.map((k) => [k.id, k]));

const PRE = 0.06;          // enters just before the vowel onset, so it reads "on" the word
const IN = 0.3, OUT = 0.35;

function envelope(t, t0, t1, out) {
  if (t < t0 || t > t1 + out) return null;
  const a = Math.min(t0 < 0 ? 1 : smooth((t - t0) / IN), 1 - smooth((t - t1) / out));
  const e = t0 < 0 ? 1 : easeOut((t - t0) / 0.55);
  return {
    alpha: a,
    scale: 0.95 + 0.05 * e,
    reveal: t0 < 0 ? 1 : easeOut((t - t0) / 0.45),
    tracking: 10 * (1 - e) + 3,
    drift: 22 * (1 - e) + 8 * smooth((t - t1) / out),
    blur: t0 < 0 ? 0 : clamp01(1 - (t - t0) / 0.3),
    accent: t0 < 0 ? 0 : 1 - smooth((t - t0 - 0.35) / 0.5),
  };
}
export function keywordState(k, t) { return envelope(t, k.at - PRE, k.at + k.hold, k.out ?? OUT); }
export function kickerState(k, t) { return k.kicker ? envelope(t, k.kickerAt - PRE, k.at + k.hold, k.out ?? OUT) : null; }
export function focusLevel(t) {
  let f = 0;
  for (const k of KEYWORDS) { const s = keywordState(k, t); if (s) f = Math.max(f, s.alpha); }
  return f;
}
export { S };
