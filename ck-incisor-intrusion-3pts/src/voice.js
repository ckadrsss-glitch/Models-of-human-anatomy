// Voice-over V4: ElevenLabs, voice «Принц Нури» (gJEfHTTiifXEDmO687lC), eleven_multilingual_v2, one take per line.
// Texts are verbatim from the V4 brief. start = placement on the FILM timeline (s, output time — see WARP in timeline.js);
// dur = clip length; speech = end of the last word (Scribe). `chunks` = on-screen subtitle lines (Russian).
import { LANG } from './lang.js';
export const VOICE_RU = [
  { file: 'assets/voice/v01.mp3', start: 0.15, dur: 3.42, speech: 3.39, text: 'А вы знаете, как интрузировать нижние резцы, не изменяя их наклон?', chunks: ['А вы знаете, как интрузировать', 'нижние резцы, не изменяя их наклон?'] },
  { file: 'assets/voice/v02.mp3', start: 4.4, dur: 5.09, speech: 5.062, text: 'Всё зависит от того, где проходит линия действия силы относительно центра резистентности.', chunks: ['Всё зависит от того, где проходит', 'линия действия силы', 'относительно центра резистентности.'] },
  { file: 'assets/voice/v03.mp3', start: 15.3, dur: 4.55, speech: 4.505, text: 'Если сила проходит впереди него, возникает тенденция к вестибулярному наклону резцов.', chunks: ['Если сила проходит впереди него,', 'возникает тенденция', 'к вестибулярному наклону резцов.'] },
  { file: 'assets/voice/v04.mp3', start: 25.9, dur: 5.56, speech: 5.526, text: 'Если линия действия силы проходит через центр резистентности, мы получаем преимущественно корпусную интрузию.', chunks: ['Если линия действия силы проходит', 'через центр резистентности,', 'мы получаем преимущественно', 'корпусную интрузию.'] },
  { file: 'assets/voice/v05.mp3', start: 33.1, dur: 4.41, speech: 4.365, text: 'Но что произойдёт, если сместить линию действия силы позади центра резистентности?', chunks: ['Но что произойдёт, если сместить', 'линию действия силы', 'позади центра резистентности?'] },
  { file: 'assets/voice/v06.mp3', start: 37.75, dur: 4.02, speech: 3.994, text: 'Возникает противоположный момент, способствующий лингвальному наклону коронок.', chunks: ['Возникает противоположный момент,', 'способствующий лингвальному', 'наклону коронок.'] },
  { file: 'assets/voice/v07.mp3', start: 46.0, dur: 5.88, speech: 5.851, text: 'Один кантилевер. Три положения линии действия силы. Три разных биомеханических эффекта.', chunks: ['Один кантилевер.', 'Три положения линии действия силы.', 'Три разных биомеханических эффекта.'] },
  { file: 'assets/voice/v08.mp3', start: 52.0, dur: 5.46, speech: 5.433, text: 'Именно поэтому важно контролировать не только величину силы, но и точку её приложения и направление.', chunks: ['Именно поэтому важно контролировать', 'не только величину силы,', 'но и точку её приложения', 'и направление.'] },
];

// English version (same voice «Принц Нури», eleven_multilingual_v2): same placement as the Russian lines; line 8 starts
// 0.45 s earlier so it ends before the outro. Word timings: ElevenLabs Scribe (src/words.js WORDS_EN).
export const VOICE_EN = [
  { file: 'assets/voice_en/v01.mp3', start: 0.15, dur: 3.76, speech: 3.715, text: 'Do you know how to intrude the lower incisors without changing their inclination?', chunks: ['Do you know how to intrude', 'the lower incisors without', 'changing their inclination?'] },
  { file: 'assets/voice_en/v02.mp3', start: 4.4, dur: 4.55, speech: 4.505, text: 'It all depends on where the line of action of the force passes relative to the center of resistance.', chunks: ['It all depends on where', 'the line of action of the force passes', 'relative to the center of resistance.'] },
  { file: 'assets/voice_en/v03.mp3', start: 15.3, dur: 3.71, speech: 3.669, text: 'If the force passes in front of it, the incisors tend to tip labially.', chunks: ['If the force passes in front of it,', 'the incisors tend to tip labially.'] },
  { file: 'assets/voice_en/v04.mp3', start: 25.9, dur: 5.15, speech: 5.108, text: 'If the line of action passes through the center of resistance, we get predominantly bodily intrusion.', chunks: ['If the line of action passes', 'through the center of resistance,', 'we get predominantly', 'bodily intrusion.'] },
  { file: 'assets/voice_en/v05.mp3', start: 33.1, dur: 3.94, speech: 3.901, text: 'But what happens if we shift the line of action behind the center of resistance?', chunks: ['But what happens if we shift', 'the line of action', 'behind the center of resistance?'] },
  { file: 'assets/voice_en/v06.mp3', start: 37.75, dur: 3.71, speech: 3.669, text: 'An opposite moment arises, promoting lingual tipping of the crowns.', chunks: ['An opposite moment arises,', 'promoting lingual tipping', 'of the crowns.'] },
  { file: 'assets/voice_en/v07.mp3', start: 46.0, dur: 4.31, speech: 4.272, text: 'One cantilever. Three lines of action. Three different biomechanical effects.', chunks: ['One cantilever.', 'Three lines of action.', 'Three different biomechanical effects.'] },
  { file: 'assets/voice_en/v08.mp3', start: 51.55, dur: 5.98, speech: 5.944, text: "That's why it's important to control not only the magnitude of the force, but also its point of application and direction.", chunks: ["That's why it's important to control", 'not only the magnitude of the force,', 'but also its point of application', 'and direction.'] },
];
export const VOICE = LANG === 'en' ? VOICE_EN : VOICE_RU;
