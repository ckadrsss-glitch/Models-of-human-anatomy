# CK BIOMECHANICS — brand elements used in this film

All elements come from previous CK films; nothing new was invented.

| Element | Source | Implementation |
|---|---|---|
| **Permanent top caption** `CK ORTHODONTIC` | measured on a frame of a previous film, `assets/brand/source/reference_frame_ck_orthodontic.png` | `drawCaption()` in `src/brand.js` |
| **Background** | same reference frame, reconstructed without the subject | `assets/brand/ck_background_original_1080x1920.png` (`tools/fit_background.py`) |
| **Outro + logo** | CK BIOMECHANICS brand kit of the previous project (`ck-occlusion-breathing`, commit f23ea62) | `drawOutro()` / `drawLogo()` in `src/brand.js`, unchanged |

## 1. Top caption

* Text `CK ORTHODONTIC`, white `#eef2f7`, centred.
* Font: Inter Medium (`assets/fonts/Inter-Medium.otf`, SIL OFL) — closest open match to the
  reference typeface; cap height 19 px (font size 26.4 px), tracking 8.3 px, baseline y = 211.6 px
  on the 1080 × 1920 frame (= measured position, size and width of the reference: x 365–714 px,
  cap band y 192–212 px).
* On screen for the entire main animation (fades in with the first 0.6 s, dissolves with the outro).
* The film title «9 SKELETAL FACIAL PATTERNS» is placed separately below it.

## 2. Background

Reconstructed from the reference frame: the background pixels (subject, caption and subtitle
masked out) are fitted with a smooth left/right-symmetric polynomial per colour channel;
rms error 0.6–0.9 of one 8-bit level. Dark at the top, glow in the lower half of the frame, soft side
vignette. Used unchanged for the whole film, as the WebGL background (sRGB, not tone-mapped) and
in the outro, so it never changes between scenes.

## 3. Outro (last 3 s — identical to previous films)

| Time in outro | Action |
|---|---|
| 0.0–0.9 s | 3D content, lines and captions dissolve; background unchanged |
| 0.55–1.35 s | circle with **CK** fades in |
| 1.15–1.95 s | **BIOMECHANICS** (one word) fades in below the circle |
| 1.95–3.0 s | static final frame |

Logo: turquoise circle `#2de2d0` with white **CK** (Montserrat 700), **BIOMECHANICS** below
(Montserrat 600, tracking), one vertical axis, original proportions. No rotation, flashes or scaling.
