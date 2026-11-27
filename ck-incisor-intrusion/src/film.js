// ============================================================================
//  Film renderer: Three.js scene (Z-Anatomy lower dentition 31–37 / 41–47, upper dentition for the
//  deep bite, translucent mandibular bone, three-piece segmented appliance: two rigid buccal segments,
//  the anterior segment with stepped extensions, two TMA cantilevers) + 2D overlay (force vectors,
//  lever arm, moments, trajectories, kinetic typography, subtitles, brand) composited into one
//  1080×1920 canvas that is shown, recorded and exported. Scenes 01 and 09 are split screens.
// ============================================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BRAND, backgroundCanvas, drawLogo } from './brand.js';
import { DURATION, FPS, OUTRO_T0, SUBS, S, W as WT, VIS, BUCCAL_TIP, cameraAt, COLUMN_CAM, split, clamp01, smooth, lerp, ramp, win, easeOut, easeInOut } from './timeline.js';
import { V, IDENT, apply, applyDir, poseLerp, crAt, forceSystem, centreOfRotation } from './model.js';
import { WIRE, toothFrame, mesialDir, resample, sideWire, pointParams, tieLocal, buccalWire, auxTube, buildEnvelope, cantilever } from './appliance.js';
import { bracketGeometry, sweepRect, doubleTubeGeometry, singleTubeGeometry } from './geom.js';
import { KEYWORDS, keywordState, kickerState, focusLevel } from './kinetic.js';

const W = BRAND.width, H = BRAND.height;
const F = BRAND.font;
export const COL = {
  blue: '#58c8ff',           // intrusive force
  gold: '#ffc95c',           // centre of resistance, lever arm
  red: '#ff4f45',            // undesired movements, reactive loads
  green: '#4be38f',          // controlled movement
  purple: '#b98cff',         // moments
  white: '#ffffff',          // technical labels
  dim: '#a9bdd0',
  accent: BRAND.colors.accent,
};
const DEG = Math.PI / 180;
const LOOK = { rim: 3.9, rim2: 2.2, rimColor: 0x8fe4ff, exposure: 1.1, edge: 0.2, key: 3.0, front: 0.9, env: 0.7 };
const INC = ['L31', 'L32', 'L41', 'L42'];
const BUC = { '3': ['L33', 'L34', 'L35', 'L36', 'L37'], '4': ['L43', 'L44', 'L45', 'L46', 'L47'] };
const COLS = [
  { pose: 'p2', k: 2, top: 'POINTS 1 · 2 · 3', cap: 'PROCLINATION', color: COL.white, n: '1' },
  { pose: 'p4', k: 4, top: 'POINT 4', cap: 'PURE INTRUSION', color: COL.green, n: '2' },
  { pose: 'p5', k: 5, top: 'POINT 5', cap: 'RETROCLINATION', color: COL.white, n: '3' },
];
const COL_RECT = { y: 505, h: 960, w: 360 };

// ---------------------------------------------------------------------------- background
let _bg = null;
function filmBackground() {
  if (_bg) return _bg;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.drawImage(backgroundCanvas(), 0, 0);
  const g = x.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, W * 0.8);
  g.addColorStop(0, 'rgba(21,44,66,0.92)'); g.addColorStop(0.5, 'rgba(18,36,54,0.38)'); g.addColorStop(1, 'rgba(16,32,48,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  _bg = c; return c;
}
function outro(ctx, u, bg) {
  if (u <= 0) return;
  const e = (v) => { const k = Math.min(1, Math.max(0, v)); return k * k * (3 - 2 * k); };
  ctx.save(); ctx.globalAlpha = e(u / 0.9); ctx.drawImage(bg, 0, 0, W, H); ctx.restore();
  drawLogo(ctx, W / 2, H * 0.455, { circleA: e((u - 0.55) / 0.8), wordA: e((u - 1.15) / 0.8) });
}
const TOP = { text: 'CK BIOMECHANICS', font: '500 28px Inter, "Helvetica Neue", Arial, sans-serif', color: '#eef2f7', baseline: 212.5, spacing: 10.4 };
function drawTopLabel(x, a) {
  if (a <= 0.003) return;
  x.save(); x.font = TOP.font; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  if ('letterSpacing' in x) x.letterSpacing = `${TOP.spacing}px`;
  x.globalAlpha = a; x.shadowColor = 'rgba(0,6,18,0.85)'; x.shadowBlur = 10; x.fillStyle = TOP.color; x.fillText(TOP.text, W / 2 + TOP.spacing / 2, TOP.baseline); x.restore();
}

