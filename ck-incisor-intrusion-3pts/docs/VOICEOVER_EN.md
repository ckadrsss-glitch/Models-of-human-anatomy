# English version (V5 EN)

Video: `export/CK_BIOMECHANICS_Incisor_Intrusion_Three_Points_V5_FINAL_EN.mp4`.
Same animation, timing and typography as V5 (Russian). English narration and subtitles.

* Voice: ElevenLabs «Принц Нури» (gJEfHTTiifXEDmO687lC), model eleven_multilingual_v2, one take per line → `assets/voice_en/v01…v08.mp3`.
* Word timings: ElevenLabs Scribe → `src/words.js` (WORDS_EN); keyword events are mapped to the English words (`src/timeline.js`, EN_STEM).
* Switch: browser `?lang=en`, tools `CK_LANG=en` (`node tools/build_audio.mjs` → `assets/audio/mix_en.m4a`, `node tools/make_srt.mjs`,
  `node tools/render.cjs build/frames_en 4`, then `bash tools/encode.sh build/frames_en export/…_EN.mp4 assets/audio/mix_en.m4a`).
* Subtitles: `docs/voiceover_en.srt`, `docs/subtitles_en.srt`.

| # | Start (s) | Line |
|---|---|---|
| 1 | 0.15 | Do you know how to intrude the lower incisors without changing their inclination? |
| 2 | 4.40 | It all depends on where the line of action of the force passes relative to the center of resistance. |
| 3 | 15.30 | If the force passes in front of it, the incisors tend to tip labially. |
| 4 | 25.90 | If the line of action passes through the center of resistance, we get predominantly bodily intrusion. |
| 5 | 33.10 | But what happens if we shift the line of action behind the center of resistance? |
| 6 | 37.75 | An opposite moment arises, promoting lingual tipping of the crowns. |
| 7 | 46.00 | One cantilever. Three lines of action. Three different biomechanical effects. |
| 8 | 51.55 | That's why it's important to control not only the magnitude of the force, but also its point of application and direction. |
