// ============================================================================
//  Film renderer: Three.js scene (up to three skull instances sharing one
//  geometry) + 2D overlay (typography, cephalometric construction) composited
//  into one 1080×1920 output canvas that is shown, recorded and exported.
//  Every number on screen is measured on the deformed bone (src/morph.js).
// ============================================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadSkullGeometry, createSkull } from './skull.js';
import { ceph, LM } from './morph.js';
import { BRAND, backgroundCanvas, drawOutro, drawTopLabel } from './brand.js';
import { stateAt, TEXT, TRIO, VERT, NEUT, HORI, ROT, STACK, OUTRO_T0, DURATION, FPS, VOICE, clamp01, smooth } from './timeline.js';

const W = BRAND.width, H = BRAND.height;
const C = BRAND.colors;
const F = BRAND.font;
const COL = {
  post: C.accent,          // S–Go  posterior facial height
  ant: '#ffd28a',          // N–Me  anterior facial height
  saddle: '#9cc8ff', articular: C.accent, gonial: '#ffb07c',
  white: '#ffffff', dim: '#c9d6ee',
};
const r1 = (x) => Math.round(x * 10) / 10;
const fx1 = (x) => r1(x).toFixed(1);
/** Björk angles rounded to 0.1° and their sum computed from the rounded values (so the arithmetic on screen adds up) */
export function bjork(c) {
  const a = r1(c.saddle), b = r1(c.articular), g = r1(c.gonial);
  return { a, b, g, sum: Math.round((a + b + g) * 10) / 10 };
}

export class Film {
  constructor() {
    this.duration = DURATION; this.fps = FPS;
    this.out = document.createElement('canvas'); this.out.width = W; this.out.height = H;
    this.ctx = this.out.getContext('2d');
    this.subtitles = false;
    this._ceph = new Map();
  }

  async init() {
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
    // soft studio lighting — identical to the previous CK films (camera looks along +X; face to +Z / screen right)
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
    for (let i = 0; i < 3; i++) { const s = createSkull(this.geometry); sc.add(s.group); this.skulls.push(s); }
    await Promise.all([
      document.fonts.load(`700 60px ${F}`), document.fonts.load(`600 30px ${F}`), document.fonts.load(`500 30px ${F}`),
      document.fonts.load(`400 24px ${F}`), document.fonts.load('500 28px Inter'), document.fonts.load(`500 30px ${F}`, 'Почему'),
    ]);
    this.renderTime(0); this.renderTime(26); this.renderTime(45);   // compile programs once
  }

  cephOf(v, r = 0) {
    const key = v.toFixed(5) + '|' + r.toFixed(4);
    let c = this._ceph.get(key);
    if (!c) { c = ceph(v, r); if (this._ceph.size > 4000) this._ceph.clear(); this._ceph.set(key, c); }
    return c;
  }

  // ------------------------------------------------------------------ frame
  renderFrame(i) { return this.renderTime(i / FPS); }

  renderTime(t) {
    t = Math.min(Math.max(t, 0), DURATION - 1e-6);
    const st = this.state = stateAt(t);
    const { k, cz, cy } = st.cam;
    const cam = this.camera;
    cam.left = -W / 2 / k; cam.right = W / 2 / k; cam.top = H / 2 / k; cam.bottom = -H / 2 / k;
    cam.position.set(-1500, cy, cz); cam.lookAt(0, cy, cz); cam.updateProjectionMatrix();
    this.skulls.forEach((sk, j) => {
      const d = st.skulls[j];
      if (!d || !this.onScreen(d)) { sk.setVisible(false); return; }
      sk.set(d.v, d.r);
      sk.group.position.set(d.depth, d.y, d.z);
      sk.setVisible(true);
    });
    this.renderer.render(this.scene, cam);
    const x = this.ctx;
    x.globalAlpha = 1;
    // global fade of the 3D layer over the identical brand background (no per-mesh transparency → no see-through artefacts)
    const fade = st.alpha;
    if (fade < 1) { x.drawImage(backgroundCanvas(), 0, 0); x.globalAlpha = fade; }
    x.drawImage(this.renderer.domElement, 0, 0);
    x.globalAlpha = 1;
    this.drawOverlay(x, t, st);
    if (this.subtitles) this.drawSubtitle(x, t);
    drawTopLabel(x, 1);
    if (t >= OUTRO_T0) drawOutro(x, t - OUTRO_T0);
    return this.out;
  }