// ---------------------------------------------------------------------------- materials (series look)
function tissueMaterial({ color, rim, base = 0.1, rimA = 0.5, light = 0.6, x0 = -1e4, x1 = 1e4, soft = 5, y0 = -1e4, ysoft = 4 }) {
  const uniforms = { uColor: { value: new THREE.Color(color) }, uRim: { value: new THREE.Color(rim) }, uAlpha: { value: 1 },
    uBase: { value: base }, uRimA: { value: rimA }, uLight: { value: light }, uX0: { value: x0 }, uX1: { value: x1 }, uSoft: { value: soft },
    uY0: { value: y0 }, uYSoft: { value: ysoft } };
  return new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform vec3 uRim; uniform float uAlpha, uBase, uRimA, uLight, uX0, uX1, uSoft, uY0, uYSoft;
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        float fr = pow(1.0 - abs(dot(n, normalize(vV))), 2.2);
        vec3 L = normalize(vec3(-0.35, 0.8, 0.5));
        float dif = 0.55 + 0.45 * dot(n, L);
        vec3 c = mix(uColor * (0.5 + uLight * dif), uRim, fr * 0.85);
        float crop = smoothstep(uX0, uX0 + uSoft, vW.x) * (1.0 - smoothstep(uX1 - uSoft, uX1, vW.x)) * smoothstep(uY0, uY0 + uYSoft, vW.y);
        float a = (uBase + uRimA * fr) * uAlpha * crop;
        if (a < 0.003) discard;
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`,
  });
}
function ghostMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vV;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uAlpha; varying vec3 vN; varying vec3 vV;
      void main(){ float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.7);
        float a = (0.02 + 0.34*fr) * uAlpha; if (a < 0.003) discard; gl_FragColor = vec4(uColor * a, a * 0.6);
        #include <colorspace_fragment>
      }`,
  });
}
function toothMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3,
    sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color('#cfe3ff'), envMapIntensity: 0.6, transparent: false });
  const u = { uTint: { value: new THREE.Color(COL.red) }, uTintAmt: { value: 0 }, uGlow: { value: new THREE.Color(COL.blue) }, uGlowAmt: { value: 0 },
    uEdge: { value: LOOK.edge }, uDim: { value: 0 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAO; attribute float aEnamel; varying float vAO; varying float vEn; varying vec3 vVw; varying vec3 vNw;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAO = aAO; vEn = aEnamel; vVw = (modelMatrix*vec4(position,1.0)).xyz; vNw = normalize(mat3(modelMatrix)*normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint; uniform float uTintAmt; uniform vec3 uGlow; uniform float uGlowAmt; uniform float uEdge; uniform float uDim; varying float vAO; varying float vEn; varying vec3 vVw; varying vec3 vNw;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 enamel = vec3(0.95, 0.93, 0.89);
        vec3 root = vec3(0.88, 0.78, 0.62);
        float en = smoothstep(0.25, 0.8, vEn);
        diffuseColor.rgb = mix(root, enamel, en);
        float frC = pow(1.0 - abs(dot(normalize(vNw), normalize(cameraPosition - vVw))), 3.0);
        diffuseColor.rgb *= 1.0 - uEdge * frC;
        diffuseColor.rgb = mix(diffuseColor.rgb, uTint, uTintAmt * 0.4);
        diffuseColor.rgb *= 1.0 - 0.3 * uDim;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.62, 0.26, vEn);')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        { float ao = mix(1.0, pow(clamp(vAO*1.05+0.05,0.0,1.0), 1.4), mix(0.7, 0.2, vEn));
          reflectedLight.indirectDiffuse *= ao; reflectedLight.directDiffuse *= mix(1.0, ao, 0.6); reflectedLight.indirectSpecular *= ao; }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float fr = pow(1.0 - abs(dot(normalize(vNw), normalize(cameraPosition - vVw))), 2.0);
          totalEmissiveRadiance += vec3(0.62, 0.70, 0.78) * 0.07 * vEn * pow(fr, 1.5);
          totalEmissiveRadiance += uTint * uTintAmt * (0.08 + 0.8*fr);
          totalEmissiveRadiance += uGlow * uGlowAmt * (0.05 + 0.8*fr); }`);
  };
  m.customProgramCacheKey = () => 'ck-tooth';
  return m;
}
const steel = () => new THREE.MeshPhysicalMaterial({ color: 0xd9dee6, metalness: 1, roughness: 0.24, envMapIntensity: 1.25, clearcoat: 0.3, clearcoatRoughness: 0.2, transparent: true });
const tma = () => new THREE.MeshPhysicalMaterial({ color: 0xd6cfc4, metalness: 1, roughness: 0.3, envMapIntensity: 1.2, clearcoat: 0.2, clearcoatRoughness: 0.25, transparent: true });

// ---------------------------------------------------------------------------- loader
async function loadDentition(url = 'assets/dentition') {
  const [hdr, buf] = await Promise.all([fetch(url + '.json').then((r) => r.json()), fetch(url + '.bin').then((r) => r.arrayBuffer())]);
  const geos = {}, raw = {};
  for (const m of hdr.meshes) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(buf, m.position[0], m.vertices * 3), en = new Uint8Array(buf, m.enamel[0], m.vertices);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(buf, m.normal[0], m.vertices * 3), 3, true));
    g.setAttribute('aAO', new THREE.BufferAttribute(new Uint8Array(buf, m.ao[0], m.vertices), 1, true));
    g.setAttribute('aEnamel', new THREE.BufferAttribute(en, 1, true));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, m.index[0], m.triangles * 3), 1));
    g.computeBoundingSphere();
    geos[m.name] = g; raw[m.name] = { pos, en };
  }
  return { hdr, geos, raw, M: Object.fromEntries(hdr.meshes.map((m) => [m.name, m])) };
}

// ---------------------------------------------------------------------------- film
export class Film {
  constructor() {
    this.out = document.createElement('canvas'); this.out.width = W; this.out.height = H;
    this.ctx = this.out.getContext('2d');
    this.subtitles = true;
    this.vp = { x: 0, y: 0, w: W, h: H };
  }
  setLook() {}

  async init() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1); r.setSize(W, H, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = LOOK.exposure;
    r.setClearColor(0x000000, 0);
    r.sortObjects = true;
    const sc = this.scene = new THREE.Scene();
    this.bgCanvas = filmBackground();
    const pm = new THREE.PMREMGenerator(r);
    sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    sc.environmentIntensity = LOOK.env;
    const cam = this.camera = new THREE.PerspectiveCamera(30, W / H, 2, 2000);
    this.mainCam = cam;
    this.colCams = [0, 1, 2].map(() => new THREE.PerspectiveCamera(30, COL_RECT.w / COL_RECT.h, 2, 2000));
    for (const c of [cam, ...this.colCams]) {
      sc.add(c);
      const key = new THREE.DirectionalLight(0xfff3e6, LOOK.key); key.position.set(-120, 200, 220); c.add(key); key.target = c;
      const fill = new THREE.DirectionalLight(0xdfe8ff, 1.1); fill.position.set(220, -40, 160); c.add(fill); fill.target = c;
      const rim = new THREE.DirectionalLight(LOOK.rimColor, LOOK.rim); rim.position.set(140, 160, -260); c.add(rim); rim.target = c;
      const rim2 = new THREE.DirectionalLight(0x8fc4ff, LOOK.rim2); rim2.position.set(-200, -40, -220); c.add(rim2); rim2.target = c;
      const front = new THREE.DirectionalLight(0xffffff, LOOK.front); front.position.set(0, 40, 300); c.add(front); front.target = c;
      c.userData.lights = [key, fill, rim, rim2, front];
    }
    sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x141018, 0.25));

    const { hdr, geos, raw, M } = await loadDentition();
    this.hdr = hdr; this.M = M; this.geos = geos;
    this.POSES = hdr.poses;

    // ---------------- teeth
    this.teeth = {};
    const mkTooth = (name, parent) => {
      const mat = toothMaterial(), mesh = new THREE.Mesh(geos[name], mat); mesh.renderOrder = 1; parent.add(mesh);
      this.teeth[name] = { m: M[name], mesh, mat };
    };
    // incisor segment: pivot = START CR = origin of the arch frame
    this.inc = new THREE.Group(); sc.add(this.inc);
    for (const n of INC) mkTooth(n, this.inc);
    this.ghostInc = new THREE.Group(); sc.add(this.ghostInc);
    this.ghostMat = ghostMaterial('#dff4ff');
    for (const n of INC) { const g = new THREE.Mesh(geos[n], this.ghostMat); g.renderOrder = 6; this.ghostInc.add(g); }
    // buccal segments: pivot at the segment CR (mean of the tooth CRs)
    this.buc = {}; this.bucGhost = {};
    this.bucGhostMat = ghostMaterial('#ffb0a8');
    for (const q of ['3', '4']) {
      const c = BUC[q].map((n) => M[n].cr).reduce((a, b) => V.add(a, b)).map((v) => v / 5);
      const pivot = new THREE.Group(), inner = new THREE.Group();
      pivot.position.set(...c); inner.position.set(-c[0], -c[1], -c[2]); pivot.add(inner); sc.add(pivot);
      const mesial = V.norm(V.sub(hdr.slots[q + '4'], hdr.slots[q + '6'])); mesial[1] = 0;
      const axis = V.norm(V.cross(V.norm(mesial), [0, 1, 0]));        // rotation about this axis by +angle tips the crowns distally
      this.buc[q] = { pivot, inner, c, axis };
      for (const n of BUC[q]) mkTooth(n, inner);
      const gp = new THREE.Group(); sc.add(gp); this.bucGhost[q] = gp;
      for (const n of BUC[q]) { const g = new THREE.Mesh(geos[n], this.bucGhostMat); g.renderOrder = 6; gp.add(g); }
    }
    this.upper = new THREE.Group(); sc.add(this.upper);
    for (const n of Object.keys(M).filter((k) => k[0] === 'U')) mkTooth(n, this.upper);

    // ---------------- bone (translucent)
    this.boneMat = tissueMaterial({ color: '#e3d7c3', rim: '#b9e4ff', base: 0.3, rimA: 0.45, light: 0.6, x0: -40, x1: 40, soft: 6, y0: -40, ysoft: 6 });
    this.bone = new THREE.Mesh(geos.bone, this.boneMat); this.bone.renderOrder = 4; sc.add(this.bone);

    // ---------------- appliance
    this.incMetal = steel(); this.bucMetal = steel();
    const brG = bracketGeometry(1.55);
    const brSmall = bracketGeometry(1.55); brSmall.scale(0.8, 0.92, 1);
    const frameQ = (m, mesial) => { const f = toothFrame(m, mesial); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.x), new THREE.Vector3(...f.y), new THREE.Vector3(...f.z))); };
    const ligMat = new THREE.MeshPhysicalMaterial({ color: 0x8796a8, roughness: 0.35, metalness: 0, transmission: 0.25, thickness: 0.5, clearcoat: 0.6, transparent: true });
    this.ligMat = ligMat;
    const addBracket = (fdi, parent, metal, geo) => {
      const m = M['L' + fdi], b = new THREE.Mesh(geo, metal);
      b.position.set(...m.fa); b.quaternion.copy(frameQ(m, mesialDir(hdr, fdi))); b.renderOrder = 2; parent.add(b);
      const lig = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.22, 10, 32), ligMat); lig.scale.set(geo === brSmall ? 0.95 : 1.12, 1.05, 1); lig.position.set(0, 0, 1.6); b.add(lig);
      return b;
    };
    for (const n of INC) addBracket(n.slice(1), this.inc, this.incMetal, brSmall);
    for (const q of ['3', '4']) {
      const inner = this.buc[q].inner;
      for (const k of ['3', '4', '5']) addBracket(q + k, inner, this.bucMetal, brG);
      const m6 = M['L' + q + '6'], t6 = new THREE.Mesh(doubleTubeGeometry(), this.bucMetal);
      t6.position.set(...m6.fa); t6.quaternion.copy(frameQ(m6, mesialDir(hdr, q + '6'))); t6.renderOrder = 2; inner.add(t6);
      const m7 = M['L' + q + '7'], t7 = new THREE.Mesh(singleTubeGeometry(), this.bucMetal);
      t7.position.set(...m7.fa); t7.quaternion.copy(frameQ(m7, mesialDir(hdr, q + '7'))); t7.renderOrder = 2; inner.add(t7);
      const bw = resample(new THREE.CatmullRomCurve3(buccalWire(hdr, q).map((p) => new THREE.Vector3(...p))).getPoints(90).map((v) => [v.x, v.y, v.z]), 100);
      const wm = new THREE.Mesh(sweepRect(bw, WIRE.ss.w, WIRE.ss.h, [0, 1, 0]), this.bucMetal); wm.renderOrder = 2; inner.add(wm);
      this.buc[q].wire = wm;
      this.buc[q].aux = auxTube(hdr, M, q);
    }
    // anterior sectional wire: two halves from the midline (draw-on in scene 02)
    this.antHalves = [1, -1].map((side) => {
      const pts = resample(sideWire(hdr, side), 160);
      const mesh = new THREE.Mesh(sweepRect(pts, WIRE.ss.w, WIRE.ss.h, [0, 1, 0]), this.incMetal); mesh.renderOrder = 2; this.inc.add(mesh);
      return { mesh, pts, idx: mesh.geometry.index.count };
    });
    this.pp = pointParams(hdr);
    // cantilevers (TMA) + passive outlines + ligatures at the tie points
    this.cantN = 300;
    this.cantMat = [tma(), tma()];
    this.cant = [0, 1].map((i) => { const m = new THREE.Mesh(sweepRect(resample([[0, 0, 0], [1, 0, 0]], this.cantN), WIRE.tma.w, WIRE.tma.h, [0, 1, 0]), this.cantMat[i]); m.renderOrder = 2; sc.add(m); return m; });
    this.passiveMat = ghostMaterial('#cfeeff');
    this.cantGhost = [0, 1].map(() => { const m = new THREE.Mesh(sweepRect(resample([[0, 0, 0], [1, 0, 0]], this.cantN), WIRE.tma.w, WIRE.tma.h, [0, 1, 0]), this.passiveMat); m.renderOrder = 7; sc.add(m); return m; });
    this.ties = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.13, 8, 24), steel()); m.renderOrder = 3; sc.add(m); return m; });

    // ---------------- clearance envelope for the cantilever arm
    const meshes = Object.keys(raw).filter((n) => n[0] === 'L').map((n) => raw[n]);
    const brk = [];
    for (const n of Object.keys(M).filter((k) => k[0] === 'L')) {
      const m = M[n]; brk.push(V.add(m.fa, V.mul(m.faN, n.endsWith('6') ? 3.0 : 2.45)));
    }
    for (const side of [1, -1]) for (const p of sideWire(hdr, side)) { const o = V.norm([p[0] - hdr.archCentre[0], 0, p[2] - hdr.archCentre[2]]); brk.push(V.add(p, V.mul(o, 0.36))); }
    this.env = buildEnvelope(meshes, brk, hdr.archCentre);

    await Promise.all([document.fonts.load(`800 60px ${F}`), document.fonts.load(`700 40px ${F}`), document.fonts.load(`600 30px ${F}`),
      document.fonts.load(`600 30px ${F}`, 'АБВ'), document.fonts.load(`800 60px ${F}`, 'АБВ'), document.fonts.load(TOP.font)]);
    for (const t of [0.5, 7.5, 11.5, 15, 21, 24, 29, 36, 46, 51, 55, 58]) this.renderTime(t);   // compile all programs once
  }

  // ------------------------------------------------------------------ state (pure functions of t)
  P(name) { return this.POSES[name]; }
  incState(t) {
    const P = (n) => this.P(n);
    if (t < 25.1) return { pose: IDENT, s: 0, target: 'p2' };
    if (t < S.reset6[0]) { const s = ramp(t, ...S.move5); return { pose: poseLerp(IDENT, P('p2'), s), s, target: 'p2' }; }
    if (t < S.reset6[1]) { const s = 1 - ramp(t, ...S.reset6); return { pose: poseLerp(IDENT, P('p2'), s), s, target: 'p2' }; }
    if (t < S.reset7[0]) { const s = ramp(t, ...S.move6); return { pose: poseLerp(IDENT, P('p4'), s), s, target: 'p4' }; }
    if (t < S.reset7[1]) { const s = 1 - ramp(t, ...S.reset7); return { pose: poseLerp(IDENT, P('p4'), s), s, target: 'p4' }; }
    if (t < S.back8[0]) { const s = ramp(t, ...S.move7); return { pose: poseLerp(IDENT, P('p5'), s), s, target: 'p5' }; }
    const u = ramp(t, ...S.back8); return { pose: poseLerp(P('p5'), P('p4'), u), s: 1, target: u < 0.5 ? 'p5' : 'p4' };
  }
  tieK(t) {
    if (this.tieOverride) return this.tieOverride;
    if (t < 25.1) return 3;
    if (t < S.slide4[0]) return 2;
    if (t < S.slide5[0]) return 2 + 2 * ramp(t, ...S.slide4);
    if (t < S.back8[0]) return 4 + ramp(t, ...S.slide5);
    return 5 - ramp(t, ...S.back8);
  }
  buccalState(t) {
    const u = t >= 48.3 && t < 57.2 ? ramp(t, ...S.buccalTip) : 0;
    return { deg: BUCCAL_TIP.deg * u, extr: BUCCAL_TIP.extr * u, u };
  }
  /** transform of a buccal-segment point (rest → current) */
  bucApply(q, st, p) {
    const B = this.buc[q], k = B.axis, a = st.deg * DEG, c = Math.cos(a), s = Math.sin(a);
    const v = V.sub(p, B.c), kv = V.cross(k, v), kd = V.dot(k, v);
    const r = V.add(V.add(V.mul(v, c), V.mul(kv, s)), V.mul(k, kd * (1 - c)));
    return V.add(V.add(B.c, r), [0, st.extr, 0]);
  }
  bucApplyDir(q, st, d) { return V.sub(this.bucApply(q, st, V.add(this.buc[q].c, d)), this.bucApply(q, st, this.buc[q].c)); }

  // ------------------------------------------------------------------ frame
  renderFrame(i) { return this.renderTime(i / FPS); }

  renderTime(tIn) {
    const t = Math.min(Math.max(tIn, 0), DURATION - 1e-6);
    this.t = t;
    const x = this.ctx;
    x.globalAlpha = 1;
    x.drawImage(this.bgCanvas, 0, 0);
    if (split(t)) this.renderSplit(t);
    else {
      this.camera = this.mainCam; this.vp = { x: 0, y: 0, w: W, h: H };
      this.applyCamera(this.mainCam, this.camOverride || cameraAt(t), W / H, this.camOverride ? 0 : focusLevel(t));
      this.updateScene(t);
      const r = this.renderer;
      r.setScissorTest(false); r.setViewport(0, 0, W, H); r.clear();
      r.render(this.scene, this.mainCam);
      x.drawImage(r.domElement, 0, 0);
      this.drawOverlay(x, t);
    }
    x.drawImage(this.topShade ??= this.makeTopShade(), 0, 0);
    this.drawKeywords(x, t);
    if (this.subtitles) this.drawSubtitle(x, t);
    this.text(x, 'QUALITATIVE BIOMECHANICS — NOT A FINITE-ELEMENT SIMULATION', W / 2, 1562, { size: 17, weight: 600, color: COL.dim, alpha: VIS.disclaimer(t) * 0.78, spacing: 2 });
    drawTopLabel(x, 1 - smooth((t - OUTRO_T0) / 0.6));
    if (t >= OUTRO_T0) outro(x, t - OUTRO_T0, this.bgCanvas);
    return this.out;
  }

  makeTopShade() {
    const c = document.createElement('canvas'); c.width = W; c.height = 520;
    const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 520);
    g.addColorStop(0, 'rgba(2,6,13,0.72)'); g.addColorStop(0.55, 'rgba(2,6,13,0.38)'); g.addColorStop(1, 'rgba(2,6,13,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, 520); return c;
  }

  applyCamera(cam, c, aspect, focus = 0) {
    const dist = c.dist * (1 - 0.018 * focus);
    const az = c.az * DEG, el = c.el * DEG;
    const dir = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
    cam.position.set(c.tgt[0] + dir[0] * dist, c.tgt[1] + dir[1] * dist, c.tgt[2] + dir[2] * dist);
    cam.up.set(-Math.sin(el) * Math.sin(az), Math.cos(el), -Math.sin(el) * Math.cos(az));
    cam.lookAt(...c.tgt);
    cam.fov = c.fov; cam.aspect = aspect; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }

  // ------------------------------------------------------------------ visibility helpers
  setToothAlpha(name, a) {
    const o = this.teeth[name]; o.mesh.visible = a > 0.004;
    const tr = a < 0.999; if (o.mat.transparent !== tr) { o.mat.transparent = tr; o.mat.needsUpdate = true; }
    o.mat.opacity = a; o.mat.depthWrite = !tr || a > 0.6;
  }
  resetTeeth() { for (const o of Object.values(this.teeth)) { const u = o.mat.userData.u; u.uTintAmt.value = 0; u.uGlowAmt.value = 0; u.uDim.value = 0; } }
  setIncPose(pose) { this.inc.position.set(...pose.shift); this.inc.rotation.set(pose.theta * DEG, 0, 0); this.inc.updateMatrixWorld(); }

  // ------------------------------------------------------------------ split screen (scenes 01 and 09)
  renderSplit(t) {
    const r = this.renderer, x = this.ctx;
    this.resetTeeth();
    for (const n of Object.keys(this.teeth)) this.setToothAlpha(n, INC.includes(n) ? 1 : 0);
    for (const q of ['3', '4']) { this.buc[q].pivot.visible = false; this.bucGhost[q].visible = false; }
    this.upper.visible = false;
    for (const m of [...this.cant, ...this.cantGhost, ...this.ties]) m.visible = false;
    this.incMetal.opacity = 1;
    for (const h of this.antHalves) h.mesh.geometry.setDrawRange(0, h.idx);
    this.bone.visible = true;
    this.boneMat.uniforms.uAlpha.value = 1; this.boneMat.uniforms.uBase.value = 0.07; this.boneMat.uniforms.uRimA.value = 0.42;
    this.boneMat.uniforms.uX0.value = -10.5; this.boneMat.uniforms.uX1.value = 10.5; this.boneMat.uniforms.uY0.value = -15; this.boneMat.uniforms.uSoft.value = 4;
    const final = t >= 53.4;
    const s = final ? 1 : ramp(t, ...S.hookMove);
    const fade = final ? smooth((t - 53.4) / 0.45) : 1 - smooth((t - 4.85) / 0.35);
    r.setScissorTest(true); r.setViewport(0, 0, W, H); r.setScissor(0, 0, W, H); r.clear();
    const shots = [];
    COLS.forEach((c, i) => {
      const cam = this.colCams[i], rect = { x: i * COL_RECT.w, y: COL_RECT.y, w: COL_RECT.w, h: COL_RECT.h };
      this.applyCamera(cam, COLUMN_CAM, rect.w / rect.h);
      const pose = poseLerp(IDENT, this.P(c.pose), s);
      this.setIncPose(pose);
      this.ghostMat.uniforms.uAlpha.value = (final ? 1 : smooth((t - 0.6) / 0.4)) * 1.1;
      this.ghostInc.visible = true;
      r.setViewport(rect.x, H - rect.y - rect.h, rect.w, rect.h); r.setScissor(rect.x, H - rect.y - rect.h, rect.w, rect.h);
      r.render(this.scene, cam);
      shots.push({ c, i, cam, rect, pose });
    });
    r.setScissorTest(false);
    x.save(); x.globalAlpha = fade; x.drawImage(r.domElement, 0, 0); x.restore();
    for (const sh of shots) { this.camera = sh.cam; this.vp = sh.rect; this.drawColumn(x, t, sh, s, fade, final); }
    this.camera = this.mainCam; this.vp = { x: 0, y: 0, w: W, h: H };
    // column dividers
    x.save(); x.globalAlpha = 0.35 * fade; x.strokeStyle = '#7fa6c8'; x.lineWidth = 1.5;
    for (const xx of [360, 720]) { x.beginPath(); x.moveTo(xx, COL_RECT.y + 10); x.lineTo(xx, COL_RECT.y + COL_RECT.h - 20); x.stroke(); }
    x.restore();
  }
  drawColumn(x, t, sh, s, fade, final) {
    const { c, pose, rect } = sh;
    const cr = crAt(pose);
    const [tl, tr] = tieLocal(this.pp, c.k);
    const tie = [apply(pose, tl), apply(pose, tr)];
    const fs = forceSystem(tie, cr, [this.buc['3'].aux.c, this.buc['4'].aux.c]);
    const at = fs.resultantAt;
    const cx = rect.x + rect.w / 2;
    // captions (top of the column)
    this.text(x, c.top, cx, rect.y + 6, { size: 21, weight: 700, color: COL.dim, alpha: fade, spacing: 2 });
    this.text(x, c.cap, cx, rect.y + 38, { size: 27, weight: 800, color: c.color, alpha: fade, spacing: 2 });
    if (final) this.text(x, 'INTRUSION +', cx, rect.y - 24, { size: 19, weight: 700, color: '#d7e6f3', alpha: fade * (c.n === '2' ? 0 : 1), spacing: 3 });
    // trajectories of the incisal edge and the apex (31), from the start to the current pose
    const m = this.M.L31;
    const traj = (p) => { const pts = []; for (let i = 0; i <= 24; i++) pts.push(this.proj(apply(poseLerp(IDENT, this.P(c.pose), s * i / 24), p))); return pts; };
    const trc = c.n === '2' ? COL.green : COL.white;
    if (s > 0.02) { this.dashed(x, traj(m.tip), { color: trc, alpha: fade * 0.95, width: 3, glow: c.n === '2' }); this.dashed(x, traj(m.apex), { color: trc, alpha: fade * 0.8, width: 2.5, glow: c.n === '2' }); }
    // CR
    this.dot(x, this.proj(cr), { alpha: fade, r: 8 });
    // line of action + resultant (same F in every column)
    const lineA = 0.55 * fade;
    this.dashed(x, [this.proj([0, at[1] + 11, at[2]]), this.proj([0, cr[1] - 9, at[2]])], { color: COL.blue, alpha: lineA, width: 2, dash: [5, 7] });
    this.force3(x, at, [0, -1, 0], 9, { color: COL.blue, alpha: fade, width: 7, head: 22, into: true });
    this.text(x, 'F', ...this.proj([0, at[1] + 10.6, at[2] + 1.2]).slice(0, 2), { size: 30, weight: 800, color: COL.blue, alpha: fade });
    // lever arm and moment
    const d = fs.d;
    if (Math.abs(d) > 0.3) {
      this.dashed(x, [this.proj(cr), this.proj([0, cr[1], at[2]])], { color: COL.gold, alpha: fade, width: 3, dash: [4, 5] });
      this.text(x, 'd', ...this.proj([0, cr[1] - 2.2, cr[2] + d / 2]).slice(0, 2), { size: 26, weight: 800, color: COL.gold, alpha: fade });
      this.momentArc(x, cr, 6.0, Math.sign(d), { alpha: fade, width: 6, progress: final ? 1 : easeOut((t - 0.5) / 0.6) });
    } else {
      this.text(x, 'd ≈ 0', ...this.proj([0, cr[1] - 3.2, cr[2] - 4.5]).slice(0, 2), { size: 23, weight: 800, color: COL.gold, alpha: fade, align: 'left' });
    }
  }

  // ------------------------------------------------------------------ full-frame 3D state
  updateScene(t) {
    const hdr = this.hdr;
    this.resetTeeth();
    this.ghostInc.visible = false;
    const sag = VIS.sagittal(t);
    // incisors
    const IS = this.IS = this.incState(t);
    this.setIncPose(IS.pose);
    for (const n of INC) this.setToothAlpha(n, 1);
    const glow = win(t, ...S.incGlow, 0.3, 0.5);
    for (const n of INC) this.teeth[n].mat.userData.u.uGlowAmt.value = 0.55 * glow;
    // ghost of the start position while the segment moves
    const gA = IS.s > 0.01 && t < S.back8[0] ? 1.1 : 0;
    this.ghostInc.visible = gA > 0; this.ghostMat.uniforms.uAlpha.value = gA;
    // buccal segments
    const BS = this.BS = this.buccalState(t);
    const bucA = 1 - 0.84 * sag;
    for (const q of ['3', '4']) {
      const B = this.buc[q];
      B.pivot.visible = bucA > 0.004;
      const p = this.bucApply(q, BS, B.c);
      B.pivot.position.set(...p);
      B.pivot.quaternion.setFromAxisAngle(new THREE.Vector3(...B.axis), BS.deg * DEG);
      for (const n of BUC[q]) this.setToothAlpha(n, bucA);
      const red = 0.5 * win(t, WT.control9, 53.5, 0.4, 0.4);
      for (const n of BUC[q]) this.teeth[n].mat.userData.u.uTintAmt.value = red;
      this.bucGhost[q].visible = BS.u > 0.02; this.bucGhostMat.uniforms.uAlpha.value = 1.2 * BS.u;
    }
    this.bucMetal.opacity = bucA;
    // canines and premolars of the right side also fade in the sagittal view (they are in front of the roots)
    // upper dentition (scene 02: deep bite, then transparent)
    const ua = VIS.upper(t);
    this.upper.visible = ua > 0.004;
    for (const n of Object.keys(this.teeth).filter((k) => k[0] === 'U')) this.setToothAlpha(n, ua);
    // bone
    const clear = VIS.boneClear(t);
    this.bone.visible = true;
    const bu = this.boneMat.uniforms;
    bu.uAlpha.value = 1; bu.uBase.value = lerp(0.3, 0.06, clear); bu.uRimA.value = lerp(0.45, 0.42, clear);
    bu.uX0.value = lerp(-40, -11, sag); bu.uX1.value = lerp(40, 11, sag); bu.uSoft.value = lerp(6, 4, sag); bu.uY0.value = -40 + 22 * sag;
    // anterior wire (draw-on: sectional part, then the stepped extensions)
    const sw = t < 5.2 ? 1 : t < S.antWire[0] ? 0 : t < S.extension[0] ? 0.5 * ramp(t, ...S.antWire) : 0.5 + 0.5 * ramp(t, ...S.extension);
    for (const h of this.antHalves) {
      const segs = h.pts.length - 1, perSeg = h.idx / segs;
      // the sectional part ends at the distal end of the lateral bracket (≈ point A); extension = the rest
      const nA = this.antSplitIdx ??= this.splitIndex(h.pts);
      const n = sw <= 0.5 ? Math.round(nA * sw * 2) : Math.round(nA + (segs - nA) * (sw - 0.5) * 2);
      h.mesh.geometry.setDrawRange(0, Math.max(0, n) * perSeg);
      h.mesh.visible = n > 0;
    }
    this.incMetal.opacity = 1;
    // buccal wires draw-on
    const bw = t < 5.2 ? 1 : ramp(t, ...S.buccalWire);
    for (const q of ['3', '4']) { const g = this.buc[q].wire.geometry; g.setDrawRange(0, Math.round(g.index.count / 6 * bw) * 6); this.buc[q].wire.visible = bw > 0.01; }
    this.updateCantilevers(t);
  }
  splitIndex(pts) {
    // index of the polyline point closest to the start of the apical step (A)
    const A = this.hdr.wire.left[2];
    let best = [1e9, 0];
    pts.forEach((p, i) => { const d = Math.hypot(Math.abs(p[0]) - Math.abs(A[0]), p[1] - A[1], p[2] - A[2]); if (d < best[0]) best = [d, i]; });
    return best[1];
  }

  /** cantilever state: fabrication, mirror copy, insertion, activation, tie point */
  cantState(t, i) {
    const side = i === 0 ? 1 : -1;
    const f = S.fab;
    const vis = (i === 0 ? t >= f.grow[0] : t >= S.mirror[0]) ? 1 : 0;
    const a = vis * VIS.cantilever(t) * (i === 1 ? smooth((t - S.mirror[0]) / (S.mirror[1] - S.mirror[0])) : 1);
    const form = i === 0 && t < f.hook[1] ? { arch: ramp(t, ...f.arch), tip: ramp(t, ...f.tip), hook: ramp(t, ...f.hook) } : null;
    const grow = i === 0 ? ramp(t, ...f.grow, easeOut) : 1;
    const q = i === 0 ? '3' : '4';
    const aux = this.buc[q].aux;
    const fabOff = [side * 3.0, 12.5, 4.0];            // fabrication: floating above the occlusal plane, clear of the teeth
    const pre = V.mul(V.norm([aux.m[0], 0, aux.m[2]]), 5.5);
    let offset = [0, 0, 0];
    if (t < S.insert[0]) offset = fabOff;
    else if (t < S.insert[1]) { const u = ramp(t, ...S.insert, (v) => clamp01(v)); offset = u < 0.5 ? V.lerp(fabOff, pre, easeInOut(u * 2)) : V.lerp(pre, [0, 0, 0], easeInOut(u * 2 - 1)); }
    const act = ramp(t, ...S.activate);
    return { side, a, form, grow, offset, act, q };
  }
  updateCantilevers(t) {
    const k = this.tieK(t), pose = this.IS.pose;
    const ties = this.tiesNow = this.tiesAt(k, pose);
    this.cantWorld = [null, null];
    for (let i = 0; i < 2; i++) {
      const cs = this.cantState(t, i), mesh = this.cant[i];
      mesh.visible = cs.a > 0.004;
      this.cantGhost[i].visible = false; this.ties[i].visible = false;
      if (!mesh.visible) continue;
      const q = cs.q, aux = this.buc[q].aux;
      const tube = { c: this.bucApply(q, this.BS, aux.c), m: this.bucApplyDir(q, this.BS, aux.m) };
      const tie = ties[i];
      const res = cantilever(tube, tie, this.env, { act: cs.act, form: cs.form, grow: cs.grow, offset: cs.offset, side: cs.side });
      sweepRect(resample(res.pts, this.cantN), WIRE.tma.w, WIRE.tma.h, [0, 1, 0], mesh.geometry);
      this.cantMat[i].opacity = cs.a;
      this.cantWorld[i] = res;
      // passive outline during / right after the activation
      const ga = VIS.passiveGhost(t) * (t > S.activate[0] ? 1 : 0);
      if (ga > 0.004) {
        const pr = cantilever(tube, tie, this.env, { act: 0, side: cs.side });
        sweepRect(resample(pr.pts, this.cantN), WIRE.tma.w, WIRE.tma.h, [0, 1, 0], this.cantGhost[i].geometry);
        this.cantGhost[i].visible = true; this.passiveMat.uniforms.uAlpha.value = ga * 2.0;
        this.passiveEnd = this.passiveEnd || []; this.passiveEnd[i] = pr.pts[pr.pts.length - 17];
      }
      // ligature at the tie point after engagement
      if (t >= S.tie) {
        const L = this.ties[i]; L.visible = true;
        const tang = V.norm(V.sub(res.pts[res.pts.length - 18], res.pts[res.pts.length - 22]));
        L.position.set(...tie);
        L.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...tang));
        const sc = 1 + 0.6 * (1 - smooth((t - S.tie) / 0.35));
        L.scale.setScalar(sc); L.material.transparent = true; L.material.opacity = cs.a;
      }
    }
  }
  tiesAt(k, pose) {
    const [l, r] = tieLocal(this.pp, k);
    return [apply(pose, l), apply(pose, r)];
  }

  // ------------------------------------------------------------------ 2D helpers
  proj(p) {
    const v = new THREE.Vector3(...p).project(this.camera), vp = this.vp;
    return [vp.x + (v.x + 1) / 2 * vp.w, vp.y + (1 - v.y) / 2 * vp.h, v.z];
  }
  text(x, str, px, py, { size = 40, weight = 700, color = COL.white, alpha = 1, spacing = 0, align = 'center', baseline = 'middle', glow = null, shadow = true } = {}) {
    if (alpha <= 0.003) return;
    x.save();
    x.globalAlpha = Math.min(1, alpha); x.fillStyle = color;
    x.font = `${weight} ${size}px ${F}`; x.textAlign = align; x.textBaseline = baseline;
    if ('letterSpacing' in x) x.letterSpacing = `${spacing}px`;
    const tx = align === 'center' ? px + spacing / 2 : px;
    if (glow) { x.shadowColor = glow; x.shadowBlur = 22; x.fillText(str, tx, py); }
    if (shadow) { x.shadowColor = 'rgba(0,6,18,0.9)'; x.shadowBlur = 12; }
    x.fillText(str, tx, py);
    x.restore();
  }
  arrow(x, a, b, { color = COL.blue, width = 6, alpha = 1, head = 24, progress = 1, glow = true } = {}) {
    if (alpha <= 0.003 || progress <= 0.001) return;
    const B = [a[0] + (b[0] - a[0]) * progress, a[1] + (b[1] - a[1]) * progress];
    const ang = Math.atan2(B[1] - a[1], B[0] - a[0]);
    const hl = Math.min(head, Math.hypot(B[0] - a[0], B[1] - a[1]) * 0.6);
    const Sx = [B[0] - Math.cos(ang) * hl * 0.7, B[1] - Math.sin(ang) * hl * 0.7];
    x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
    const pass = (w, c, al, blur) => {
      x.globalAlpha = Math.min(1, al); x.strokeStyle = c; x.fillStyle = c; x.lineWidth = w; x.shadowColor = c; x.shadowBlur = blur;
      x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(...Sx); x.stroke();
      x.beginPath(); x.moveTo(...B);
      x.lineTo(B[0] - hl * Math.cos(ang - 0.42), B[1] - hl * Math.sin(ang - 0.42));
      x.lineTo(B[0] - hl * Math.cos(ang + 0.42), B[1] - hl * Math.sin(ang + 0.42));
      x.closePath(); x.fill();
    };
    pass(width + 5, 'rgba(0,8,22,1)', alpha * 0.45, 0);
    if (glow) { x.globalCompositeOperation = 'lighter'; pass(width + 6, color, alpha * 0.2, 20); x.globalCompositeOperation = 'source-over'; }
    pass(width, color, alpha, 0);
    x.restore();
  }
  force3(x, p, d, len, opts = {}) {
    const dn = V.norm(d);
    const a = opts.into ? V.sub(p, V.mul(dn, len)) : p, b = opts.into ? p : V.add(p, V.mul(dn, len));
    this.arrow(x, this.proj(a), this.proj(b), opts);
    return { a: this.proj(a), b: this.proj(b) };
  }
  /** moment arc about an axis through c (default +x = sagittal). sign > 0: positive rotation about the axis */
  momentArc(x, c, r, sign, { color = COL.purple, width = 6, alpha = 1, head = 22, progress = 1, axis = [1, 0, 0], span = 125, mid = 0 } = {}) {
    if (alpha <= 0.003 || progress <= 0.001 || !sign) return;
    const ax = V.norm(axis);
    let u = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
    u = V.norm(V.sub(u, V.mul(ax, V.dot(u, ax)))); const v = V.cross(ax, u);
    const a0 = (mid - sign * span / 2) * DEG, a1 = (mid + sign * span / 2) * DEG;
    const e = a0 + (a1 - a0) * progress, n = 40, pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (e - a0) * i / n; pts.push(this.proj(V.add(c, V.add(V.mul(u, Math.cos(a) * r), V.mul(v, Math.sin(a) * r))))); }
    x.save(); x.lineCap = 'round';
    const tip = pts[n], pre = pts[Math.max(0, n - 4)];
    const ang = Math.atan2(tip[1] - pre[1], tip[0] - pre[0]);
    for (const [w, col, al, comp, blur] of [[width + 5, 'rgba(0,8,22,1)', 0.45, 'source-over', 0], [width + 6, color, 0.2, 'lighter', 20], [width, color, 1, 'source-over', 0]]) {
      x.globalCompositeOperation = comp; x.globalAlpha = Math.min(1, alpha * al); x.strokeStyle = col; x.fillStyle = col; x.lineWidth = w; x.shadowColor = col; x.shadowBlur = blur;
      x.beginPath(); pts.slice(0, n - 2).forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke();
      x.beginPath(); x.moveTo(tip[0] + Math.cos(ang) * head * 0.35, tip[1] + Math.sin(ang) * head * 0.35);
      x.lineTo(tip[0] - head * Math.cos(ang - 0.45), tip[1] - head * Math.sin(ang - 0.45));
      x.lineTo(tip[0] - head * Math.cos(ang + 0.45), tip[1] - head * Math.sin(ang + 0.45));
      x.closePath(); x.fill();
    }
    x.restore();
    return tip;
  }
  dot(x, p, { r = 9, color = COL.gold, alpha = 1 } = {}) {
    if (alpha <= 0.003) return;
    x.save(); x.globalAlpha = Math.min(1, alpha);
    x.globalCompositeOperation = 'lighter'; x.fillStyle = color; x.shadowColor = color; x.shadowBlur = 26;
    x.beginPath(); x.arc(p[0], p[1], r * 1.6, 0, Math.PI * 2); x.globalAlpha = alpha * 0.3; x.fill();
    x.globalCompositeOperation = 'source-over'; x.shadowBlur = 0; x.globalAlpha = Math.min(1, alpha);
    x.fillStyle = color; x.beginPath(); x.arc(p[0], p[1], r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#ffffff'; x.lineWidth = 2.5; x.beginPath(); x.arc(p[0], p[1], r + 4, 0, Math.PI * 2); x.stroke();
    x.restore();
  }
  dashed(x, pts, { color = COL.white, width = 3.5, alpha = 1, dash = [9, 9], glow = false } = {}) {
    if (alpha <= 0.003 || pts.length < 2) return;
    x.save(); x.lineCap = 'round'; x.lineJoin = 'round'; x.setLineDash(dash);
    if (glow) { x.globalCompositeOperation = 'lighter'; x.globalAlpha = Math.min(1, alpha * 0.25); x.strokeStyle = color; x.lineWidth = width + 5; x.shadowColor = color; x.shadowBlur = 14;
      x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke(); x.globalCompositeOperation = 'source-over'; x.shadowBlur = 0; }
    x.globalAlpha = Math.min(1, alpha); x.strokeStyle = color; x.lineWidth = width;
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke();
    x.restore();
  }
  callout(x, p3, str, { dx = 90, dy = -60, color = COL.white, alpha = 1, size = 26, sub = null } = {}) {
    if (alpha <= 0.003) return;
    const p = this.proj(p3), q = [p[0] + dx, p[1] + dy];
    x.save(); x.globalAlpha = Math.min(1, alpha * 0.85); x.strokeStyle = color; x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.lineTo(q[0] + Math.sign(dx || 1) * 18, q[1]); x.stroke();
    x.fillStyle = color; x.beginPath(); x.arc(p[0], p[1], 3.5, 0, Math.PI * 2); x.fill(); x.restore();
    const al = dx >= 0 ? 'left' : 'right', tx = q[0] + Math.sign(dx || 1) * 26;
    this.text(x, str, tx, q[1], { size, weight: 700, color, alpha, align: al, spacing: 2 });
    if (sub) this.text(x, sub, tx, q[1] + size * 0.95, { size: Math.round(size * 0.72), weight: 600, color: COL.dim, alpha, align: al, spacing: 1.5 });
  }
  badge(x, p, n, { alpha = 1, color = COL.white, ring = COL.blue, r = 19, scale = 1 } = {}) {
    if (alpha <= 0.003) return;
    x.save(); x.globalAlpha = Math.min(1, alpha); x.translate(p[0], p[1]); x.scale(scale, scale);
    x.fillStyle = 'rgba(3,12,26,0.88)'; x.shadowColor = ring; x.shadowBlur = 14;
    x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fill();
    x.shadowBlur = 0; x.strokeStyle = ring; x.lineWidth = 3; x.stroke();
    x.fillStyle = color; x.font = `800 ${Math.round(r * 1.15)}px ${F}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(n), 0.5, 1.5); x.restore();
  }
  flash(x, p, u, a, color) {
    if (a <= 0.01) return;
    x.save(); x.globalAlpha = a; x.strokeStyle = color; x.lineWidth = 3; x.shadowColor = color; x.shadowBlur = 14;
    x.beginPath(); x.arc(p[0], p[1], 16 + 46 * u, 0, Math.PI * 2); x.stroke(); x.restore();
  }

  // ------------------------------------------------------------------ overlay (full-frame scenes)
  drawOverlay(x, t) {
    const hdr = this.hdr, M = this.M, IS = this.IS, pose = IS.pose;
    const cr = crAt(pose);
    const tubesNow = ['3', '4'].map((q) => this.bucApply(q, this.BS, this.buc[q].aux.c));

    // ---------- 02: deep bite, segments
    if (t < 10.4) {
      const tipU = V.add(M.U11.tip, [0, 0, 0]);
      this.callout(x, V.lerp(M.U11.tip, M.U21.tip, 0.5), 'DEEP OVERBITE', { dx: 120, dy: 190, alpha: win(t, 5.35, 6.9, 0.3, 0.4), size: 26, sub: 'lower incisors over-erupted' });
      const la = win(t, ...S.segLabels, 0.3, 0.3);
      if (la > 0.01) {
        this.callout(x, hdr.slots['34'], 'SEGMENT A · 33–37', { dx: 40, dy: 230, alpha: la, size: 22, sub: 'SS .019 × .025' });
        this.callout(x, hdr.slots['44'], 'SEGMENT A · 43–47', { dx: -40, dy: 300, alpha: la, size: 22, sub: 'SS .019 × .025' });
        this.callout(x, V.lerp(hdr.slots['31'], hdr.slots['41'], 0.5), 'SEGMENT B · 32–42', { dx: 30, dy: -260, alpha: la, size: 24, sub: 'rigid anterior segment' });
        this.callout(x, hdr.wire.left[hdr.wire.left.length - 3], 'STEPPED EXTENSION', { dx: 60, dy: 150, alpha: la * smooth((t - 9.25) / 0.3), size: 20, sub: 'not engaged in the 33 bracket' });
      }
      const ea = win(t, S.extension[0], 10.2, 0.2, 0.3);
      if (ea > 0.01) for (const p of [hdr.wire.left[3], hdr.wire.right[3]]) this.flash(x, this.proj(p), clamp01((t - S.extension[0]) / 0.8), ea * (1 - clamp01((t - S.extension[0]) / 0.8)), COL.white);
    }

    // ---------- 03: fabrication labels, tube, passive / activation, tie, vectors
    if (t >= 10.3 && t < 13.0 && this.cantWorld[0]) {
      const f = S.fab;
      const step = t < f.tip[0] ? '01 · TMA .017 × .025 WIRE' : t < f.arch[0] ? '02 · TIP-BACK BEND' : t < f.hook[0] ? '03 · ARCH FORM' : '04 · HOOK';
      this.text(x, step, W / 2, 1300, { size: 30, weight: 700, color: COL.dim, alpha: win(t, 10.35, 12.95, 0.25, 0.3), spacing: 5 });
      const pts = this.cantWorld[0].pts, tags = this.cantWorld[0].tags;
      for (const [tag, rng] of [['bend', f.tip], ['arm', f.arch], ['hook', f.hook]]) {
        const a = win(t, rng[0] - 0.1, rng[1] + 0.12, 0.15, 0.25); if (a < 0.01) continue;
        const idx = tags.map((g, i) => (g === tag ? i : -1)).filter((i) => i >= 0);
        if (!idx.length) continue;
        const p = this.proj(pts[idx[Math.floor(idx.length * (tag === 'arm' ? 0.4 : 0.5))]]);
        x.save(); x.globalAlpha = a * 0.7; x.strokeStyle = '#ffffff'; x.lineWidth = 2; x.setLineDash([3, 6]);
        x.beginPath(); x.arc(p[0], p[1], 46, 0, Math.PI * 2); x.stroke(); x.restore();
      }
    }
    if (t >= S.mirror[0] && t < S.insert[1] + 0.3) {
      const a = win(t, S.mirror[0], S.insert[1] + 0.3, 0.2, 0.3);
      this.text(x, 'SYMMETRIC COPY', W / 2, 1300, { size: 30, weight: 700, color: COL.dim, alpha: a * (t < S.insert[0] ? 1 : 0), spacing: 5 });
      this.text(x, 'INTO THE AUXILIARY TUBES 36 / 46', W / 2, 1300, { size: 28, weight: 700, color: COL.dim, alpha: a * (t >= S.insert[0] ? 1 : 0), spacing: 4 });
    }
    if (t >= S.insert[0] && t < 16.8) {
      const aT = win(t, S.insert[0], 15.0, 0.3, 0.4);
      this.callout(x, tubesNow[0], 'AUX TUBE 36', { dx: 30, dy: 170, alpha: aT, size: 22 });
      this.callout(x, tubesNow[1], 'AUX TUBE 46', { dx: -30, dy: 170, alpha: aT, size: 22 });
      const aP = win(t, S.insert[1] - 0.05, 16.5, 0.15, 0.5);
      if (this.passiveEnd) for (let i = 0; i < 2; i++) if (this.passiveEnd[i]) {
        this.callout(x, this.passiveEnd[i], 'PASSIVE', { dx: i ? -60 : 60, dy: 90, color: COL.dim, alpha: aP * (t > S.activate[0] ? 1 : 0), size: 21 });
      }
      const aA = win(t, S.activate[0] - 0.05, S.tie + 0.5, 0.15, 0.35);
      if (aA > 0.01 && this.passiveEnd) for (let i = 0; i < 2; i++) if (this.passiveEnd[i]) {
        const a0 = this.proj(this.passiveEnd[i]), b0 = this.proj(this.tiesNow[i]);
        this.arrow(x, [a0[0] + (i ? -34 : 34), a0[1]], [b0[0] + (i ? -34 : 34), b0[1] + 14], { color: '#ffffff', width: 4, alpha: aA * 0.9, head: 16 });
      }
      this.text(x, 'ACTIVATION', W / 2, 1300, { size: 30, weight: 700, color: COL.dim, alpha: win(t, S.activate[0] - 0.05, S.tie + 0.9, 0.15, 0.35), spacing: 5 });
      const ef = win(t, S.tie - 0.02, S.tie + 0.6, 0.05, 0.5);
      for (const p of this.tiesNow) this.flash(x, this.proj(p), clamp01((t - S.tie) / 0.6), ef, COL.blue);
      this.text(x, 'TIED AT THE ANTERIOR SEGMENT · POINT CONTACT', W / 2, 1338, { size: 20, weight: 600, color: COL.dim, alpha: win(t, S.tie + 0.3, 16.7, 0.3, 0.4), spacing: 2 });
    }
    if (t >= WT.intrForce - 0.05 && t < 19.4) {
      const a = win(t, WT.intrForce - 0.05, 19.4, 0.3, 0.4);
      const fs = forceSystem(this.tiesNow, cr, tubesNow);
      for (const [i, p] of this.tiesNow.entries()) {
        this.force3(x, V.add(p, [0, 0.4, 0.6]), [0, -1, 0], 5.5, { color: COL.blue, alpha: a, width: 6, head: 19, into: true, progress: easeOut((t - WT.intrForce - i * 0.08) / 0.45) });
        this.text(x, 'F/2', ...this.proj(V.add(p, [i ? -1.2 : 1.2, 7.4, 0.8])).slice(0, 2), { size: 24, weight: 800, color: COL.blue, alpha: a * smooth((t - WT.intrForce - 0.3) / 0.3) });
      }
      const aR = win(t, WT.direction - 0.05, 19.4, 0.3, 0.4);
      const at = fs.resultantAt;
      this.force3(x, V.add(at, [0, 0.4, 1.5]), [0, -1, 0], 11, { color: COL.blue, alpha: aR, width: 8, head: 24, into: true, progress: easeOut((t - WT.direction) / 0.5) });
      this.text(x, 'F', ...this.proj(V.add(at, [0, 13.4, 1.5])).slice(0, 2), { size: 34, weight: 800, color: COL.blue, alpha: aR });
      this.text(x, 'RESULTANT · MID-SAGITTAL', ...this.proj(V.add(at, [0, 16.0, 1.5])).slice(0, 2), { size: 18, weight: 700, color: COL.dim, alpha: aR * win(t, WT.direction + 0.3, 18.6, 0.3, 0.3), spacing: 2 });
    }

    // ---------- 04: five application points (occlusal) → sagittal, CR, lines of action
    if (t >= 19.2 && t < 25.3) {
      const P = hdr.points;
      const aBase = win(t, 19.3, 25.2, 0.3, 0.4);
      const occl = 1 - smooth((t - 21.9) / 0.6);
      ['1', '2', '3', '4', '5'].forEach((k, i) => {
        const a = aBase * smooth((t - S.points[i]) / 0.25), sc = 1 + 0.4 * (1 - smooth((t - S.points[i]) / 0.35));
        for (const p of (k === '1' ? [P[k][0]] : P[k])) {
          const w = apply(pose, p);
          const pr = this.proj(w);
          x.save(); x.globalAlpha = a; x.fillStyle = COL.blue; x.shadowColor = COL.blue; x.shadowBlur = 12; x.beginPath(); x.arc(pr[0], pr[1], 6, 0, Math.PI * 2); x.fill(); x.restore();
          const ac = this.hdr.archCentre, out = V.norm([w[0] - ac[0], 0, w[2] - ac[2]]);
          const off = this.proj(V.add(w, V.mul(out, 4.2)));
          this.badge(x, [off[0], off[1]], k, { alpha: a * (occl > 0.02 ? 1 : 0), scale: sc * 0.95 });
        }
      });
      this.text(x, 'ALTERNATIVE TIE POINTS · NOT SIMULTANEOUS FORCES', W / 2, 1392, { size: 21, weight: 700, color: COL.dim, alpha: win(t, 20.95, 22.4, 0.3, 0.4), spacing: 2 });
      // sagittal: CR, then the line of action of each option
      const aCR = win(t, S.crIn - 0.05, 25.3, 0.3, 0.3);
      this.dot(x, this.proj(cr), { alpha: aCR, r: 9 });
      this.callout(x, cr, 'CR', { dx: -150, dy: 170, color: COL.gold, alpha: aCR * win(t, S.crIn, 25.0, 0.3, 0.3), size: 28, sub: 'one CR · 4-incisor segment (≈)' });
      const aL = win(t, S.crIn + 0.5, 25.3, 0.3, 0.3);
      if (aL > 0.01) {
        ['1', '2', '3', '4', '5'].forEach((k, i) => {
          const z = hdr.d[k] + cr[2], a = aL * smooth((t - S.crIn - 0.5 - i * 0.18) / 0.25);
          const col = k === '4' ? COL.green : COL.blue;
          this.dashed(x, [this.proj([0, 21, z]), this.proj([0, -11, z])], { color: col, alpha: a * 0.75, width: 2, dash: [5, 7] });
          const pt = this.proj([0, 21, z]);
          this.badge(x, [pt[0] + (k === '1' ? 18 : k === '3' ? -18 : 0), pt[1] - 22 - (k === '2' ? 40 : 0)], k, { alpha: a, r: 16, ring: col });
        });
      }
    }

    // ---------- 05–07: sagittal force analysis
    if (t >= 25.1 && t < 48.6) this.drawSagittal(x, t, cr, tubesNow);

    // ---------- 08: reciprocal side effects
    if (t >= 48.3 && t < 53.6) {
      const fs = forceSystem(this.tiesNow, cr, tubesNow);
      const aI = win(t, 49.4, 53.5, 0.4, 0.3) * 0.75;
      this.force3(x, V.add(fs.resultantAt, [0, 0.4, 1.5]), [0, -1, 0], 10, { color: COL.blue, alpha: aI, width: 7, into: true });
      this.text(x, 'F', ...this.proj(V.add(fs.resultantAt, [0, 12.4, 1.5])).slice(0, 2), { size: 30, weight: 800, color: COL.blue, alpha: aI });
      const aF = win(t, WT.reactive - 0.05, 53.5, 0.3, 0.3);
      fs.molar.forEach((mo, i) => {
        const p = tubesNow[i];
        this.force3(x, V.add(p, [i ? -1.0 : 1.0, 0.8, 0]), [0, 1, 0], 6.5, { color: COL.red, alpha: aF, width: 6, progress: easeOut((t - WT.reactive - i * 0.1) / 0.45) });
        this.text(x, 'F/2', ...this.proj(V.add(p, [i ? -1.0 : 1.0, 9.6, 0])).slice(0, 2), { size: 22, weight: 800, color: COL.red, alpha: aF });
      });
      const aM = win(t, WT.moments9 - 0.05, 53.5, 0.3, 0.3);
      fs.molar.forEach((mo, i) => {
        const p = this.bucApply(i ? '4' : '3', this.BS, M[i ? 'L46' : 'L36'].cr);
        this.momentArc(x, p, 5.5, 1, { axis: mo.couple, alpha: aM, width: 5, head: 18, progress: easeOut((t - WT.moments9) / 0.6), span: 140, mid: 0 });
      });
      this.callout(x, this.bucApply('3', this.BS, M.L36.tip), 'REACTIVE EXTRUSION', { dx: -60, dy: -230, color: COL.red, alpha: aF * win(t, WT.reactive, 53.4, 0.3, 0.3), size: 22 });
      this.callout(x, this.bucApply('4', this.BS, M.L46.cr), 'TIP-BACK MOMENT', { dx: 50, dy: 230, color: COL.purple, alpha: aM, size: 22, sub: 'at the molar tube' });
      // distribution over the rigid buccal segment (small arrows on each tooth)
      const aD = win(t, WT.reactive + 0.5, 53.5, 0.3, 0.3) * 0.8;
      for (const q of ['3', '4']) BUC[q].forEach((n, j) => {
        const p = this.bucApply(q, this.BS, M[n].tip);
        this.force3(x, V.add(p, [0, 1.2, 0]), [0, 1, 0], [1.6, 2.2, 2.8, 3.4, 2.4][j], { color: COL.red, alpha: aD, width: 3.5, head: 12 });
      });
      const aT = win(t, S.buccalTip[0] + 0.3, 53.5, 0.3, 0.3);
      this.callout(x, this.bucApply('3', this.BS, M.L37.tip), 'POSSIBLE DISTAL TIPPING', { dx: 70, dy: -330, color: COL.red, alpha: aT, size: 20, sub: 'anchor teeth are not immobile' });
    }
    // anatomy attribution (end)
    this.text(x, 'Anatomy: Z-Anatomy / BodyParts3D © DBCLS · CC BY-SA 4.0', W / 2, 1588, { size: 15, weight: 500, color: COL.dim, alpha: win(t, 48.6, 53.4, 0.5, 0.4) * 0.6, spacing: 1 });
  }

  /** scenes 05–07: resultant at the current tie points, lever arm d, moment M = F·d, motion and trajectories */
  drawSagittal(x, t, cr, tubesNow) {
    const IS = this.IS, pose = IS.pose, M = this.M;
    const fs = forceSystem(this.tiesNow, cr, tubesNow);
    const at = fs.resultantAt, d = fs.d;
    const sceneA = win(t, 25.15, 48.5, 0.3, 0.4);
    this.dot(x, this.proj(cr), { alpha: sceneA, r: 9 });
    this.text(x, 'CR', ...this.proj(V.add(cr, [0, -2.6, -3.2])).slice(0, 2), { size: 24, weight: 800, color: COL.gold, alpha: sceneA, align: 'right' });
    // 05: points 1, 2, 3 highlighted in turn (alternatives, same F)
    if (t < 27.2) {
      ['1', '2', '3'].forEach((k, i) => {
        const a = win(t, S.hl123[i], 27.2, 0.2, 0.4) * (i === 1 ? 0.5 : 0.85);
        const z = this.hdr.d[k] + cr[2], top = this.proj([0, at[1] + 10, z]);
        this.dashed(x, [this.proj([0, at[1] + 10, z]), this.proj([0, -11, z])], { color: COL.blue, alpha: a * 0.6, width: 2, dash: [5, 7] });
        this.badge(x, [top[0] + (i - 1) * 30, top[1] - 26], k, { alpha: a, r: 15, scale: 1 + 0.4 * (1 - smooth((t - S.hl123[i]) / 0.3)) });
      });
    }
    // resultant (blue) at the current tie points + its line of action
    const aF = sceneA;
    this.dashed(x, [this.proj([0, at[1] + 13, at[2]]), this.proj([0, cr[1] - 12, at[2]])], { color: COL.blue, alpha: aF * 0.65, width: 2.2, dash: [6, 7] });
    this.force3(x, V.add(at, [0, 0.3, 0]), [0, -1, 0], 10, { color: COL.blue, alpha: aF, width: 8, head: 24, into: true });
    this.text(x, 'F', ...this.proj([0, at[1] + 12.6, at[2] + 1.4]).slice(0, 2), { size: 32, weight: 800, color: COL.blue, alpha: aF });
    // the same F during the question (only the point changes)
    this.text(x, 'SAME MAGNITUDE · SAME DIRECTION · ONLY THE POINT CHANGES', W / 2, 1300, { size: 19, weight: 700, color: COL.dim, alpha: win(t, WT.what + 0.4, S.slide4[1] + 0.2, 0.3, 0.4), spacing: 1 });
    // lever arm d (gold) and moment (purple), scaled with |d|
    const dA = sceneA * Math.max(win(t, WT.ahead - 0.05, 31.7, 0.3, 0.3), win(t, 32.2, 48.5, 0.3, 0.3)) * clamp01(Math.abs(d) / 1.2);
    if (dA > 0.01) {
      this.dashed(x, [this.proj(cr), this.proj([0, cr[1], at[2]])], { color: COL.gold, alpha: dA, width: 3.5, dash: [4, 5] });
      const tick = (z) => { const a = this.proj([0, cr[1] - 0.9, z]), b = this.proj([0, cr[1] + 0.9, z]); x.save(); x.globalAlpha = dA; x.strokeStyle = COL.gold; x.lineWidth = 3; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); x.restore(); };
      tick(cr[2]); tick(at[2]);
      this.text(x, 'd', ...this.proj([0, cr[1] - 2.4, (cr[2] + at[2]) / 2]).slice(0, 2), { size: 30, weight: 800, color: COL.gold, alpha: dA });
    }
    const mOn = Math.max(win(t, WT.intr5 - 0.25, 31.7, 0.3, 0.3), win(t, 32.25, 41.4, 0.3, 0.3) * (t < 32.4 ? 0 : 1), win(t, WT.opposite - 0.05, 48.5, 0.3, 0.3));
    const mA = sceneA * mOn * clamp01(Math.abs(d) / 2.0);
    if (mA > 0.01) {
      const pr = t < 32 ? easeOut((t - WT.intr5 + 0.25) / 0.6) : t > 42 ? easeOut((t - WT.opposite) / 0.6) : 1;
      this.momentArc(x, cr, 6.5, Math.sign(d), { alpha: mA, width: 4 + 4 * clamp01(Math.abs(d) / 8), progress: pr, span: 40 + 100 * clamp01(Math.abs(d) / 8) });
      this.text(x, 'M = F × d', ...this.proj(V.add(cr, [0, -9.5, d > 0 ? 3 : -3])).slice(0, 2), { size: 26, weight: 800, color: COL.purple, alpha: mA * (t > 32.4 && t < 41.4 ? 0.0 : 1) });
    }
    // 06: d ≈ 0 / M ≈ 0 labels at the CR
    const z0 = win(t, WT.through - 0.05, 41.3, 0.3, 0.4);
    this.text(x, 'M ≈ 0', ...this.proj(V.add(cr, [0, -4.0, -5.5])).slice(0, 2), { size: 26, weight: 800, color: COL.purple, alpha: z0 * smooth((t - WT.centre7 - 0.5) / 0.3), align: 'right' });
    // trajectories (crown edge and apex of 31) from the start pose
    if (IS.s > 0.01 && t < S.back8[0]) {
      const target = this.P(IS.target);
      const traj = (p) => { const pts = []; for (let i = 0; i <= 28; i++) pts.push(this.proj(apply(poseLerp(IDENT, target, IS.s * i / 28), p))); return pts; };
      const pure = IS.target === 'p4', retro = IS.target === 'p5';
      const col = pure ? COL.green : COL.white;
      this.dashed(x, traj(M.L31.tip), { color: col, alpha: sceneA, width: 3.5, glow: pure });
      this.dashed(x, traj(M.L31.apex), { color: retro ? COL.gold : col, alpha: sceneA * (retro ? 1 : 0.85), width: retro ? 4.5 : 3, glow: pure || retro });
      if (IS.s > 0.35) {
        const ta = sceneA * smooth((IS.s - 0.35) / 0.2);
        const tip = apply(pose, M.L31.tip), apex = apply(pose, M.L31.apex);
        if (IS.target === 'p2') {
          this.callout(x, tip, 'CROWN → LABIAL', { dx: 70, dy: -70, alpha: ta, size: 22 });
          this.callout(x, apex, 'ROOT → LINGUAL', { dx: -70, dy: 60, alpha: ta, size: 22 });
        } else if (pure) {
          this.callout(x, tip, 'CROWN ↓', { dx: 80, dy: -60, color: COL.green, alpha: ta, size: 22 });
          this.callout(x, apex, 'ROOT ↓ · AXIS UNCHANGED', { dx: 70, dy: 70, color: COL.green, alpha: ta, size: 22 });
        } else {
          this.callout(x, tip, 'CROWN → LINGUAL', { dx: -80, dy: -70, alpha: ta, size: 22 });
          this.callout(x, apex, 'ROOT APEX → LABIAL', { dx: 80, dy: 60, color: COL.gold, alpha: ta, size: 23, sub: 'root trajectory' });
        }
      }
      // centre of rotation ≠ CR (scene 05)
      if (IS.target === 'p2') {
        const aC = win(t, 29.6, 31.5, 0.3, 0.3), c = centreOfRotation(target);
        if (aC > 0.01 && c) {
          const p = this.proj(c);
          x.save(); x.globalAlpha = aC; x.strokeStyle = '#ffffff'; x.lineWidth = 3;
          x.beginPath(); x.moveTo(p[0] - 9, p[1] - 9); x.lineTo(p[0] + 9, p[1] + 9); x.moveTo(p[0] + 9, p[1] - 9); x.lineTo(p[0] - 9, p[1] + 9); x.stroke(); x.restore();
          this.callout(x, c, 'CENTER OF ROTATION ≠ CR', { dx: 30, dy: 150, alpha: aC, size: 19 });
        }
      }
    }
  }

  drawSubtitle(x, t) {
    const cue = SUBS.find((c) => t >= c[0] && t < c[1]);
    if (!cue || t >= OUTRO_T0 + 0.25) return;
    const a = Math.min(smooth((t - cue[0]) / 0.15), smooth((cue[1] - t) / 0.15));
    x.save(); x.font = `600 40px ${F}`;
    const words = cue[2].split(' '), lines = []; let cur = '';
    for (const w of words) { const s = cur ? cur + ' ' + w : w; if (x.measureText(s).width > 860 && cur) { lines.push(cur); cur = w; } else cur = s; }
    lines.push(cur);
    const lh = 54, y0 = 1520 - lines.length * lh;
    const wmax = Math.max(...lines.map((l) => x.measureText(l).width));
    x.globalAlpha = a * 0.6; x.fillStyle = '#02060d';
    x.beginPath(); x.roundRect(W / 2 - wmax / 2 - 26, y0 - 12, wmax + 52, lines.length * lh + 20, 16); x.fill();
    x.restore();
    lines.forEach((l, i) => this.text(x, l, W / 2, y0 + 12 + i * lh + lh / 2 - 12, { size: 40, weight: 600, alpha: a, shadow: false }));
  }

  // ------------------------------------------------------------------ kinetic typography
  kwColor(c) { return { blue: COL.blue, white: '#ffffff', gold: COL.gold, red: COL.red, green: COL.green, purple: COL.purple }[c]; }
  drawKeywords(x, t) {
    for (const k of KEYWORDS) {
      const s = keywordState(k, t), sk = kickerState(k, t);
      if (!s && !sk) continue;
      this.drawOneKeyword(x, k, s, sk);
    }
  }
  drawOneKeyword(x, k, s, sk) {
    const cx0 = W / 2, cy0 = k.kicker ? 380 : 345;
    const col = this.kwColor(k.color);
    if (sk && sk.alpha > 0.003) this.text(x, k.kicker, cx0, cy0 - k.size * 0.98 - (1 - easeOut(sk.reveal)) * 14, { size: 26, weight: 800, alpha: sk.alpha, color: '#d7e6f3', spacing: 6 });
    if (!s || s.alpha <= 0.003) return;
    const cx = cx0 + k.dir[0] * s.drift, cy = cy0 + k.dir[1] * s.drift;
    const fill = k.from ? this.mixColor(this.kwColor(k.from), col, 1 - s.accent) : col;
    const lines = k.text2 ? [k.text, k.text2] : [k.text];
    x.save();
    x.font = `800 ${k.size}px ${F}`;
    if ('letterSpacing' in x) x.letterSpacing = `${s.tracking.toFixed(1)}px`;
    const w = Math.max(...lines.map((l) => x.measureText(l).width)), lh = k.size * 1.12, h = k.size * 1.25 + lh * (lines.length - 1);
    x.translate(cx, cy); x.scale(s.scale, s.scale);
    x.beginPath();
    if (k.dir[0] < 0) x.rect(w / 2 + 20 - (w + 40) * s.reveal, -h, (w + 40) * s.reveal, h * 2);
    else if (k.dir[0] > 0) x.rect(-w / 2 - 20, -h, (w + 40) * s.reveal, h * 2);
    else if (k.dir[1] > 0) x.rect(-w, -k.size * 0.7, w * 2, (h + 20) * s.reveal);
    else x.rect(-w, h - k.size * 0.6 - (h + 20) * s.reveal, w * 2, (h + 20) * s.reveal);
    x.clip();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach((l, li) => {
      const yy = li * lh;
      for (let i = 3; i >= 1 && s.blur > 0.02; i--) { x.globalAlpha = s.alpha * 0.16 * s.blur; x.fillStyle = fill; x.fillText(l, -k.dir[0] * i * 9 * s.blur, yy - k.dir[1] * i * 9 * s.blur); }
      x.globalAlpha = s.alpha; x.shadowColor = 'rgba(0,6,18,0.9)'; x.shadowBlur = 16; x.fillStyle = fill; x.fillText(l, 0, yy);
      if (k.color !== 'white' || k.from) { x.save(); x.globalCompositeOperation = 'lighter'; x.shadowColor = fill; x.shadowBlur = 20; x.globalAlpha = s.alpha * 0.22 * Math.max(0.4, s.accent); x.fillText(l, 0, yy); x.restore(); }
    });
    x.restore();
    x.save(); x.globalAlpha = s.alpha * 0.85; x.strokeStyle = fill; x.lineWidth = 3; x.lineCap = 'round';
    const uw = Math.min(w, 760) * 0.36 * s.reveal * s.scale, uy = cy + k.size * 0.62 + lh * (lines.length - 1);
    x.beginPath(); x.moveTo(cx - uw, uy); x.lineTo(cx + uw, uy); x.stroke(); x.restore();
  }
  mixColor(a, b, u) {
    const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const A = p(a), B = p(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * u)).join(',')})`;
  }

  grab(type = 'image/jpeg', q = 0.95) { return this.out.toDataURL(type, q); }
}
