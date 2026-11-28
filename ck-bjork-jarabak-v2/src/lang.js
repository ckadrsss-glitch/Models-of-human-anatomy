// ============================================================================
//  Language layer. The film is authored once on the "animation clock" (the Russian
//  V2 timeline, 0–80 s). A language version only changes the OUTPUT clock:
//    • RU — identity (output = animation, 80 s).
//    • EN — every scene is stretched uniformly to fit the (longer) English narration;
//      warp(tOut) → tAnim, unwarp(tAnim) → tOut. Word-anchored events use the English
//      word onsets (src/words.js → WORDS_EN), mapped onto the animation clock.
//  Select with ?lang=en (browser) or FILM_LANG=en (Node tools).
// ============================================================================
import { VOICE as VOICE_RU, VOICE_EN, EN_TEMPO } from './voice.js';
import { WORDS, WORDS_EN } from './words.js';

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') : globalThis.process?.env?.FILM_LANG;
export const LANG = q === 'en' ? 'en' : 'ru';

// scene bounds on the animation clock (RU V2 timeline); the last segment is the 3-s brand outro
export const BOUNDS = [0, 4.9, 10.9, 17.0, 23.0, 31.2, 39.0, 48.4, 56.6, 63.4, 71.6, 77.0, 80.0];
export const ANIM_DURATION = 80;

function buildEN() {
  const seg = [];   // [animStart, animEnd, outStart, outEnd]
  const voice = [];
  let out = 0;
  for (let i = 0; i < 11; i++) {
    const s = BOUNDS[i], e = BOUNDS[i + 1], ru = VOICE_RU[i];
    const pre = ru.start - s, tailRU = e - (ru.start + ru.dur);
    const dur = VOICE_EN[i].dur / EN_TEMPO;
    const len = Math.max(e - s, pre + dur + Math.max(0.35, tailRU * 0.6));
    seg.push([s, e, out, out + len]);
    voice.push({ ...VOICE_EN[i], start: +(out + pre).toFixed(3), dur: +dur.toFixed(3) });
    out += len;
  }
  seg.push([77, 80, out, out + 3]);
  return { seg, voice, duration: +(out + 3).toFixed(3) };
}
const EN = LANG === 'en' ? buildEN() : null;

export const DURATION_OUT = EN ? EN.duration : ANIM_DURATION;
export const VOICE = EN ? EN.voice : VOICE_RU;
export const WORDS_ACTIVE = EN ? WORDS_EN.map((l) => l.map(([w, a, b]) => [w, a / EN_TEMPO, b / EN_TEMPO])) : WORDS;

export function warp(tOut) {
  if (!EN) return tOut;
  for (const [s, e, o0, o1] of EN.seg) if (tOut <= o1) return s + (Math.max(tOut, o0) - o0) * (e - s) / (o1 - o0);
  return ANIM_DURATION;
}
export function unwarp(tAnim) {
  if (!EN) return tAnim;
  for (const [s, e, o0, o1] of EN.seg) if (tAnim <= e) return o0 + (Math.max(tAnim, s) - s) * (o1 - o0) / (e - s);
  return EN.duration;
}
export const SEGMENTS = EN ? EN.seg : null;
export const EN_TEMPO_ACTIVE = EN ? EN_TEMPO : 1;
