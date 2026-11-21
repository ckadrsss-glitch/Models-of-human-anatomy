# CK BIOMECHANICS — 9 Skeletal Facial Patterns

**Sagittal × Vertical** · premium orthodontic 3D animation · 40 s · 9:16 (1080 × 1920) · 30 fps

Three.js / WebGL project that shows the illustrative 3 × 3 matrix of two independent diagnostic
characteristics — sagittal skeletal relationship (Class I / II / III) and vertical pattern
(hypo- / normo- / hyperdivergent). It is **not** a stand-alone nine-diagnosis classification.

| | |
|---|---|
| Final video | `export/CK_BIOMECHANICS_9_skeletal_patterns.mp4` (H.264 High + AAC, 1080×1920, 30 fps, 40 s) |
| Live player | `index.html` (GitHub Pages: `…/Models-of-human-anatomy/ck-skeletal-patterns/`) |
| Anatomy | Z-Anatomy / BodyParts3D skull, CC BY-SA 4.0 — see [docs/ASSETS.md](docs/ASSETS.md) |
| Morphology model & QA | [docs/SCIENCE.md](docs/SCIENCE.md) |
| Brand (background, logo, outro) | [docs/BRAND.md](docs/BRAND.md), `src/brand.js` — reused unchanged from the CK BIOMECHANICS brand kit |

## Storyboard

| Time | Scene | Content |
|---|---|---|
| 00:00–00:05 | 01 Intro | Skull fades in, strict lateral view, static camera; *9 SKELETAL FACIAL PATTERNS* / *SAGITTAL × VERTICAL* |
| 00:05–00:13 | 02 Sagittal | Skull centres; *SAGITTAL RELATIONSHIP*: Class I → II → III by anatomical morphing; S–N, N–A, N–B tracing |
| 00:13–00:21 | 03 Vertical | *VERTICAL PATTERN*: hypo → normo → hyperdivergent; mandibular plane (Go–Me) against S–N, lower-face-height bracket |
| 00:21–00:37 | 04 Matrix | Camera pulls back, one skull becomes nine; 3 × 3 matrix (columns Class I/II/III, rows hypo/normo/hyper), static ≈ 12 s, S–N and Go–Me in every cell |
| 00:37–00:40 | 05 Outro | CK BIOMECHANICS brand-kit outro, unchanged (last 3 s, as in every film of the series): skulls dissolve over the unchanged background, CK circle, then BIOMECHANICS, hold |

No numbers (angles, thresholds) are shown anywhere in the film.

## Run

```bash
cd ck-skeletal-patterns
node tools/serve.cjs 8123          # → http://localhost:8123/   (any static server works)
```

ES modules and `fetch` need a web server — opening `index.html` from disk does not work.
No build step and no network access are needed: three.js and mp4-muxer are vendored in `vendor/`.

Player controls: **▶ Play / ❚❚ Pause** (space), **↺ Restart**, scrubber, ←/→ frame step (Shift: 1 s),
scene buttons, sound toggle (licence-free procedural ambience, `assets/audio/ambient.m4a`).

### Recording / export in the browser

* **● Record WebM** — real-time recording of the 1080×1920 output canvas with `MediaRecorder`
  (VP9/VP8, 16 Mbit/s). Playback restarts at 0 and stops at 40 s; the file is downloaded automatically.
  Keep the tab visible while recording (browsers throttle hidden tabs). The WebM is silent.
* **⬇ Export MP4 (frame-accurate)** — renders every frame deterministically and encodes H.264 with
  WebCodecs + mp4-muxer, independent of the machine's speed (Chrome / Edge ≥ 113). Silent.

Convert the WebM to MP4 (and add the soundtrack) with FFmpeg:

```bash
ffmpeg -i CK_BIOMECHANICS_9_skeletal_patterns.webm -i assets/audio/ambient.m4a \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -r 30 \
  -vf "scale=1080:1920:flags=lanczos" -c:a aac -b:a 160k -shortest -movflags +faststart \
  CK_BIOMECHANICS_9_skeletal_patterns.mp4
```

(Without sound: drop `-i assets/audio/ambient.m4a`, `-map …` and the audio options.)

### Offline render (server / CI, no GPU needed)

```bash
npm i -D playwright && npx playwright install chromium   # if Playwright is not installed
node tools/render.cjs build/frames 3      # headless Chromium (SwiftShader WebGL) → 1200 JPEG frames
node tools/build_audio.mjs                # regenerates assets/audio/ambient.m4a (optional)
bash tools/encode.sh build/frames         # → export/CK_BIOMECHANICS_9_skeletal_patterns.mp4
node tools/stills.cjs build/stills 3 9.5 15 30 37    # control stills at given seconds
```

Every animated value is a pure function of time (`src/timeline.js`), so the player, scrubbing,
the in-browser export and the offline render produce identical frames.

### Rebuilding the skull asset

```bash
pip install bpy==5.3.0 numpy        # Blender as a Python module (no Blender install needed)
unzip ../Z-Anatomy.zip Z-Anatomy/Startup.blend -d /tmp/za
python tools/export_skull.py /tmp/za/Z-Anatomy/Startup.blend assets
```

`debug.html?s=1&v=-1&lm=1&box=-10,110,-115,5` shows any skull state with a millimetre grid and the
landmarks computed by the JS morphology model (used to verify that lines and geometry coincide).

## Structure

```
index.html            player UI + importmap (three from vendor/)
src/timeline.js       scenes, camera, morph schedule, text/line timing (pure functions of t)
src/morph.js          sagittal × vertical morphology model — one definition, emitted as JS and GLSL
src/skull.js          binary mesh loader, bone/enamel/dentine materials, GPU warp with exact normals
src/film.js           scene, lighting, nine skull instances, overlay typography & cephalometric lines
src/brand.js          CK BIOMECHANICS background, logo and outro (brand kit, unchanged)
src/main.js           playback, WebM recording, WebCodecs MP4 export, headless render API
assets/skull.bin|json Z-Anatomy skull export (79 682 vertices, 28 teeth, baked AO)
assets/audio/         procedural ambience (generated by tools/build_audio.mjs)
tools/                skull export (bpy), landmark tools, offline render, encoding, stills
```

## Licences

* Skull, teeth and every derivative (asset files, rendered video) — **CC BY-SA 4.0**:
  Z-Anatomy (Gauthier Kervyn, Marcin Zielinski), derived from BodyParts3D © The Database Center for
  Life Science (CC BY-SA 2.1 JP). Attribution is shown on screen in the matrix scene.
* three.js, mp4-muxer — MIT (`vendor/…/LICENSE`). Montserrat — SIL Open Font License 1.1.
* Soundtrack — generated procedurally by `tools/build_audio.mjs`, no third-party music.
