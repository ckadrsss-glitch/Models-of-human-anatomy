# English version — DOUBLE CANTILEVER

File: `export/CK_BIOMECHANICS_Molar_Uprighting_Double_Cantilever_EN.mp4` (1080 × 1920, 30 fps, 63.3 s, H.264 + AAC, ≤ 25 MB).
Same visuals, camera, timing, typography and brand outro as the Russian double-cantilever film
(`..._Double_Cantilever_FINAL.mp4`, unchanged); only the narration and the burned-in subtitles are English.
Player: `index.html?dc=1&lang=en`.

## Voice-over

Voice: ElevenLabs «Принц Нури» (`gJEfHTTiifXEDmO687lC`), eleven_multilingual_v2, English text — the series voice.
Clips `assets/voice/en/en1…8.mp3` (raw takes `raw1…8.mp3`). Each clip is placed so that its key words land on the same
visual events as the Russian narration. Clips 4–8 are tempo-fitted (×0.92 … ×1.12). In clip 6 four pauses are shortened.
Word timing: ElevenLabs Scribe (`src/voice_en.js`).

| # | Start | Text |
|---|---|---|
| 1 | 00:00.10 | Uprighting a molar is easy. But how do you do it without disrupting the occlusion? |
| 2 | 00:06.05 | For a mesially tipped molar, one of the tools of correction is the cantilever. |
| 3 | 00:15.20 | On activation, the cantilever creates a force system and a moment that uprights the molar. |
| 4 | 00:23.30 | But along with the uprighting moment comes an extrusive force on the molar, and a reciprocal intrusive load on the anchor segment. |
| 5 | 00:32.80 | And here is the problem. Without control of the vertical component, we can end up with occlusal interference. |
| 6 | 00:39.75 | But there is another way. A second cantilever creates opposite vertical forces, compensating the extrusion of the molar and the intrusive load on the anchor teeth. With proper activation, we keep the uprighting moment and control the vertical movement. |
| 7 | 00:53.60 | What matters is not just uprighting the molar, but understanding exactly how it will move. |
| 8 | 00:57.85 | But what if we actually need the molar to extrude? |

The keywords DOUBLE CANTILEVER, FORCE BALANCE and CONTROLLED UPRIGHTING follow the English words
(«cantilever», «compensating», «control»). The other keywords stay on the visual events, which the English words
meet within a few tenths of a second.

## Build

```bash
EN=1 node tools/build_audio_dc.mjs                        # assets/audio/mix_dc_en.m4a
DC=1 EN=1 node tools/render.cjs build/frames_en 4 0 1899  # all frames (the subtitles are burned in)
T=63.3 VB=2800k bash tools/encode.sh build/frames_en export/CK_BIOMECHANICS_Molar_Uprighting_Double_Cantilever_EN.mp4 assets/audio/mix_dc_en.m4a
```

## Caption (Instagram)

**Uprighting a lower second molar is easy. Keeping the occlusion is not.**

A single cantilever delivers the uprighting moment, but also extrudes the molar and intrudes the anchor teeth.
A second cantilever adds opposite vertical forces: with matched activation they balance out, while the uprighting
moment is kept.

What if extrusion is actually desirable? Tell us in the comments 👇

*Qualitative biomechanical demonstration, not an FE simulation.*

#orthodontics #biomechanics #molaruprighting #cantilever #segmentedarch #orthodontist #CKBIOMECHANICS
