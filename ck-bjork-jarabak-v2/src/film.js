// ============================================================================
//  Björk–Jarabak V2 film renderer: Three.js (up to three skull instances sharing
//  one geometry) + 2D overlay composited into one 1080×1920 canvas.
//  Every landmark, line, arc and number is measured on the deformed bone (src/morph.js).
//  Colour code (constant): cranial base gold · ramus blue · body teal ·
//  anterior facial height amber · posterior facial height blue.
// ============================================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadSkullGeometry, createSkull } from './skull.js';
import { ceph, dist } from './morph.js';
import { BRAND, backgroundCanvas, drawOutro, drawTopLabel } from './brand.js';
import { stateAt, T, ST, L, OUTRO_T0, DURATION, FPS, clamp01, smooth, easeOut, win, ramp, lerp } from './timeline.js';
import { VOICE } from './voice.js';
import { drawKeywords } from './kinetic.js';

const W = BRAND.width, H = BRAND.height;
const F = BRAND.font;
export const COL = {
  base: '#e2bf72', ramus: '#79b8ff', body: '#38d8c6', ant: '#ffb04f', post: '#8fc6ff',
  saddle: '#e2bf72', articular: '#79b8ff', gonial: '#38d8c6', upper: '#79b8ff', lower: '#38d8c6',
  white: '#ffffff', dim: '#c9d4e6', accent: '#2de2d0', mark: '#f4f7fb',
};
const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const ri = (x) => String(Math.round(x));

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
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.8;
    const sc = this.scene = new THREE.Scene();
    const bg = new THREE.CanvasTexture(backgroundCanvas()); bg.colorSpace = THREE.SRGBColorSpace;
    sc.background = bg;
    const pm = new THREE.PMREMGenerator(r);
    sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    sc.environmentIntensity = 0.36;
    const key = new THREE.DirectionalLight(0xfff1e0, 2.5); key.position.set(-230, 260, 120); sc.add(key);
    const fill = new THREE.DirectionalLight(0xc8dcff, 0.35); fill.position.set(-200, -140, -60); sc.add(fill);
    const rim = new THREE.DirectionalLight(0x9fc7ff, 1.9); rim.position.set(160, 200, -260); sc.add(rim);
    const front = new THREE.DirectionalLight(0xbcd6ff, 0.8); front.position.set(120, 60, 300); sc.add(front);
    const top = new THREE.DirectionalLight(0xffffff, 0.3); top.position.set(0, 300, 40); sc.add(top);
    sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1410, 0.15));
    this.camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 4000);
    this.camera.position.set(-1500, 0, 0); this.camera.up.set(0, 1, 0); this.camera.lookAt(0, 0, 0);
    this.geometry = await loadSkullGeometry('assets/skull');
    this.skulls = [];
    for (let i = 0; i < 3; i++) { const s = createSkull(this.geometry); sc.add(s.group); this.skulls.push(s); }
    await Promise.all([
      document.fonts.load(`700 60px ${F}`), document.fonts.load(`600 30px ${F}`), document.fonts.load(`500 30px ${F}`),
      document.fonts.load(`400 24px ${F}`), document.fonts.load('500 28px Inter'), document.fonts.load(`500 25px ${F}`, 'геометрия'),
    ]);
    this.renderTime(0); this.renderTime(20); this.renderTime(60);
  }

  cephOf(P) {
    const key = Object.values(P).map((v) => v.toFixed(4)).join('|');
    let c = this._ceph.get(key);
    if (!c) { c = ceph(P); if (this._ceph.size > 3000) this._ceph.clear(); this._ceph.set(key, c); }
    return c;
  }

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
      if (!d) { sk.setVisible(false); return; }
      sk.set(d.P); sk.group.position.set(j * 30, d.y, d.z); sk.setVisible(true);
    });
    this.renderer.render(this.scene, cam);
    const x = this.ctx;
    x.globalAlpha = 1;
    if (st.alpha < 1) { x.drawImage(backgroundCanvas(), 0, 0); x.globalAlpha = st.alpha; }
    x.drawImage(this.renderer.domElement, 0, 0);
    x.globalAlpha = 1;
    this.drawOverlay(x, t, st);
    if (this.subtitles) this.drawSubtitle(x, t);
    drawTopLabel(x, 1);
    if (t >= OUTRO_T0) drawOutro(x, t - OUTRO_T0);
    return this.out;
  }

  // ------------------------------------------------------------------ helpers
  proj(d, p) { const { k, cz, cy } = this.state.cam; return [W / 2 + (d.z + p[0] - cz) * k, H / 2 - (d.y + p[1] - cy) * k]; }

  text(x, str, px, py, { size = 40, weight = 700, color = '#fff', alpha = 1, spacing = 0, align = 'center', baseline = 'middle', shadow = true, maxW = 0 } = {}) {
    if (alpha <= 0.003) return;
    x.save();
    x.globalAlpha = alpha; x.fillStyle = color;
    x.font = `${weight} ${size}px ${F}`; x.textAlign = align; x.textBaseline = baseline;
    if (shadow) { x.shadowColor = 'rgba(0,6,18,0.92)'; x.shadowBlur = 14; }
    if ('letterSpacing' in x) x.letterSpacing = `${spacing}px`;
    if (maxW) { const w = x.measureText(str).width; if (w > maxW) { const f = maxW / w; x.font = `${weight} ${Math.floor(size * f)}px ${F}`; } }
    x.fillText(str, align === 'center' ? px + spacing / 2 : (align === 'right' ? px + spacing : px), py);
    x.restore();
  }
  tw(str, size, weight = 700, spacing = 0) { const x = this.ctx; x.save(); x.font = `${weight} ${size}px ${F}`; if ('letterSpacing' in x) x.letterSpacing = `${spacing}px`; const w = x.measureText(str).width; x.restore(); return w; }

  line(x, a, b, { color = '#fff', width = 3, alpha = 1, dash = null, extendA = 0, extendB = 0, progress = 1, under = true, glow = 0 } = {}) {
    if (alpha <= 0.003 || progress <= 0) return;
    const dx = b[0] - a[0], dy = b[1] - a[1], Lh = Math.hypot(dx, dy) || 1, ux = dx / Lh, uy = dy / Lh;
    const A = [a[0] - ux * extendA, a[1] - uy * extendA], Bf = [b[0] + ux * extendB, b[1] + uy * extendB];
    const B = [A[0] + (Bf[0] - A[0]) * progress, A[1] + (Bf[1] - A[1]) * progress];
    x.save(); x.lineCap = 'round';
    if (dash) x.setLineDash(dash);
    if (under) { x.globalAlpha = alpha * 0.55; x.strokeStyle = 'rgba(0,8,22,1)'; x.lineWidth = width + 4; x.beginPath(); x.moveTo(...A); x.lineTo(...B); x.stroke(); }
    if (glow > 0) { x.globalAlpha = alpha * 0.35 * glow; x.strokeStyle = color; x.lineWidth = width + 10; x.shadowColor = color; x.shadowBlur = 18; x.beginPath(); x.moveTo(...A); x.lineTo(...B); x.stroke(); x.shadowBlur = 0; }
    x.globalAlpha = alpha; x.strokeStyle = color; x.lineWidth = width;
    x.beginPath(); x.moveTo(...A); x.lineTo(...B); x.stroke(); x.restore();
  }

  dot(x, p, { r = 5.5, color = COL.mark, alpha = 1, ring = '#ffffff' } = {}) {
    if (alpha <= 0.003) return;
    const pop = 1 + 0.5 * Math.max(0, 1 - alpha) * alpha * 4;
    x.save(); x.globalAlpha = alpha;
    x.fillStyle = 'rgba(0,8,22,0.6)'; x.beginPath(); x.arc(p[0], p[1], (r + 6) * pop, 0, Math.PI * 2); x.fill();
    x.fillStyle = color; x.beginPath(); x.arc(p[0], p[1], r * pop, 0, Math.PI * 2); x.fill();
    x.strokeStyle = ring; x.globalAlpha = alpha * 0.85; x.lineWidth = 2; x.beginPath(); x.arc(p[0], p[1], (r + 3.5) * pop, 0, Math.PI * 2); x.stroke();
    x.restore();
  }

  label(x, p, abbr, name, { alpha = 1, dx = 16, dy = -18, align = 'left', size = 28 } = {}) {
    if (alpha <= 0.003) return;
    const tx = p[0] + dx, ty = p[1] + dy;
    if (!name) { this.text(x, abbr, tx, ty, { size, weight: 700, alpha, align }); return; }
    const wa = this.tw(abbr + ' ', size, 700), wn = this.tw(name, size * 0.78, 500);
    const x0 = align === 'left' ? tx : tx - wa - wn;
    this.text(x, abbr, x0, ty, { size, weight: 700, alpha, align: 'left' });
    this.text(x, name, x0 + wa, ty + 1, { size: size * 0.78, weight: 500, alpha: alpha * 0.92, align: 'left', color: COL.dim });
  }

  arc(x, o, a, b, { radius = 46, color = '#fff', alpha = 1, progress = 1, width = 3.5, fill = 0.2 } = {}) {
    if (alpha <= 0.003 || progress <= 0) return;
    const a1 = Math.atan2(a[1] - o[1], a[0] - o[0]);
    let d = Math.atan2(b[1] - o[1], b[0] - o[0]) - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const a2 = a1 + d * progress;
    x.save(); x.lineCap = 'round';
    x.globalAlpha = alpha * fill; x.fillStyle = color; x.beginPath(); x.moveTo(...o); x.arc(o[0], o[1], radius, a1, a2, d < 0); x.closePath(); x.fill();
    x.globalAlpha = alpha * 0.55; x.strokeStyle = 'rgba(0,8,22,1)'; x.lineWidth = width + 3; x.beginPath(); x.arc(o[0], o[1], radius, a1, a2, d < 0); x.stroke();
    x.globalAlpha = alpha; x.strokeStyle = color; x.lineWidth = width; x.beginPath(); x.arc(o[0], o[1], radius, a1, a2, d < 0); x.stroke();
    x.restore();
  }
  /** point on the bisector of the angle a-o-b at distance r (for value labels) */
  bisect(o, a, b, r) {
    const u = [a[0] - o[0], a[1] - o[1]], v = [b[0] - o[0], b[1] - o[1]];
    const lu = Math.hypot(...u), lv = Math.hypot(...v);
    const m = [u[0] / lu + v[0] / lv, u[1] / lu + v[1] / lv], lm = Math.hypot(...m) || 1;
    return [o[0] + m[0] / lm * r, o[1] + m[1] / lm * r];
  }
  arrowHead(x, tip, from, { color = '#fff', alpha = 1, size = 16 } = {}) {
    const a = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
    x.save(); x.globalAlpha = alpha; x.fillStyle = color; x.beginPath(); x.moveTo(...tip);
    x.lineTo(tip[0] - size * Math.cos(a - 0.45), tip[1] - size * Math.sin(a - 0.45));
    x.lineTo(tip[0] - size * Math.cos(a + 0.45), tip[1] - size * Math.sin(a + 0.45)); x.closePath(); x.fill(); x.restore();
  }
  polyline(x, pts, { color = '#fff', width = 2.5, alpha = 1, dash = null } = {}) {
    if (alpha <= 0.003) return;
    x.save(); x.globalAlpha = alpha; x.strokeStyle = color; x.lineWidth = width; x.lineJoin = 'round'; x.lineCap = 'round';
    if (dash) x.setLineDash(dash);
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(...p) : x.moveTo(...p))); x.stroke(); x.restore();
  }
  /** mandibular outline (posterior border above Go + inferior border + chin) from the warped radiographic contour */
  outline(d, c) {
    return c.post.filter((p) => p[1] >= c.Go[1]).concat(c.inf.filter((p) => p[0] >= c.Go[0])).map((p) => this.proj(d, p));
  }

  /**
   * Björk polygon N–S–Ar–Go–Me (+ optional facial heights). `a` = per-segment alpha multipliers,
   * `p` = per-segment draw progress, glow = per-segment highlight.
   */
  polygon(x, d, c, { alpha = 1, a = {}, p = {}, g = {}, width = 3.5 } = {}) {
    const P = (q) => this.proj(d, q);
    const segs = [['NS', c.N, c.S, COL.base], ['SAr', c.S, c.Ar, COL.base], ['ArGo', c.Ar, c.Go, COL.ramus], ['GoMe', c.Go, c.Me, COL.body]];
    for (const [id, A, B, col] of segs) this.line(x, P(A), P(B), { color: col, width, alpha: alpha * (a[id] ?? 1), progress: p[id] ?? 1, glow: g[id] ?? 0 });
  }
  heights(x, d, c, { alpha = 1, pPost = 1, pAnt = 1, width = 4, gPost = 0, gAnt = 0 } = {}) {
    const P = (q) => this.proj(d, q);
    this.line(x, P(c.S), P(c.Go), { color: COL.post, width, alpha, progress: pPost, glow: gPost, dash: [14, 9] });
    this.line(x, P(c.N), P(c.Me), { color: COL.ant, width, alpha, progress: pAnt, glow: gAnt, dash: [14, 9] });
  }
  points(x, d, c, keys, { alpha = 1, r = 5 } = {}) { for (const k of keys) this.dot(x, this.proj(d, c[k]), { alpha, r }); }
  measureLabel(x, a, b, str, { color = '#fff', alpha = 1, off = 30, side = 1, size = 28 } = {}) {
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const n = [-dy / l * side, dx / l * side];
    this.text(x, str, m[0] + n[0] * off, m[1] + n[1] * off, { size, weight: 700, color, alpha });
  }

  // ------------------------------------------------------------------ overlay
  drawOverlay(x, t, st) {
    const fade = st.alpha;
    if (t < 6.2) this.scene01(x, t, st);
    if (t >= 4.9 && t < 31.3) this.scenesSingle(x, t, st, fade);
    if (t >= 31.2 && t < 39.1) this.scene06(x, t, st, fade);
    if (t >= 39.0 && t < 56.7) this.scenes0708(x, t, st, fade);
    if (t >= 56.6 && t < 63.5) this.scene09(x, t, st, fade);
    if (t >= 63.4) this.scene1011(x, t, st, fade);
    drawKeywords(this, x, t);
  }

  // ---------------------------------------------------------------- 01 hook
  scene01(x, t, st) {
    const out = 1 - smooth((t - 4.85) / 0.45);
    const [A, B] = st.skulls.filter((s) => s.role === 'A' || s.role === 'B' || s.role === 'single');
    const cA = this.cephOf(A.P), cB = this.cephOf(st.skulls.find((s) => s.role === 'B').P);
    const dB = st.skulls.find((s) => s.role === 'B');
    for (const [d, c] of [[A, cA], [dB, cB]]) {
      const P = (q) => this.proj(d, q);
      this.line(x, P(c.Go), P(c.Me), { color: COL.body, width: 5, alpha: out, glow: 1 - smooth((t - 1.4) / 1.2) * 0.6 });
      this.dot(x, P(c.Go), { alpha: out, r: 5 }); this.dot(x, P(c.Me), { alpha: out, r: 5 });
      this.measureLabel(x, P(c.Go), P(c.Me), `Go–Me ${ri(c.GoMe)} mm`, { color: COL.body, alpha: out, off: 40, side: 1, size: 28 });
    }
    // "71 mm = 71 mm" in the gap between the skulls
    const eq = win(t, T.length + 0.15, 4.85, 0.35, 0.4);
    this.text(x, `${ri(cA.GoMe)} mm = ${ri(cB.GoMe)} mm`, 60, 922, { size: 40, weight: 700, color: COL.body, alpha: eq, align: 'left' });
    // chin projection difference (no explanation yet)
    const ch = win(t, T.why, 4.85, 0.4, 0.4);
    if (ch > 0) {
      const pa = this.proj(A, cA.Pog), pb = this.proj(dB, cB.Pog);
      const g = easeOut((t - T.why) / 0.7);
      this.line(x, pa, [pa[0], lerp(pa[1], pb[1] + 40, g)], { color: COL.ant, width: 2.5, alpha: ch * 0.9, dash: [8, 8] });
      x.save(); x.globalAlpha = ch; x.strokeStyle = COL.ant; x.lineWidth = 3;
      for (const p of [pa, pb]) { x.beginPath(); x.arc(p[0], p[1], 20 + 6 * Math.sin(t * 5) * (1 - g * 0.6), 0, Math.PI * 2); x.stroke(); }
      x.restore();
      const gp = clamp01((t - T.why - 0.6) / 0.5);
      if (gp > 0) {
        const y = pb[1] + 4, xa = pa[0], xb = pb[0];
        this.line(x, [xb + 26, y], [xa - 4, y], { color: COL.ant, width: 3, alpha: ch * gp, under: true });
        this.arrowHead(x, [xb + 24, y], [xa, y], { color: COL.ant, alpha: ch * gp, size: 14 });
        this.text(x, `${ri(Math.abs(cA.Pog[0] - cB.Pog[0]))} mm`, (xa + xb) / 2 + 12, y + 34, { size: 28, weight: 700, color: COL.ant, alpha: ch * gp });
      }
    }
  }

  // ---------------------------------------------------------------- 02–05 single reference skull
  scenesSingle(x, t, st, fade) {
    const d = st.skulls.find((s) => s.role === 'single');
    const c = this.cephOf(d.P);
    const P = (q) => this.proj(d, q);
    const ap = (t0) => fade * smooth((t - t0) / 0.35);
    // ---- 02 polygon: points appear one by one, joined by measuring lines
    const pt = { N: 6.15, S: 6.75, Ar: 7.35, Go: 7.95, Me: 8.55 };
    const seg = (t0) => smooth((t - t0) / 0.55);
    const dimFor = (id) => {        // active measurement bright, the rest dimmed
      if (t < 10.9) return 1;
      if (t < 17.0) return id === 'NS' || id === 'SAr' ? 1 : 0.28;
      if (t < 23.0) return id === 'SAr' || id === 'ArGo' ? 1 : 0.28;
      return id === 'ArGo' || id === 'GoMe' ? 1 : 0.28;
    };
    const poly = { NS: seg(pt.S), SAr: seg(pt.Ar), ArGo: seg(pt.Go), GoMe: seg(pt.Me) };
    const glow = {
      NS: t > 10.9 && t < 17 ? 0.6 : 0, SAr: (t > 10.9 && t < 17 ? 0.6 : 0) + (t > T.post4 && t < 23 ? 0.8 : 0),
      ArGo: (t > T.ramus4 && t < 23 ? 0.8 : 0) + (t > T.ramus5 && t < 31 ? 0.6 : 0), GoMe: t > T.body5 && t < 31 ? 0.7 : 0,
    };
    this.polygon(x, d, c, { alpha: fade, p: poly, a: { NS: dimFor('NS'), SAr: dimFor('SAr'), ArGo: dimFor('ArGo'), GoMe: dimFor('GoMe') }, g: glow, width: 4 });
    const names = t < 10.9;
    const lab = [['N', 'Nasion', 18, -28, 'right'], ['S', 'Sella', -18, -30, 'right'], ['Ar', 'Articulare', -22, 6, 'right'], ['Go', 'Gonion', -22, 18, 'right'], ['Me', 'Menton', -22, 30, 'right']];
    for (const [kk, nm, dx, dy, al] of lab) {
      const a = ap(pt[kk]) * (kk === 'Me' ? 1 - win(t, 12.4, 16.95, 0.3, 0.3) : 1);
      this.dot(x, P(c[kk]), { alpha: a });
      this.label(x, P(c[kk]), kk, names ? nm : null, { alpha: a * (names ? 1 : 0.9), dx: kk === 'N' ? 18 : dx, dy, align: kk === 'N' ? 'left' : al, size: 28 });
    }
    // ---- 03 saddle angle (with the two conditional configurations)
    const s3 = win(t, 11.2, 16.9, 0.5, 0.4) * fade;
    if (s3 > 0) {
      this.arc(x, P(c.S), P(c.N), P(c.Ar), { radius: 58, color: COL.saddle, alpha: s3, progress: smooth((t - 11.2) / 0.6) });
      const q = this.bisect(P(c.S), P(c.N), P(c.Ar), 104);
      this.text(x, `${r1(c.saddle)}°`, q[0] + 6, q[1], { size: 34, weight: 700, color: COL.saddle, alpha: s3 });
      const demo = win(t, 12.4, 16.95, 0.4, 0.4) * fade;
      if (demo > 0) {
        const c0 = this.cephOf(ST.REF);
        this.polyline(x, this.outline(d, c0), { color: '#ffffff', width: 2, alpha: demo * 0.6, dash: [7, 7] });
        this.polyline(x, this.outline(d, c), { color: COL.body, width: 2.5, alpha: demo * 0.9 });
        // chin projection relative to the reference position
        const p0 = P(c0.Pog), p1 = P(c.Pog);
        this.line(x, [p0[0], p0[1] - 70], [p0[0], p0[1] + 60], { color: '#ffffff', width: 2, alpha: demo * 0.55, dash: [6, 7], under: false });
        this.dot(x, p1, { r: 6, color: COL.ant, alpha: demo });
        const dz = (c.Pog[0] - c0.Pog[0]);
        if (Math.abs(dz) > 0.6) {
          this.line(x, [p0[0], p1[1]], [p1[0], p1[1]], { color: COL.ant, width: 3, alpha: demo });
          this.arrowHead(x, p1, [p0[0], p1[1]], { color: COL.ant, alpha: demo, size: 13 });
        }
        const tag = c.saddle < 122.5 ? 'REDUCED' : (c.saddle > 123.5 ? 'INCREASED' : '');
        if (tag) {
          this.text(x, `${tag} SADDLE ANGLE  ${r1(c.saddle)}°`, 540, 1466, { size: 34, weight: 700, color: COL.saddle, alpha: demo });
          this.text(x, `chin ${dz > 0 ? 'more anterior' : 'more posterior'} · ${r1(Math.abs(dz))} mm`, 540, 1512, { size: 28, weight: 600, color: COL.ant, alpha: demo });
        }
        this.text(x, `Go–Me ${r1(c.GoMe)} mm — body length unchanged`, 540, 1556, { size: 26, weight: 500, color: COL.dim, alpha: demo });
        this.text(x, 'Conditional anatomical configurations — not a treatment effect', 540, 1596, { size: 22, weight: 500, color: COL.dim, alpha: demo * 0.85 });
      }
    }
    // ---- 04 articular angle
    const s4 = win(t, 17.3, 22.9, 0.5, 0.4) * fade;
    if (s4 > 0) {
      this.arc(x, P(c.Ar), P(c.S), P(c.Go), { radius: 56, color: COL.articular, alpha: s4, progress: smooth((t - 17.3) / 0.6) });
      const q = this.bisect(P(c.Ar), P(c.S), P(c.Go), -98);
      this.text(x, `${r1(c.articular)}°`, q[0], q[1], { size: 34, weight: 700, color: COL.articular, alpha: s4 });
      const a1 = win(t, T.ramus4, 22.9, 0.4, 0.4) * fade, a2 = win(t, T.post4, 22.9, 0.4, 0.4) * fade;
      this.text(x, 'RAMUS  Ar–Go', 540, 1462, { size: 32, weight: 700, color: COL.ramus, alpha: a1 });
      this.text(x, 'ветвь нижней челюсти', 540, 1502, { size: 25, weight: 500, color: COL.dim, alpha: a1 });
      this.text(x, 'POSTERIOR CRANIAL BASE  S–Ar', 540, 1552, { size: 32, weight: 700, color: COL.base, alpha: a2 });
      this.text(x, 'заднее основание черепа', 540, 1592, { size: 25, weight: 500, color: COL.dim, alpha: a2 });
    }
    // ---- 05 gonial angle and its split by Go–N
    const s5 = win(t, 23.3, 31.1, 0.5, 0.35) * fade;
    if (s5 > 0) {
      const split = smooth((t - T.split) / 0.8);
      this.arc(x, P(c.Go), P(c.Ar), P(c.Me), { radius: 60, color: COL.gonial, alpha: s5 * (1 - split * 0.85), progress: smooth((t - 23.3) / 0.6) });
      const q = this.bisect(P(c.Go), P(c.Ar), P(c.Me), 110);
      this.text(x, `${r1(c.gonial)}°`, q[0], q[1], { size: 34, weight: 700, color: COL.gonial, alpha: s5 * (1 - split) });
      if (split > 0) {
        this.line(x, P(c.Go), P(c.N), { color: '#ffffff', width: 3, alpha: s5, dash: [12, 9], progress: split });
        this.dot(x, P(c.N), { alpha: s5 });
        const su = smooth((t - T.split - 0.5) / 0.6), sl = smooth((t - T.split - 0.9) / 0.6);
        this.arc(x, P(c.Go), P(c.Ar), P(c.N), { radius: 74, color: COL.upper, alpha: s5 * su, progress: su });
        this.arc(x, P(c.Go), P(c.N), P(c.Me), { radius: 56, color: COL.lower, alpha: s5 * sl, progress: sl });
        const rowU = s5 * su, rowL = s5 * sl;
        this.text(x, 'UPPER GONIAL ANGLE', 70, 1446, { size: 30, weight: 700, color: COL.upper, alpha: rowU, align: 'left' });
        this.text(x, `Ar–Go–N   ${r1(c.upperGonial)}°   · ref 52–55°`, 70, 1484, { size: 27, weight: 600, alpha: rowU, align: 'left' });
        this.text(x, 'LOWER GONIAL ANGLE', 70, 1528, { size: 30, weight: 700, color: COL.lower, alpha: rowL, align: 'left' });
        this.text(x, `N–Go–Me   ${r1(c.lowerGonial)}°   · ref 70–75°`, 70, 1566, { size: 27, weight: 600, alpha: rowL, align: 'left' });
        const eq = s5 * smooth((t - (T.detail + 0.9)) / 0.5);
        this.text(x, `${r1(c.upperGonial)}° + ${r1(c.lowerGonial)}° = ${r1(c.gonial)}°`, 700, 1446, { size: 30, weight: 700, color: '#ffffff', alpha: eq, align: 'left' });
      }
    }
  }

  // ---------------------------------------------------------------- 06 rehook: same sum, different anatomy
  scene06(x, t, st, fade) {
    const [A, B] = st.skulls;
    const cA = this.cephOf(A.P), cB = this.cephOf(B.P);
    const base = fade * win(t, 31.25, 39.0, 0.4, 0.3);
    const comp = smooth((t - 36.95) / 0.5);
    const rowsAt = [T.even + 0.05, T.even + 0.45, T.even + 0.85, T.sum6 + 0.35];
    [[A, cA, 'MODEL A', 728], [B, cB, 'MODEL B', 1318]].forEach(([d, c, name, y0], i) => {
      const P = (q) => this.proj(d, q);
      this.polygon(x, d, c, { alpha: base, width: 3.2 });
      this.points(x, d, c, ['N', 'S', 'Ar', 'Go', 'Me'], { alpha: base, r: 4 });
      const angs = [['saddle', c.S, c.N, c.Ar, COL.saddle, 40], ['articular', c.Ar, c.S, c.Go, COL.articular, 36], ['gonial', c.Go, c.Ar, c.Me, COL.gonial, 40]];
      const vals = angs.map(([kk]) => Math.round(c[kk]));
      angs.forEach(([kk, o, a, b, col, rad], j) => {
        const g = smooth((t - rowsAt[j]) / 0.4);
        const hi = kk !== 'gonial' ? comp : 0;
        this.arc(x, P(o), P(a), P(b), { radius: rad + 6 * hi, color: col, alpha: base * (0.35 + 0.65 * g), progress: 1, width: 3 + 1.5 * hi, fill: 0.15 + 0.2 * hi });
      });
      // addition, value by value, in the free area behind the mandible
      this.text(x, name, 60, y0 - 50, { size: 26, weight: 700, color: COL.dim, alpha: base, align: 'left', spacing: 3 });
      vals.forEach((v, j) => {
        const g = smooth((t - rowsAt[j]) / 0.35) * base;
        const col = [COL.saddle, COL.articular, COL.gonial][j];
        this.text(x, `${j ? '+ ' : ''}${v}°`, 220, y0 + j * 40, { size: 32, weight: 700, color: col, alpha: g, align: 'right' });
        if (i === 1 && j < 2 && comp > 0) this.text(x, j === 0 ? '+10' : '−10', 236, y0 + j * 40, { size: 24, weight: 700, color: COL.accent, alpha: base * comp, align: 'left' });
      });
      const gs = smooth((t - rowsAt[3]) / 0.35) * base;
      this.line(x, [70, y0 + 102], [222, y0 + 102], { color: '#ffffff', width: 2, alpha: gs * 0.7, under: false });
      this.text(x, `= ${vals.reduce((s, v) => s + v, 0)}°`, 220, y0 + 136, { size: 38, weight: 700, alpha: gs, align: 'right' });
    });
    this.text(x, 'Illustrative models — not clinical cases', 540, 1628, { size: 22, weight: 500, color: COL.dim, alpha: base * 0.85 });
  }

  // ---------------------------------------------------------------- 07 linear measurements · 08 Jarabak ratio
  scenes0708(x, t, st, fade) {
    const d = st.skulls.find((s) => s.role === 'single');
    const c = this.cephOf(d.P), c0 = this.cephOf(ST.REF);
    const P = (q) => this.proj(d, q);
    const in7 = win(t, 39.6, 48.3, 0.4, 0.35) * fade;
    const in8 = win(t, 48.5, 56.55, 0.4, 0.3) * fade;
    // points always shown, lines by measurement
    this.points(x, d, c, ['N', 'S', 'Ar', 'Go', 'Me'], { alpha: Math.max(in7, in8) });
    if (in7 > 0) {
      const items = [
        ['SN', c.S, c.N, COL.base, 'Anterior cranial base', 'S–N', c.SN, '71 ± 3', T.base7 - 0.1, -1],
        ['SAr', c.S, c.Ar, COL.base, 'Posterior cranial base', 'S–Ar', c.SAr, '32 ± 3', T.base7 + 0.5, 1],
        ['ArGo', c.Ar, c.Go, COL.ramus, 'Ramus height', 'Ar–Go', c.ArGo, '44 ± 5', T.ramus7, 1],
        ['GoMe', c.Go, c.Me, COL.body, 'Mandibular body length', 'Go–Me', c.GoMe, '71 ± 5', T.body7, -1],
      ];
      items.forEach(([id, a, b, col, name, abbr, v, ref, t0, side], i) => {
        const g = smooth((t - t0) / 0.5) * in7;
        const fresh = 1 - smooth((t - t0 - 0.6) / 0.8);
        this.line(x, P(a), P(b), { color: col, width: 4 + 2 * fresh, alpha: g, progress: smooth((t - t0) / 0.5), glow: fresh });
        this.measureLabel(x, P(a), P(b), `${r1(v)} mm`, { color: col, alpha: g, off: 32, side, size: 27 });
        const y = 1420 + i * 46;
        this.text(x, `${abbr}`, 70, y, { size: 28, weight: 700, color: col, alpha: g, align: 'left' });
        this.text(x, name, 190, y, { size: 25, weight: 500, color: COL.dim, alpha: g, align: 'left' });
        this.text(x, `${r1(v)} mm`, 830, y, { size: 28, weight: 700, alpha: g, align: 'right' });
        this.text(x, `ref ${ref}`, 1010, y, { size: 23, weight: 500, color: COL.dim, alpha: g * 0.9, align: 'right' });
      });
      // ramus comparison: short vs long ramus as morphological variants
      const rd = win(t, 44.0, 48.1, 0.4, 0.4) * in7;
      if (rd > 0) {
        this.polyline(x, this.outline(d, c0), { color: '#ffffff', width: 2, alpha: rd * 0.55, dash: [7, 7] });
        this.polyline(x, this.outline(d, c), { color: COL.ramus, width: 2.5, alpha: rd * 0.85 });
        const tag = c.ArGo < c0.ArGo - 1 ? 'SHORT RAMUS' : (c.ArGo > c0.ArGo + 1 ? 'LONG RAMUS' : '');
        if (tag) this.text(x, `${tag}  ·  Ar–Go ${r1(c.ArGo)} mm`, 540, 396, { size: 30, weight: 700, color: COL.ramus, alpha: rd });
      }
      const note = win(t, 46.2, 48.2, 0.4, 0.35) * in7;
      this.text(x, 'No single linear value defines the skeletal class', 540, 1612, { size: 22, weight: 500, color: COL.dim, alpha: note * 0.9 });
    }
    if (in8 > 0) {
      const gp = smooth((t - T.post8) / 0.6), ga = smooth((t - T.ant8) / 0.6);
      this.polygon(x, d, c, { alpha: in8 * 0.25, width: 3 });
      this.line(x, P(c.S), P(c.Go), { color: COL.post, width: 5, alpha: in8 * gp, progress: gp, glow: 1 - smooth((t - T.post8 - 0.6) / 0.8) });
      this.line(x, P(c.N), P(c.Me), { color: COL.ant, width: 5, alpha: in8 * ga, progress: ga, glow: 1 - smooth((t - T.ant8 - 0.6) / 0.8) });
      this.measureLabel(x, P(c.S), P(c.Go), `${r1(c.SGo)} mm`, { color: COL.post, alpha: in8 * gp, off: 62, side: 1, size: 28 });
      this.measureLabel(x, P(c.N), P(c.Me), `${r1(c.NMe)} mm`, { color: COL.ant, alpha: in8 * ga, off: 64, side: -1, size: 28 });
      this.text(x, 'POSTERIOR FACIAL HEIGHT', 70, 1410, { size: 25, weight: 700, color: COL.post, alpha: in8 * gp, align: 'left' });
      this.text(x, `S–Go  ${r1(c.SGo)} mm`, 70, 1446, { size: 28, weight: 700, alpha: in8 * gp, align: 'left' });
      this.text(x, 'ANTERIOR FACIAL HEIGHT', 1010, 1410, { size: 25, weight: 700, color: COL.ant, alpha: in8 * ga, align: 'right' });
      this.text(x, `N–Me  ${r1(c.NMe)} mm`, 1010, 1446, { size: 28, weight: 700, alpha: in8 * ga, align: 'right' });
      const gr = in8 * smooth((t - T.vert8) / 0.5);
      if (gr > 0) {
        const parts = [[`${r1(c.SGo)}`, COL.post], [' / ', '#fff'], [`${r1(c.NMe)}`, COL.ant], [' × 100 = ', '#fff'], [`${r1(c.ratio)}%`, '#fff']];
        this.richLine(x, parts, 540, 1502, { size: 44, weight: 700, alpha: gr });
        // reference scale 54–80 % with the 62–65 % teaching band and the model marker
        const x0 = 150, x1 = 930, v2x = (v) => x0 + (v - 54) / (80 - 54) * (x1 - x0), y = 1596;
        const gs = in8 * smooth((t - T.vert8 - 0.5) / 0.5);
        this.line(x, [x0, y], [x1, y], { color: '#ffffff', width: 2, alpha: gs * 0.5, under: false });
        x.save(); x.globalAlpha = gs * 0.85; x.fillStyle = COL.accent; x.fillRect(v2x(62), y - 7, v2x(65) - v2x(62), 14); x.restore();
        for (const v of [54, 62, 65, 80]) this.text(x, `${v}`, v2x(v), y + 26, { size: 21, weight: 600, color: COL.dim, alpha: gs });
        const m = v2x(c.ratio);
        x.save(); x.globalAlpha = gs; x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(m, y - 10); x.lineTo(m - 9, y - 26); x.lineTo(m + 9, y - 26); x.closePath(); x.fill(); x.restore();
        this.text(x, 'teaching reference 62–65 %', x0, y - 30, { size: 22, weight: 600, color: COL.accent, alpha: gs, align: 'left' });
      }
    }
  }

  richLine(x, parts, cx, cy, { size = 34, weight = 600, alpha = 1 } = {}) {
    const ws = parts.map(([s]) => this.tw(s, size, weight));
    let px = cx - ws.reduce((a, b) => a + b, 0) / 2;
    parts.forEach(([s, col], i) => { this.text(x, s, px, cy, { size, weight, color: col, alpha, align: 'left' }); px += ws[i]; });
  }

  // ---------------------------------------------------------------- 09 three skeletal patterns
  scene09(x, t, st, fade) {
    const meta = [
      ['HYPERDIVERGENT', ['predominantly vertical', 'proportions'], 'tendency: posterior rotation', 'cw'],
      ['NORMODIVERGENT', ['relatively balanced', 'vertical proportions'], '', ''],
      ['HYPODIVERGENT', ['predominantly horizontal', 'proportions'], 'tendency: anterior rotation', 'ccw'],
    ];
    for (const d of st.skulls) {
      const i = +d.role.slice(4), c = this.cephOf(d.P);
      const a = fade * d.appear * win(t, 56.6, 63.4, 0.01, 0.3);
      const P = (q) => this.proj(d, q);
      this.line(x, P(c.S), P(c.Go), { color: COL.post, width: 3, alpha: a, dash: [9, 6] });
      this.line(x, P(c.N), P(c.Me), { color: COL.ant, width: 3, alpha: a, dash: [9, 6] });
      this.points(x, d, c, ['S', 'N', 'Go', 'Me'], { alpha: a, r: 3.5 });
      const cx = L.trio.colX[i];
      const [name, desc, tend, rot] = meta[i];
      this.text(x, name, cx, 1080, { size: 26, weight: 700, alpha: a, spacing: 1, maxW: 330 });
      this.text(x, `${ri(c.ratio)}%`, cx, 1140, { size: 54, weight: 700, alpha: a, color: '#ffffff' });
      desc.forEach((s, j) => this.text(x, s, cx, 1192 + j * 30, { size: 22, weight: 500, alpha: a * 0.9, color: COL.dim, maxW: 330 }));
      if (rot) {
        // conditional rotation arrow about the condyle, drawn below the chin
        const ga = a * smooth((t - (rot === 'cw' ? T.vert9 : T.hor9)) / 0.6);
        const o = P([c.Ar[0] + 4, c.Ar[1] + 6]), m = P(c.Me);
        const rr = Math.hypot(m[0] - o[0], m[1] - o[1]) + 30;
        const am = Math.atan2(m[1] - o[1], m[0] - o[0]);
        const a0 = am - (rot === 'cw' ? 0.22 : -0.22), a1 = am + (rot === 'cw' ? 0.22 : -0.22);
        x.save(); x.globalAlpha = ga; x.strokeStyle = rot === 'cw' ? COL.ant : COL.body; x.lineWidth = 4; x.lineCap = 'round';
        x.beginPath(); x.arc(o[0], o[1], rr, Math.min(a0, a1), Math.max(a0, a1)); x.stroke(); x.restore();
        const tip = [o[0] + rr * Math.cos(a1), o[1] + rr * Math.sin(a1)], pre = [o[0] + rr * Math.cos(a1 - (a1 - a0) * 0.15), o[1] + rr * Math.sin(a1 - (a1 - a0) * 0.15)];
        this.arrowHead(x, tip, pre, { color: rot === 'cw' ? COL.ant : COL.body, alpha: ga, size: 16 });
        this.text(x, rot === 'cw' ? 'CLOCKWISE' : 'COUNTERCLOCKWISE', cx, 1262, { size: 21, weight: 700, alpha: ga, color: rot === 'cw' ? COL.ant : COL.body, maxW: 330 });
        this.text(x, tend, cx, 1290, { size: 19, weight: 500, alpha: ga * 0.9, color: COL.dim, maxW: 330 });
      }
    }
    const n = fade * win(t, 61.2, 63.4, 0.5, 0.3);
    this.text(x, 'Arrows = morphological tendency, not a forecast of growth', 540, 1376, { size: 23, weight: 500, color: COL.dim, alpha: n });
    this.text(x, 'Reference values depend on age and population. Morphology ≠ growth prediction.', 540, 1412, { size: 21, weight: 500, color: COL.dim, alpha: n * 0.9, maxW: 940 });
  }

  // ---------------------------------------------------------------- 10 clinical payoff · 11 question
  scene1011(x, t, st, fade) {
    const [A, B] = st.skulls;
    const cA = this.cephOf(A.P), cB = this.cephOf(B.P);
    const base = fade * win(t, 63.5, 71.9, 0.4, 0.6);
    const steps = [T.analyse, T.analyse + 0.85, T.numbers + 0.25, T.rel];
    const g = steps.map((s) => smooth((t - s) / 0.45));
    const all = smooth((t - (T.morph10 - 0.3)) / 0.6);
    const act = (i) => Math.max(g[i] * (0.45 + 0.55 * (1 - (i < 3 ? g[i + 1] : 0))), all * g[i]);   // active bright, earlier dimmed, all at the end
    [[A, cA, 'A', 728], [B, cB, 'B', 1318]].forEach(([d, c, nm, y0]) => {
      const P = (q) => this.proj(d, q);
      const a0 = Math.min(1, act(0)), a1 = Math.min(1, act(1)), a2 = Math.min(1, act(2)), a3 = Math.min(1, act(3));
      this.line(x, P(c.S), P(c.N), { color: COL.base, width: 4, alpha: base * a0, glow: g[0] * (1 - g[1]) });
      this.line(x, P(c.S), P(c.Ar), { color: COL.base, width: 4, alpha: base * a0, glow: g[0] * (1 - g[1]) });
      this.line(x, P(c.Ar), P(c.Go), { color: COL.ramus, width: 4, alpha: base * a1, glow: g[1] * (1 - g[2]) });
      this.line(x, P(c.Go), P(c.Me), { color: COL.body, width: 4, alpha: base * a2, glow: g[2] * (1 - g[3]) });
      this.heights(x, d, c, { alpha: base * a3, width: 3 });
      this.points(x, d, c, ['N', 'S', 'Ar', 'Go', 'Me'], { alpha: base * g[0], r: 4 });
      const rows = [
        [`S–Ar ${r1(c.SAr)} mm`, COL.base, a0],
        [`Ar–Go ${r1(c.ArGo)} mm`, COL.ramus, a1],
        [`Go–Me ${r1(c.GoMe)} mm`, COL.body, a2],
        [`S–Go/N–Me ${ri(c.ratio)}%`, COL.ant, a3],
      ];
      rows.forEach(([s, col, a], j) => this.text(x, s, 44, y0 - 40 + j * 42, { size: 28, weight: 700, color: col, alpha: base * a, align: 'left', maxW: 250 }));
    });
    // 11 — question for the audience
    const q = win(t, 71.75, 77.2, 0.4, 0.3);
    if (q > 0) {
      this.text(x, 'WHICH CEPH ANALYSIS', 540, 640, { size: 56, weight: 700, alpha: smooth((t - T.which + 0.1) / 0.4) * q });
      this.text(x, 'DO YOU USE MOST?', 540, 712, { size: 56, weight: 700, alpha: smooth((t - T.which - 0.15) / 0.4) * q });
      this.text(x, 'Какой анализ ТРГ вы используете чаще всего?', 540, 780, { size: 28, weight: 500, color: COL.dim, alpha: smooth((t - T.which - 0.3) / 0.4) * q });
      ['JARABAK?', 'STEINER?', 'McNAMARA?'].forEach((s, i) => {
        const ga = smooth((t - (T.trg + i * 0.45)) / 0.35) * q, rise = (1 - easeOut((t - (T.trg + i * 0.45)) / 0.5)) * 24;
        const y = 900 + i * 112 + rise, w = 420, h = 84;
        x.save(); x.globalAlpha = ga * 0.92; x.fillStyle = 'rgba(15,28,46,0.92)'; x.strokeStyle = i === 0 ? COL.accent : 'rgba(201,212,230,0.55)'; x.lineWidth = 2.5;
        x.beginPath(); x.roundRect(540 - w / 2, y - h / 2, w, h, 42); x.fill(); x.stroke(); x.restore();
        this.text(x, s, 540, y + 2, { size: 40, weight: 700, alpha: ga, color: i === 0 ? COL.accent : '#ffffff', spacing: 2 });
      });
      const n = smooth((t - 74.3) / 0.6) * q;
      this.text(x, 'Reference values depend on age and population.', 540, 1290, { size: 24, weight: 500, color: COL.dim, alpha: n });
      this.text(x, 'Morphology ≠ growth prediction.', 540, 1326, { size: 24, weight: 500, color: COL.dim, alpha: n });
      this.text(x, 'Skull: Z-Anatomy / BodyParts3D © DBCLS · CC BY-SA 4.0', 540, 1392, { size: 19, weight: 400, color: COL.dim, alpha: n * 0.6 });
    }
  }

  // ---------------------------------------------------------------- optional Russian subtitles (off in the exports)
  drawSubtitle(x, t) {
    for (const v of VOICE) {
      if (t < v.start || t > v.start + v.dur + 0.2) continue;
      const a = Math.min(smooth((t - v.start) / 0.2), smooth((v.start + v.dur + 0.2 - t) / 0.2));
      x.save(); x.font = `600 30px ${F}`;
      const words = v.text.split(' '), lines = []; let cur = '';
      for (const w of words) { const s = cur ? cur + ' ' + w : w; if (x.measureText(s).width > 880 && cur) { lines.push(cur); cur = w; } else cur = s; }
      lines.push(cur);
      const lh = 42, y0 = 1700 - lines.length * lh;
      x.globalAlpha = a * 0.6; x.fillStyle = '#000';
      const wmax = Math.max(...lines.map((l) => x.measureText(l).width));
      x.beginPath(); x.roundRect(540 - wmax / 2 - 20, y0 - 12, wmax + 40, lines.length * lh + 18, 12); x.fill(); x.restore();
      lines.forEach((l, i) => this.text(x, l, 540, y0 + i * lh + lh / 2 - 2, { size: 30, weight: 600, alpha: a, shadow: false }));
    }
  }

  grab(type = 'image/jpeg', q = 0.95) { return this.out.toDataURL(type, q); }
}
