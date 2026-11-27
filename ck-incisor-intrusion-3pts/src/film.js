// ============================================================================
//  Film renderer: Three.js scene (Z-Anatomy lower dentition 31–37 / 41–47, translucent mandibular bone,
//  three-piece segmented appliance: two rigid buccal segments (silver), the anterior sectional wire with
//  stepped extensions (gold accent), two TMA cantilevers (blue accent) tied at A, B or C) + 2D overlay
//  (force vectors, line of action, lever arm, moments, axes, trajectories, kinetic typography, subtitles,
//  brand) composited into one 1080×1920 canvas. Scene 08 = three horizontal zones.
// ============================================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BRAND, backgroundCanvas, drawLogo } from './brand.js';
import { DURATION, FPS, OUTRO_T0, SUBS, S, W as WT, VIS, BUCCAL_TIP, cameraAt, ZONE, ZONE_CAM, split, clamp01, smooth, lerp, ramp, win, easeOut, easeInOut } from './timeline.js';
import { V, IDENT, apply, applyDir, poseLerp, crAt, forceSystem, centreOfRotation } from './model.js';
import { WIRE, toothFrame, mesialDir, resample, sideWire, pointParams, tieLocal, buccalWire, auxTube, buildEnvelope, cantilever, TIE_KEYS } from './appliance.js';
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
const ZONES = [
  { pose: 'pA', u: 0, key: 'A', cap: 'INTRUSION + PROCLINATION' },
  { pose: 'pB', u: 1, key: 'B', cap: 'PURE INTRUSION' },
  { pose: 'pC', u: 2, key: 'C', cap: 'INTRUSION + RETROCLINATION' },
];
const DELTA_A = 4.6;          // passive drop of the free end at configuration A (mm, illustrative)

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
// metals: silver = rigid anchor segments and brackets, gold accent = anterior sectional wire, blue accent = TMA cantilevers.
// Slightly darker than enamel so that the wires never merge with the white teeth.
const steel = () => new THREE.MeshPhysicalMaterial({ color: 0xc4cbd6, metalness: 1, roughness: 0.26, envMapIntensity: 1.2, clearcoat: 0.3, clearcoatRoughness: 0.2, transparent: true });
const goldWire = () => new THREE.MeshPhysicalMaterial({ color: 0xd9b56a, metalness: 1, roughness: 0.27, envMapIntensity: 1.2, clearcoat: 0.3, clearcoatRoughness: 0.2,
  emissive: new THREE.Color('#8a6a22'), emissiveIntensity: 0, transparent: true });
