# English version — script and timecodes

Voice: ElevenLabs **Ryan — American Documentary Narrator** (`GQQpeRnV5mCWTgxKhGo5`), `eleven_multilingual_v2`, one take per line, tempo ×1.05 (pitch preserved). All 11 lines transcribe word-for-word (Scribe). Duration **91.7 s**.

Same visuals, measurements and storyboard as the Russian V2; each scene is stretched uniformly to fit the English narration (`src/lang.js`), and every word-anchored event (keywords, landmarks, measurements, sound accents) is re-anchored to the English word onsets. Russian on-screen glosses are removed.

| # | Scene | Time | Narration (start) |
|---|---|---|---|
| 01 | Hook | 00:00.0–00:05.7 | 00:00.3 “Same mandibular length. So why are these facial profiles so different?” |
| 02 | Polygon | 00:05.7–00:13.9 | 00:05.8 “The Björk–Jarabak analysis evaluates not only the size of the jaws, but the geometry of the facial skeleton.” |
| 03 | Saddle angle | 00:13.9–00:21.5 | 00:14.0 “The saddle angle describes the configuration of the cranial base, which influences the position of the mandible.” |
| 04 | Articular angle | 00:21.5–00:28.3 | 00:21.6 “The articular angle reflects the orientation of the ramus relative to the posterior cranial base.” |
| 05 | Gonial angle | 00:28.3–00:38.6 | 00:28.4 “The gonial angle describes the relationship between the ramus and the mandibular body. Splitting it shows their orientation in more detail.” |
| 06 | Rehook | 00:38.6–00:46.4 | 00:38.7 “But here's the catch. Even the same sum of angles can hide completely different anatomy.” |
| 07 | Linear measurements | 00:46.4–00:57.7 | 00:46.6 “Next, we assess cranial base length, ramus height and mandibular body length. This shows which components determine the position of the mandible.” |
| 08 | Jarabak ratio | 00:57.7–01:07.0 | 00:57.9 “The ratio of posterior to anterior facial height helps assess vertical proportions and the character of the skeletal morphology.” |
| 09 | Skeletal patterns | 01:07.0–01:14.2 | 01:07.2 “A low ratio is typical of a vertical pattern. A high ratio, of a horizontal one.” |
| 10 | Clinical payoff | 01:14.2–01:23.3 | 01:14.4 “So don't analyze isolated numbers — analyze how they relate. That is what reveals the patient's skeletal morphology.” |
| 11 | Question + outro | 01:23.3–01:28.7 | 01:23.5 “Which cephalometric analysis do you use most often?” |
| — | Outro (CK / BIOMECHANICS) | 01:28.7–01:31.7 | — |

Audio: `assets/audio/voiceover_en.m4a`, `music_en.m4a`, `mix_en.m4a` (−15.8 LUFS, true peak −1.5 dBTP). Subtitles: `docs/voiceover_en.srt`.

Player: `index.html?lang=en`. Offline: `FILM_LANG=en node tools/build_audio.mjs` → `FILM_LANG=en node tools/render.cjs build/frames_en 4` → `bash tools/encode.sh build/frames_en assets/audio/mix_en.m4a CK_BIOMECHANICS_BJORK_JARABAK_V2_EN`.
