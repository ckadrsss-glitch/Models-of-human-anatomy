// ============================================================================
//  Film renderer: Three.js scene (nine skull instances sharing one geometry)
//  + 2D overlay (typography, cephalometric lines) composited into one
//  1080×1920 output canvas that is shown, recorded and exported.
// ============================================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadSkullGeometry, createSkull } from './skull.js';
import { landmarks, clearance } from './morph.js';
import { BRAND, backgroundCanvas, drawOutro, drawCaption, loadBackground, CAPTION } from './brand.js';
import { stateAt, TEXT, LINES, COLS, ROWS, GRID, OUTRO_T0, DURATION, FPS, TEASER } from './timeline.js';

const W = BRAND.width, H = BRAND.height;
const C = BRAND.colors;
const F = BRAND.font;

export class Film {
  constructor() {
    this.duration = DURATION; this.fps = FPS;
    this.out = document.createElement('canvas'); this.out.width = W; this.out.height = H;
    this.ctx = this.out.getContext('2d');
  }

  async init() {
    await loadBackground();
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1); r.setSize(W, H, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.82;
    const sc = this.scene = new THREE.Scene();
    // brand background (unchanged, untonemapped sRGB texture — identical to the 2D outro background)
    const bg = new THREE.CanvasTexture(backgroundCanvas()); bg.colorSpace = THREE.SRGBColorSpace;
    sc.background = bg;
    const pm = new THREE.PMREMGenerator(r);
    sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    sc.environmentIntensity = 0.38;
    // soft studio lighting (camera looks along +X; face points to +Z / screen right)
    const key = new THREE.DirectionalLight(0xfff1e0, 2.6); key.position.set(-230, 260, 120); sc.add(key);
    const fill = new THREE.DirectionalLight(0xc8dcff, 0.35); fill.position.set(-200, -140, -60); sc.add(fill);
    const rim = new THREE.DirectionalLight(0x9fc7ff, 2.2); rim.position.set(160, 200, -260); sc.add(rim);
    const front = new THREE.DirectionalLight(0x9fc7ff, 0.9); front.position.set(120, 60, 300); sc.add(front);
    const top = new THREE.DirectionalLight(0xffffff, 0.3); top.position.set(0, 300, 40); sc.add(top);
    sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1410, 0.15));

    this.camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 4000);
    this.camera.position.set(-1500, 0, 0); this.camera.up.set(0, 1, 0); this.camera.lookAt(0, 0, 0);

    this.geometry = await loadSkullGeometry('assets/skull');
    this.skulls = [];
    for (let i = 0; i < 9; i++) { const s = createSkull(this.geometry); sc.add(s.group); this.skulls.push(s); }
    await Promise.all([document.fonts.load(CAPTION.font), document.fonts.load(`700 60px ${F}`), document.fonts.load(`600 30px ${F}`), document.fonts.load(`500 30px ${F}`), document.fonts.load(`400 24px ${F}`)]);
    // compile all programs once
    this.renderFrame(0); this.renderFrame(Math.round(28 * FPS));
  }

  // ------------------------------------------------------------------ frame
  renderFrame(i) { return this.renderTime(i / FPS); }

  renderTime(t) {
    t = Math.min(Math.max(t, 0), DURATION - 1e-6);
    const st = this.state = stateAt(t);
    const { k, cz, cy } = st.cam;
    const cam = this.camera;
    // ortho frustum in mm: 1080 px ↔ 1080/k mm
    cam.left = -W / 2 / k; cam.right = W / 2 / k; cam.top = H / 2 / k; cam.bottom = -H / 2 / k;
    cam.position.set(-1500, cy, cz); cam.lookAt(0, cy, cz); cam.updateProjectionMatrix();
    this.skulls.forEach((sk, j) => {
      const d = st.skulls[j];
      if (!d) { sk.setVisible(false); return; }
      sk.set(d.s, d.v, clearance(d.s));
      sk.group.position.set(d.depth, d.y, d.z);
      sk.setVisible(true);
    });
    this.renderer.render(this.scene, cam);
    const x = this.ctx;
    // global fade of the 3D layer over the identical brand background (no per-mesh transparency → no see-through artefacts)
    const fade = st.skulls[0].alpha;
    if (fade < 1) { x.drawImage(backgroundCanvas(), 0, 0); x.globalAlpha = fade; }
    x.drawImage(this.renderer.domElement, 0, 0);
    x.globalAlpha = 1;
    // permanent series caption — on screen for the whole main animation, dissolves with the outro
    drawCaption(x, Math.min(1, t / 0.6 + 0.0001));
    this.drawOverlay(x, t, st);
    if (t >= OUTRO_T0) drawOutro(x, t - OUTRO_T0);
    return this.out;
  }

  // ------------------------------------------------------------------ overlay helpers
  proj(d, p) {
    const { k, cz, cy } = this.state.cam;
    return [W / 2 + (d.z + p[0] - cz) * k, H / 2 - (d.y + p[1] - cy) * k];
  }

  text(x, str, px, py, { size = 40, weight = 700, color = C.text, alpha = 1, spacing = 0, align = 'center', baseline = 'middle' } = {}) {
    if (alpha <= 0.003) return;
    x.save();
    x.globalAlpha = alpha; x.fillStyle = color;
    x.font = `${weight} ${size}px ${F}`; x.textAlign = align; x.textBaseline = baseline;
    if ('letterSpacing' in x) x.letterSpacing = `${spacing}px`;
    // letter-spacing adds trailing space: compensate for centred text
    x.fillText(str, align === 'center' ? px + spacing / 2 : px, py);
    x.restore();
  }

  line(x, a, b, { color = '#fff', width = 2.5, alpha = 1, dash = null, extendA = 0, extendB = 0, progress = 1 } = {}) {
    if (alpha <= 0.003) return;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const A = [a[0] - ux * extendA, a[1] - uy * extendA];
    const Bfull = [b[0] + ux * extendB, b[1] + uy * extendB];
    const B = [A[0] + (Bfull[0] - A[0]) * progress, A[1] + (Bfull[1] - A[1]) * progress];
    x.save(); x.globalAlpha = alpha; x.strokeStyle = color; x.lineWidth = width; x.lineCap = 'round';
    if (dash) x.setLineDash(dash);
    x.beginPath(); x.moveTo(A[0], A[1]); x.lineTo(B[0], B[1]); x.stroke(); x.restore();
  }

  dot(x, p, { r = 6, color = C.accent, alpha = 1, label = null, dx = 14, dy = -14, size = 26 } = {}) {
    if (alpha <= 0.003) return;
    x.save(); x.globalAlpha = alpha;
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(p[0], p[1], r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = color; x.lineWidth = 2.5; x.beginPath(); x.arc(p[0], p[1], r + 3.5, 0, Math.PI * 2); x.stroke();
    x.restore();
    if (label) this.text(x, label, p[0] + dx, p[1] + dy, { size, weight: 600, alpha: alpha * 0.95, align: 'left' });
  }

  // ------------------------------------------------------------------ overlay
  drawOverlay(x, t, st) {
    const A = (f) => f(t);
    // ---- scene 1: title
    this.text(x, '9 SKELETAL FACIAL PATTERNS', W / 2, 330, { size: 64, weight: 700, alpha: A(TEXT.title), spacing: 1.5 });
    this.text(x, 'SAGITTAL × VERTICAL', W / 2, 410, { size: 30, weight: 600, color: C.accent, alpha: A(TEXT.subtitle), spacing: 10 });

    // ---- scene 2: sagittal
    const single = st.skulls.length === 1 ? st.skulls[0] : null;
    this.text(x, 'SAGITTAL RELATIONSHIP', W / 2, 300, { size: 30, weight: 600, color: C.accent, alpha: A(TEXT.sagHeader), spacing: 8 });
    const cls = [['CLASS I', 'Balanced maxillo-mandibular relationship', TEXT.classI],
      ['CLASS II', 'Mandible distal relative to the maxilla', TEXT.classII],
      ['CLASS III', 'Mandible mesial relative to the maxilla', TEXT.classIII]];
    for (const [name, desc, f] of cls) {
      const a = f(t);
      this.text(x, name, W / 2, 392, { size: 88, weight: 700, alpha: a, spacing: 3 });
      this.text(x, desc, W / 2, 1636, { size: 34, weight: 500, alpha: a * 0.9 });
    }
    // ---- scene 3: vertical
    this.text(x, 'VERTICAL PATTERN', W / 2, 300, { size: 30, weight: 600, color: C.accent, alpha: A(TEXT.vertHeader), spacing: 8 });
    const ver = [['HYPODIVERGENT', 'Flat mandibular plane · shorter lower face', TEXT.hypo],
      ['NORMODIVERGENT', 'Average mandibular plane inclination', TEXT.normo],
      ['HYPERDIVERGENT', 'Steep mandibular plane · longer lower face', TEXT.hyper]];
    for (const [name, desc, f] of ver) {
      const a = f(t);
      this.text(x, name, W / 2, 392, { size: 72, weight: 700, alpha: a, spacing: 3 });
      this.text(x, desc, W / 2, 1636, { size: 34, weight: 500, alpha: a * 0.9 });
    }
    if (single) this.drawSingleCeph(x, t, single);

    // ---- scene 4: matrix
    const gt = A(TEXT.gridTitle);
    this.text(x, '9 SKELETAL FACIAL PATTERNS', W / 2, 296, { size: 52, weight: 700, alpha: gt, spacing: 1.5 });
    this.text(x, 'SAGITTAL × VERTICAL', W / 2, 352, { size: 26, weight: 600, color: C.accent, alpha: gt, spacing: 9 });
    const ch = A(TEXT.colHead), rh = A(TEXT.rowHead);
    COLS.forEach((c, i) => this.text(x, c.label, GRID.colX[i], GRID.headerY, { size: 38, weight: 700, alpha: ch, spacing: 2 }));
    if (ch > 0) {
      x.save(); x.globalAlpha = ch * 0.35; x.strokeStyle = '#ffffff'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(40, GRID.headerY + 34); x.lineTo(W - 40, GRID.headerY + 34); x.stroke(); x.restore();
    }
    ROWS.forEach((r, i) => {
      const y = GRID.rowLabelY[i];
      if (rh > 0) { x.save(); x.globalAlpha = rh; x.fillStyle = C.accent; x.fillRect(40, y - 13, 5, 26); x.restore(); }
      this.text(x, r.label, 60, y, { size: 30, weight: 600, alpha: rh, spacing: 6, align: 'left' });
    });
    if (st.skulls.length === 9) this.drawGridCeph(x, t, st);
    // ---- teaser: the series continues with the Jarabak analysis
    const ts = TEASER.small(t), tb = TEASER.big(t);
    this.text(x, 'TO BE CONTINUED', W / 2, 930, { size: 88, weight: 700, alpha: tb, spacing: 3 });
    this.text(x, 'NEXT · JARABAK ANALYSIS', W / 2, 1030, { size: 32, weight: 600, color: C.accent, alpha: ts, spacing: 8 });
    this.text(x, 'Schematic representation of skeletal relationships', W / 2, 1770, { size: 27, weight: 500, alpha: A(TEXT.footnote) * 0.85 });
    this.text(x, 'Skull: Z-Anatomy / BodyParts3D © DBCLS · CC BY-SA 4.0', W / 2, 1812, { size: 20, weight: 400, alpha: A(TEXT.attribution) * 0.5 });
  }

  drawSingleCeph(x, t, d) {
    const L = landmarks(d.s, d.v, clearance(d.s));
    const P = (k) => this.proj(d, L[k]);
    const sag = LINES.sagittal(t), ver = LINES.vertical(t);
    const sn = Math.max(sag, ver);
    if (sn > 0) {
      this.line(x, P('S'), P('N'), { color: '#ffffff', width: 2.5, alpha: sn * 0.75, extendA: 70, extendB: 40, dash: [14, 10] });
      this.dot(x, P('S'), { alpha: sn, label: 'S', dx: -10, dy: -26, color: '#ffffff' });
      this.dot(x, P('N'), { alpha: sn, label: 'N', dx: 16, dy: -20, color: '#ffffff' });
    }
    if (sag > 0) {
      const g = (t - 6.6) / 1.2;
      this.line(x, P('N'), P('A'), { color: C.accent, width: 3, alpha: sag, extendB: 30, progress: Math.min(1, Math.max(0, g)) });
      this.line(x, P('N'), P('B'), { color: '#ffd28a', width: 3, alpha: sag, extendB: 40, progress: Math.min(1, Math.max(0, g - 0.2)) });
      this.dot(x, P('A'), { alpha: sag * Math.min(1, Math.max(0, g * 2 - 0.6)), label: 'A', dx: 18, dy: -6, color: C.accent });
      this.dot(x, P('B'), { alpha: sag * Math.min(1, Math.max(0, g * 2 - 1)), label: 'B', dx: 18, dy: 4, color: '#ffd28a' });
    }
    if (ver > 0) {
      const g = Math.min(1, Math.max(0, (t - 13.4) / 1.0));
      // mandibular plane (Go–Me), extended posteriorly to show convergence with S–N
      this.line(x, P('Me'), P('Go'), { color: C.accent, width: 3.5, alpha: ver, extendA: 30, extendB: 150, progress: g });
      this.dot(x, P('Go'), { alpha: ver * g, label: 'Go', dx: -64, dy: 6, color: C.accent });
      this.dot(x, P('Me'), { alpha: ver * g, label: 'Me', dx: 16, dy: 22, color: C.accent });
      // lower anterior face height bracket (ANS level → menton), no values
      const a = P('ANS'), m = P('Me');
      const bx = Math.max(a[0], m[0]) + 78;
      const al = ver * Math.min(1, Math.max(0, (t - 14.0) / 0.8));
      this.line(x, [bx, a[1]], [bx, m[1]], { color: '#ffffff', width: 2.5, alpha: al * 0.8 });
      this.line(x, [bx - 14, a[1]], [bx + 14, a[1]], { color: '#ffffff', width: 2.5, alpha: al * 0.8 });
      this.line(x, [bx - 14, m[1]], [bx + 14, m[1]], { color: '#ffffff', width: 2.5, alpha: al * 0.8 });
      this.line(x, a, [bx - 18, a[1]], { color: '#ffffff', width: 1.5, alpha: al * 0.35, dash: [6, 8] });
      this.line(x, m, [bx - 18, m[1]], { color: '#ffffff', width: 1.5, alpha: al * 0.35, dash: [6, 8] });
    }
  }

  drawGridCeph(x, t, st) {
    const a = LINES.grid(t);
    if (a <= 0) return;
    const g = Math.min(1, Math.max(0, (t - 26.2) / 1.4));
    for (const d of st.skulls) {
      const L = landmarks(d.s, d.v, clearance(d.s));
      const P = (k) => this.proj(d, L[k]);
      this.line(x, P('S'), P('N'), { color: '#ffffff', width: 2.5, alpha: a * 0.85, extendA: 16, extendB: 10, dash: [8, 6], progress: g });
      this.line(x, P('Me'), P('Go'), { color: C.accent, width: 2.5, alpha: a, extendA: 8, extendB: 40, progress: g });
    }
  }

  grab(type = 'image/jpeg', q = 0.95) { return this.out.toDataURL(type, q); }
}