const tma = () => new THREE.MeshPhysicalMaterial({ color: 0x4f9fdc, metalness: 0.85, roughness: 0.3, envMapIntensity: 1.0, clearcoat: 0.3, clearcoatRoughness: 0.25,
  emissive: new THREE.Color('#0b4b7a'), emissiveIntensity: 0.55, transparent: true });

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
    this.zoneCams = [0, 1, 2].map(() => new THREE.PerspectiveCamera(30, W / ZONE.h, 2, 2000));
    for (const c of [cam, ...this.zoneCams]) {
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
    this.incMetal = steel(); this.bucMetal = steel(); this.antMetal = goldWire();
    const brG = bracketGeometry(1.55);
    const brSmall = bracketGeometry(1.55); brSmall.scale(0.8, 0.92, 1);
    const frameQ = (m, mesial) => { const f = toothFrame(m, mesial); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.x), new THREE.Vector3(...f.y), new THREE.Vector3(...f.z))); };
    const ligMat = new THREE.MeshPhysicalMaterial({ color: 0x8796a8, roughness: 0.35, metalness: 0, transmission: 0.25, thickness: 0.5, clearcoat: 0.6, transparent: true });
    this.ligMat = ligMat;
    const addBracket = (fdi, parent, metal, geo) => {
      const m = M['L' + fdi], b = new THREE.Mesh(geo, metal);
      b.position.set(...m.fa); b.quaternion.copy(frameQ(m, mesialDir(hdr, fdi))); b.renderOrder = 2; parent.add(b);
      const lig = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.22, 10, 32), parent === this.inc ? ligMat : this.bucLig); lig.scale.set(geo === brSmall ? 0.95 : 1.12, 1.05, 1); lig.position.set(0, 0, 1.6); b.add(lig);
      return b;
    };
    for (const n of INC) addBracket(n.slice(1), this.inc, this.incMetal, brSmall);
    this.bucLig = ligMat.clone();
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
      const mesh = new THREE.Mesh(sweepRect(pts, WIRE.ss.w, WIRE.ss.h, [0, 1, 0]), this.antMetal); mesh.renderOrder = 2; this.inc.add(mesh);
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
    // free-arm length of the cantilever for A / B / C (for the re-adjusted activation: same F, F ∝ δ / L³)
    this.armL = TIE_KEYS.map((k, i) => { const [l] = tieLocal(this.pp, i); return cantilever({ c: this.buc['3'].aux.c, m: this.buc['3'].aux.m }, l, this.env, { act: 1, delta0: DELTA_A }).Ltot; });
    for (const t of [0.5, 6, 10, 12.5, 15, 20, 25, 33, 40, 50, 55, 58]) this.renderTime(t);   // compile all programs once
  }
  // ------------------------------------------------------------------ state (pure functions of t)
  P(name) { return this.POSES[name]; }
  /** pose of the rigid 4-incisor segment; `target` = configuration whose end pose is approached; s = progress */
  incState(t) {
    const P = (n) => this.P(n), seg = (s, target) => ({ pose: poseLerp(IDENT, P(target), s), s, target });
    if (t < 4) return seg(smooth((t - S.hook[0]) / (S.hook[1] - S.hook[0])), 'pA');
    if (t < S.moveA[0]) return seg(0, 'pA');
    if (t < S.resetA[0]) return seg(ramp(t, ...S.moveA), 'pA');
    if (t < S.moveB[0]) return seg(1 - ramp(t, ...S.resetA), 'pA');
    if (t < S.resetB[0]) return seg(ramp(t, ...S.moveB), 'pB');
    if (t < S.moveC[0]) return seg(1 - ramp(t, ...S.resetB), 'pB');
    if (t < S.cut7) return seg(ramp(t, ...S.moveC), 'pC');
    return seg(0, 'pB');
  }
  /** tie configuration index u (0 = A, 1 = B, 2 = C): the hooks are moved along the wire */
  tieU(t) {
    if (this.tieOverride != null) return this.tieOverride;
    if (t < S.slideB[0]) return 0;
    if (t < S.slideC[0]) return ramp(t, ...S.slideB);
    if (t < S.cut7) return 1 + ramp(t, ...S.slideC);
    return 1;
  }
  /** activation of the cantilevers 0 (passive) … 1 (lifted to the anterior segment and tied) */
  actAt(t) {
    if (this.actOverride != null) return this.actOverride;
    if (t < 4) return 1;
    if (t < S.deactB[0]) return ramp(t, ...S.activate);
    if (t < S.reactB[0]) return 1 - ramp(t, ...S.deactB);
    if (t < S.deactC[0]) return ramp(t, ...S.reactB);
    if (t < S.reactC[0]) return 1 - ramp(t, ...S.deactC);
    return ramp(t, ...S.reactC);
  }
  /** ligature at the tie point: 0 = absent, 1 = tied; pulse = re-tie flash */
  ligAt(t) {
    if (this.tieOverride != null) return { a: 1, pulse: 0 };
    const tied = (t0, t1) => (t >= t0 && t < t1);
    const out = (w) => 1 - smooth((t - w[0]) / (w[1] - w[0]));
    if (t < S.tie) return { a: 0, pulse: 0 };
    if (t < S.untieB[0]) return { a: 1, pulse: smooth((t - S.tie) / 0.35) };
    if (t < S.untieB[1]) return { a: out(S.untieB), pulse: 1 };
    if (t < S.tieB) return { a: 0, pulse: 0 };
    if (t < S.untieC[0]) return { a: 1, pulse: smooth((t - S.tieB) / 0.35) };
    if (t < S.untieC[1]) return { a: out(S.untieC), pulse: 1 };
    if (t < S.tieC) return { a: 0, pulse: 0 };
    if (tied(S.tieC, S.cut7)) return { a: 1, pulse: smooth((t - S.tieC) / 0.35) };
    return { a: 1, pulse: 1 };
  }
  /** passive deflection of the free end for configuration u: the same F with a shorter arm needs less deflection
   *  (cantilever beam: F = 3·E·I·δ / L³ — qualitative; the demonstrated activation is re-adjusted at every tie point) */
  deltaAt(u) {
    const L = this.armL, k0 = Math.max(0, Math.min(1, Math.floor(u))), f = clamp01(u - k0);
    const l = L[k0] + (L[k0 + 1] - L[k0]) * f;
    return DELTA_A * Math.pow(l / L[0], 3);
  }
  buccalState(t) {
    const u = t >= S.cut7 && t < OUTRO_T0 ? ramp(t, ...S.buccalTip) : 0;
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
    if (split(t) && !this.camOverride) this.renderZones(t);
    else {
      this.camera = this.mainCam; this.vp = { x: 0, y: 0, w: W, h: H };
      this.applyCamera(this.mainCam, this.camOverride || cameraAt(t), W / H, this.camOverride ? 0 : focusLevel(t));
      this.updateScene(t);
      const r = this.renderer;
      r.setScissorTest(false); r.setViewport(0, 0, W, H); r.clear();
      r.render(this.scene, this.mainCam);
      x.drawImage(r.domElement, 0, 0);
      if (!this.noOverlay) this.drawOverlay(x, t);
    }
    if (this.noOverlay) return this.out;
    x.drawImage(this.topShade ??= this.makeTopShade(), 0, 0);
    this.drawKeywords(x, t);
    if (this.subtitles) this.drawSubtitle(x, t);
    this.text(x, 'QUALITATIVE BIOMECHANICS — NOT A FINITE-ELEMENT SIMULATION', W / 2, 1556, { size: 17, weight: 600, color: COL.dim, alpha: VIS.disclaimer(t) * 0.78, spacing: 2 });
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

  // ------------------------------------------------------------------ scene 08: three horizontal zones
  renderZones(t) {
    const r = this.renderer, x = this.ctx;
    this.resetTeeth();
    for (const n of Object.keys(this.teeth)) this.setToothAlpha(n, INC.includes(n) ? 1 : (n === 'L33' || n === 'L43') ? 0.16 : 0);
    for (const q of ['3', '4']) {
      const B = this.buc[q]; B.pivot.visible = true; B.pivot.position.set(...B.c); B.pivot.quaternion.identity();
      this.bucGhost[q].visible = false; B.wire.visible = false; this.bucMetal.opacity = 0; this.bucLig.visible = false;
    }
    this.upper.visible = false;
    for (const m of [...this.cant, ...this.cantGhost, ...this.ties]) m.visible = false;
    this.incMetal.opacity = 1; this.antMetal.opacity = 1;
    for (const h of this.antHalves) { h.mesh.visible = true; h.mesh.geometry.setDrawRange(0, h.idx); }
    this.bone.visible = true;
    const bu = this.boneMat.uniforms;
    bu.uAlpha.value = 1; bu.uBase.value = 0.07; bu.uRimA.value = 0.42; bu.uX0.value = -10.5; bu.uX1.value = 10.5; bu.uY0.value = -18; bu.uSoft.value = 4;
    const s = ramp(t, ...S.final);
    const fade = smooth((t - S.final[0]) / 0.35);
    r.setScissorTest(true); r.setViewport(0, 0, W, H); r.setScissor(0, 0, W, H); r.clear();
    const shots = [];
    ZONES.forEach((z, i) => {
      const cam = this.zoneCams[i], rect = { x: 0, y: ZONE.y0 + i * ZONE.h, w: W, h: ZONE.h };
      this.applyCamera(cam, ZONE_CAM, rect.w / rect.h);
      const pose = poseLerp(IDENT, this.P(z.pose), s);
      this.setIncPose(pose);
      this.ghostMat.uniforms.uAlpha.value = 1.1; this.ghostInc.visible = true;
      r.setViewport(rect.x, H - rect.y - rect.h, rect.w, rect.h); r.setScissor(rect.x, H - rect.y - rect.h, rect.w, rect.h);
      r.render(this.scene, cam);
      shots.push({ z, i, cam, rect, pose });
    });
    r.setScissorTest(false);
    x.save(); x.globalAlpha = fade; x.drawImage(r.domElement, 0, 0); x.restore();
    for (const sh of shots) { this.camera = sh.cam; this.vp = sh.rect; this.drawZone(x, t, sh, s, fade); }
    this.camera = this.mainCam; this.vp = { x: 0, y: 0, w: W, h: H };
    x.save(); x.globalAlpha = 0.32 * fade; x.strokeStyle = '#7fa6c8'; x.lineWidth = 1.5;
    for (const i of [1, 2]) { const yy = ZONE.y0 + i * ZONE.h; x.beginPath(); x.moveTo(60, yy); x.lineTo(W - 60, yy); x.stroke(); }
    x.restore();
    this.text(x, 'ONE FORCE · THREE POINTS · THREE OUTCOMES', W / 2, 256, { size: 24, weight: 800, color: '#ffffff', alpha: fade, spacing: 4 });
  }
  drawZone(x, t, sh, s, fade) {
    const { z, pose, rect } = sh;
    const [tl, tr] = tieLocal(this.pp, z.u);
    const fs = forceSystem([apply(pose, tl), apply(pose, tr)], crAt(pose), [this.buc['3'].aux.c, this.buc['4'].aux.c]);
    this.analysis(x, t, { pose, target: z.pose, s, fs, alpha: fade, compact: true, traj: z.key === 'B' ? COL.green : '#ffffff',
      showF: true, showCR: true, showD: true, showM: true, mProgress: 1, axes: true, refs: true });
    // caption (left)
    const lx = 70, cy = rect.y + rect.h / 2;
    this.text(x, z.key, lx, cy - 52, { size: 76, weight: 800, color: z.key === 'B' ? COL.green : '#ffffff', alpha: fade, align: 'left' });
    const words = z.cap.split(' + ');
    if (words.length === 2) {
      this.text(x, words[0] + ' +', lx, cy + 18, { size: 24, weight: 700, color: '#d7e6f3', alpha: fade, align: 'left', spacing: 2 });
      this.text(x, words[1], lx, cy + 52, { size: 30, weight: 800, color: '#ffffff', alpha: fade, align: 'left', spacing: 1 });
    } else this.text(x, z.cap, lx, cy + 34, { size: 30, weight: 800, color: COL.green, alpha: fade, align: 'left', spacing: 1 });
    const sub = { A: 'tie mesial · d > 0', B: 'tie at CR level · d ≈ 0 (idealised)', C: 'tie distal · d < 0' }[z.key];
    this.text(x, sub, lx, cy + 92, { size: 19, weight: 600, color: COL.dim, alpha: fade, align: 'left', spacing: 1 });
  }

  // ------------------------------------------------------------------ full-frame 3D state
  updateScene(t) {
    this.resetTeeth();
    this.ghostInc.visible = false;
    const sag = VIS.sagittal(t);
    const hook = t < 4;
    // incisors
    const IS = this.IS = this.incState(t);
    this.setIncPose(IS.pose);
    for (const n of INC) this.setToothAlpha(n, 1);
    const glow = win(t, ...S.incGlow, 0.3, 0.5);
    for (const n of INC) { const u = this.teeth[n].mat.userData.u; u.uGlow.value.set(COL.blue); u.uGlowAmt.value = 0.55 * glow; }
    if (hook) for (const n of INC) this.teeth[n].mat.userData.u.uTintAmt.value = 0.55 * win(t, WT.tilt1 - 0.1, 4.2, 0.4, 0.4);
    // ghost of the start position while the segment moves
    const gA = IS.s > 0.01 ? 1.1 : 0;
    this.ghostInc.visible = gA > 0; this.ghostMat.uniforms.uAlpha.value = gA;
    // buccal segments
    const BS = this.BS = this.buccalState(t);
    const bucA = 1 - 0.9 * sag;
    const gR = win(t, S.bucR[0], S.bucR[1] + 0.8, 0.25, 0.4), gL = win(t, S.bucL[0], S.bucL[1] + 0.8, 0.25, 0.4);
    for (const q of ['3', '4']) {
      const B = this.buc[q];
      B.pivot.visible = bucA > 0.004;
      const p = this.bucApply(q, BS, B.c);
      B.pivot.position.set(...p);
      B.pivot.quaternion.setFromAxisAngle(new THREE.Vector3(...B.axis), BS.deg * DEG);
      for (const n of BUC[q]) this.setToothAlpha(n, (n === 'L33' || n === 'L43') && hook ? 0.16 : bucA);
      const red = 0.5 * win(t, WT.control7, 52.9, 0.4, 0.4);
      const g = q === '4' ? gR : gL;
      for (const n of BUC[q]) { const u = this.teeth[n].mat.userData.u; u.uTintAmt.value = red; u.uGlow.value.set('#dcefff'); u.uGlowAmt.value = 0.5 * g; }
      this.bucGhost[q].visible = BS.u > 0.02; this.bucGhostMat.uniforms.uAlpha.value = 1.2 * BS.u;
    }
    this.bucMetal.opacity = 1 - sag; this.bucLig.opacity = 1 - sag; this.bucLig.visible = sag < 0.99;
    this.upper.visible = false;
    // bone
    const clear = VIS.boneClear(t);
    this.bone.visible = true;
    const bu = this.boneMat.uniforms;
    bu.uAlpha.value = 1; bu.uBase.value = lerp(0.3, 0.06, clear); bu.uRimA.value = lerp(0.45, 0.42, clear);
    bu.uX0.value = lerp(-40, -11, sag); bu.uX1.value = lerp(40, 11, sag); bu.uSoft.value = lerp(6, 4, sag); bu.uY0.value = -40 + 22 * sag;
    // anterior wire (gold accent): draw-on of the sectional part, then the stepped extensions
    const sw = t < 4 ? 1 : t < S.antWire[0] ? 0 : t < S.extension[0] ? 0.5 * ramp(t, ...S.antWire) : 0.5 + 0.5 * ramp(t, ...S.extension);
    for (const h of this.antHalves) {
      const segs = h.pts.length - 1, perSeg = h.idx / segs;
      const nA = this.antSplitIdx ??= this.splitIndex(h.pts);
      const n = sw <= 0.5 ? Math.round(nA * sw * 2) : Math.round(nA + (segs - nA) * (sw - 0.5) * 2);
      h.mesh.geometry.setDrawRange(0, Math.max(0, n) * perSeg);
      h.mesh.visible = n > 0;
    }
    this.incMetal.opacity = 1; this.antMetal.opacity = 1;
    this.antMetal.emissiveIntensity = 0.35 * win(t, S.antWire[0], S.extension[1] + 0.6, 0.2, 0.5) + 0.25 * win(t, ...S.macro, 0.3, 0.3);
    // buccal wires draw-on (right, then left)
    for (const q of ['3', '4']) {
      const w = q === '4' ? S.bucR : S.bucL;
      const bw = t < 4 ? 0 : ramp(t, ...w);
      const g = this.buc[q].wire.geometry; g.setDrawRange(0, Math.round(g.index.count / 6 * bw) * 6); this.buc[q].wire.visible = bw > 0.01;
    }
    this.updateCantilevers(t);
  }
  splitIndex(pts) {
    // index of the polyline point closest to the start of the apical step (A)
    const A = this.hdr.wire.left[2];
    let best = [1e9, 0];
    pts.forEach((p, i) => { const d = Math.hypot(Math.abs(p[0]) - Math.abs(A[0]), p[1] - A[1], p[2] - A[2]); if (d < best[0]) best = [d, i]; });
    return best[1];
  }

  /** cantilever state: insertion into the auxiliary tubes, activation, configuration */
  cantState(t, i) {
    const side = i === 0 ? 1 : -1;
    const a = VIS.cantilever(t) * smooth((t - S.insert[0]) / 0.25);
    const q = i === 0 ? '3' : '4';
    const aux = this.buc[q].aux;
    const pre = V.mul(V.norm([aux.m[0], 0, aux.m[2]]), 6.0);
    const offset = t < S.insert[1] ? V.mul(pre, 1 - ramp(t, ...S.insert)) : [0, 0, 0];
    return { side, a, offset, act: this.actAt(t), q };
  }
  updateCantilevers(t) {
    const u = this.tieU(t), pose = this.IS.pose;
    const ties = this.tiesNow = this.tiesAt(u, pose);
    const delta0 = this.deltaAt(u);
    const lig = this.ligAt(t);
    this.cantWorld = [null, null]; this.passiveEnd = [null, null];
    for (let i = 0; i < 2; i++) {
      const cs = this.cantState(t, i), mesh = this.cant[i];
      mesh.visible = cs.a > 0.004;
      this.cantGhost[i].visible = false; this.ties[i].visible = false;
      if (!mesh.visible) continue;
      const q = cs.q, aux = this.buc[q].aux;
      const tube = { c: this.bucApply(q, this.BS, aux.c), m: this.bucApplyDir(q, this.BS, aux.m) };
      const tie = ties[i];
      const res = cantilever(tube, tie, this.env, { act: cs.act, delta0, offset: cs.offset, side: cs.side });
      sweepRect(resample(res.pts, this.cantN), WIRE.tma.w, WIRE.tma.h, [0, 1, 0], mesh.geometry);
      this.cantMat[i].opacity = cs.a;
      this.cantWorld[i] = res;
      // passive outline during the activation windows
      const ga = this.passiveGhostA(t) * smooth((cs.act - 0.12) / 0.25);
      const pr = cantilever(tube, tie, this.env, { act: 0, delta0, side: cs.side });
      this.passiveEnd[i] = pr.pts[pr.pts.length - 17];
      if (ga > 0.004) {
        sweepRect(resample(pr.pts, this.cantN), WIRE.tma.w, WIRE.tma.h, [0, 1, 0], this.cantGhost[i].geometry);
        this.cantGhost[i].visible = true; this.passiveMat.uniforms.uAlpha.value = ga * 2.0;
      }
      // ligature at the tie point
      if (lig.a > 0.004) {
        const L = this.ties[i]; L.visible = true;
        const tang = V.norm(V.sub(res.pts[res.pts.length - 18], res.pts[res.pts.length - 22]));
        L.position.set(...tie);
        L.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...tang));
        L.scale.setScalar((1 + 0.6 * (1 - lig.pulse)) * (0.4 + 0.6 * lig.a)); L.material.transparent = true; L.material.opacity = cs.a * lig.a;
      }
    }
  }
  passiveGhostA(t) {
    return Math.max(win(t, S.insert[1] - 0.1, S.tie + 0.9, 0.2, 0.5), win(t, S.deactB[0], S.tieB + 0.7, 0.2, 0.5), win(t, S.deactC[0], S.tieC + 0.7, 0.2, 0.5)) * (t < S.cut7 ? 1 : 0);
  }
  tiesAt(u, pose) {
    const [l, r] = tieLocal(this.pp, u);
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
  /** mid-sagittal landmarks of the segment (mean of 31 and 41) in the START pose */
  segLm() {
    if (this._lm) return this._lm;
    const M = this.M, mid = (a, b) => [0, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    return (this._lm = { tip: mid(M.L31.tip, M.L41.tip), apex: mid(M.L31.apex, M.L41.apex) });
  }
  /**
   * Sagittal analysis of one configuration: fixed references, start / current long axis, dashed trajectories of the
   * incisal edge and the root apex, CR, resultant F and its line of action, lever arm d, moment M = F × d.
   */
  analysis(x, t, o) {
    const { pose, target, s, fs, alpha = 1, compact = false } = o;
    if (alpha <= 0.003) return;
    const lm = this.segLm(), cr = crAt(pose), at = fs.resultantAt, d = fs.d;
    const k = compact ? 0.62 : 1;
    const tip0 = lm.tip, apex0 = lm.apex, tip = apply(pose, tip0), apex = apply(pose, apex0);
    const moved = s > 0.015;
    // fixed anatomical / spatial references (do not move with the teeth)
    if (o.refs && moved) {
      const ra = alpha * 0.5 * smooth((s - 0.015) / 0.1);
      for (const y of [tip0[1], apex0[1]]) this.dashed(x, [this.proj([0, y, tip0[2] - 12]), this.proj([0, y, tip0[2] + 5])], { color: COL.dim, alpha: ra, width: 1.4, dash: [2, 6] });
      if (!compact) this.text(x, 'FIXED REFERENCE · START LEVEL', ...this.proj([0, apex0[1] - 1.2, tip0[2] - 12]).slice(0, 2), { size: 15, weight: 700, color: COL.dim, alpha: ra * 1.4, align: 'left', spacing: 1 });
    }
    // long axes: start (dashed, dim) and current (solid)
    if (o.axes && moved) {
      const ext = (a, b, e) => { const dd = V.norm(V.sub(b, a)); return [V.sub(a, V.mul(dd, e)), V.add(b, V.mul(dd, e))]; };
      const [a0, b0] = ext(apex0, tip0, 1.2), [a1, b1] = ext(apex, tip, 1.2);
      const bt0 = V.add(tip0, V.mul(V.norm(V.sub(tip0, apex0)), 4.5)), bt1 = V.add(tip, V.mul(V.norm(V.sub(tip, apex)), 4.5));
      const aa = alpha * smooth((s - 0.015) / 0.12);
      this.dashed(x, [this.proj(a0), this.proj(bt0)], { color: '#cfe0ee', alpha: aa * 0.7, width: 2 * k, dash: [10, 8] });
      this.dashed(x, [this.proj(a1), this.proj(bt1)], { color: o.traj, alpha: aa * 0.95, width: 3 * k, dash: [1, 0], glow: o.traj === COL.green });
      if (!compact && aa > 0.01 && o.axisLabels) {
        this.text(x, 'START AXIS', ...this.proj(V.add(bt0, [0, 0.6, -1.0])).slice(0, 2), { size: 15, weight: 700, color: '#cfe0ee', alpha: aa * 0.85, align: 'right', spacing: 1 });
        this.text(x, 'FINAL AXIS', ...this.proj(V.add(bt1, [0, 1.4, -0.6])).slice(0, 2), { size: 15, weight: 700, color: o.traj, alpha: aa, align: 'right', spacing: 1 });
      }
    }
    // trajectories of the incisal edge and the root apex (start → current), green when controlled
    if (moved) {
      const P = this.P(target), n = 28;
      const path = (p) => { const pts = []; for (let i = 0; i <= n; i++) pts.push(this.proj(apply(poseLerp(IDENT, P, s * i / n), p))); return pts; };
      const tc = o.trajTip || o.traj;
      this.dashed(x, path(tip0), { color: tc, alpha, width: 3.6 * k, dash: [7, 6], glow: true });
      this.dashed(x, path(apex0), { color: o.traj, alpha, width: 3.6 * k, dash: [7, 6], glow: true });
      for (const [p, c] of [[tip, tc], [apex, o.traj]]) { const q = this.proj(p); x.save(); x.globalAlpha = alpha; x.fillStyle = c; x.beginPath(); x.arc(q[0], q[1], 5 * k + 1, 0, Math.PI * 2); x.fill(); x.restore(); }
    }
    // centre of resistance
    if (o.showCR) {
      const ca = alpha * (o.crAlpha ?? 1);
      this.dot(x, this.proj(cr), { alpha: ca, r: compact ? 6 : 9 });
      this.text(x, 'CR', ...this.proj(V.add(cr, [0, compact ? -2.6 : -2.6, compact ? 1.4 : 1.2])).slice(0, 2), { size: compact ? 18 : 24, weight: 800, color: COL.gold, alpha: ca, align: 'left' });
    }
    // resultant F and its line of action
    if (o.showLine || o.showF) {
      const la = alpha * (o.lineAlpha ?? 1);
      this.dashed(x, [this.proj([0, at[1] + (compact ? 8 : 12), at[2]]), this.proj([0, cr[1] - (compact ? 9 : 13), at[2]])], { color: COL.blue, alpha: la * 0.7, width: 2.2 * k, dash: [6, 7] });
    }
    if (o.showF) {
      const fa = alpha * (o.fAlpha ?? 1), len = compact ? 7 : 10;
      this.force3(x, V.add(at, [0, 0.3, 0]), [0, -1, 0], len, { color: COL.blue, alpha: fa, width: 8 * k, head: 24 * k, into: true, progress: o.fProgress ?? 1 });
      this.text(x, 'F', ...this.proj([0, at[1] + len + (compact ? 1.6 : 1.8), at[2]]).slice(0, 2), { size: compact ? 22 : 32, weight: 800, color: COL.blue, alpha: fa });
    }
    // lever arm d (gold) and moment (purple) — scaled with |d|
    const dA = alpha * (o.dAlpha ?? 1) * clamp01(Math.abs(d) / 1.0) * (o.showD ? 1 : 0);
    if (dA > 0.01) {
      this.dashed(x, [this.proj(cr), this.proj([0, cr[1], at[2]])], { color: COL.gold, alpha: dA, width: 3.5 * k, dash: [4, 5] });
      const tick = (z) => { const a = this.proj([0, cr[1] - 0.9, z]), b = this.proj([0, cr[1] + 0.9, z]); x.save(); x.globalAlpha = dA; x.strokeStyle = COL.gold; x.lineWidth = 3 * k; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); x.restore(); };
      tick(cr[2]); tick(at[2]);
      this.text(x, 'd', ...this.proj([0, cr[1] + (compact ? 2.0 : 1.9), (cr[2] + at[2]) / 2]).slice(0, 2), { size: compact ? 20 : 30, weight: 800, color: COL.gold, alpha: dA });
    }
    if (o.showD && Math.abs(d) <= 0.3 && (o.d0Alpha ?? 1) > 0.01)
      this.text(x, 'd ≈ 0', ...this.proj(V.add(cr, [0, compact ? 2.4 : 2.6, compact ? -3.2 : -3.0])).slice(0, 2), { size: compact ? 18 : 24, weight: 800, color: COL.gold, alpha: alpha * (o.d0Alpha ?? 1), align: 'right' });
    const mA = alpha * (o.mAlpha ?? 1) * clamp01(Math.abs(d) / 2.0) * (o.showM ? 1 : 0);
    if (mA > 0.01) {
      this.momentArc(x, cr, compact ? 4.6 : 6.5, Math.sign(d), { alpha: mA, width: (compact ? 3 : 4) + 4 * k * clamp01(Math.abs(d) / 8), head: compact ? 15 : 22, progress: o.mProgress ?? 1, span: 50 + 90 * clamp01(Math.abs(d) / 8) });
      if (!compact) this.text(x, 'M = F × d', ...this.proj(V.add(cr, [0, 7.8, d > 0 ? -5.5 : 5.5])).slice(0, 2), { size: 26, weight: 800, color: COL.purple, alpha: mA * (o.mLabel ?? 1), align: d > 0 ? 'right' : 'left' });
    }
    if (o.showM && Math.abs(d) <= 0.3 && (o.m0Alpha ?? 0) > 0.01)
      this.text(x, 'M ≈ 0', ...this.proj(V.add(cr, [0, -2.6, compact ? -3.2 : -3.0])).slice(0, 2), { size: compact ? 18 : 24, weight: 800, color: COL.purple, alpha: alpha * o.m0Alpha, align: 'right' });
    return { tip, apex, cr, at, d };
  }
  /** faint lines of action of the other configurations (orientation: A in front, B through, C behind the CR) */
  otherLines(x, keys, cr, alpha) {
    if (alpha <= 0.01) return;
    for (const k of keys) {
      const z = this.hdr.d[k] + cr[2];
      this.dashed(x, [this.proj([0, 22, z]), this.proj([0, -12, z])], { color: COL.dim, alpha: alpha * 0.45, width: 1.6, dash: [3, 7] });
      const p = this.proj([0, 22, z]);
      this.badge(x, [p[0], p[1] - 18], k, { alpha: alpha * 0.6, r: 14, ring: COL.dim, color: COL.dim });
    }
  }
  /** step caption of the re-tie procedure (lower third) */
  step(x, str, a, color = COL.dim, size = 26) { this.text(x, str, W / 2, 1330, { size, weight: 700, color, alpha: a, spacing: size > 22 ? 4 : 2 }); }

  drawOverlay(x, t) {
    const hdr = this.hdr, M = this.M, IS = this.IS, pose = IS.pose;
    const cr = crAt(pose);
    const tubesNow = ['3', '4'].map((q) => this.bucApply(q, this.BS, this.buc[q].aux.c));
    const fs = forceSystem(this.tiesNow, cr, tubesNow);

    // ---------- 01: the hook — intrusive force, but the crowns tip labially
    if (t < 4) {
      const a = 1 - smooth((t - 3.75) / 0.25);
      const r = this.analysis(x, t, { pose, target: 'pA', s: IS.s, fs, alpha: a, traj: '#ffffff', trajTip: COL.red, showF: true, showLine: false, axes: true, refs: true });
      this.text(x, 'INTRUSIVE FORCE', ...this.proj([0, fs.resultantAt[1] + 6.0, fs.resultantAt[2] + 1.8]).slice(0, 2), { size: 18, weight: 700, color: COL.blue, alpha: a, align: 'left', spacing: 1 });
      this.text(x, 'directed apically', ...this.proj([0, fs.resultantAt[1] + 4.9, fs.resultantAt[2] + 1.8]).slice(0, 2), { size: 16, weight: 600, color: COL.dim, alpha: a, align: 'left', spacing: 1 });
      const ua = a * win(t, WT.tilt1 - 0.15, 4.2, 0.3, 0.3);
      this.callout(x, r.tip, 'UNWANTED TIPPING', { dx: 40, dy: 150, color: COL.red, alpha: ua, size: 22, sub: 'crowns move labially' });
      return;
    }

    // ---------- 02: appliance design
    if (t < 13.0) {
      const S2 = S;
      const mid = V.lerp(hdr.slots['31'], hdr.slots['41'], 0.5);
      this.callout(x, apply(pose, mid), 'ACTIVE SEGMENT', { dx: 40, dy: 260, alpha: win(t, S2.incGlow[0], WT.unite2 + 0.1, 0.25, 0.3), size: 24, sub: '32 · 31 · 41 · 42 only' });
      this.callout(x, M.L43.tip, 'CANINES 33 / 43', { dx: -30, dy: -230, alpha: win(t, 4.9, WT.unite2 + 0.6, 0.25, 0.3), size: 22, sub: 'not in the active segment' });
      this.callout(x, apply(pose, hdr.slots['32']), 'SECTIONAL WIRE', { dx: 50, dy: 250, color: COL.gold, alpha: win(t, S2.antWire[0] + 0.2, S2.extension[0] + 0.05, 0.25, 0.3), size: 22, sub: 'SS .019 × .025 · rigid' });
      this.callout(x, hdr.wire.left[hdr.wire.left.length - 3], 'STEPPED EXTENSION', { dx: 40, dy: 240, color: COL.gold, alpha: win(t, S2.extension[0] + 0.2, S2.bucR[0] + 0.1, 0.25, 0.3), size: 22, sub: 'not engaged in the canine bracket' });
      this.callout(x, hdr.slots['45'], 'RIGHT ANCHOR SEGMENT', { dx: 30, dy: 330, alpha: win(t, S2.bucR[0], S2.bucR[1] + 0.6, 0.2, 0.3), size: 22, sub: '43–47 · SS .019 × .025' });
      this.callout(x, hdr.slots['35'], 'LEFT ANCHOR SEGMENT', { dx: -30, dy: 330, alpha: win(t, S2.bucL[0], S2.bucL[1] + 0.6, 0.2, 0.3), size: 22, sub: '33–37 · SS .019 × .025' });
      const aT = win(t, S2.insert[0], S2.macro[0] + 0.1, 0.25, 0.3);
      this.callout(x, tubesNow[0], 'AUX TUBE 36', { dx: -40, dy: 210, alpha: aT, size: 21 });
      this.callout(x, tubesNow[1], 'AUX TUBE 46', { dx: 40, dy: 210, alpha: aT, size: 21 });
      // macro of the stepped extension (left)
      const aM = win(t, S2.macro[0] + 0.25, S2.activate[0] + 0.05, 0.25, 0.25);
      if (aM > 0.01) {
        const wl = hdr.wire.left;
        this.callout(x, apply(pose, V.lerp(wl[1], wl[2], 0.5)), 'APICAL STEP', { dx: 70, dy: -170, color: COL.gold, alpha: aM, size: 22, sub: 'out of the lateral bracket' });
        this.callout(x, apply(pose, wl[Math.max(3, wl.length - 4)]), 'DISTAL RUN · TIE ZONE', { dx: 60, dy: 190, color: COL.gold, alpha: aM, size: 22, sub: 'labial to 33, gingival to its bracket' });
        this.step(x, 'STEPPED EXTENSION OF THE SECTIONAL WIRE', aM);
      }
      // activation and tie
      const aA = win(t, S2.activate[0] - 0.05, S2.tie + 0.4, 0.15, 0.3);
      if (aA > 0.01) for (let i = 0; i < 2; i++) if (this.passiveEnd[i]) {
        const a0 = this.proj(this.passiveEnd[i]), b0 = this.proj(this.tiesNow[i]);
        if (Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) > 18) this.arrow(x, [a0[0] + 26, a0[1]], [b0[0] + 26, b0[1] + 10], { color: '#ffffff', width: 4, alpha: aA * 0.9, head: 16 });
        if (i === 0) this.callout(x, this.passiveEnd[i], 'PASSIVE', { dx: 70, dy: 80, color: COL.dim, alpha: aA, size: 21 });
      }
      this.step(x, 'ACTIVATION · ELASTIC DEFLECTION', win(t, S2.activate[0] - 0.05, S2.tie + 0.25, 0.15, 0.25));
      const ef = win(t, S2.tie - 0.02, S2.tie + 0.6, 0.05, 0.5);
      for (const p of this.tiesNow) this.flash(x, this.proj(p), clamp01((t - S2.tie) / 0.6), ef, COL.blue);
      this.step(x, 'TIED AT A · POINT CONTACT', win(t, S2.tie + 0.2, 13.0, 0.25, 0.3));
      const aV = win(t, S2.vectors - 0.05, 13.05, 0.25, 0.15);
      if (aV > 0.01) {
        for (const [i, p] of this.tiesNow.entries()) {
          this.force3(x, V.add(p, [0, 0.4, 0.6]), [0, -1, 0], 6, { color: COL.blue, alpha: aV, width: 6, head: 19, into: true, progress: easeOut((t - S2.vectors - i * 0.08) / 0.4) });
          this.text(x, 'F/2', ...this.proj(V.add(p, [i ? -1.4 : 1.4, 8.0, 0.8])).slice(0, 2), { size: 24, weight: 800, color: COL.blue, alpha: aV });
        }
        const at = fs.resultantAt;
        this.force3(x, V.add(at, [0, 0.4, 1.5]), [0, -1, 0], 11, { color: COL.blue, alpha: aV, width: 8, head: 24, into: true, progress: easeOut((t - S2.vectors - 0.25) / 0.45) });
        this.text(x, 'F', ...this.proj(V.add(at, [0, 13.6, 1.5])).slice(0, 2), { size: 34, weight: 800, color: COL.blue, alpha: aV });
      }
      return;
    }

    // ---------- 03: position A — frontal / occlusal / macro of the connection
    if (t < S.sagIn[0] + 0.6) {
      const aB = win(t, S.badgeA, S.sagIn[0] + 0.6, 0.3, 0.4);
      const ac = hdr.archCentre;
      for (const p of this.tiesNow) {
        const out = V.norm([p[0] - ac[0], 0, p[2] - ac[2]]), q = this.proj(V.add(p, V.mul(out, t > 15.5 ? 2.2 : 4.4)));
        this.badge(x, q, 'A', { alpha: aB * (t < 16.3 ? 1 : 0), scale: 1 + 0.4 * (1 - smooth((t - S.badgeA) / 0.4)) });
        this.flash(x, this.proj(p), clamp01((t - S.badgeA) / 0.7), aB * (1 - clamp01((t - S.badgeA) / 0.7)), COL.blue);
      }
      this.step(x, 'BOTH CANTILEVERS TIED AT A', win(t, S.badgeA + 0.2, 15.6, 0.3, 0.3));
      const aH = win(t, 15.75, S.sagIn[0] + 0.3, 0.25, 0.3);
      if (aH > 0.01) {
        this.callout(x, this.tiesNow[0], 'HOOK OVER THE SECTIONAL WIRE', { dx: 50, dy: 260, color: '#ffffff', alpha: aH, size: 22, sub: 'ligated · point contact · mesial position' });
      }
      if (t < S.sagIn[0]) return;
    }

    // ---------- 03–06: sagittal analysis
    if (t < S.cut7) { this.drawSagittal(x, t, cr, fs); return; }

    // ---------- 07: reciprocal effects on the anchor segments (configuration B)
    if (t < 53.2) {
      const aI = win(t, S.cut7 + 0.3, 53.1, 0.4, 0.3) * 0.8;
      this.force3(x, V.add(fs.resultantAt, [0, 0.4, 1.5]), [0, -1, 0], 10, { color: COL.blue, alpha: aI, width: 7, into: true });
      this.text(x, 'F', ...this.proj(V.add(fs.resultantAt, [0, 12.4, 1.5])).slice(0, 2), { size: 30, weight: 800, color: COL.blue, alpha: aI });
      this.callout(x, apply(pose, V.lerp(hdr.slots['31'], hdr.slots['41'], 0.5)), 'INTRUSIVE FORCE', { dx: 40, dy: 300, color: COL.blue, alpha: aI * win(t, 46.5, WT.reactive7, 0.3, 0.3), size: 22, sub: 'anterior segment' });
      const aF = win(t, WT.reactive7 - 0.05, 53.1, 0.3, 0.3);
      fs.molar.forEach((mo, i) => {
        const p = tubesNow[i];
        this.force3(x, V.add(p, [i ? -1.0 : 1.0, 0.8, 0]), [0, 1, 0], 6.5, { color: COL.red, alpha: aF, width: 6, progress: easeOut((t - WT.reactive7 - i * 0.1) / 0.45) });
        this.text(x, 'F/2', ...this.proj(V.add(p, [i ? -1.0 : 1.0, 9.6, 0])).slice(0, 2), { size: 22, weight: 800, color: COL.red, alpha: aF });
      });
      const aM = win(t, WT.moments7 - 0.05, 53.1, 0.3, 0.3);
      fs.molar.forEach((mo, i) => {
        const p = this.bucApply(i ? '4' : '3', this.BS, M[i ? 'L46' : 'L36'].cr);
        this.momentArc(x, p, 5.5, 1, { axis: mo.couple, alpha: aM, width: 5, head: 18, progress: easeOut((t - WT.moments7) / 0.6), span: 140, mid: 0 });
      });
      this.callout(x, this.bucApply('3', this.BS, M.L36.tip), 'REACTIVE EXTRUSION', { dx: -60, dy: -230, color: COL.red, alpha: aF, size: 22 });
      this.callout(x, this.bucApply('4', this.BS, M.L46.cr), 'TIP-BACK MOMENT', { dx: 50, dy: 230, color: COL.purple, alpha: aM, size: 22, sub: 'at the molar tube' });
      const aD = win(t, WT.reactive7 + 0.5, 53.1, 0.3, 0.3) * 0.8;
      for (const q of ['3', '4']) BUC[q].forEach((n, j) => {
        const p = this.bucApply(q, this.BS, M[n].tip);
        this.force3(x, V.add(p, [0, 1.2, 0]), [0, 1, 0], [1.6, 2.2, 2.8, 3.4, 2.4][j], { color: COL.red, alpha: aD, width: 3.5, head: 12 });
      });
      const aT = win(t, S.buccalTip[0] + 0.3, 53.1, 0.3, 0.3);
      this.callout(x, this.bucApply('4', this.BS, M.L47.tip), 'POSSIBLE DISTAL TIPPING', { dx: 20, dy: -135, color: COL.red, alpha: aT, size: 20, sub: 'anchor teeth are not immobile' });
      this.step(x, 'RIGID SEGMENTS SHARE THE LOAD — NOT ELIMINATE IT', win(t, WT.anchor7 - 0.2, 53.0, 0.3, 0.3) * 0.95, COL.dim, 21);
      this.text(x, 'Anatomy: Z-Anatomy / BodyParts3D © DBCLS · CC BY-SA 4.0', W / 2, 1584, { size: 15, weight: 500, color: COL.dim, alpha: win(t, 46.6, 53.0, 0.5, 0.4) * 0.6, spacing: 1 });
    }
  }

  /** scenes 03–06: one configuration at a time in the sagittal view */
  drawSagittal(x, t, cr, fs) {
    const IS = this.IS, pose = IS.pose, u = this.tieU(t);
    const sceneA = win(t, S.sagIn[0] + 0.5, S.cut7, 0.6, 0.15);
    const tied = this.ligAt(t).a > 0.5;
    const cfg = t < 26 ? 'A' : t < 37.0 ? 'B' : 'C';
    const traj = cfg === 'B' ? COL.green : '#ffffff';
    const sliding = (t >= S.slideB[0] && t < S.tieB) || (t >= S.slideC[0] && t < S.tieC);
    const sagOnly = t >= 26.6 || t < 23.6 || (t >= 37 && (t < 38.2 || t > 39.6));     // views where the 2D analysis reads correctly
    const aSag = sceneA * (sagOnly ? 1 : 0.5) * (t > 26.6 && t < 27.4 ? smooth((t - 26.6) / 0.8) : 1) * (t > 39.6 && t < 40.1 ? smooth((t - 39.6) / 0.5) : 1);
    // timing of the elements per scene
    let o = { showCR: false, showF: false, showLine: false, showD: false, showM: false };
    if (t < 23.6) {
      o = { showCR: true, crAlpha: smooth((t - WT.cr3 + 0.1) / 0.35), showLine: true, lineAlpha: smooth((t - WT.line3) / 0.4),
        showF: true, fAlpha: smooth((t - WT.line3) / 0.4), showD: true, dAlpha: smooth((t - WT.ahead3) / 0.35) * (t < 23.0 ? 1 : 1 - smooth((t - 23.0) / 0.5)),
        showM: true, mAlpha: smooth((t - WT.moment3 + 0.05) / 0.3) * (t < 23.0 ? 1 : 1 - smooth((t - 23.0) / 0.5)), mProgress: easeOut((t - WT.moment3 + 0.05) / 0.6) };
    } else if (t < 37.0) {
      const dOn = sliding || tied;
      o = { showCR: true, showLine: dOn, lineAlpha: 1, showF: tied, fAlpha: tied ? smooth((t - S.tieB) / 0.35) : 0,
        showD: dOn, dAlpha: 1, d0Alpha: smooth((t - WT.through5 + 0.05) / 0.3), showM: true, mAlpha: dOn ? (sliding ? 0.6 : 1) : 0, mProgress: 1, m0Alpha: smooth((t - WT.centre5) / 0.3) };
    } else {
      const dOn = sliding || tied;
      o = { showCR: true, showLine: dOn, lineAlpha: 1, showF: tied, fAlpha: tied ? smooth((t - S.tieC) / 0.35) : 0,
        showD: dOn, dAlpha: 1, showM: true, mAlpha: (t >= WT.opp6 - 0.05 ? smooth((t - WT.opp6 + 0.05) / 0.3) : 0), mProgress: easeOut((t - WT.opp6 + 0.05) / 0.6) };
    }
    this.retie(x, t);
    const r = this.analysis(x, t, { pose, target: IS.target, s: IS.s, fs, alpha: aSag, traj, axes: true, refs: true, axisLabels: t < 23.6, ...o });
    if (!r) return;
    // the other configurations as faint references (only after they have been introduced)
    if (t >= 26.6) this.otherLines(x, t < 37.0 ? ['A'] : ['A', 'B'], cr, aSag * win(t, 26.8, S.cut7, 0.5, 0.2));
    if (t >= 23.6) {
      const z = fs.resultantAt[2], p = this.proj([0, 22, z]);
      if (o.showLine) this.badge(x, [p[0], p[1] - 20], u < 0.5 ? 'A' : u < 1.5 ? 'B' : 'C', { alpha: aSag, r: 18, ring: COL.blue });
    }
    // motion labels
    if (IS.s > 0.35) {
      const ta = aSag * smooth((IS.s - 0.35) / 0.2);
      if (IS.target === 'pA') {
        this.callout(x, r.tip, 'CROWN → LABIAL', { dx: 40, dy: -70, alpha: ta, size: 21 });
        this.callout(x, r.apex, 'ROOT APEX → LINGUAL', { dx: 70, dy: 40, alpha: ta, size: 21 });
      } else if (IS.target === 'pB') {
        this.callout(x, r.tip, 'CROWN → APICAL', { dx: 40, dy: -70, color: COL.green, alpha: ta, size: 21 });
        this.callout(x, r.apex, 'APEX → APICAL · AXIS UNCHANGED', { dx: 70, dy: 40, color: COL.green, alpha: ta, size: 21 });
      } else {
        this.callout(x, r.tip, 'CROWN → LINGUAL', { dx: -90, dy: -40, alpha: ta, size: 21 });
        this.callout(x, r.apex, 'ROOT APEX → LABIAL', { dx: 70, dy: 40, alpha: ta, size: 21 });
      }
    }
    // centre of rotation ≠ CR (position A)
    if (IS.target === 'pA' && t < 23.6) {
      const aC = aSag * win(t, 21.7, 23.1, 0.3, 0.3), c = centreOfRotation(this.P('pA'));
      if (aC > 0.01 && c) {
        const p = this.proj(c);
        x.save(); x.globalAlpha = aC; x.strokeStyle = '#ffffff'; x.lineWidth = 3;
        x.beginPath(); x.moveTo(p[0] - 9, p[1] - 9); x.lineTo(p[0] + 9, p[1] + 9); x.moveTo(p[0] + 9, p[1] - 9); x.lineTo(p[0] - 9, p[1] + 9); x.stroke(); x.restore();
        this.callout(x, c, 'CENTER OF ROTATION ≠ CR', { dx: -40, dy: 160, alpha: aC, size: 19 });
      }
    }
    const ia = win(t, 34.6, 36.9, 0.3, 0.3);
    if (ia > 0.01) { this.text(x, 'IDEALISED CONDITION', 60, 640, { size: 21, weight: 800, color: COL.green, alpha: ia, align: 'left', spacing: 2 });
      this.text(x, 'line of action through the CR', 60, 672, { size: 19, weight: 600, color: '#d7e6f3', alpha: ia, align: 'left', spacing: 1 });
      this.text(x, 'of THIS model — not a guaranteed', 60, 700, { size: 19, weight: 600, color: '#d7e6f3', alpha: ia, align: 'left', spacing: 1 });
      this.text(x, 'result of an anatomical tie point', 60, 728, { size: 19, weight: 600, color: '#d7e6f3', alpha: ia, align: 'left', spacing: 1 }); }
  }
  retie(x, t) {
    const seq = (untie, deact, slide, react, tieT, from, to) => {
      if (t < untie[0] - 0.1 || t > tieT + 0.8) return;
      const pa = win(t, untie[0] - 0.1, tieT + 0.8, 0.25, 0.35);
      const steps = [['UNTIE', untie[0]], ['DEACTIVATE', deact[0]], [`MOVE THE HOOK DISTALLY  ${from} → ${to}`, slide[0]], ['RE-ACTIVATE FOR THE SAME F', react[0]], [`RE-TIE AT ${to}`, tieT]];
      x.save(); x.globalAlpha = pa * 0.62; x.fillStyle = '#02060d'; x.beginPath(); x.roundRect(40, 570, 470, 330, 18); x.fill(); x.restore();
      this.text(x, 'CHANGING THE TIE POINT', 60, 600, { size: 24, weight: 800, color: '#ffffff', alpha: pa, align: 'left', spacing: 3 });
      steps.forEach(([str, t0], i) => {
        const next = steps[i + 1] ? steps[i + 1][1] : tieT + 0.8;
        const on = t >= t0 - 0.05, cur = on && t < next;
        const col = cur ? (i === 3 ? COL.blue : '#ffffff') : on ? '#9fb6c9' : '#5d7286';
        this.text(x, `${i + 1} · ${str}`, 60, 646 + i * 38, { size: 23, weight: cur ? 800 : 600, color: col, alpha: pa * (cur ? 1 : 0.85), align: 'left', spacing: 1 });
      });
      const s3 = win(t, react[0] - 0.05, tieT + 1.2, 0.15, 0.3);
      this.text(x, 'shorter arm → stiffer: less deflection', 60, 852, { size: 19, weight: 600, color: COL.dim, alpha: pa * s3, align: 'left', spacing: 1 });
      this.text(x, 'for the same F (model)', 60, 878, { size: 19, weight: 600, color: COL.dim, alpha: pa * s3, align: 'left', spacing: 1 });
      // hook marker
      if (t >= slide[0] - 0.05 && t <= tieT + 0.3) {
        const a = win(t, slide[0] - 0.05, tieT + 0.3, 0.15, 0.3);
        for (const p of this.tiesNow) { const q = this.proj(p); x.save(); x.globalAlpha = a; x.fillStyle = COL.blue; x.shadowColor = COL.blue; x.shadowBlur = 16; x.beginPath(); x.arc(q[0], q[1], 7, 0, Math.PI * 2); x.fill(); x.restore(); }
      }
      if (t >= tieT && t < tieT + 0.7) for (const p of this.tiesNow) this.flash(x, this.proj(p), clamp01((t - tieT) / 0.6), 1 - clamp01((t - tieT) / 0.7), COL.blue);
      // passive end → tie arrows during the re-activation
      const sA = win(t, react[0] - 0.05, tieT + 0.05, 0.15, 0.1);
      if (sA > 0.01) for (let i = 0; i < 2; i++) if (this.passiveEnd[i]) {
        const a0 = this.proj(this.passiveEnd[i]), b0 = this.proj(this.tiesNow[i]);
        if (Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) > 14 && b0[0] > 0 && b0[0] < W) this.arrow(x, [a0[0] + 22, a0[1]], [b0[0] + 22, b0[1] + 8], { color: '#ffffff', width: 3.5, alpha: sA * 0.9, head: 14 });
      }
    };
    seq(S.untieB, S.deactB, S.slideB, S.reactB, S.tieB, 'A', 'B');
    seq(S.untieC, S.deactC, S.slideC, S.reactC, S.tieC, 'B', 'C');
  }


  drawSubtitle(x, t) {
    const cue = SUBS.find((c) => t >= c[0] && t < c[1]);
    if (!cue || t >= OUTRO_T0 + 0.25) return;
    const a = Math.min(smooth((t - cue[0]) / 0.15), smooth((cue[1] - t) / 0.15));
    x.save(); x.font = `600 40px ${F}`;
    const words = cue[2].split(' '), lines = []; let cur = '';
    for (const w of words) { const s = cur ? cur + ' ' + w : w; if (x.measureText(s).width > 820 && cur) { lines.push(cur); cur = w; } else cur = s; }
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
