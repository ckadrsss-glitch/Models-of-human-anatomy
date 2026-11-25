// ============================================================================
//  Kinetic typography synchronised to the narration (pure functions of time; no DOM).
//  HEAR → READ → SEE: every keyword enters on the spoken word (word-level timing from
//  src/words.js), with a 95 → 100 % scale, opacity fade, directional reveal, settling
//  tracking and a short motion-blur trail; it holds for readability and leaves softly.
//  English scientific terms on screen (brief), Russian narration.
// ============================================================================
import { W, clamp01, smooth, easeOut } from './timeline.js';

/**
 * place: 'top' (upper safe area under the brand line) | 'mid' (question, centre).
 * color: blue (therapeutic) | red (side effects) | gold (CR) | green (controlled trajectory) | white.
 * from: entrance accent colour that settles into `color`.
 */
export const KEYWORDS = [
  { id: 'title', text: 'MOLAR UPRIGHTING', at: -0.3, hold: 2.6, color: 'white', place: 'top', dir: [0, -1], size: 84, kicker: '47 · MESIAL TIPPING', kickerAt: -0.3 },
  { id: 'interf', text: 'OCCLUSAL INTERFERENCE', at: 3.28, hold: 1.25, color: 'white', from: 'red', place: 'top', dir: [0, -1], size: 66 },
  { id: 'cant', text: 'CANTILEVER', at: W.cantilever, hold: 1.5, color: 'blue', place: 'top', dir: [1, 0], size: 92 },
  { id: 'seg', text: 'SEGMENTED ARCH MECHANICS', at: 10.55, hold: 3.05, color: 'white', place: 'top', dir: [0, -1], size: 54, kicker: 'ONE-COUPLE SYSTEM', kickerAt: 11.0 },
  { id: 'passive', text: 'PASSIVE POSITION', at: 14.25, hold: 1.05, color: 'white', place: 'top', dir: [0, -1], size: 66 },
  { id: 'act', text: 'ACTIVATION', at: W.activation, hold: 1.85, color: 'blue', place: 'top', dir: [0, -1], size: 88 },
  { id: 'moment', text: 'MOMENT', at: W.moment, hold: 2.7, color: 'blue', place: 'top', dir: [-1, 0], size: 96 },
  { id: 'cr', text: 'CENTER OF RESISTANCE', at: 22.75, hold: 1.05, color: 'gold', place: 'top', dir: [0, -1], size: 60 },
  { id: 'upm', text: 'UPRIGHTING MOMENT', at: W.upMoment, hold: 1.35, color: 'blue', place: 'top', dir: [-1, 0], size: 64 },
  { id: 'ext', text: 'EXTRUSIVE FORCE', at: W.extrusive, hold: 1.7, color: 'red', place: 'top', dir: [0, -1], size: 70 },
  { id: 'recip', text: 'RECIPROCAL INTRUSION', at: W.intrusive, hold: 2.4, color: 'red', place: 'top', dir: [0, 1], size: 60, kicker: 'ANCHOR SEGMENT', kickerAt: W.anchor },
  { id: 'side', text: 'THE SIDE EFFECT', at: W.problem, hold: 1.75, color: 'white', from: 'red', place: 'top', dir: [0, -1], size: 84 },
  { id: 'vert', text: 'VERTICAL CONTROL', at: W.vertical, hold: 2.5, color: 'white', place: 'top', dir: [0, -1], size: 76 },
  { id: 'skel', text: 'SKELETAL ANCHORAGE', at: W.skeletal, hold: 1.35, color: 'blue', place: 'top', dir: [0, -1], size: 68, kicker: 'MINISCREW', kickerAt: W.additional + 0.2 },
  { id: 'comp', text: 'FORCE COMPENSATION', at: W.compensate, hold: 1.65, color: 'blue', place: 'top', dir: [1, 0], size: 68 },
  { id: 'ctrl', text: 'CONTROLLED UPRIGHTING', at: W.control, hold: 3.1, color: 'green', place: 'top', dir: [-1, 0], size: 64 },
  { id: 'q', text: 'WHAT IF EXTRUSION', text2: 'IS DESIRABLE?', at: W.question, hold: 2.55, out: 0.7, color: 'white', place: 'mid', dir: [0, -1], size: 74 },
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
    scale: 0.95 + 0.05 * e,
    reveal: easeOut((t - t0) / 0.45),
    tracking: 10 * (1 - e) + 3,
    drift: 22 * (1 - e) + 8 * smooth((t - t1) / out),
    blur: clamp01(1 - (t - t0) / 0.3),
    accent: 1 - smooth((t - t0 - 0.35) / 0.5),
  };
}
export function keywordState(k, t) { return envelope(t, k.at - PRE, k.at + k.hold, k.out ?? OUT); }
export function kickerState(k, t) { return k.kicker ? envelope(t, k.kickerAt - PRE, k.at + k.hold, k.out ?? OUT) : null; }

/** strongest keyword envelope at time t (dims secondary labels, gently focuses the camera) */
export function focusLevel(t) {
  let f = 0;
  for (const k of KEYWORDS) { const s = keywordState(k, t); if (s) f = Math.max(f, s.alpha); }
  return f;
}
