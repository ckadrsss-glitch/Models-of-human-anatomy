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
  { id: 'q1', text: 'INTRUSION', text2: 'OR PROCLINATION?', at: -0.3, hold: 3.7, color: 'white', place: 'top', dir: [0, -1], size: 82 },
  { id: 'seg', text: 'SEGMENTED ARCH', at: W.unite2, hold: W.cant2 - W.unite2 - 0.45, color: 'white', place: 'top', dir: [0, -1], size: 84, kicker: '32 · 31 · 41 · 42 — ONE RIGID SEGMENT', kickerAt: W.four2 },
  { id: 'cant', text: 'BILATERAL', text2: 'CANTILEVERS', at: W.cant2, hold: 3.3, color: 'white', place: 'top', dir: [1, 0], size: 80, kicker: 'TMA .017 × .025 · AUX TUBES 36 / 46', kickerAt: W.cant2 + 0.3 },
  { id: 'posA', text: 'POSITION A', at: 13.15, hold: 3.05, color: 'white', place: 'top', dir: [0, -1], size: 92, kicker: 'TIE: MESIAL · ON THE SECTIONAL WIRE', kickerAt: 13.45 },
  { id: 'procl', text: 'PROCLINATION', at: W.vest3, hold: 23.0 - W.vest3, color: 'white', place: 'top', dir: [1, 0], size: 90, kicker: 'INTRUSION +', kickerAt: W.vest3 },
  { id: 'newp', text: 'NEW TIE POINT?', at: W.what4, hold: 2.75, color: 'white', place: 'top', dir: [0, -1], size: 84, kicker: 'SAME FORCE', kickerAt: W.what4 + 0.3 },
  { id: 'posB', text: 'POSITION B', at: 28.95, hold: 2.75, color: 'white', place: 'top', dir: [0, -1], size: 92, kicker: 'TIE: ON THE EXTENSION · CR LEVEL', kickerAt: 29.2 },
  { id: 'm0', text: 'M ≈ 0', at: W.centre5 + 0.1, hold: W.pure5 - W.centre5 - 0.55, color: 'purple', place: 'top', dir: [-1, 0], size: 104, kicker: 'd ≈ 0', kickerAt: W.through5 },
  { id: 'pure', text: 'PURE INTRUSION', at: W.pure5, hold: 37.0 - W.pure5 - 0.3, color: 'green', place: 'top', dir: [0, 1], size: 86, kicker: 'IDEALISED CONDITION', kickerAt: W.pure5 + 0.5 },
  { id: 'posC', text: 'POSITION C', at: 37.2, hold: W.opp6 - 37.2 - 0.4, color: 'white', place: 'top', dir: [0, -1], size: 92, kicker: 'TIE: FURTHER DISTAL ON THE EXTENSION', kickerAt: 37.5 },
  { id: 'retro', text: 'RETROCLINATION', at: W.retro6, hold: 46.0 - W.retro6 - 0.3, color: 'white', place: 'top', dir: [-1, 0], size: 86, kicker: 'INTRUSION +', kickerAt: W.intr6 },
  { id: 'recip', text: 'RECIPROCAL FORCES', at: W.reactive7, hold: W.anchor7 - W.reactive7 - 0.4, color: 'red', place: 'top', dir: [0, -1], size: 76 },
  { id: 'anch', text: 'ANCHORAGE CONTROL', at: W.anchor7, hold: 52.75 - W.anchor7, color: 'white', place: 'top', dir: [1, 0], size: 76 },
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