  onScreen(d) {
    const { k, cz } = this.state.cam;
    const px = W / 2 + (d.z - cz) * k;
    return px + 110 * k > -20 && px - 110 * k < W + 20;
  }

  // ------------------------------------------------------------------ drawing helpers
  proj(d, p) {
    const { k, cz, cy } = this.state.cam;
    return [W / 2 + (d.z + p[0] - cz) * k, H / 2 - (d.y + p[1] - cy) * k];
  }

  text(x, str, px, py, { size = 40, weight = 700, color = C.text, alpha = 1, spacing = 0, align = 'center', baseline = 'middle', shadow = true, font = F } = {}) {
    if (alpha <= 0.003) return;
    x.save();
    x.globalAlpha = alpha; x.fillStyle = color;
    x.font = `${weight} ${size}px ${font}`; x.textAlign = align; x.textBaseline = baseline;
    if (shadow) { x.shadowColor = 'rgba(0,6,18,0.9)'; x.shadowBlur = 14; }
    if ('letterSpacing' in x) x.letterSpacing = `${spacing}px`;
    x.fillText(str, align === 'center' ? px + spacing / 2 : (align === 'right' ? px + spacing : px), py);
    x.restore();
  }

  /** a line with a soft dark underlay so it reads on bone and on the background */
  line(x, a, b, { color = '#fff', width = 3, alpha = 1, dash = null, extendA = 0, extendB = 0, progress = 1, under = true } = {}) {
    if (alpha <= 0.003 || progress <= 0) return;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const A = [a[0] - ux * extendA, a[1] - uy * extendA];
    const Bf = [b[0] + ux * extendB, b[1] + uy * extendB];
    const B = [A[0] + (Bf[0] - A[0]) * progress, A[1] + (Bf[1] - A[1]) * progress];
    x.save(); x.lineCap = 'round';
    if (dash) x.setLineDash(dash);
    if (under) { x.globalAlpha = alpha * 0.55; x.strokeStyle = 'rgba(0,8,22,1)'; x.lineWidth = width + 4; x.beginPath(); x.moveTo(...A); x.lineTo(...B); x.stroke(); }
    x.globalAlpha = alpha; x.strokeStyle = color; x.lineWidth = width;
    x.beginPath(); x.moveTo(...A); x.lineTo(...B); x.stroke(); x.restore();
  }

