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
export const KEYWORDS = [   // all times in animation time (W = spoken word onsets mapped through WARP)
  { id: 'q1', text: 'INTRUSION', text2: 'WITHOUT TIPPING?', at: W.intr1, hold: 3.85 - W.intr1, color: 'white', place: 'top', dir: [0, -1], size: 82, kicker: 'LOWER INCISORS', kickerAt: W.intr1 + 0.45 },
  { id: 'loa', text: 'LINE OF ACTION', at: W.line2, hold: W.cr2 - W.line2 - 0.4, color: 'white', place: 'top', dir: [0, -1], size: 84, kicker: 'WHERE DOES THE FORCE PASS?', kickerAt: W.where2 },
  { id: 'cr', text: 'CENTER OF', text2: 'RESISTANCE', at: W.cr2, hold: 10.4 - W.cr2, color: 'gold', place: 'top', dir: [1, 0], size: 80, kicker: 'RELATIVE TO THE', kickerAt: W.cr2 },
  { id: 'posA', text: 'POSITION A', at: 13.15, hold: W.ahead3 - 13.15 - 0.35, color: 'white', place: 'top', dir: [0, -1], size: 92, kicker: 'TIE: MESIAL · ON THE SECTIONAL WIRE', kickerAt: 13.45 },
  { id: 'ant', text: 'ANTERIOR TO CR', at: W.ahead3, hold: W.vest3 - W.ahead3 - 0.4, color: 'white', place: 'top', dir: [1, 0], size: 84, kicker: 'LINE OF ACTION', kickerAt: W.ahead3 },
  { id: 'procl', text: 'LABIAL TIPPING', at: W.vest3, hold: 23.0 - W.vest3, color: 'white', place: 'top', dir: [1, 0], size: 88, kicker: 'INTRUSION + TENDENCY TO', kickerAt: W.vest3 },
  { id: 'newp', text: 'NEW TIE POINT', at: W.what4, hold: 2.75, color: 'white', place: 'top', dir: [0, -1], size: 84, kicker: 'SAME CANTILEVER · SAME FORCE', kickerAt: W.what4 + 0.3 },
  { id: 'posB', text: 'POSITION B', at: 28.95, hold: W.through5 - 28.95 - 0.4, color: 'white', place: 'top', dir: [0, -1], size: 92, kicker: 'TIE: ON THE EXTENSION · CR LEVEL', kickerAt: 29.2 },
  { id: 'm0', text: 'THROUGH THE CR', at: W.through5, hold: W.pure5 - W.through5 - 0.45, color: 'gold', place: 'top', dir: [-1, 0], size: 84, kicker: 'd ≈ 0 · M ≈ 0', kickerAt: W.centre5 },
  { id: 'pure', text: 'BODILY INTRUSION', at: W.pure5, hold: 37.0 - W.pure5 - 0.3, color: 'green', place: 'top', dir: [0, 1], size: 84, kicker: 'PREDOMINANTLY · IDEALISED MODEL', kickerAt: W.pure5 },
  { id: 'posC', text: 'POSITION C', at: 37.2, hold: W.further6 - 37.2 - 0.4, color: 'white', place: 'top', dir: [0, -1], size: 92, kicker: 'TIE: FURTHER DISTAL ON THE EXTENSION', kickerAt: 37.5 },
  { id: 'post', text: 'POSTERIOR TO CR', at: W.further6, hold: W.opp6 - W.further6 - 0.4, color: 'white', place: 'top', dir: [-1, 0], size: 84, kicker: 'LINE OF ACTION', kickerAt: W.further6 },
  { id: 'opp', text: 'OPPOSITE MOMENT', at: W.opp6, hold: W.retro6 - W.opp6 - 0.4, color: 'purple', place: 'top', dir: [0, -1], size: 84 },
  { id: 'retro', text: 'LINGUAL TIPPING', at: W.retro6, hold: 46.0 - W.retro6 - 0.3, color: 'white', place: 'top', dir: [-1, 0], size: 86, kicker: 'INTRUSION + TENDENCY TO', kickerAt: W.retro6 },
  { id: 'recip', text: 'REACTIVE LOAD', at: 46.6, hold: W.anchor7 - 46.6 - 0.4, color: 'red', place: 'top', dir: [0, -1], size: 80, kicker: 'ON THE ANCHOR SEGMENTS', kickerAt: 46.9 },
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
