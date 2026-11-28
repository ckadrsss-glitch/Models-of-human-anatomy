// ============================================================================
//  ENGLISH version of the DOUBLE CANTILEVER film (same visuals and timing).
//  Voice: ElevenLabs «Принц Нури» (gJEfHTTiifXEDmO687lC), eleven_multilingual_v2, English text.
//  Clips assets/voice/en/en1…8.mp3 (raw takes: raw1…8.mp3). Each clip is placed so its key words land on the
//  same visual events as the Russian narration; clips 4–8 are tempo-fitted (atempo 0.92 … 1.12), clip 6 has
//  four pauses shortened. Word times: ElevenLabs Scribe on the raw takes, mapped through the edits.
// ============================================================================
export const VOICE_EN = [
  { file: 'assets/voice/en/en1.mp3', start: 0.1, speech: 4.27, text: 'Uprighting a molar is easy. But how do you do it without disrupting the occlusion?', chunks: ['Uprighting a molar is easy.', 'But how do you do it without disrupting the occlusion?'] },
  { file: 'assets/voice/en/en2.mp3', start: 6.05, speech: 3.81, text: 'For a mesially tipped molar, one of the tools of correction is the cantilever.', chunks: ['For a mesially tipped molar,', 'one of the tools of correction is the cantilever.'] },
  { file: 'assets/voice/en/en3.mp3', start: 15.2, speech: 4.83, text: 'On activation, the cantilever creates a force system and a moment that uprights the molar.', chunks: ['On activation, the cantilever creates', 'a force system and a moment', 'that uprights the molar.'] },
  { file: 'assets/voice/en/en4.mp3', start: 23.3, speech: 6.41, text: 'But along with the uprighting moment comes an extrusive force on the molar, and a reciprocal intrusive load on the anchor segment.', chunks: ['But along with the uprighting moment', 'comes an extrusive force on the molar,', 'and a reciprocal intrusive load', 'on the anchor segment.'] },
  { file: 'assets/voice/en/en5.mp3', start: 32.8, speech: 6.21, text: 'And here is the problem. Without control of the vertical component, we can end up with occlusal interference.', chunks: ['And here is the problem.', 'Without control of the vertical component,', 'we can end up with occlusal interference.'] },
  { file: 'assets/voice/en/en6.mp3', start: 39.75, speech: 13.52, text: 'But there is another way. A second cantilever creates opposite vertical forces, compensating the extrusion of the molar and the intrusive load on the anchor teeth. With proper activation, we keep the uprighting moment and control the vertical movement.', chunks: ['But there is another way.', 'A second cantilever creates', 'opposite vertical forces,', 'compensating the extrusion of the molar', 'and the intrusive load on the anchor teeth.', 'With proper activation,', 'we keep the uprighting moment', 'and control the vertical movement.'] },
  { file: 'assets/voice/en/en7.mp3', start: 53.6, speech: 4.17, text: 'What matters is not just uprighting the molar, but understanding exactly how it will move.', chunks: ['What matters is not just uprighting the molar,', 'but understanding exactly how it will move.'] },
  { file: 'assets/voice/en/en8.mp3', start: 57.85, speech: 2.45, text: 'But what if we actually need the molar to extrude?', chunks: ['But what if we actually need the molar to extrude?'] },
];
// line 6 key words (raw take times → edited clip → absolute)
const MAP6 = (t) => (t - (t >= 11.21 ? 0.9 : t >= 9.5 ? 0.75 : t >= 6.83 ? 0.4 : t >= 1.45 ? 0.25 : 0)) / 1.06;
const at6 = (t) => VOICE_EN[5].start + MAP6(t);
export const W6_EN = {
  other: at6(0.453), second: at6(1.765), cantilever: at6(2.148), vertical: at6(3.576), compensate: at6(4.76),
  activation: at6(10.24), keep: at6(11.505), moment: at6(12.469), control: at6(13.317),
};
export const SUBS_EN = VOICE_EN.flatMap((v) => {
  const total = v.chunks.reduce((n, c) => n + c.length, 0);
  let t = v.start;
  return v.chunks.map((c, i) => { const d = v.speech * c.length / total; const cue = [t, i === v.chunks.length - 1 ? v.start + v.speech + 0.3 : t + d, c]; t += d; return cue; });
});