  dot(x, p, { r = 6, color = C.accent, alpha = 1 } = {}) {
    if (alpha <= 0.003) return;
    const pop = 1 + 0.6 * Math.max(0, 1 - alpha) * alpha * 4;       // tiny pop while appearing
    x.save(); x.globalAlpha = alpha;
    x.fillStyle = 'rgba(0,8,22,0.6)'; x.beginPath(); x.arc(p[0], p[1], (r + 6) * pop, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(p[0], p[1], r * pop, 0, Math.PI * 2); x.fill();
    x.strokeStyle = color; x.lineWidth = 2.5; x.beginPath(); x.arc(p[0], p[1], (r + 3.5) * pop, 0, Math.PI * 2); x.stroke();
    x.restore();
  }

  /** landmark with label: abbreviation (bold) + optional full name */
  landmark(x, p, abbr, name, { alpha = 1, dx = 16, dy = -18, align = 'left', color = '#ffffff', size = 30 } = {}) {
    if (alpha <= 0.003) return;
    this.dot(x, p, { alpha, color });
    const tx = p[0] + dx, ty = p[1] + dy;
    if (!name) { this.text(x, abbr, tx, ty, { size, weight: 700, alpha, align }); return; }
    x.save(); x.font = `700 ${size}px ${F}`; const wa = x.measureText(abbr + ' ').width;
    x.font = `500 ${size * 0.8}px ${F}`; const wn = x.measureText(name).width; x.restore();
    const x0 = align === 'left' ? tx : tx - wa - wn;
    this.text(x, abbr, x0, ty, { size, weight: 700, alpha, align: 'left' });
    this.text(x, name, x0 + wa, ty + 1, { size: size * 0.8, weight: 500, alpha: alpha * 0.9, align: 'left', color: COL.dim });
  }

  /** interior angle arc at o between rays to a and b (screen space) */
  arc(x, o, a, b, { radius = 46, color = '#fff', alpha = 1, progress = 1, width = 3 } = {}) {
    if (alpha <= 0.003 || progress <= 0) return;
    const a1 = Math.atan2(a[1] - o[1], a[0] - o[0]);
    let a2 = Math.atan2(b[1] - o[1], b[0] - o[0]);
    let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    x.save(); x.lineCap = 'round';
    x.globalAlpha = alpha * 0.18; x.fillStyle = color;
    x.beginPath(); x.moveTo(...o); x.arc(o[0], o[1], radius, a1, a1 + d * progress, d < 0); x.closePath(); x.fill();
    x.globalAlpha = alpha * 0.55; x.strokeStyle = 'rgba(0,8,22,1)'; x.lineWidth = width + 3;
    x.beginPath(); x.arc(o[0], o[1], radius, a1, a1 + d * progress, d < 0); x.stroke();
    x.globalAlpha = alpha; x.strokeStyle = color; x.lineWidth = width;
    x.beginPath(); x.arc(o[0], o[1], radius, a1, a1 + d * progress, d < 0); x.stroke();
    x.restore();
  }

  arrowHead(x, tip, from, { color = '#fff', alpha = 1, size = 16 } = {}) {
    const a = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
    x.save(); x.globalAlpha = alpha; x.fillStyle = color;
    x.beginPath(); x.moveTo(...tip);
    x.lineTo(tip[0] - size * Math.cos(a - 0.45), tip[1] - size * Math.sin(a - 0.45));
    x.lineTo(tip[0] - size * Math.cos(a + 0.45), tip[1] - size * Math.sin(a + 0.45));
    x.closePath(); x.fill(); x.restore();
  }

  // ------------------------------------------------------------------ overlay
  drawOverlay(x, t, st) {
    const A = (f) => f(t);
    const fade = st.alpha;
    // ---- scene 1: title
    this.text(x, 'JARABAK ANALYSIS', W / 2, 330, { size: 76, weight: 700, alpha: A(TEXT.title), spacing: 2 });
    this.text(x, 'VERTICAL FACIAL PATTERNS', W / 2, 410, { size: 30, weight: 600, color: C.accent, alpha: A(TEXT.subtitle), spacing: 9 });

    if (t >= 6.4 && t < 17.6) this.scene2(x, t, st.skulls[0]);
    if (t >= 17.4 && t < 30.6) this.scene3(x, t, st);
    if (t >= 30.4 && t < 43.3) this.scene4(x, t, st);
    if (t >= 43.0 && t < 53.4) this.scene5(x, t, st, fade);
    if (t >= 53.0) this.scene6(x, t, st, fade);
  }

  heightsLines(x, d, c, { alpha = 1, pSGo = 1, pNMe = 1, width = 4, labels = true, la = 1 } = {}) {
    const P = (p) => this.proj(d, p);
    this.line(x, P(c.S), P(c.Go), { color: COL.post, width, alpha, progress: pSGo });
    this.line(x, P(c.N), P(c.Me), { color: COL.ant, width, alpha, progress: pNMe });
    if (labels) {
      const s = 27;
      for (const [p, ab, dx, dy, al] of [[c.S, 'S', -16, -22, 'right'], [c.N, 'N', 18, -20, 'left'], [c.Go, 'Go', -20, 8, 'right'], [c.Me, 'Me', 18, 18, 'left']]) {
        this.dot(x, P(p), { alpha: alpha * la, color: '#ffffff', r: 5 });
        this.text(x, ab, P(p)[0] + dx, P(p)[1] + dy, { size: s, weight: 700, alpha: alpha * la, align: al });
      }
    }
  }

  // ---------------------------------------------------------------- 02 facial heights
  scene2(x, t, d) {
    const c = this.cephOf(d.v, d.r);
    const P = (p) => this.proj(d, p);
    const hA = TEXT.heights(t);
    this.text(x, 'FACIAL HEIGHTS', W / 2, 300, { size: 30, weight: 600, color: C.accent, alpha: hA, spacing: 9 });
    const ap = (t0) => hA * smooth((t - t0) / 0.45);
    const T = TEXT.pts;
    const gS = clamp01((t - TEXT.sgo) / 1.0), gN = clamp01((t - TEXT.nme) / 1.0);
    // lines (drawn under the points)
    this.line(x, P(c.S), P(c.Go), { color: COL.post, width: 4.5, alpha: hA, progress: smooth(gS) });
    this.line(x, P(c.N), P(c.Me), { color: COL.ant, width: 4.5, alpha: hA, progress: smooth(gN) });
    this.landmark(x, P(c.S), 'S', 'Sella', { alpha: ap(T.S), dx: -18, dy: -30, align: 'right' });
    this.landmark(x, P(c.N), 'N', 'Nasion', { alpha: ap(T.N), dx: 20, dy: -30, align: 'right' });
    this.landmark(x, P(c.Go), 'Go', 'Gonion', { alpha: ap(T.Go), dx: -22, dy: 10, align: 'right' });
    this.landmark(x, P(c.Me), 'Me', 'Menton', { alpha: ap(T.Me), dx: -22, dy: 26, align: 'right' });
    // height captions (bottom, colour-coded)
    const a1 = hA * smooth((t - TEXT.sgo - 0.4) / 0.6), a2 = hA * smooth((t - TEXT.nme - 0.4) / 0.6);
    this.text(x, 'S–Go', 70, 1372, { size: 40, weight: 700, color: COL.post, alpha: a1, align: 'left' });
    this.text(x, 'Posterior facial height', 70, 1414, { size: 26, weight: 500, alpha: a1 * 0.92, align: 'left', color: COL.dim });
    this.text(x, 'N–Me', W - 70, 1372, { size: 40, weight: 700, color: COL.ant, alpha: a2, align: 'right' });
    this.text(x, 'Anterior facial height', W - 70, 1414, { size: 26, weight: 500, alpha: a2 * 0.92, align: 'right', color: COL.dim });
    // formula
    const fa = TEXT.formula(t), na = TEXT.numbers(t);
    this.text(x, 'JARABAK RATIO', W / 2, 1484, { size: 26, weight: 600, color: C.accent, alpha: fa, spacing: 8 });
    this.formula(x, W / 2, 1552, fa, '100%');
    // numbers measured on the model
    if (na > 0) {
      const y = 1646;
      const parts = [[`${fx1(c.SGo)} mm`, COL.post], [' / ', '#fff'], [`${fx1(c.NMe)} mm`, COL.ant], [' × 100% = ', '#fff'], [`${Math.round(c.ratio)}%`, '#fff']];
      this.richLine(x, parts, W / 2, y, { size: 34, weight: 600, alpha: na });
    }
  }

  /** "S–Go / N–Me × 100%" as a stacked fraction */
  formula(x, cx, cy, alpha, tail) {
    if (alpha <= 0.003) return;
    const fs = 36;
    x.save(); x.font = `700 ${fs}px ${F}`;
    const wf = Math.max(x.measureText('S–Go').width, x.measureText('N–Me').width) + 24;
    x.font = `600 ${fs}px ${F}`; const wt = x.measureText(`× ${tail}`).width; x.restore();
    const total = wf + 22 + wt, x0 = cx - total / 2;
    this.text(x, 'S–Go', x0 + wf / 2, cy - 26, { size: fs, weight: 700, color: COL.post, alpha });
    this.text(x, 'N–Me', x0 + wf / 2, cy + 28, { size: fs, weight: 700, color: COL.ant, alpha });
    this.line(x, [x0, cy + 1], [x0 + wf, cy + 1], { color: '#fff', width: 2.5, alpha, under: false });
    this.text(x, `× ${tail}`, x0 + wf + 22, cy + 2, { size: fs, weight: 600, alpha, align: 'left' });
  }

  richLine(x, parts, cx, cy, { size = 34, weight = 600, alpha = 1 } = {}) {
    x.save(); x.font = `${weight} ${size}px ${F}`;
    const ws = parts.map(([s]) => x.measureText(s).width); x.restore();
    let px = cx - ws.reduce((a, b) => a + b, 0) / 2;
    parts.forEach(([s, col], i) => { this.text(x, s, px, cy, { size, weight, color: col, alpha, align: 'left' }); px += ws[i]; });
  }

  // ---------------------------------------------------------------- 03 three vertical patterns
  scene3(x, t, st) {
    const hd = TEXT.s3head(t);
    this.text(x, 'JARABAK RATIO', W / 2, 300, { size: 30, weight: 600, color: C.accent, alpha: hd, spacing: 9 });
    this.text(x, 'S–Go / N–Me × 100%', W / 2, 350, { size: 26, weight: 500, alpha: hd * 0.85, color: COL.dim });
    const mid = st.skulls[0];
    const la = TEXT.s3lines(t);
    if (la > 0) {
      const c = this.cephOf(mid.v, 0);
      this.heightsLines(x, mid, c, { alpha: la, labels: true });
      // live value — measured on the morphing geometry
      this.text(x, `${Math.round(c.ratio)}%`, W / 2, 1572, { size: 64, weight: 700, alpha: la * 0.95 });
      this.richLine(x, [[`S–Go ${fx1(c.SGo)} mm`, COL.post], ['   ', '#fff'], [`N–Me ${fx1(c.NMe)} mm`, COL.ant]], W / 2, 1634, { size: 26, weight: 600, alpha: la * 0.9 });
    }
    const pats = [
      [VERT, TEXT.vert, 'Relatively smaller posterior facial height'],
      [NEUT, TEXT.neut, 'Intermediate proportions'],
      [HORI, TEXT.hori, 'Relatively larger posterior facial height'],
    ];
    for (const [p, f, desc] of pats) {
      const a = f(t);
      this.text(x, p.label, W / 2, 1412, { size: 56, weight: 700, alpha: a, spacing: 2 });
      this.text(x, desc, W / 2, 1474, { size: 28, weight: 500, alpha: a * 0.92, color: COL.dim });
    }
    // trio
    const ta = TEXT.trioLabels(t), tl = TEXT.trioLines(t);
    if (ta > 0 || tl > 0) {
      const order = [[st.skulls[1], VERT, 'VERTICAL', '54–58%'], [st.skulls[0], NEUT, 'NEUTRAL', '59–63%'], [st.skulls[2], HORI, 'HORIZONTAL', '64–80%']];
      order.forEach(([d, p, name, range], i) => {
        const c = this.cephOf(d.v, 0);
        this.heightsLines(x, d, c, { alpha: tl, width: 3, labels: false });
        const cx = TRIO.colX[i];
        this.text(x, name, cx, 1110, { size: 30, weight: 700, alpha: ta, spacing: 2 });
        this.text(x, `${Math.round(c.ratio)}%`, cx, 1176, { size: 56, weight: 700, alpha: ta, color: '#ffffff' });
        this.text(x, `ref. ${range}`, cx, 1232, { size: 24, weight: 500, alpha: ta * 0.8, color: COL.dim });
      });
      const na = TEXT.rangesNote(t);
      this.text(x, 'Classic teaching ranges (Jarabak) — cut-offs differ between studies', W / 2, 1340, { size: 24, weight: 500, alpha: na * 0.8, color: COL.dim });
      this.text(x, 'Values in the gaps between ranges are not auto-classified', W / 2, 1376, { size: 24, weight: 500, alpha: na * 0.8, color: COL.dim });
    }
  }

  // ---------------------------------------------------------------- 04 Björk sum
  polygon(x, d, c, { alpha = 1, prog = 1, width = 3 } = {}) {
    const P = (p) => this.proj(d, p);
    const pts = [c.N, c.S, c.Ar, c.Go, c.Me];
    for (let i = 0; i < 4; i++) this.line(x, P(pts[i]), P(pts[i + 1]), { color: '#ffffff', width, alpha: alpha * 0.9, progress: clamp01(prog * 4 - i) });
  }

  scene4(x, t, st) {
    const hd = TEXT.s4head(t);
    this.text(x, 'BJÖRK SUM', W / 2, 300, { size: 30, weight: 600, color: C.accent, alpha: hd, spacing: 9 });
    this.text(x, 'Saddle + Articular + Gonial angle', W / 2, 350, { size: 26, weight: 500, alpha: hd * 0.85, color: COL.dim });
    const d = st.skulls[0];
    const c = this.cephOf(d.v, 0), B = bjork(c);
    const P = (p) => this.proj(d, p);
    const sa = TEXT.single4(t);
    if (sa > 0) {
      const T = TEXT.pts4;
      const ap = (t0) => sa * smooth((t - t0) / 0.4);
      this.polygon(x, d, c, { alpha: sa, prog: clamp01((t - TEXT.poly) / 1.0), width: 3.5 });
      const R = 50;
      const arcs = [
        ['saddle', c.S, c.N, c.Ar, 'SADDLE ANGLE', 'N–S–Ar', B.a, [-26, -58], 'right'],
        ['articular', c.Ar, c.S, c.Go, 'ARTICULAR ANGLE', 'S–Ar–Go', B.b, [-34, 34], 'right'],
        ['gonial', c.Go, c.Ar, c.Me, 'GONIAL ANGLE', 'Ar–Go–Me', B.g, [-34, 30], 'right'],
      ];
      for (const [key, o, a, b, name, def, val, off, al] of arcs) {
        const t0 = TEXT.arcs[key];
        const g = clamp01((t - t0) / 0.7);
        this.arc(x, P(o), P(a), P(b), { radius: R, color: COL[key], alpha: sa, progress: smooth(g) });
        const la = sa * smooth((t - t0 - 0.25) / 0.5);
        const q = P(o);
        this.text(x, name, q[0] + off[0], q[1] + off[1] - 16, { size: 26, weight: 700, color: COL[key], alpha: la, align: al, spacing: 1 });
        this.text(x, `${def}  ${val.toFixed(1)}°`, q[0] + off[0], q[1] + off[1] + 16, { size: 24, weight: 600, alpha: la * 0.95, align: al });
      }
      this.landmark(x, P(c.N), 'N', null, { alpha: ap(T.N), dx: 18, dy: -24 });
      this.landmark(x, P(c.S), 'S', null, { alpha: ap(T.S), dx: 14, dy: -26 });
      this.landmark(x, P(c.Ar), 'Ar', null, { alpha: ap(T.Ar), dx: -16, dy: -22, align: 'right' });
      this.landmark(x, P(c.Go), 'Go', null, { alpha: ap(T.Go), dx: 6, dy: 46 });
      this.landmark(x, P(c.Me), 'Me', null, { alpha: ap(T.Me), dx: 18, dy: 26 });
      // right-hand panel
      const pa = TEXT.sumPanel(t);
      const xr = W - 70;
      const rows = [['Saddle', B.a, COL.saddle], ['Articular', B.b, COL.articular], ['Gonial', B.g, COL.gonial]];
      rows.forEach(([n, v, col], i) => {
        const y = 1380 + i * 44, a = pa * smooth((t - 37.0 - i * 0.15) / 0.5);
        this.text(x, n, xr - 150, y, { size: 28, weight: 600, color: col, alpha: a, align: 'right' });
        this.text(x, `${i ? '+ ' : ''}${v.toFixed(1)}°`, xr, y, { size: 28, weight: 600, alpha: a, align: 'right' });
      });
      const a4 = pa * smooth((t - 37.5) / 0.5);
      this.line(x, [xr - 330, 1505], [xr, 1505], { color: '#ffffff', width: 2, alpha: a4 * 0.6, under: false });
      this.text(x, `BJÖRK SUM = ${B.sum.toFixed(1)}°`, xr, 1550, { size: 40, weight: 700, alpha: a4, align: 'right' });
      this.text(x, 'BJÖRK SUM ≈ 396°', 70, 1505, { size: 30, weight: 700, color: C.accent, alpha: a4, align: 'left' });
      this.text(x, 'classic mean', 70, 1545, { size: 24, weight: 500, alpha: a4 * 0.85, align: 'left', color: COL.dim });
      this.text(x, '(not a diagnostic cut-off)', 70, 1577, { size: 24, weight: 500, alpha: a4 * 0.85, align: 'left', color: COL.dim });
    }
    // comparison of the three configurations
    const ca = TEXT.trio4(t);
    if (ca > 0) {
      const order = [[st.skulls[1], 'VERTICAL'], [st.skulls[0], 'NEUTRAL'], [st.skulls[2], 'HORIZONTAL']];
      order.forEach(([dd, name], i) => {
        const cc = this.cephOf(dd.v, 0), BB = bjork(cc);
        this.polygon(x, dd, cc, { alpha: ca, prog: clamp01((t - 39.5) / 1.0), width: 2.5 });
        const cx = TRIO.colX[i];
        this.text(x, name, cx, 1110, { size: 30, weight: 700, alpha: ca, spacing: 2 });
        this.text(x, `${BB.sum.toFixed(1)}°`, cx, 1176, { size: 50, weight: 700, alpha: ca });
      });
      this.text(x, 'LARGER SUM', TRIO.colX[0], 1232, { size: 24, weight: 600, alpha: ca * 0.85, color: COL.dim });
      this.text(x, 'INTERMEDIATE', TRIO.colX[1], 1232, { size: 24, weight: 600, alpha: ca * 0.85, color: COL.dim });
      this.text(x, 'SMALLER SUM', TRIO.colX[2], 1232, { size: 24, weight: 600, alpha: ca * 0.85, color: COL.dim });
      this.text(x, 'Larger sum — usually a more vertical configuration,', W / 2, 1340, { size: 25, weight: 500, alpha: ca * 0.85, color: COL.dim });
      this.text(x, 'smaller — a more horizontal one', W / 2, 1376, { size: 25, weight: 500, alpha: ca * 0.85, color: COL.dim });
    }
  }

  // ---------------------------------------------------------------- 05 mandibular rotation
  scene5(x, t, st, fade) {
    const a = TEXT.s5(t) * fade;
    this.text(x, 'MANDIBULAR ROTATION', W / 2, 300, { size: 30, weight: 600, color: C.accent, alpha: a, spacing: 9 });
    const u = clamp01((t - ROT.t0) / (ROT.t1 - ROT.t0));
    st.skulls.forEach((d, i) => {
      const cw = i === 0;
      const col = cw ? COL.ant : C.accent;
      const c0 = this.cephOf(d.v, 0), c = this.cephOf(d.v, d.r);
      const P = (p) => this.proj(d, p);
      // mandibular contour: initial position (dashed ghost) and current position — from the warped radiographic contour
      const outline = (cc) => cc.post.filter((p) => p[1] >= cc.Go[1]).concat(cc.inf.filter((p) => p[0] >= cc.Go[0])).map(P);
      const poly = (pts, alpha, color, width, dash) => {
        x.save(); x.globalAlpha = alpha; x.strokeStyle = color; x.lineWidth = width; x.lineJoin = 'round'; x.lineCap = 'round';
        if (dash) x.setLineDash(dash);
        x.beginPath(); pts.forEach((p, k) => (k ? x.lineTo(...p) : x.moveTo(...p))); x.stroke(); x.restore();
      };
      if (u > 0) poly(outline(c0), a * 0.8 * Math.min(1, u * 4), '#ffffff', 2.2, [7, 7]);
      poly(outline(c), a * 0.9, col, 3, null);
      // S–N reference and mandibular plane (Go–Me): initial (dashed) and current (solid)
      this.line(x, P(LM.S), P(LM.N), { color: '#ffffff', width: 2, alpha: a * 0.55, dash: [10, 9], extendA: 20, extendB: 20 });
      this.line(x, P(c0.Go), P(c0.Me), { color: '#ffffff', width: 2.5, alpha: a * 0.7 * Math.min(1, u * 4), dash: [9, 8], extendA: 30, extendB: 40 });
      this.line(x, P(c.Go), P(c.Me), { color: col, width: 4, alpha: a, extendA: 30, extendB: 40 });
      // chin trajectory: arc about the condylar hinge axis from the initial to the current menton
      if (u > 0.02) {
        const o = P(LM.Co), m0 = P(c0.Me), m1 = P(c.Me);
        const rr = Math.hypot(m0[0] - o[0], m0[1] - o[1]) + 30;
        const a0 = Math.atan2(m0[1] - o[1], m0[0] - o[0]), a1 = Math.atan2(m1[1] - o[1], m1[0] - o[0]);
        x.save(); x.globalAlpha = a; x.strokeStyle = col; x.lineWidth = 4; x.lineCap = 'round';
        x.shadowColor = 'rgba(0,6,18,0.9)'; x.shadowBlur = 8;
        x.beginPath(); x.arc(o[0], o[1], rr, a0, a1, a1 < a0); x.stroke(); x.restore();
        const tip = [o[0] + rr * Math.cos(a1), o[1] + rr * Math.sin(a1)];
        const dir = a1 < a0 ? -1 : 1;
        const pre = [o[0] + rr * Math.cos(a1 - dir * 0.05), o[1] + rr * Math.sin(a1 - dir * 0.05)];
        this.arrowHead(x, tip, pre, { color: col, alpha: a * Math.min(1, u * 3), size: 20 });
        // initial menton (hollow) and current menton
        x.save(); x.globalAlpha = a * 0.85; x.strokeStyle = '#ffffff'; x.lineWidth = 2.5; x.setLineDash([4, 4]);
        x.beginPath(); x.arc(m0[0], m0[1], 8, 0, Math.PI * 2); x.stroke(); x.restore();
        this.dot(x, m1, { r: 5, color: col, alpha: a });
        this.dot(x, o, { r: 4, color: '#ffffff', alpha: a * 0.9 });
      }
      // labels in the empty area behind the mandible
      const y0 = STACK.y[i];
      this.text(x, cw ? 'CLOCKWISE' : 'COUNTERCLOCKWISE', 60, y0 + 196, { size: 30, weight: 700, alpha: a, align: 'left', spacing: 1.5, color: col });
      this.text(x, 'ROTATION', 60, y0 + 236, { size: 30, weight: 700, alpha: a, align: 'left', spacing: 1.5 });
      this.text(x, cw ? 'chin down and back' : 'chin up and forward', 60, y0 + 274, { size: 24, weight: 500, alpha: a * 0.9 * smooth((t - ROT.t1 + 0.6) / 0.6), align: 'left', color: COL.dim });
    });
    this.text(x, 'Schematic illustration of mandibular rotation', W / 2, 1686, { size: 24, weight: 500, alpha: TEXT.s5note(t) * fade * 0.85, color: COL.dim });
  }

  // ---------------------------------------------------------------- 06 conclusion
  scene6(x, t, st, fade) {
    const a = TEXT.s6a(t) * fade, b = TEXT.s6b(t) * fade, c = TEXT.s6c(t) * fade;
    const d = st.skulls[0];
    if (d && d.role === 'final') {
      const cc = this.cephOf(d.v, 0);
      this.heightsLines(x, d, cc, { alpha: a * 0.9, width: 3, labels: false });
      this.polygon(x, d, cc, { alpha: b * 0.75, width: 2.2 });
    }
    this.text(x, 'JARABAK RATIO', 290, 1290, { size: 40, weight: 700, alpha: a, color: COL.post });
    this.text(x, '+', W / 2, 1290, { size: 40, weight: 600, alpha: Math.min(a, b) * 0.8 });
    this.text(x, 'BJÖRK SUM', 790, 1290, { size: 40, weight: 700, alpha: b, color: '#ffffff' });
    this.line(x, [140, 1352], [W - 140, 1352], { color: '#ffffff', width: 1.5, alpha: c * 0.35, under: false });
    this.text(x, 'VERTICAL SKELETAL ASSESSMENT', W / 2, 1414, { size: 34, weight: 700, alpha: c, color: C.accent, spacing: 3 });
    this.text(x, 'Interpret in clinical context', W / 2, 1478, { size: 27, weight: 500, alpha: c * 0.9, color: COL.dim });
    this.text(x, 'Skull: Z-Anatomy / BodyParts3D © DBCLS · CC BY-SA 4.0', W / 2, 1600, { size: 20, weight: 400, alpha: c * 0.5, color: COL.dim });
  }

  // ---------------------------------------------------------------- optional Russian subtitles (off for the export)
  drawSubtitle(x, t) {
    for (const v of VOICE) {
      const dur = v.dur || 6;
      if (t < v.start || t > v.start + dur + 0.2) continue;
      const a = Math.min(smooth((t - v.start) / 0.2), smooth((v.start + dur + 0.2 - t) / 0.2));
      x.save(); x.font = `600 32px ${F}`;
      const words = v.text.split(' '), lines = []; let cur = '';
      for (const w of words) { const s = cur ? cur + ' ' + w : w; if (x.measureText(s).width > 900 && cur) { lines.push(cur); cur = w; } else cur = s; }
      lines.push(cur);
      const lh = 44, y0 = 1812 - lines.length * lh;
      x.globalAlpha = a * 0.6; x.fillStyle = '#000';
      const wmax = Math.max(...lines.map((l) => x.measureText(l).width));
      x.beginPath(); x.roundRect(W / 2 - wmax / 2 - 22, y0 - 14, wmax + 44, lines.length * lh + 20, 12); x.fill();
      x.restore();
      lines.forEach((l, i) => this.text(x, l, W / 2, y0 + 8 + i * lh + lh / 2 - 8, { size: 32, weight: 600, alpha: a, shadow: false }));
    }
  }

  grab(type = 'image/jpeg', q = 0.95) { return this.out.toDataURL(type, q); }
}
