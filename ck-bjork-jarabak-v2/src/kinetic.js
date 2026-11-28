// ============================================================================
//  Kinetic typography synchronised to the narration (pure functions of time).
//  Each keyword enters on the spoken word (word onsets from src/words.js via T),
//  with a 94 → 100 % scale, short upward settle, tracking that tightens, then
//  holds for readability and leaves softly. English term + short Russian gloss.
//  Places: 'top' (y 288, under the brand line), 'bottom' (y 1566), or explicit y.
// ============================================================================
import { T, smooth, easeOut, clamp01 } from './timeline.js';

export const KEYWORDS = [
  // 01 hook
  { text: 'SAME LENGTH', at: T.same, until: 4.75, place: 'top', size: 60 },
  { text: 'DIFFERENT PROFILE', at: T.diff, until: 4.75, place: 'bottom', size: 60, color: 'amber' },
  // 02 polygon
  { text: 'BJÖRK–JARABAK', at: T.bjork, until: 10.75, place: 'top', size: 66 },
  { text: 'SKELETAL GEOMETRY', at: T.geom, until: 10.75, y: 352, size: 32, color: 'accent', spacing: 7, ru: 'геометрия лицевого скелета', ruAt: T.geom + 0.25 },
  // 03 saddle
  { text: 'SADDLE ANGLE', at: T.saddle, until: 16.85, place: 'top', size: 64, color: 'gold' },
  { text: 'N–S–Ar  ·  ref 123° ± 5°', at: T.saddle + 0.55, until: 16.85, y: 352, size: 30, color: 'white', spacing: 2, ru: 'седловидный угол · основание черепа', ruAt: T.saddle + 0.8 },
  // 04 articular
  { text: 'ARTICULAR ANGLE', at: T.art, until: 22.85, place: 'top', size: 64, color: 'blue' },
  { text: 'S–Ar–Go  ·  ref 143° ± 6°', at: T.art + 0.55, until: 22.85, y: 352, size: 30, color: 'white', spacing: 2, ru: 'артикулярный угол · ветвь и заднее основание черепа', ruAt: T.art + 0.8 },
  // 05 gonial
  { text: 'GONIAL ANGLE', at: T.gon, until: 31.0, place: 'top', size: 64, color: 'teal' },
  { text: 'Ar–Go–Me  ·  ref 130° ± 7°', at: T.gon + 0.55, until: 31.0, y: 352, size: 30, color: 'white', spacing: 2, ru: 'гониальный угол · ветвь и тело челюсти', ruAt: T.gon + 0.8 },
  // 06 rehook
  { text: 'WHAT IS THE CATCH?', at: 31.45, until: T.even - 0.05, place: 'top', size: 58 },
  { text: 'SAME SUM', at: T.sum6, until: 36.9, place: 'top', size: 66 },
  { text: 'DIFFERENT ANATOMY', at: T.diff6, until: 38.85, place: 'bottom', size: 60, color: 'amber' },
  { text: 'COMPENSATION', at: 36.95, until: 38.85, place: 'top', size: 66, color: 'accent' },
  // 07 linear
  { text: 'LINEAR MEASUREMENTS', at: 39.3, until: 48.25, place: 'top', size: 56 },
  { text: 'cranial base · ramus · body', at: 39.75, until: 43.9, y: 350, size: 30, color: 'white', spacing: 2, ru: 'основание черепа · ветвь · тело челюсти', ruAt: 40.0 },
  // 08 Jarabak ratio
  { text: 'JARABAK RATIO', at: T.help8, until: 56.45, place: 'top', size: 66 },
  { text: 'S–Go / N–Me × 100%', at: T.help8 + 0.45, until: 56.45, y: 352, size: 32, color: 'white', spacing: 2, ru: 'соотношение задней и передней высоты лица', ruAt: T.help8 + 0.7 },
  // 09 patterns
  { text: 'SKELETAL PATTERN', at: T.low9, until: 63.25, place: 'top', size: 62 },
  { text: 'vertical dimension — not Class I / II / III', at: T.low9 + 0.5, until: 63.25, y: 350, size: 28, color: 'white', spacing: 1, ru: 'вертикальные пропорции, а не скелетный класс', ruAt: T.low9 + 0.75 },
  // 10 payoff
  { text: 'NOT JUST NUMBERS', at: T.numbers - 0.35, until: 71.45, place: 'top', size: 60 },
  { text: 'UNDERSTAND THE RELATIONSHIP', at: T.rel, until: 71.45, place: 'bottom', size: 50, color: 'accent' },
];

const COLOR = { white: '#ffffff', amber: '#ffb04f', gold: '#e2bf72', blue: '#79b8ff', teal: '#38d8c6', accent: '#2de2d0' };
export const PLACE_Y = { top: 288, bottom: 1566 };
const PRE = 0.05, IN = 0.32, OUT = 0.32;

export function envelope(t, t0, t1) {
  if (t < t0 - PRE || t > t1 + OUT) return null;
  const a = Math.min(smooth((t - t0 + PRE) / IN), 1 - smooth((t - t1) / OUT));
  const e = easeOut((t - t0 + PRE) / 0.55);
  return { alpha: a, scale: 0.94 + 0.06 * e, rise: 18 * (1 - e), tracking: 8 * (1 - e), accent: 1 - smooth((t - t0 - 0.3) / 0.5) };
}

/** draw all active keywords (film passes its text() helper) */
export function drawKeywords(film, x, t) {
  for (const k of KEYWORDS) {
    const s = envelope(t, k.at, k.until);
    if (s && s.alpha > 0.003) {
      const y = (k.y ?? PLACE_Y[k.place]) + s.rise;
      const size = Math.round(k.size * s.scale);
      film.text(x, k.text, 540, y, { size, weight: k.size >= 40 ? 700 : 600, color: COLOR[k.color || 'white'], alpha: s.alpha, spacing: (k.spacing ?? 2) + s.tracking, maxW: 960 });
    }
    if (k.ru) {
      const r = envelope(t, k.ruAt, k.until);
      if (r && r.alpha > 0.003) film.text(x, k.ru, 540, (k.y ?? PLACE_Y[k.place]) + 40 + r.rise * 0.6, { size: 25, weight: 500, color: '#c9d4e6', alpha: r.alpha * 0.92, maxW: 960 });
    }
  }
}
export { clamp01 };
