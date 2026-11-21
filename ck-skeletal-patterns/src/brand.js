// ============================================================================
//  CK BIOMECHANICS — brand kit (reference implementation for every project)
//
//  1. Brand background: deep navy close to black, soft radial gradient (centre
//     slightly lighter than the edges) with a faint cool-blue glow behind the
//     subject. Identical for the whole video and for every CK BIOMECHANICS film.
//  2. Logo: a circle with "CK" inside; "BIOMECHANICS" (one word, capitals)
//     directly below; all elements on one vertical axis.
//  3. Outro (last 3 s): content fades out over the unchanged background, the
//     circle with CK fades in, then BIOMECHANICS, then the final frame holds.
//     No rotation, flashes or scale effects.
//
//  Pure 2D-canvas code with no dependencies: reusable in any player/renderer.
// ============================================================================

export const BRAND = {
  width: 1080,
  height: 1920,
  font: 'Montserrat, system-ui, sans-serif',
  colors: {
    bgCenter: '#0a1730',   // centre of the radial gradient
    bgMid: '#06101f',
    bgEdge: '#02060d',     // edges — almost black
    glow: 'rgba(70,150,255,0.10)', // cool blue glow behind the subject
    text: '#ffffff',
    accent: '#2de2d0',     // turquoise
  },
  // glow centre (fraction of frame) — behind the subject
  glowCenter: [0.5, 0.46],
  outroDuration: 3.0,
};

const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** Paint the brand background into a 2D context (w×h). */
export function paintBackground(ctx, w = BRAND.width, h = BRAND.height) {
  const C = BRAND.colors;
  const cx = w * 0.5, cy = h * 0.5;
  const R = Math.hypot(w, h) * 0.62;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, C.bgCenter);
  g.addColorStop(0.45, C.bgMid);
  g.addColorStop(1, C.bgEdge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // faint cool glow behind the model
  const gx = w * BRAND.glowCenter[0], gy = h * BRAND.glowCenter[1];
  const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.62);
  glow.addColorStop(0, C.glow);
  glow.addColorStop(0.55, 'rgba(70,150,255,0.035)');
  glow.addColorStop(1, 'rgba(70,150,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------
// ORIGINAL series background and permanent top caption, measured on a frame of
// a previous CK film (assets/brand/source/reference_frame_ck_orthodontic.png):
//  * background: reconstructed by tools/fit_background.py (rms error < 1 level)
//    → assets/brand/ck_background_original_1080x1920.png — used unchanged;
//  * caption "CK ORTHODONTIC": Inter Medium, cap height 19 px (26.4 px font),
//    tracking 8.3 px, colour #eef2f7, centred, baseline at y = 211.6 px.
// ---------------------------------------------------------------------------
export const CAPTION = {
  text: 'CK ORTHODONTIC',
  font: '500 26.4px "Inter CK", Inter, system-ui, sans-serif',
  spacing: 8.26, color: '#eef2f7', x: 540, baseline: 211.6,
};
export function drawCaption(ctx, alpha = 1) {
  if (alpha <= 0.003) return;
  ctx.save();
  ctx.globalAlpha = alpha; ctx.fillStyle = CAPTION.color; ctx.font = CAPTION.font;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${CAPTION.spacing}px`;
  ctx.fillText(CAPTION.text, CAPTION.x + CAPTION.spacing / 2, CAPTION.baseline);
  ctx.restore();
}

let _bgImage = null;
/** Load the original background PNG (call once before the first frame). */
export async function loadBackground(url = 'assets/brand/ck_background_original_1080x1920.png') {
  const img = new Image(); img.src = url; await img.decode();
  _bgImage = img; _bgCanvas = null;
}

let _bgCanvas = null;
/** Cached full-resolution background canvas (also used as a WebGL background texture). */
export function backgroundCanvas() {
  if (_bgCanvas) return _bgCanvas;
  if (_bgImage) {
    const c = document.createElement('canvas'); c.width = BRAND.width; c.height = BRAND.height;
    c.getContext('2d').drawImage(_bgImage, 0, 0, c.width, c.height);
    return (_bgCanvas = c);
  }
  const c = document.createElement('canvas');
  c.width = BRAND.width; c.height = BRAND.height;
  paintBackground(c.getContext('2d'), c.width, c.height);
  // very light dither to avoid banding in the H.264 encode
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  let s = 1234567;
  for (let i = 0; i < d.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const n = ((s >> 16) & 3) - 1.5;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  _bgCanvas = c;
  return c;
}

/**
 * Draw the CK BIOMECHANICS logo centred on (cx, cy = circle centre).
 * circleA / wordA: opacities of the circle+CK and of BIOMECHANICS.
 */
export function drawLogo(ctx, cx, cy, { scale = 1, circleA = 1, wordA = 1 } = {}) {
  const C = BRAND.colors, F = BRAND.font;
  const r = 118 * scale;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (circleA > 0) {
    ctx.globalAlpha = circleA;
    ctx.lineWidth = 6 * scale;
    ctx.strokeStyle = C.accent;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = C.text;
    ctx.font = `700 ${Math.round(104 * scale)}px ${F}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(4 * scale)}px`;
    // optical centring of the two capitals (letter-spacing adds space on the right)
    ctx.fillText('CK', cx + 2 * scale, cy + 4 * scale);
  }
  if (wordA > 0) {
    ctx.globalAlpha = wordA;
    ctx.fillStyle = C.text;
    ctx.font = `600 ${Math.round(58 * scale)}px ${F}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(9 * scale)}px`;
    ctx.fillText('BIOMECHANICS', cx + 4.5 * scale, cy + r + 92 * scale);
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore();
}

/**
 * Universal 3-second outro. u = seconds since the outro started (0…3).
 * Returns { contentFade } — how much the underlying content should be hidden (0…1).
 * The caller draws its content first; drawOutro then covers it with the
 * identical brand background (so the background never changes) and draws the logo.
 */
export function drawOutro(ctx, u, { w = BRAND.width, h = BRAND.height } = {}) {
  if (u <= 0) return { contentFade: 0 };
  const contentFade = ease(u / 0.9);              // 0.0–0.9 s: content dissolves
  const circleA = ease((u - 0.55) / 0.8);         // 0.55–1.35 s: circle + CK
  const wordA = ease((u - 1.15) / 0.8);           // 1.15–1.95 s: BIOMECHANICS; then hold
  ctx.save();
  ctx.globalAlpha = contentFade;
  ctx.drawImage(backgroundCanvas(), 0, 0, w, h);
  ctx.restore();
  drawLogo(ctx, w / 2, h * 0.455, { circleA, wordA });
  return { contentFade };
}
