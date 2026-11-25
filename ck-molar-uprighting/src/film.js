// ============================================================================
//  Film renderer: Three.js scene (Z-Anatomy lower right segment 42–47 with 46 missing,
//  upper antagonists, translucent mandibular bone, PDL of 47, brackets, rigid anchor
//  segment wire, molar tube, cantilever, miniscrew + elastic) + 2D overlay (force
//  vectors, moments, trajectories, kinetic typography, subtitles, brand) composited
//  into one 1080×1920 canvas that is shown, recorded and exported.
// ============================================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BRAND, backgroundCanvas, drawLogo } from './brand.js';
import { DURATION, FPS, OUTRO_T0, SUBS, S, W as WT, VIS, UPPER, pose47At, anchorIntrusionAt, upperAt, cameraAt, clamp01, smooth, lerp, ramp, win, easeOut, easeInOut } from './timeline.js';
import { V, apply, applyDir, poseLerp, START, END_A, END_B, forceSystem } from './model.js';
import { SCENE } from './scene.js';
import { KEYWORDS, keywordState, kickerState, focusLevel } from './kinetic.js';
import { solveDesign, centreLine } from './wire.js';
import { bracketGeometry, tubeGeometry, sweepRect, resample, screwGeometry, roundedBox } from './geom.js';
import { EDIT, DURATION_DC, DS, W6, SUBS_DC, DELTA2, dcGeometry, forceSystemDC } from './dc.js';
import { solve2, centreLine2, toLocal, toWorld } from './wire2.js';
import { CAMERA } from './timeline.js';

const W = BRAND.width, H = BRAND.height;
const F = BRAND.font;
export const COL = {
  blue: '#58c8ff',           // therapeutic forces and moments
  red: '#ff4f45',            // undesired forces / side effects
  gold: '#ffc95c',           // centre of resistance
  green: '#4be38f',          // controlled trajectory
  white: '#ffffff',
  dim: '#a9bdd0',
  accent: BRAND.colors.accent,
};
const DEG = Math.PI / 180;
const LOOK = { rim: 3.9, rim2: 2.2, rimColor: 0x8fe4ff, exposure: 1.1, edge: 0.2, key: 3.0, front: 0.9, env: 0.7 };

// ---------------------------------------------------------------------------- background
let _bg = null;
function filmBackground() {
  if (_bg) return _bg;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.drawImage(backgroundCanvas(), 0, 0);
  // the series' "Enhanced Dark" treatment: soft radial light behind the model (graphite-navy)
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
// persistent top inscription — same typography as the series (Inter Medium 28 px, wide tracking, baseline 212.5 px)
const TOP = { text: 'CK BIOMECHANICS', font: '500 28px Inter, "Helvetica Neue", Arial, sans-serif', color: '#eef2f7', baseline: 212.5, spacing: 10.4 };
function drawTopLabel(x, a) {
  if (a <= 0.003) return;
  x.save(); x.font = TOP.font; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  if ('letterSpacing' in x) x.letterSpacing = `${TOP.spacing}px`;
  x.globalAlpha = a; x.shadowColor = 'rgba(0,6,18,0.85)'; x.shadowBlur = 10; x.fillStyle = TOP.color; x.fillText(TOP.text, W / 2 + TOP.spacing / 2, TOP.baseline); x.restore();
}

// ---------------------------------------------------------------------------- materials
/** translucent tissue: fresnel rim + soft wrap lighting, soft crop along x (segment ends) */
function tissueMaterial({ color, rim, base = 0.1, rimA = 0.5, light = 0.6, x0 = -1e4, x1 = 1e4, soft = 5, additive = false, aoAlpha = false }) {
  const uniforms = { uColor: { value: new THREE.Color(color) }, uRim: { value: new THREE.Color(rim) }, uAlpha: { value: 1 },
    uBase: { value: base }, uRimA: { value: rimA }, uLight: { value: light }, uX0: { value: x0 }, uX1: { value: x1 }, uSoft: { value: soft } };
  return new THREE.ShaderMaterial({
    defines: aoAlpha ? { AO_ALPHA: 1 } : {},
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */`attribute float aAO; varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vAO;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz); vAO = aAO; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform vec3 uRim; uniform float uAlpha, uBase, uRimA, uLight, uX0, uX1, uSoft;
      varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vAO;
      void main(){
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        float fr = pow(1.0 - abs(dot(n, normalize(vV))), 2.2);
        vec3 L = normalize(vec3(-0.35, 0.8, 0.5));
        float dif = 0.55 + 0.45 * dot(n, L);
        vec3 c = mix(uColor * (0.5 + uLight * dif), uRim, fr * 0.85);
        float crop = smoothstep(uX0, uX0 + uSoft, vW.x) * (1.0 - smoothstep(uX1 - uSoft, uX1, vW.x));
        #ifdef AO_ALPHA
        float aoA = vAO;
        #else
        float aoA = 1.0;
        #endif
        float a = (uBase + uRimA * fr) * uAlpha * crop * aoA;
        if (a < 0.003) discard;
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`,
  });
}
/** ghost of a tooth position: luminous fresnel shell */
function ghostMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vV;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uAlpha; varying vec3 vN; varying vec3 vV;
      void main(){ float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.7);
        float a = (0.02 + 0.34*fr) * uAlpha; if (a < 0.003) discard; gl_FragColor = vec4(uColor * a, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
/** teeth: physical material + baked AO, enamel / root dentine & cementum blend, highlight, contact spot */
function toothMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3,
    sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color('#cfe3ff'), envMapIntensity: 0.6, transparent: false });
  const u = { uTint: { value: new THREE.Color(COL.red) }, uTintAmt: { value: 0 }, uGlow: { value: new THREE.Color(COL.blue) }, uGlowAmt: { value: 0 },
    uEdge: { value: LOOK.edge }, uDim: { value: 0 }, uSpot: { value: new THREE.Vector3(1e4, 0, 0) }, uSpotAmt: { value: 0 }, uSpotCol: { value: new THREE.Color(COL.red) } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAO; attribute float aEnamel; varying float vAO; varying float vEn; varying vec3 vVw; varying vec3 vNw;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAO = aAO; vEn = aEnamel; vVw = (modelMatrix*vec4(position,1.0)).xyz; vNw = normalize(mat3(modelMatrix)*normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint; uniform float uTintAmt; uniform vec3 uGlow; uniform float uGlowAmt; uniform float uEdge; uniform float uDim; uniform vec3 uSpot; uniform float uSpotAmt; uniform vec3 uSpotCol; varying float vAO; varying float vEn; varying vec3 vVw; varying vec3 vNw;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 enamel = vec3(0.95, 0.93, 0.89);
        vec3 root = vec3(0.88, 0.78, 0.62);
        float en = smoothstep(0.25, 0.8, vEn);
        diffuseColor.rgb = mix(root, enamel, en);
        float frC = pow(1.0 - abs(dot(normalize(vNw), normalize(cameraPosition - vVw))), 3.0);
        diffuseColor.rgb *= 1.0 - uEdge * frC;
        diffuseColor.rgb = mix(diffuseColor.rgb, uTint, uTintAmt * 0.4);
        float spot = uSpotAmt * (1.0 - smoothstep(0.4, 2.0, distance(vVw, uSpot)));
        diffuseColor.rgb = mix(diffuseColor.rgb, uSpotCol, spot * 0.75);
        diffuseColor.rgb *= 1.0 - 0.3 * uDim;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.62, 0.26, vEn);')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        { float ao = mix(1.0, pow(clamp(vAO*1.05+0.05,0.0,1.0), 1.4), mix(0.7, 0.2, vEn));
          reflectedLight.indirectDiffuse *= ao; reflectedLight.directDiffuse *= mix(1.0, ao, 0.6); reflectedLight.indirectSpecular *= ao; }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float fr = pow(1.0 - abs(dot(normalize(vNw), normalize(cameraPosition - vVw))), 2.0);
          totalEmissiveRadiance += vec3(0.62, 0.70, 0.78) * 0.07 * vEn * pow(fr, 1.5);
          totalEmissiveRadiance += uTint * uTintAmt * (0.08 + 0.8*fr);
          totalEmissiveRadiance += uGlow * uGlowAmt * (0.05 + 0.8*fr);
          float spot = uSpotAmt * (1.0 - smoothstep(0.3, 2.2, distance(vVw, uSpot)));
          totalEmissiveRadiance += uSpotCol * spot * 0.9; }`);
  };
  m.customProgramCacheKey = () => 'ck-tooth';
  return m;
}
const steel = () => new THREE.MeshPhysicalMaterial({ color: 0xd9dee6, metalness: 1, roughness: 0.24, envMapIntensity: 1.25, clearcoat: 0.3, clearcoatRoughness: 0.2 });
const titanium = () => new THREE.MeshPhysicalMaterial({ color: 0xc8c3bb, metalness: 1, roughness: 0.3, envMapIntensity: 1.15 });

// ---------------------------------------------------------------------------- loader
async function loadDentition(url = 'assets/dentition') {
  const [hdr, buf] = await Promise.all([fetch(url + '.json').then((r) => r.json()), fetch(url + '.bin').then((r) => r.arrayBuffer())]);
  const geos = {};
  for (const m of hdr.meshes) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, m.position[0], m.vertices * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(buf, m.normal[0], m.vertices * 3), 3, true));
    g.setAttribute('aAO', new THREE.BufferAttribute(new Uint8Array(buf, m.ao[0], m.vertices), 1, true));
    g.setAttribute('aEnamel', new THREE.BufferAttribute(new Uint8Array(buf, m.enamel[0], m.vertices), 1, true));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, m.index[0], m.triangles * 3), 1));
    g.computeBoundingSphere();
    geos[m.name] = g;
  }
  return { hdr, geos, M: Object.fromEntries(hdr.meshes.map((m) => [m.name, m])) };
}

// ---------------------------------------------------------------------------- film
export class Film {
  constructor() {
    this.out = document.createElement('canvas'); this.out.width = W; this.out.height = H;
    this.ctx = this.out.getContext('2d');
    this.subtitles = true;
  }
  setLook() {}

  async init() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1); r.setSize(W, H, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = LOOK.exposure;
    r.sortObjects = true;
    const sc = this.scene = new THREE.Scene();
    this.bgCanvas = filmBackground();
    const bg = new THREE.CanvasTexture(this.bgCanvas); bg.colorSpace = THREE.SRGBColorSpace;
    sc.background = bg;
    const pm = new THREE.PMREMGenerator(r);
    sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    sc.environmentIntensity = LOOK.env;
    const cam = this.camera = new THREE.PerspectiveCamera(30, W / H, 2, 2000);
    sc.add(cam);
    const key = new THREE.DirectionalLight(0xfff3e6, LOOK.key); key.position.set(-120, 200, 220); cam.add(key); key.target = cam;
    const fill = new THREE.DirectionalLight(0xdfe8ff, 1.1); fill.position.set(220, -40, 160); cam.add(fill); fill.target = cam;
    const rim = new THREE.DirectionalLight(LOOK.rimColor, LOOK.rim); rim.position.set(140, 160, -260); cam.add(rim); rim.target = cam;
    const rim2 = new THREE.DirectionalLight(0x8fc4ff, LOOK.rim2); rim2.position.set(-200, -40, -220); cam.add(rim2); rim2.target = cam;
    const front = new THREE.DirectionalLight(0xffffff, LOOK.front); front.position.set(0, 40, 300); cam.add(front); front.target = cam;
    sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x141018, 0.25));

    const { hdr, geos, M } = await loadDentition();
    this.hdr = hdr; this.M = M;
    const L47 = this.L47 = M.L47;

    // ---------------- teeth
    this.teeth = {};
    const addTooth = (name) => {
      const m = M[name], mat = toothMaterial();
      const mesh = new THREE.Mesh(geos[name], mat); mesh.position.set(...m.cr); mesh.renderOrder = 1; sc.add(mesh);
      this.teeth[name] = { m, mesh, mat };
      return this.teeth[name];
    };
    for (const n of ['L42', 'L43', 'L44', 'L45', 'L47', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17']) addTooth(n);
    this.anchorGroup = new THREE.Group(); sc.add(this.anchorGroup);
    for (const n of ['L43', 'L44', 'L45']) { sc.remove(this.teeth[n].mesh); this.anchorGroup.add(this.teeth[n].mesh); }
    this.upperGroup = new THREE.Group(); sc.add(this.upperGroup);
    for (const n of ['U12', 'U13', 'U14', 'U15', 'U16', 'U17']) { sc.remove(this.teeth[n].mesh); this.upperGroup.add(this.teeth[n].mesh); }

    // 47: pose pivot = anatomical CR (mesh local coordinates are around the CR)
    const t47 = this.teeth.L47;
    this.pdlMat = tissueMaterial({ color: '#ff8f9c', rim: '#ffc4cb', base: 0.05, rimA: 0.55, light: 0.9, additive: true, aoAlpha: true });
    this.pdl = new THREE.Mesh(geos.pdl47, this.pdlMat); this.pdl.renderOrder = 3; t47.mesh.add(this.pdl);
    this.ghostS = new THREE.Mesh(geos.L47, ghostMaterial('#dff4ff')); this.ghostS.renderOrder = 6; sc.add(this.ghostS);
    this.ghostA = new THREE.Mesh(geos.L47, ghostMaterial('#ff7a6e')); this.ghostA.renderOrder = 6; sc.add(this.ghostA);

    // ---------------- bone (closed volume of the segment; translucent)
    this.boneMat = tissueMaterial({ color: '#e3d7c3', rim: '#b9e4ff', base: 0.5, rimA: 0.5, light: 0.6, x0: -24, x1: 40, soft: 7 });
    this.bone = new THREE.Mesh(geos.bone, this.boneMat); this.bone.renderOrder = 4; sc.add(this.bone);

    // ---------------- appliance: brackets 43–45, anchor wire, molar tube (on 47)
    const metal = this.metal = steel();
    this.metalMats = [metal];
    const brG = bracketGeometry(SCENE.bracketOff);
    const frameAt = (m) => {           // bracket frame on a tooth: z = faN, x = mesial projected, y = z × x
      const z = new THREE.Vector3(...m.faN).normalize();
      const x = new THREE.Vector3(1, 0, 0).sub(z.clone().multiplyScalar(z.x)).normalize();
      const y = z.clone().cross(x);
      return new THREE.Matrix4().makeBasis(x, y, z);
    };
    this.brackets = [];
    for (const n of ['L43', 'L44', 'L45']) {
      const m = M[n], b = new THREE.Mesh(brG, metal);
      b.position.set(...m.fa); b.quaternion.setFromRotationMatrix(frameAt(m)); b.renderOrder = 2;
      this.anchorGroup.add(b); this.brackets.push(b);
      // elastomeric ligature around the tie-wings
      const lig = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.24, 10, 36), new THREE.MeshPhysicalMaterial({ color: 0x8796a8, roughness: 0.35, metalness: 0, transmission: 0.25, thickness: 0.5, clearcoat: 0.6 }));
      lig.scale.set(1.12, 1.05, 1); lig.position.set(0, 0, 1.6); b.add(lig);
    }
    const wp = resample(new THREE.CatmullRomCurve3(SCENE.anchorWire(hdr).map((p) => new THREE.Vector3(...p))).getPoints(80).map((v) => [v.x, v.y, v.z]), 90);
    this.anchorWirePts = wp;
    this.anchorWire = new THREE.Mesh(sweepRect(wp, 0.64, 0.46, [0, 0, 1]), metal); this.anchorWire.renderOrder = 2; this.anchorGroup.add(this.anchorWire);
    // molar tube: child of 47 (local = anatomical − CR)
    this.tube = new THREE.Mesh(tubeGeometry(), metal); this.tube.renderOrder = 2;
    this.tube.position.set(...V.sub(L47.fa, L47.cr)); this.tube.quaternion.setFromRotationMatrix(frameAt(L47));
    t47.mesh.add(this.tube);
    // tube frame (anatomical): m (lumen axis, mesial), o (occlusal), b (buccal)
    const fz = new THREE.Vector3(...L47.faN).normalize(), fx = new THREE.Vector3(1, 0, 0).sub(fz.clone().multiplyScalar(fz.x)).normalize();
    this.tubeFrame0 = { c: V.add(L47.fa, V.mul(L47.faN, SCENE.tubeOff)), m: [fx.x, fx.y, fx.z], b: [fz.x, fz.y, fz.z], o: [0, 0, 0] };
    this.tubeFrame0.o = V.cross(this.tubeFrame0.b, this.tubeFrame0.m);
    this.tubeHook0 = V.add(L47.fa, V.add(V.mul(this.tubeFrame0.o, -2.55), V.add(V.mul(this.tubeFrame0.m, -0.9), V.mul(this.tubeFrame0.b, 1.9))));

    // ---------------- cantilever (designed in the START pose: passive hook 9 mm gingival to the anchor wire)
    this.hook = SCENE.hook(hdr);
    this.delta0 = 6.5;
    const tf = this.tubeFrameAt(START);
    const Ht = this.toTube(tf, this.hook);
    this.design = solveDesign(V.add(Ht, [0, -this.delta0, 0]));
    this.wireMat = steel(); this.metalMats.push(this.wireMat);
    this.wireN = 520;
    this.wire = new THREE.Mesh(sweepRect(resample(centreLine(this.design, { step: 1, helix: 1, tip: 1, hook: 1 }).pts, this.wireN), 0.62, 0.44, [0, 1, 0]), this.wireMat);
    this.wire.renderOrder = 2; sc.add(this.wire);
    this.passiveMat = ghostMaterial('#cfeeff');
    this.wireGhost = new THREE.Mesh(sweepRect(resample(centreLine(this.design, { step: 1, helix: 1, tip: 1, hook: 1 }).pts, this.wireN), 0.62, 0.44, [0, 1, 0]), this.passiveMat);
    this.wireGhost.renderOrder = 7; sc.add(this.wireGhost);

    // ---------------- miniscrew + elastic chain
    const scr = hdr.screw;
    this.screwAxis = new THREE.Vector3(...scr.axis).normalize();
    this.screwHead = new THREE.Vector3(...scr.head);
    this.screw = new THREE.Mesh(screwGeometry(scr.len, 1.6), titanium()); this.screw.renderOrder = 2; sc.add(this.screw);
    this.metalMats.push(this.screw.material);
    this.chainMat = new THREE.MeshPhysicalMaterial({ color: 0x9fb4c8, roughness: 0.35, metalness: 0, clearcoat: 0.7, transparent: true, opacity: 0.95 });
    this.chain = [];
    for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.24, 10, 24), this.chainMat); c.renderOrder = 2; sc.add(c); this.chain.push(c); }

    if (this.dc) this.initDC();

    // ---------------- occlusal contact points (closest pair at the closure stop), for the red highlight
    this.contactA = this.findContact(END_A, UPPER.stopA);
    this.contactB = this.findContact(END_B, UPPER.stopB);

    await Promise.all([document.fonts.load(`800 60px ${F}`), document.fonts.load(`700 40px ${F}`), document.fonts.load(`600 30px ${F}`),
      document.fonts.load(`600 30px ${F}`, 'АБВ'), document.fonts.load(`800 60px ${F}`, 'АБВ'), document.fonts.load(TOP.font)]);
    for (const t of [0.5, 7.5, 16, 24, 36, 44, 53, 58]) this.renderTime(t);   // compile all programs once
  }

  // ------------------------------------------------------------------ helpers (geometry)
  tubeFrameAt(pose) {
    const f = this.tubeFrame0, cr = this.L47.cr;
    return { c: apply(pose, f.c, cr), m: applyDir(pose, f.m), o: applyDir(pose, f.o), b: applyDir(pose, f.b) };
  }
  toTube(tf, p) { const d = V.sub(p, tf.c); return [V.dot(d, tf.m), V.dot(d, tf.o), V.dot(d, tf.b)]; }
  fromTube(tf, q) { return V.add(tf.c, V.add(V.mul(tf.m, q[0]), V.add(V.mul(tf.o, q[1]), V.mul(tf.b, q[2])))); }
  p47(pose, p) { return apply(pose, p, this.L47.cr); }

  findContact(pose, dy) {
    const g47 = this.teeth.L47.mesh.geometry, cr = this.L47.cr;
    const pos = g47.attributes.position, en = g47.attributes.aEnamel;
    const lower = [];
    for (let i = 0; i < pos.count; i += 2) if (en.getX(i) > 0.5) lower.push(this.p47(pose, [pos.getX(i) + cr[0], pos.getY(i) + cr[1], pos.getZ(i) + cr[2]]));
    let best = [1e9, null];
    for (const n of ['U16', 'U17']) {
      const m = this.M[n], g = this.teeth[n].mesh.geometry, p = g.attributes.position, e = g.attributes.aEnamel;
      for (let i = 0; i < p.count; i += 2) {
        if (e.getX(i) < 0.5) continue;
        const u = [p.getX(i) + m.cr[0], p.getY(i) + m.cr[1] + dy, p.getZ(i) + m.cr[2]];
        if (u[1] > 16) continue;
        for (const l of lower) { const d = (u[0] - l[0]) ** 2 + (u[1] - l[1]) ** 2 + (u[2] - l[2]) ** 2; if (d < best[0]) best = [d, V.lerp(u, l, 0.5)]; }
      }
    }
    return best[1];
  }

  // ------------------------------------------------------------------ frame
  renderFrame(i) { return this.renderTime(i / FPS); }

  renderTime(tIn) {
    // DOUBLE CANTILEVER edit (src/dc.js): [EDIT.a, EDIT.join) = new scene; afterwards the original timeline shifted by EDIT.d
    const dur = this.dc ? DURATION_DC : DURATION;
    const tNew = Math.min(Math.max(tIn, 0), dur - 1e-6);
    this.mode = !this.dc ? 'orig' : tNew >= EDIT.join ? 'remap' : tNew >= EDIT.a ? 'dc' : 'orig';
    this.tNew = tNew;
    const t = this.mode === 'remap' ? tNew - EDIT.d : tNew;
    this.t = t;
    this.applyCamera(t);
    this.updateScene(t);
    this.renderer.render(this.scene, this.camera);
    const x = this.ctx;
    x.globalAlpha = 1;
    x.drawImage(this.renderer.domElement, 0, 0);
    x.drawImage(this.topShade ??= this.makeTopShade(), 0, 0);
    if (this.mode === 'dc') { if (t < 40.6) this.drawOverlay(x, t); this.drawOverlayDC(x, t); this.drawKeywordsDC(x, t); }
    else { this.drawOverlay(x, t); this.drawKeywords(x, t); }
    if (this.subtitles) this.drawSubtitle(x, this.dc ? tNew : t);
    drawTopLabel(x, 1 - smooth((t - OUTRO_T0) / 0.6));
    if (t >= OUTRO_T0) outro(x, t - OUTRO_T0, this.bgCanvas);
    return this.out;
  }

  /** soft dark gradient behind the top typography (legibility over bright enamel) */
  makeTopShade() {
    const c = document.createElement('canvas'); c.width = W; c.height = 520;
    const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 520);
    g.addColorStop(0, 'rgba(2,6,13,0.72)'); g.addColorStop(0.55, 'rgba(2,6,13,0.38)'); g.addColorStop(1, 'rgba(2,6,13,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, 520); return c;
  }

  applyCamera(t) {
    const c = { ...(this.mode === 'dc' ? this.cameraDC(t) : cameraAt(t)) };
    c.dist *= 1 - 0.018 * focusLevel(t);
    const az = c.az * DEG, el = c.el * DEG;
    const dir = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
    const cam = this.camera;
    cam.position.set(c.tgt[0] + dir[0] * c.dist, c.tgt[1] + dir[1] * c.dist, c.tgt[2] + dir[2] * c.dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(...c.tgt);
    cam.fov = c.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }

  // ------------------------------------------------------------------ 3D state
  updateScene(t) {
    const O = this.mode === 'dc' ? this.dcState(t) : null;
    const P = this.P = O ? O.P : pose47At(t);
    const pose = P.pose, L47 = this.L47;
    const lowA = VIS.lower(t), boneA = VIS.bone(t), clear = VIS.boneClear(t);
    // 47
    const t47 = this.teeth.L47;
    const crNow = V.add(L47.cr, pose.shift);
    t47.mesh.position.set(...crNow); t47.mesh.rotation.set(0, 0, pose.theta * DEG);
    // anchor segment (reciprocal intrusion, small)
    // (double-cantilever edit: the vertical reactions on the anchor are balanced → no anchor intrusion)
    const ai = this.aiNow = O ? O.ai : this.mode === 'remap' ? 0 : anchorIntrusionAt(t);
    this.anchorGroup.position.set(0, -ai, 0);
    // upper antagonists
    const up = O ? O.up : upperAt(t);
    this.upperGroup.position.set(0, up.dy, 0);
    // tooth visibility / emphasis
    for (const [n, o] of Object.entries(this.teeth)) {
      let a = n[0] === 'U' ? up.a : lowA;
      if (n === 'L42') a *= 0.55;
      o.mesh.visible = a > 0.004;
      const tr = a < 0.999; o.mat.transparent = tr; o.mat.opacity = a; o.mat.depthWrite = !tr || a > 0.6;
      o.mat.userData.u.uSpotAmt.value = 0; o.mat.userData.u.uTintAmt.value = 0; o.mat.userData.u.uGlowAmt.value = 0; o.mat.userData.u.uDim.value = 0;
    }
    // red interference highlight (scene 01 and 05), green-white normal contact (scene 06 end)
    const red = VIS.red47(t);
    const okC = O ? O.okC : win(t, 50.6, 52.2, 0.15, 0.6);
    for (const n of ['L47', 'U16', 'U17']) {
      const u = this.teeth[n].mat.userData.u;
      if (red > 0.002) { u.uSpot.value.set(...this.contactA); u.uSpotAmt.value = red; u.uSpotCol.value.set(COL.red); }
      else if (okC > 0.002) { u.uSpot.value.set(...this.contactB); u.uSpotAmt.value = okC * 0.55; u.uSpotCol.value.set(COL.green); }
    }
    this.teeth.L47.mat.userData.u.uTintAmt.value = 0.55 * red;
    // dim the anchor teeth slightly while the molar is the subject (scene 04 focus)
    const dimA = 0.35 * win(t, 22.8, 26.8, 0.6, 0.6);
    for (const n of ['L43', 'L44', 'L45']) this.teeth[n].mat.userData.u.uDim.value = dimA;
    // anchor teeth: soft red emphasis while the reactive intrusion is named
    const anchRed = 0.22 * Math.max(win(t, WT.intrusive - 0.05, WT.intrusive + 2.5, 0.25, 0.6), win(t, 34.0, 39.6, 0.6, 0.6) * 0.7);
    for (const n of ['L43', 'L44', 'L45']) this.teeth[n].mat.userData.u.uTintAmt.value = anchRed;
    // PDL
    this.pdlMat.uniforms.uAlpha.value = (O ? O.pdl : VIS.pdl(t)) * lowA;
    this.pdl.visible = this.pdlMat.uniforms.uAlpha.value > 0.003;
    // bone: normal translucency → see-through
    this.boneMat.uniforms.uAlpha.value = boneA;
    this.boneMat.uniforms.uBase.value = lerp(0.3, 0.06, clear);
    this.boneMat.uniforms.uRimA.value = lerp(0.42, 0.5, clear);
    this.bone.visible = boneA > 0.003;
    // ghosts
    const gS = (O ? O.ghostS : VIS.ghostStart(t)) * lowA, gA = O ? 0 : VIS.ghostA(t);
    this.placeGhost(this.ghostS, START, gS * (P.s > 0.02 || t > 51 ? 1 : 0));
    this.placeGhost(this.ghostA, END_A, gA);
    // appliance
    const apA = VIS.appliance(O ? Math.min(t, 50.99) : t);
    for (const b of this.brackets) b.visible = apA > 0.004;
    this.anchorWire.visible = apA > 0.004; this.tube.visible = apA > 0.004;
    for (const m of this.metalMats) { m.transparent = true; }
    this.metal.opacity = apA;
    this.updateWire(t, pose);
    this.updateScrew(t, pose);
    if (this.dc) this.updateDC(t, pose, apA);
  }

  placeGhost(mesh, pose, a) {
    mesh.position.set(...V.add(this.L47.cr, pose.shift)); mesh.rotation.set(0, 0, pose.theta * DEG);
    mesh.material.uniforms.uAlpha.value = a; mesh.visible = a > 0.004;
  }

  /** forming progress, insertion offset, activation */
  wireState(t) {
    const f = S.fab;
    const fp = (a) => ramp(t, a[0], a[1], easeInOut);
    const form = t < 5 ? null : { straight: fp(f.straight), step: fp(f.step), helix: fp(f.helix), tip: fp(f.arm), hook: fp(f.hook) };
    const ins = 1 - ramp(t, ...S.insert);                     // 1 = outside the tube (scene 02 placement)
    const act = ramp(t, ...S.activate, easeInOut);
    return { form, ins, act };
  }

  updateWire(t, pose) {
    const a = VIS.cantilever(this.mode === 'dc' ? Math.min(t, 50.99) : t);
    this.wire.visible = a > 0.004 && t >= 5.2;
    this.wireGhost.visible = false;
    if (!this.wire.visible) return;
    const st = this.ws = this.wireState(t);
    const tf = this.tubeFrameAt(t < 26.2 ? START : pose);
    // deflection: hook centre → anchor-wire hook point (tube frame) with the beam profile.
    // Before the movement the passive design (δ0 gingival) is fixed; during the uprighting the cantilever
    // deactivates (residual activation δ falls to ~25 %) — the passive geometry is re-solved each frame so the
    // hook stays engaged on the anchor wire (periodic reactivation implied, as in the clinic).
    const Ht = this.toTube(tf, V.add(this.hook, [0, -this.aiNow, 0]));
    let design = this.design, defl;
    if (t < 26.2) {
      const cl0 = centreLine(this.design, { step: 1, helix: 1, tip: 1, hook: 1 });
      const hk = this.hookPassiveTube ??= (() => { const c = cl0.run; const top = cl0.pts.filter((_, i) => c.tags[i] === 'hook').reduce((m, q) => (q[1] > m[1] ? q : m)); return [top[0], top[1] - 0.62, top[2]]; })();
      defl = V.mul(V.sub(Ht, hk), st.act);
      this.deflMag = this.delta0;
    } else {
      const dEff = this.delta0 * (1 - 0.75 * this.P.s);
      design = solveDesign(V.add(Ht, [0, -dEff, 0]), this.design);      // deterministic: always from the base design
      defl = [0, dEff, 0];
      this.deflMag = dEff;
    }
    const form = st.form;
    let pts;
    if (form && form.hook < 1) {
      // fabrication: straight wire grows, then the bends form one after another (developed length conserved)
      const cl = centreLine(this.design, { step: form.step, helix: form.helix, tip: form.tip, hook: form.hook });
      const n = Math.max(2, Math.round(cl.pts.length * Math.max(0.02, form.straight)));
      pts = cl.pts.slice(0, n);
    } else pts = centreLine(design, { step: 1, helix: 1, tip: 1, hook: 1 }, defl).pts;
    // insertion offset (scene 02/03): outside the tube, mesial and buccal, then slid in
    const off = V.mul([6.5, 0.6, 2.8], easeInOut(st.ins));
    const world = pts.map((q) => this.fromTube(tf, V.add(q, off)));
    sweepRect(resample(world, this.wireN), 0.62, 0.44, tf.o, this.wire.geometry);
    this.wireMat.opacity = a;
    this.wireWorld = world;
    this.wireTf = tf;
    // passive outline during / after activation
    const ga = VIS.passiveGhost(t) * st.act;
    if (ga > 0.004) {
      const pw = centreLine(design, { step: 1, helix: 1, tip: 1, hook: 1 }).pts.map((q) => this.fromTube(tf, q));
      sweepRect(resample(pw, this.wireN), 0.62, 0.44, tf.o, this.wireGhost.geometry);
      this.passiveMat.uniforms.uAlpha.value = ga * 2.2; this.wireGhost.visible = true;
      this.passiveTip = pw[pw.length - 1];
    }
    // world positions used by the overlay
    this.tubeNow = tf.c;
    this.deflNow = defl;
  }

  updateScrew(t, pose) {
    const a = this.dc ? 0 : VIS.screw(t);
    this.screw.visible = a > 0.004;
    for (const c of this.chain) c.visible = false;
    if (!this.screw.visible) return;
    const p = ramp(t, ...S.screw, easeOut);                    // placement: descends along its axis while turning
    const head = this.screwHead.clone().addScaledVector(this.screwAxis, -(1 - p) * 7.5);
    this.screw.position.copy(head);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), this.screwAxis);
    const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -p * 9 * Math.PI);
    this.screw.quaternion.copy(q).multiply(spin);
    this.screw.material.transparent = a < 0.999; this.screw.material.opacity = a;
    // elastic chain: screw head → tube hook of 47
    const e = ramp(t, ...S.elastic, easeOut) * (t < 51 ? 1 : 1);
    if (e <= 0.001) return;
    const hookW = this.p47(pose, this.tubeHook0);
    const h0 = this.screwHead.clone().addScaledVector(this.screwAxis, -1.7);   // ring under the button
    const A = [h0.x, h0.y, h0.z], B = V.lerp(A, hookW, e);
    const n = this.chain.length;
    const dir = new THREE.Vector3(...V.norm(V.sub(hookW, A)));
    for (let i = 0; i < n; i++) {
      const c = this.chain[i], u = (i + 0.5) / n;
      const p_ = V.lerp(A, B, u);
      c.visible = true; c.position.set(...p_);
      // link: ring plane contains the chain direction, alternate links turned 90°
      const side = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
      const zAx = i % 2 ? side : dir.clone().cross(side).normalize();
      const yAx = zAx.clone().cross(dir).normalize();
      c.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, yAx, zAx));
      const sp = V.len(V.sub(B, A)) / n;
      c.scale.set(Math.max(0.55, sp / 1.2), 0.8, 1);
    }
    this.chainA = A; this.chainB = hookW;
    this.chainMat.opacity = 0.95 * a;
  }

  // ================================================================== DOUBLE CANTILEVER edit (src/dc.js)
  initDC() {
    const hdr = this.hdr, L47 = this.L47, G = this.G = dcGeometry(hdr);
    const metal = this.metal;
    // vertical slot (auxiliary vertical tube) soldered to the distal end of the rigid anchor wire
    const slot = new THREE.Group();
    const body = new THREE.Mesh(roundedBox(1.25, 3.0, 1.25, 0.32), metal); body.position.set(...G.slotC); slot.add(body);
    const lumen = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 3.02, 16), new THREE.MeshBasicMaterial({ color: 0x0b1420 }));
    lumen.position.set(...V.add(G.slotC, [0, 0, 0])); lumen.visible = false; slot.add(lumen);
    const sp = [G.wEnd, V.add(G.wEnd, [-0.2, 0.2, 1.2]), V.add(G.slotC, [0, -1.25, -0.55])];
    const spur = new THREE.Mesh(sweepRect(resample(sp, 12), 0.7, 0.55, [0, 1, 0]), metal); slot.add(spur);
    const solder = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 10), metal); solder.position.set(...G.wEnd); slot.add(solder);
    this.slot = slot; this.anchorGroup.add(slot);
    // distal extension of the wire bonded to 47 (child of 47: local = anatomical − CR), with a small occlusal stop at its end
    const ext = [G.E0, V.lerp(G.E0, G.E1, 0.5), G.E1, V.add(G.E1, [0, 0.9, 0])].map((p) => V.sub(p, L47.cr));
    this.extMat = steel(); this.metalMats.push(this.extMat);
    this.ext = new THREE.Mesh(sweepRect(resample([ext[0], ext[1], ext[2]], 30), 0.62, 0.44, [0, 1, 0]), this.extMat);
    const stop = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), this.extMat); stop.position.set(...ext[2]); this.ext.add(stop);
    const barrel = new THREE.Mesh(roundedBox(2.6, 0.9, 0.9, 0.3), this.extMat);
    barrel.position.set(...V.sub(V.add(G.E0, V.mul(G.de, 0.6)), L47.cr)); this.ext.add(barrel);
    this.teeth.L47.mesh.add(this.ext);
    // second cantilever (green) + its passive outline
    this.base2 = solve2(V.add(toLocal(G.S0, apply(START, G.D, L47.cr)), [DELTA2, 0, 0]));
    this.wire2Mat = steel(); this.metalMats.push(this.wire2Mat);
    this.wire2Mat.emissive = new THREE.Color(COL.green);
    const p0 = centreLine2(this.base2).pts.map((q) => toWorld(G.S0, q));
    this.wire2 = new THREE.Mesh(sweepRect(resample(p0, 360), 0.62, 0.44, [1, 0, 0]), this.wire2Mat); this.wire2.renderOrder = 2; this.scene.add(this.wire2);
    this.wire2GhostMat = ghostMaterial('#9df5c2');
    this.wire2Ghost = new THREE.Mesh(sweepRect(resample(p0, 360), 0.62, 0.44, [1, 0, 0]), this.wire2GhostMat); this.wire2Ghost.renderOrder = 7; this.scene.add(this.wire2Ghost);
    this.wireMat.emissive = new THREE.Color(COL.blue);
  }

  /** state overrides for the new scene (pose, anchor, antagonists, tissues) */
  dcState(t) {
    const d = EDIT.d;
    let P;
    if (t < DS.reset[1]) P = pose47At(t);
    else if (t < DS.upright[0]) P = { pose: START, scen: 'B', s: 0 };
    else { const s = ramp(t, ...DS.upright); P = { pose: poseLerp(START, END_B, s), scen: 'B', s }; }
    const up = t < 41 ? upperAt(t) : t >= 48.6 + d ? upperAt(t - d) : { dy: UPPER.open, a: 0 };
    return {
      P, up,
      ai: t < DS.reset[1] ? anchorIntrusionAt(t) : 0,
      okC: t >= 48.6 + d ? win(t - d, 50.6, 52.2, 0.15, 0.6) : 0,
      pdl: t < DS.reset[1] ? VIS.pdl(t) : 0.8 * win(t, DS.upright[0] - 0.6, 50.8 + d, 0.6, 0.6),
      ghostS: t < DS.reset[1] ? VIS.ghostStart(t) : smooth((t - DS.upright[0] - 0.1) / 0.6),
    };
  }

  /** camera of the new scene: starts on the original 39.8 s key, ends on the original 50.4 s key (shifted) */
  cameraDC(t) {
    const old = (tt) => cameraAt(tt), d = EDIT.d;
    if (t < 39.8) return old(t);
    if (t >= 50.4 + d) return old(t - d);
    const K = (tt, az, el, dist, tgt) => ({ t: tt, az, el, dist, tgt });
    const k39 = CAMERA.find((k) => k.t === 39.8), k50 = CAMERA.find((k) => k.t === 50.4);
    const keys = [K(39.8, k39.az, k39.el, k39.dist, k39.tgt), K(41.2, -4, 4, 150, [15, 6, 2]), K(42.1, 14, 14, 104, [18, 9, 3]),
      K(43.9, 9, 9, 128, [14, 8, 2]), K(46.4, 2, 4, 160, [16, 6, 1]), K(48.6, -2, 3, 140, [12, 6, 0]), K(50.4 + d, k50.az, k50.el, k50.dist, k50.tgt)];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i].t) {
      const a = keys[i - 1], b = keys[i], u = easeInOut((t - a.t) / (b.t - a.t));
      return { az: lerp(a.az, b.az, u), el: lerp(a.el, b.el, u), dist: Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), u)), tgt: [0, 1, 2].map((k) => lerp(a.tgt[k], b.tgt[k], u)), fov: 30 };
    }
    return old(t - d);
  }

  /** slot, extension, second cantilever, colour coding of both cantilevers */
  updateDC(t, pose, apA) {
    const G = this.G, L47 = this.L47, tn = this.tNew, dc = this.mode === 'dc', remap = this.mode === 'remap';
    // fade of the auxiliary parts: appear on «Второй кантилевер», leave with the cantilevers in scene 07
    const auxA = dc ? smooth((t - DS.slotIn[0]) / (DS.slotIn[1] - DS.slotIn[0])) : remap ? VIS.cantilever(t) : 0;
    this.slot.visible = auxA > 0.004; this.ext.visible = auxA > 0.004;
    this.extMat.opacity = auxA;
    if (this.slot.visible) this.slot.traverse((o) => { if (o.material && o.material !== this.metal) { o.material.transparent = true; o.material.opacity = auxA; } });
    // the slot shares the bracket material (opacity apA); scale-in for the appearance
    this.slot.scale.setScalar(1);
    // colour coding: first cantilever blue, second green (soft emissive glow)
    const glow = dc ? 0.85 * smooth((t - DS.v1Ext + 0.2) / 0.4) : remap ? 0.85 * (1 - smooth((t - 50.9) / 0.6)) : 0;
    this.wireMat.emissiveIntensity = glow;
    // second cantilever
    const wa = dc ? smooth((t - DS.wire2In[0]) / (DS.wire2In[1] - DS.wire2In[0])) : remap ? VIS.cantilever(t) : 0;
    this.wire2.visible = wa > 0.004; this.wire2Ghost.visible = false;
    if (!this.wire2.visible) return;
    this.wire2Mat.opacity = wa; this.wire2Mat.emissiveIntensity = 0.9 * wa;
    const s = this.P.s, Dl = toLocal(G.S0, apply(pose, G.D, L47.cr));
    const act = dc ? ramp(t, ...DS.activate2) : 1;
    let design = this.base2, dDown;
    if (dc && t < DS.upright[0]) dDown = DELTA2 * act;                    // passive → activated on the START pose
    else { const d2 = DELTA2 * (1 - 0.75 * s); design = solve2(V.add(Dl, [d2, 0, 0]), this.base2); dDown = d2; }   // deactivates as the molar uprights
    const ins = dc ? 1 - ramp(t, ...DS.insert2) : 0;                     // 1 = above the slot (before insertion)
    const off = [0, 4.2 * ins, 1.6 * ins];
    const pts = centreLine2(design, dDown).pts.map((q) => V.add(toWorld(G.S0, q), off));
    sweepRect(resample(pts, 360), 0.62, 0.44, [1, 0, 0], this.wire2.geometry);
    this.wire2World = pts; this.D_now = apply(pose, G.D, L47.cr);
    const ga = dc ? win(t, DS.activate2[0] - 0.1, DS.balance[0], 0.3, 0.5) : 0;
    if (ga > 0.004) {
      const pp = centreLine2(this.base2).pts.map((q) => toWorld(G.S0, q));
      sweepRect(resample(pp, 360), 0.62, 0.44, [1, 0, 0], this.wire2Ghost.geometry);
      this.wire2GhostMat.uniforms.uAlpha.value = ga * 2.2; this.wire2Ghost.visible = true; this.passive2Tip = pp[pp.length - 1];
    }
  }

  drawOverlayDC(x, t) {
    const L47 = this.L47, G = this.G, P = this.P, pose = P.pose, d = EDIT.d;
    const crNow = V.add(L47.cr, pose.shift), tf = this.tubeFrameAt(pose), tubeW = tf.c;
    const hookW = V.add(this.hook, [0, -this.aiNow, 0]);
    const Dw = apply(pose, G.D, L47.cr), slotW = G.slotC;
    const f = forceSystemDC(L47, pose, hookW, G, 1);
    const end = 50.9 + d;                                               // everything of this scene has left before the original continues
    const sc = 7.2;
    const bal = ramp(t, ...DS.balance, easeInOut);                     // compensation progress
    const shrink = 1 - 0.78 * bal;                                     // opposite vertical vectors shrink together
    const fadeUp = 1 - 0.55 * smooth((t - DS.upright[0]) / 0.8);       // vectors step back during the movement
    // CR
    const aCR = win(t, 41.0, end, 0.4, 0.5);
    this.dot(x, this.proj(crNow), { alpha: aCR, r: 8 });
    // 1–2: first cantilever (blue wire): extrusive on 47, intrusive on the anchor segment (red: side effects)
    const a1 = win(t, DS.v1Ext, end, 0.3, 0.5) * fadeUp;
    this.force3(x, V.add(tubeW, V.mul(tf.b, 2)), [0, 1, 0], sc * shrink, { color: COL.red, alpha: a1, width: 6, progress: easeOut((t - DS.v1Ext) / 0.45) });
    const a1i = win(t, DS.v1Int, end, 0.3, 0.5) * fadeUp;
    this.force3(x, V.add(hookW, [0, 0.8, 1.5]), [0, -1, 0], sc * shrink, { color: COL.red, alpha: a1i, width: 6, progress: easeOut((t - DS.v1Int) / 0.45) });
    if (t < DS.slotIn[0] + 0.6) {
      const al = win(t, DS.v1Ext + 0.2, DS.slotIn[0] + 0.6, 0.3, 0.3);
      this.callout(x, V.add(tubeW, [0, 4, 2]), 'CANTILEVER 1', { dx: -60, dy: -150, color: COL.blue, alpha: al, size: 24, sub: 'extrusion on 47' });
      this.callout(x, V.add(hookW, [0, -4, 1.5]), 'REACTIVE INTRUSION', { dx: 40, dy: 140, color: COL.red, alpha: al, size: 22, sub: 'anchor segment' });
    }
    // 3: installation of the second cantilever
    const aS = win(t, DS.slotIn[0] + 0.1, DS.v2[1] + 0.4, 0.3, 0.4);
    this.callout(x, V.add(slotW, [0, 1.6, 0.6]), 'VERTICAL SLOT', { dx: 70, dy: -170, alpha: aS, size: 24, sub: 'rigid with the anchor wire' });
    this.callout(x, V.add(apply(pose, G.E1, L47.cr), [0, 0, 0.4]), 'DISTAL EXTENSION · 47', { dx: -40, dy: -190, alpha: win(t, DS.slotIn[0] + 0.3, DS.v2[1] + 0.4, 0.3, 0.4), size: 22 });
    if (this.wire2World) {
      const mid = this.wire2World[Math.floor(this.wire2World.length * 0.55)];
      this.callout(x, mid, 'CANTILEVER 2', { dx: 40, dy: -120, color: COL.green, alpha: win(t, DS.wire2In[1], DS.v2[1] + 0.4, 0.3, 0.4), size: 24, sub: 'along cantilever 1' });
    }
    const aP = win(t, DS.insert2[1] - 0.1, DS.engage2 + 0.5, 0.2, 0.4);
    if (aP > 0.01 && this.passive2Tip) {
      const pt = this.proj(V.add(this.passive2Tip, [0, 0, 2])), ph = this.proj(V.add(Dw, [0, 1.2, 2]));
      this.arrow(x, [pt[0] - 40, pt[1]], [ph[0] - 40, ph[1] - 10], { color: '#ffffff', width: 4, alpha: aP * 0.9, head: 18 });
      this.text(x, 'PASSIVE → ACTIVATED', pt[0] - 60, (pt[1] + ph[1]) / 2, { size: 20, color: COL.dim, alpha: aP, align: 'right', spacing: 2 });
    }
    const ef = win(t, DS.engage2 - 0.02, DS.engage2 + 0.6, 0.05, 0.5);
    if (ef > 0.01) { const p = this.proj(Dw); x.save(); x.globalAlpha = ef; x.strokeStyle = COL.green; x.lineWidth = 3; x.beginPath(); x.arc(p[0], p[1], 20 + 40 * (t - DS.engage2), 0, Math.PI * 2); x.stroke(); x.restore(); }
    // 4: opposite vertical vectors of the second cantilever (green): intrusive on 47 distal to the CR, extrusive on the anchor slot
    const a2 = win(t, DS.v2[0], end, 0.3, 0.5) * fadeUp;
    this.force3(x, V.add(Dw, [0, 1.0, 1.2]), [0, -1, 0], sc * shrink, { color: COL.green, alpha: a2, width: 6, into: true, progress: easeOut((t - DS.v2[0]) / 0.45) });
    this.force3(x, V.add(slotW, [0, -1.6, 1.2]), [0, 1, 0], sc * shrink, { color: COL.green, alpha: win(t, DS.v2[0] + 0.15, end, 0.3, 0.5) * fadeUp, width: 6, into: true, progress: easeOut((t - DS.v2[0] - 0.15) / 0.45) });
    // 5: compensation → ΣFv ≈ 0 on the molar and on the anchor segment
    const aB = win(t, DS.balance[0] + 0.6, end, 0.4, 0.5);
    if (aB > 0.01) {
      const pm = this.proj(V.add(tubeW, [-4, 10.5, 2])), pa = this.proj(V.add(hookW, [-7, 8.5, 1.5]));
      this.text(x, 'ΣFv ≈ 0', pm[0], pm[1], { size: 32, weight: 800, color: COL.white, alpha: aB });
      this.text(x, 'ΣFv ≈ 0', pa[0], pa[1], { size: 26, weight: 800, color: COL.white, alpha: aB * 0.9 });
      this.text(x, 'with matched activation of both cantilevers', W / 2, 1240, { size: 21, weight: 600, color: COL.dim, alpha: win(t, DS.balance[0] + 0.6, DS.moments[1], 0.4, 0.4), spacing: 1 });
    }
    // 6: resulting moments — kept after the vertical compensation
    const aM = win(t, DS.moments[0], end, 0.4, 0.5);
    const pulse = 1 + 0.35 * win(t, W6.moment - 0.1, W6.moment + 0.9, 0.2, 0.5);
    if (aM > 0.01) {
      this.moment3(x, crNow, 8, 205, 335, { alpha: aM, progress: easeOut((t - DS.moments[0]) / 0.6), width: (8 + 2 * (pulse - 1) * 3) });
      const lp = this.proj(V.add(crNow, [3, -10.5, 0]));
      this.text(x, 'M = M₁ + F₂·d', lp[0], lp[1], { size: 26, weight: 800, color: COL.blue, alpha: aM, align: 'left' });
      this.text(x, 'uprighting direction kept', lp[0], lp[1] + 28, { size: 18, weight: 600, color: COL.dim, alpha: aM, align: 'left', spacing: 1 });
      // lever arm d of F2 about the CR (horizontal, sagittal)
      const ad = win(t, DS.moments[0] + 0.4, DS.upright[0] + 1.2, 0.3, 0.5);
      this.dashed(x, [this.proj(crNow), this.proj([Dw[0], crNow[1], crNow[2]])], { color: COL.gold, alpha: ad, width: 2.5, dash: [3, 5] });
      this.dashed(x, [this.proj([Dw[0], crNow[1], crNow[2]]), this.proj(Dw)], { color: COL.gold, alpha: ad * 0.6, width: 2, dash: [3, 5] });
      const mp = this.proj([(Dw[0] + crNow[0]) / 2, crNow[1] - 1.6, crNow[2]]);
      this.text(x, 'd', mp[0], mp[1], { size: 26, weight: 800, color: COL.gold, alpha: ad });
      // moment on the anchor segment from the vertical-slot fixation (clockwise in this view)
      const ac = V.add(V.lerp(this.M.L45.cr, this.M.L44.cr, 0.4), [0, -this.aiNow, 0]);
      this.moment3(x, ac, 6.5, 120, 20, { color: COL.red, alpha: aM * 0.9, width: 5, head: 18, progress: easeOut((t - DS.moments[0] - 0.4) / 0.6) });
      const ap = this.proj(V.add(ac, [0, -9.5, 0]));
      this.text(x, 'M ANCHOR', ap[0], ap[1], { size: 22, weight: 800, color: COL.red, alpha: aM * win(t, DS.moments[0] + 0.4, end, 0.3, 0.5), spacing: 2 });
      this.text(x, 'rigid anchor segment', ap[0], ap[1] + 24, { size: 17, weight: 600, color: COL.dim, alpha: aM * win(t, DS.moments[0] + 0.4, end, 0.3, 0.5), spacing: 1 });
    }
    // 7: controlled trajectories (green, as in the original style)
    const aT = win(t, DS.upright[0] + 0.1, end, 0.4, 0.5);
    if (aT > 0.01 && P.s > 0.001) {
      const traj = (pt) => { const pts = []; for (let i = 0; i <= 30; i++) pts.push(this.proj(apply(poseLerp(START, END_B, P.s * i / 30), pt, L47.cr))); return pts; };
      this.dashed(x, traj(L47.tip), { color: COL.green, alpha: aT, width: 4, glow: true });
      this.dashed(x, traj(L47.apexM), { color: COL.green, alpha: aT * 0.85, width: 3, glow: true });
      this.dashed(x, traj(L47.apexD), { color: COL.green, alpha: aT * 0.85, width: 3, glow: true });
      if (P.s > 0.25) {
        this.callout(x, apply(pose, L47.tip, L47.cr), 'CROWN', { dx: -100, dy: -70, color: COL.green, alpha: aT * win(t, DS.upright[0] + 1.0, end - 0.6, 0.3, 0.4), size: 22 });
        this.callout(x, apply(pose, L47.apexD, L47.cr), 'ROOTS', { dx: -100, dy: 60, color: COL.green, alpha: aT * win(t, DS.upright[0] + 1.3, end - 0.6, 0.3, 0.4), size: 22 });
      }
    }
    const ok = win(t - d, 50.7, 52.2, 0.15, 0.6) * (t > 48.6 + d ? 1 : 0);
    if (ok > 0.01) this.contactRing(x, this.contactB, t - d - 50.7, ok, COL.green);
    // disclaimer (dips with the original at the scene change)
    this.text(x, 'QUALITATIVE BIOMECHANICS · NOT A FINITE-ELEMENT SIMULATION', W / 2, 1560, { size: 17, weight: 600, color: COL.dim, alpha: win(t, 40.6, end + 0.1, 0.5, 0.5) * 0.75, spacing: 2 });
  }

  drawKeywordsDC(x, t) {
    const KWS = [
      { text: 'DOUBLE CANTILEVER', at: W6.second, hold: 1.7, color: 'green', dir: [1, 0], size: 76, kicker: 'ANOTHER WAY', kickerAt: W6.other },
      { text: 'INTRUSIVE FORCE', at: DS.v2[0], hold: 1.0, color: 'green', dir: [0, 1], size: 76, kicker: 'CANTILEVER 2 · 47 DISTAL', kickerAt: DS.v2[0] },
      { text: 'FORCE BALANCE', at: W6.compensate, hold: 2.4, color: 'white', dir: [0, -1], size: 84 },
      { text: 'CONTROLLED UPRIGHTING', at: W6.control, hold: 2.1, color: 'green', dir: [-1, 0], size: 64 },
    ];
    for (const k of KWS) {
      const kk = { ...k, place: 'top', id: k.text, kickerAt: k.kickerAt ?? k.at };
      const sKw = keywordState(kk, t), sk = kickerState(kk, t);
      if (!sKw && !sk) continue;
      this.drawOneKeyword(x, kk, sKw, sk);
    }
  }

  // ------------------------------------------------------------------ 2D helpers
  proj(p) { const v = new THREE.Vector3(...p).project(this.camera); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, v.z]; }
  text(x, str, px, py, { size = 40, weight = 700, color = COL.white, alpha = 1, spacing = 0, align = 'center', baseline = 'middle', glow = null, shadow = true } = {}) {
    if (alpha <= 0.003) return;
    x.save();
    x.globalAlpha = alpha; x.fillStyle = color;
    x.font = `${weight} ${size}px ${F}`; x.textAlign = align; x.textBaseline = baseline;
    if ('letterSpacing' in x) x.letterSpacing = `${spacing}px`;
    const tx = align === 'center' ? px + spacing / 2 : px;
    if (glow) { x.shadowColor = glow; x.shadowBlur = 22; x.fillText(str, tx, py); }
    if (shadow) { x.shadowColor = 'rgba(0,6,18,0.9)'; x.shadowBlur = 12; }
    x.fillText(str, tx, py);
    x.restore();
  }
  /** glowing vector a → b (screen px) with arrow head; progress p draws it from a */
  arrow(x, a, b, { color = COL.blue, width = 6, alpha = 1, head = 24, progress = 1, glow = true } = {}) {
    if (alpha <= 0.003 || progress <= 0.001) return;
    const B = [a[0] + (b[0] - a[0]) * progress, a[1] + (b[1] - a[1]) * progress];
    const ang = Math.atan2(B[1] - a[1], B[0] - a[0]);
    const hl = Math.min(head, Math.hypot(B[0] - a[0], B[1] - a[1]) * 0.6);
    const Sx = [B[0] - Math.cos(ang) * hl * 0.7, B[1] - Math.sin(ang) * hl * 0.7];
    x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
    const pass = (w, c, al, blur) => {
      x.globalAlpha = al; x.strokeStyle = c; x.fillStyle = c; x.lineWidth = w; x.shadowColor = c; x.shadowBlur = blur;
      x.beginPath(); x.moveTo(...a); x.lineTo(...Sx); x.stroke();
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
  /** force vector in 3D: from point p along direction d (mm length len) — or ending at p (into = true) */
  force3(x, p, d, len, opts = {}) {
    const dn = V.norm(d);
    const a = opts.into ? V.sub(p, V.mul(dn, len)) : p, b = opts.into ? p : V.add(p, V.mul(dn, len));
    this.arrow(x, this.proj(a), this.proj(b), opts);
    return { a: this.proj(a), b: this.proj(b) };
  }
  /** moment arc around the 3D axis through c (axis +z in the segment frame), radius r mm, from a0 to a1 (deg) */
  moment3(x, c, r, a0, a1, { color = COL.blue, width = 6, alpha = 1, head = 24, progress = 1, axis = [0, 0, 1] } = {}) {
    if (alpha <= 0.003 || progress <= 0.001) return;
    const e = a0 + (a1 - a0) * progress, n = 40, pts = [];
    for (let i = 0; i <= n; i++) { const a = (a0 + (e - a0) * i / n) * DEG; pts.push(this.proj(V.add(c, [Math.cos(a) * r, Math.sin(a) * r, 0]))); }
    x.save(); x.lineCap = 'round';
    const tip = pts[n], pre = pts[Math.max(0, n - 4)];
    const ang = Math.atan2(tip[1] - pre[1], tip[0] - pre[0]);
    for (const [w, col, al, comp, blur] of [[width + 5, 'rgba(0,8,22,1)', 0.45, 'source-over', 0], [width + 6, color, 0.2, 'lighter', 20], [width, color, 1, 'source-over', 0]]) {
      x.globalCompositeOperation = comp; x.globalAlpha = alpha * al; x.strokeStyle = col; x.fillStyle = col; x.lineWidth = w; x.shadowColor = col; x.shadowBlur = blur;
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
    x.save(); x.globalAlpha = alpha;
    x.globalCompositeOperation = 'lighter'; x.fillStyle = color; x.shadowColor = color; x.shadowBlur = 26;
    x.beginPath(); x.arc(p[0], p[1], r * 1.6, 0, Math.PI * 2); x.globalAlpha = alpha * 0.3; x.fill();
    x.globalCompositeOperation = 'source-over'; x.shadowBlur = 0; x.globalAlpha = alpha;
    x.fillStyle = color; x.beginPath(); x.arc(p[0], p[1], r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#ffffff'; x.lineWidth = 2.5; x.beginPath(); x.arc(p[0], p[1], r + 4, 0, Math.PI * 2); x.stroke();
    x.restore();
  }
  /** dashed polyline (screen) */
  dashed(x, pts, { color = COL.white, width = 3.5, alpha = 1, dash = [9, 9], glow = false } = {}) {
    if (alpha <= 0.003 || pts.length < 2) return;
    x.save(); x.lineCap = 'round'; x.lineJoin = 'round'; x.setLineDash(dash);
    if (glow) { x.globalCompositeOperation = 'lighter'; x.globalAlpha = alpha * 0.25; x.strokeStyle = color; x.lineWidth = width + 5; x.shadowColor = color; x.shadowBlur = 14;
      x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke(); x.globalCompositeOperation = 'source-over'; x.shadowBlur = 0; }
    x.globalAlpha = alpha; x.strokeStyle = color; x.lineWidth = width;
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke();
    x.restore();
  }
  /** label with a thin leader line from a 3D point */
  callout(x, p3, str, { dx = 90, dy = -60, color = COL.white, alpha = 1, size = 26, sub = null } = {}) {
    if (alpha <= 0.003) return;
    const p = this.proj(p3), q = [p[0] + dx, p[1] + dy];
    x.save(); x.globalAlpha = alpha * 0.85; x.strokeStyle = color; x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.lineTo(q[0] + Math.sign(dx || 1) * 18, q[1]); x.stroke();
    x.fillStyle = color; x.beginPath(); x.arc(p[0], p[1], 3.5, 0, Math.PI * 2); x.fill(); x.restore();
    const al = dx >= 0 ? 'left' : 'right', tx = q[0] + Math.sign(dx || 1) * 26;
    this.text(x, str, tx, q[1], { size, weight: 700, color, alpha, align: al, spacing: 2 });
    if (sub) this.text(x, sub, tx, q[1] + size * 0.95, { size: Math.round(size * 0.72), weight: 600, color: COL.dim, alpha, align: al, spacing: 1.5 });
  }
  tag(x, str, px, py, { color = COL.blue, alpha = 1, size = 26, fg = '#03101f' } = {}) {
    if (alpha <= 0.003) return;
    x.save(); x.font = `800 ${size}px ${F}`; if ('letterSpacing' in x) x.letterSpacing = '2px';
    const w = x.measureText(str).width + 30, h = size + 16;
    x.globalAlpha = alpha; x.fillStyle = color; x.shadowColor = color; x.shadowBlur = 14;
    x.beginPath(); x.roundRect(px - w / 2, py - h / 2, w, h, h / 2); x.fill();
    x.shadowBlur = 0; x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(str, px + 1, py + 1); x.restore();
  }

  // ------------------------------------------------------------------ overlay
  drawOverlay(x, t) {
    const L47 = this.L47, P = this.P, pose = P.pose;
    const crNow = V.add(L47.cr, pose.shift);
    const tf = this.tubeFrameAt(pose);
    const tubeW = tf.c;
    const hookW = V.add(this.hook, [0, -this.aiNow, 0]);
    const cusp = (ps) => this.p47(ps, L47.tip);
    const apexM = (ps) => this.p47(ps, L47.apexM), apexD = (ps) => this.p47(ps, L47.apexD);

    // ---------- 01: quick uprighting with extrusion — trajectory of the crown and the vertical rise
    {
      const a = win(t, 0.85, 4.7, 0.3, 0.4);
      if (a > 0.003) {
        const s1 = P.s, pts = [];
        for (let i = 0; i <= 24; i++) pts.push(this.proj(cusp(poseLerp(START, END_A, s1 * i / 24))));
        this.dashed(x, pts, { color: COL.white, alpha: a * 0.85 });
        const ext = win(t, 1.6, 4.7, 0.3, 0.4);
        const c = cusp(pose);
        this.force3(x, V.add(c, [-1.5, 1.5, 3]), [0, 1, 0], 7, { color: COL.red, alpha: ext, width: 6, progress: easeOut((t - 1.6) / 0.4) });
        { const q = this.proj(V.add(c, [-1.5, 6, 3])); this.text(x, 'EXTRUSION', q[0] - 22, q[1], { size: 26, color: COL.red, alpha: ext, spacing: 3, align: 'right' }); }
      }
      const ca = VIS.red47(t) * (t < 5 ? 1 : 0);
      if (ca > 0.01) this.contactRing(x, this.contactA, t - 3.25, ca);
    }

    // ---------- 02: part labels on the finished wire
    if (t > 10.3 && t < 14.2 && this.wireWorld) {
      const a = win(t, 10.4, 14.0, 0.4, 0.4), wpts = this.wireWorld, tags = centreLine(this.design, { step: 1, helix: 1, tip: 1, hook: 1 }).tags;
      const pick = (tag, k = 0.5) => { const idx = tags.map((g, i) => (g === tag ? i : -1)).filter((i) => i >= 0); return wpts[idx[Math.floor(idx.length * k)]]; };
      const items = [['tube', 'TUBE END', 'fixed in the molar tube', 70, 120, 10.5], ['helix', 'HELIX', null, -40, -120, 10.9], ['tip', 'TIP-BACK BEND', null, 90, -95, 11.3], ['arm', 'WORKING ARM', null, 60, 95, 11.7], ['hook', 'HOOK', 'point contact on the anchor wire', 40, -110, 12.1]];
      for (const [tag, str, sub, dx, dy, t0] of items) { const p = pick(tag, tag === 'arm' ? 0.55 : 0.5); if (p) this.callout(x, p, str, { dx, dy, alpha: a * smooth((t - t0) / 0.3), size: 24, sub }); }
    }
    // forming marker: soft ring at the bend being formed
    if (t > 6.0 && t < 10.35 && this.wireWorld) {
      const f = S.fab, wpts = this.wireWorld, tags = centreLine(this.design, { step: 1, helix: 1, tip: 1, hook: 1 }).tags;
      for (const [tag, rng] of [['step', f.step], ['helix', f.helix], ['tip', f.arm], ['hook', f.hook]]) {
        const a = win(t, rng[0] - 0.1, rng[1] + 0.1, 0.15, 0.25); if (a < 0.01) continue;
        const idx = tags.map((g, i) => (g === tag ? i : -1)).filter((i) => i >= 0 && i < wpts.length);
        if (!idx.length) continue;
        const p = this.proj(wpts[idx[Math.floor(idx.length / 2)]]);
        x.save(); x.globalAlpha = a * 0.7; x.strokeStyle = '#ffffff'; x.lineWidth = 2; x.setLineDash([3, 6]);
        x.beginPath(); x.arc(p[0], p[1], 46, 0, Math.PI * 2); x.stroke(); x.restore();
      }
      const step = t < f.step[1] + 0.1 ? 'BENDS' : t < f.helix[1] + 0.1 ? 'HELIX' : t < f.arm[1] + 0.1 ? 'WORKING ARM' : 'HOOK';
      const n = { BENDS: '02', HELIX: '03', 'WORKING ARM': '04', HOOK: '05' }[step];
      this.text(x, `${n} · ${step}`, W / 2, 1290, { size: 30, weight: 700, color: COL.dim, alpha: win(t, 6.0, 10.35, 0.3, 0.3), spacing: 5 });
    }
    if (t > 5.25 && t < 6.05) this.text(x, '01 · STRAIGHT WIRE', W / 2, 1290, { size: 30, weight: 700, color: COL.dim, alpha: win(t, 5.3, 6.05, 0.25, 0.2), spacing: 5 });

    // ---------- 03: insertion / activation labels and the first force system
    if (t > 13.9 && t < 22.2) {
      const aL = win(t, 14.2, 21.8, 0.4, 0.5);
      this.callout(x, V.add(tubeW, V.mul(tf.b, 1)), 'MOLAR TUBE', { dx: 50, dy: -190, alpha: aL * win(t, 14.3, 16.2, 0.3, 0.4), size: 24 });
      this.callout(x, this.anchorWirePts[60], 'ANCHOR SEGMENT', { dx: 70, dy: -170, alpha: aL * win(t, 14.6, 17.0, 0.3, 0.4), size: 24, sub: 'rigid rectangular SS wire' });
      // activation: lift arrow at the free end
      const aA = win(t, S.activate[0] - 0.1, S.engage + 0.5, 0.2, 0.4);
      if (aA > 0.01 && this.passiveTip) {
        const pt = this.proj(V.add(this.passiveTip, [0, 0, 2])), ph = this.proj(V.add(hookW, [0, 0, 2]));
        this.arrow(x, [pt[0] + 40, pt[1]], [ph[0] + 40, ph[1] + 20], { color: '#ffffff', width: 4, alpha: aA * 0.9, head: 18 });
        this.text(x, 'ACTIVATION', pt[0] + 60, (pt[1] + ph[1]) / 2, { size: 22, color: COL.dim, alpha: aA, align: 'left', spacing: 3 });
      }
      if (win(t, 15.4, 21.5, 0.4, 0.8) * (this.passiveTip ? 1 : 0) > 0.05)
        this.callout(x, this.passiveTip, 'PASSIVE', { dx: -80, dy: 70, alpha: win(t, 16.4, 21.4, 0.4, 0.6) * 0.9, size: 22, color: COL.dim });
      // engage flash
      const ef = win(t, S.engage - 0.02, S.engage + 0.6, 0.05, 0.5);
      if (ef > 0.01) { const p = this.proj(hookW); x.save(); x.globalAlpha = ef; x.strokeStyle = COL.blue; x.lineWidth = 3; x.beginPath(); x.arc(p[0], p[1], 20 + 40 * (t - S.engage), 0, Math.PI * 2); x.stroke(); x.restore(); }
      // force system appears: moment (blue) on «момент», forces (red) right after «система сил»
      const aM = win(t, WT.moment - 0.05, 22.2, 0.35, 0.4);
      this.moment3(x, crNow, 7, 200, 320, { alpha: aM, progress: easeOut((t - WT.moment) / 0.6), width: 7 });
      const aF = win(t, WT.system + 0.9, 22.2, 0.35, 0.4) * 0.85;
      this.force3(x, V.add(tubeW, V.mul(tf.b, 2)), [0, 1, 0], 7, { color: COL.red, alpha: aF, width: 5, head: 20, progress: easeOut((t - WT.system - 0.9) / 0.4) });
      this.force3(x, V.add(hookW, [0, 0.8, 1.5]), [0, -1, 0], 7, { color: COL.red, alpha: aF, width: 5, head: 20, progress: easeOut((t - WT.system - 1.1) / 0.4) });
    }

    // ---------- 04 / 05: CR, uprighting moment, extrusive force, reciprocal intrusion, trajectories
    const sysA = t >= 22.2 && t < 40.4;
    if (sysA) {
      const fs = forceSystem(L47, pose, hookW);
      const decay = 0.6 + 0.4 * Math.min(1, (this.deflMag ?? this.delta0) / this.delta0);   // force falls as the cantilever deactivates
      const aCR = win(t, 22.6, 40.2, 0.4, 0.5);
      this.dot(x, this.proj(crNow), { alpha: aCR, r: 9 });
      if (t < 27) this.callout(x, crNow, 'CR', { dx: 150, dy: 190, color: COL.gold, alpha: win(t, 22.8, 26.6, 0.3, 0.4), size: 26, sub: '≈ 0.45 root length from the crest' });
      const aM = win(t, WT.upMoment - 0.05, 40.2, 0.35, 0.5) * (t > 32.2 ? 0.55 : 1);
      this.moment3(x, crNow, 7.5, 205, 330, { alpha: aM, progress: easeOut((t - WT.upMoment) / 0.6), width: 7 + 2 * win(t, WT.upMoment, WT.upMoment + 1.4, 0.2, 0.4) });
      if (aM > 0.02 && t < 32.2) this.text(x, 'M', ...this.proj(V.add(crNow, [-9.2, -6.5, 0])).slice(0, 2), { size: 30, weight: 800, color: COL.blue, alpha: aM });
      const aE = win(t, WT.extrusive - 0.05, 40.2, 0.3, 0.5);
      const big = 1 + 0.5 * win(t, 33.2, 39.8, 0.6, 0.6);              // 05: the vertical component is emphasised
      this.force3(x, V.add(tubeW, V.mul(tf.b, 2)), [0, 1, 0], 7 * decay * big, { color: COL.red, alpha: aE, width: 6 + 3 * (big - 1) * 2, progress: easeOut((t - WT.extrusive) / 0.45) });
      if (t > 33.2) this.text(x, 'Fv', ...this.proj(V.add(tubeW, [2.5, 7 * decay * big + 2, 2])).slice(0, 2), { size: 34, weight: 800, color: COL.red, alpha: win(t, 33.4, 39.8, 0.3, 0.5) });
      const aI = win(t, WT.intrusive - 0.05, 40.2, 0.3, 0.5);
      this.force3(x, V.add(hookW, [0, 0.8, 1.5]), [0, -1, 0], 7 * decay, { color: COL.red, alpha: aI, width: 6, into: false, progress: easeOut((t - WT.intrusive) / 0.45) });
      // reactive intrusion distributed over the anchor teeth (small arrows on 43–45 crowns)
      const aD = win(t, WT.anchor, 40.2, 0.4, 0.5) * 0.75;
      for (const n of ['L43', 'L44', 'L45']) this.force3(x, V.add(this.M[n].tip, [0, 2.5 - anchorIntrusionAt(t), 0]), [0, -1, 0], 3.2, { color: COL.red, alpha: aD, width: 4, head: 15 });
      // trajectories of the crown and the roots (dashed), start ghost is in 3D
      const aT = win(t, 26.4, 40.0, 0.5, 0.5);
      if (aT > 0.01) {
        const traj = (fn) => { const pts = []; for (let i = 0; i <= 30; i++) pts.push(this.proj(fn(poseLerp(START, END_A, P.s * i / 30)))); return pts; };
        this.dashed(x, traj(cusp), { color: COL.white, alpha: aT, width: 3.5 });
        this.dashed(x, traj(apexM), { color: COL.white, alpha: aT * 0.8, width: 3 });
        this.dashed(x, traj(apexD), { color: COL.white, alpha: aT * 0.8, width: 3 });
        if (t > 28.4 && t < 32.4) {
          this.callout(x, cusp(pose), 'CROWN', { dx: -100, dy: -60, alpha: win(t, 28.5, 32.2, 0.3, 0.4), size: 22 });
          this.callout(x, apexD(pose), 'ROOTS', { dx: -100, dy: 60, alpha: win(t, 28.9, 32.2, 0.3, 0.4), size: 22 });
        }
        // centre of rotation ≠ CR (rotation about the CR + extrusive translation)
        const aC = win(t, 29.0, 32.6, 0.4, 0.4);
        if (aC > 0.01) {
          const dth = (END_A.theta - START.theta) * DEG, crot = V.add(crNow, [-(END_A.shift[1] - START.shift[1]) / dth, 0, 0]);
          const p = this.proj(crot);
          x.save(); x.globalAlpha = aC; x.strokeStyle = '#ffffff'; x.lineWidth = 3;
          x.beginPath(); x.moveTo(p[0] - 9, p[1] - 9); x.lineTo(p[0] + 9, p[1] + 9); x.moveTo(p[0] + 9, p[1] - 9); x.lineTo(p[0] - 9, p[1] + 9); x.stroke(); x.restore();
          this.callout(x, crot, 'CENTER OF ROTATION ≠ CR', { dx: 110, dy: 170, alpha: aC, size: 20, color: COL.white });
        }
      }
      // 05: occlusal plane and the step at 47
      const aP = win(t, WT.vertical - 0.1, 39.8, 0.4, 0.5);
      if (aP > 0.01) {
        const a44 = V.add(this.M.L44.tip, [0, -anchorIntrusionAt(t), 0]), a45 = V.add(this.M.L45.tip, [0, -anchorIntrusionAt(t), 0]);
        const dir = V.norm(V.sub(a44, a45));
        const ext0 = V.add(a45, V.mul(dir, -28)), ext1 = V.add(a44, V.mul(dir, 10));
        this.dashed(x, [this.proj(ext1), this.proj(ext0)], { color: COL.white, alpha: aP * 0.9, width: 2.5, dash: [6, 8] });
        this.text(x, 'OCCLUSAL PLANE', ...this.proj(V.add(ext0, [6, 2.2, 0])).slice(0, 2), { size: 20, color: COL.white, alpha: aP, align: 'left', spacing: 3 });
        const c = cusp(pose), onPlane = V.add(a45, V.mul(dir, (c[0] - a45[0]) / dir[0]));
        this.arrow(x, this.proj([c[0] - 4, onPlane[1], c[2] + 3]), this.proj([c[0] - 4, c[1], c[2] + 3]), { color: COL.red, width: 4, alpha: aP, head: 14 });
      }
      // 05: interference at contact
      const ca = VIS.red47(t) * (t > 30 ? 1 : 0);
      if (ca > 0.01) { this.contactRing(x, this.contactA, t - 38.15, ca); this.callout(x, this.contactA, 'PREMATURE CONTACT', { dx: 70, dy: -150, color: COL.red, alpha: ca, size: 24 }); }
      // 05: slow motion marker
      const sm = win(t, 32.2, 35.2, 0.3, 0.5);
      this.text(x, '0.25×', 980, 1210, { size: 26, weight: 800, color: COL.dim, alpha: sm * 0.8, align: 'right', spacing: 2 });
    }

    // ---------- 06: skeletal anchorage — compensation of the vertical component
    if (this.dc && this.mode === 'remap' && t < 52.2) { const ok = win(t, 50.7, 52.2, 0.15, 0.6); if (ok > 0.01) this.contactRing(x, this.contactB, t - 50.7, ok, COL.green); }
    if (t > 40.6 && t < 51.4 && !this.dc) {
      const fsB = forceSystem(L47, pose, hookW, this.screwHead.toArray(), 1.08);
      const scrA = win(t, S.screw[0] + 0.3, 50.9, 0.3, 0.5);
      this.callout(x, this.screwHead.toArray(), 'MINISCREW', { dx: -70, dy: -150, alpha: scrA * win(t, 41.4, 46.0, 0.3, 0.5), size: 24, sub: 'buccal shelf · outside the roots' });
      const tubeHookW = this.p47(pose, this.tubeHook0);
      const sc = 7.2;                                         // mm per unit force (drawing scale)
      const aE = win(t, 42.9, 50.9, 0.3, 0.5);
      // extrusive (red) from the cantilever, intrusive (blue) from the elastic, resultant (white)
      this.force3(x, V.add(tubeW, V.mul(tf.b, 2)), [0, 1, 0], sc, { color: COL.red, alpha: aE * 0.95, width: 6, progress: easeOut((t - 42.9) / 0.4) });
      const aI = win(t, WT.compensate - 0.05, 50.9, 0.3, 0.5);
      const fs = fsB.Fs, fl = V.len(fs);
      this.force3(x, tubeHookW, fs, Math.min(sc * fl, 10.5), { color: COL.blue, alpha: aI, width: 6, progress: easeOut((t - WT.compensate) / 0.45) });
      // vertical component of the elastic (projection), compensating Fv
      const aV = win(t, WT.compensate + 0.6, 50.9, 0.3, 0.5);
      this.force3(x, V.add(tubeHookW, [2.4, 0, 2.2]), [0, -1, 0], sc * Math.abs(fs[1]), { color: COL.blue, alpha: aV * 0.85, width: 4, head: 16 });
      const aR = win(t, 44.2, 50.9, 0.3, 0.5);
      const sumP = this.proj(V.add(tubeW, [3, 9.5, 2]));
      this.text(x, 'ΣFv ≈ 0', sumP[0] - 70, sumP[1] - 10, { size: 32, weight: 800, color: COL.white, alpha: aR, align: 'right' });
      this.text(x, 'depends on magnitude & direction', sumP[0] - 70, sumP[1] + 22, { size: 18, weight: 600, color: COL.dim, alpha: aR, align: 'right', spacing: 1 });
      // CR + uprighting moment kept; ΔM from the elastic's line of action
      const aCR = win(t, 42.6, 50.9, 0.3, 0.5);
      this.dot(x, this.proj(crNow), { alpha: aCR, r: 8 });
      this.moment3(x, crNow, 7.5, 205, 330, { alpha: aCR * 0.95, progress: easeOut((t - 42.6) / 0.6), width: 7 });
      const aL = win(t, 44.0, 47.4, 0.4, 0.5);
      if (aL > 0.01) {
        const u = fsB.u, a = V.add(tubeHookW, V.mul(u, -8)), b = V.add(tubeHookW, V.mul(u, 14));
        this.dashed(x, [this.proj(a), this.proj(b)], { color: COL.white, alpha: aL * 0.8, width: 2, dash: [5, 7] });
        // perpendicular from the CR to the line of action (sagittal)
        const r = V.sub(crNow, tubeHookW), u2 = V.norm([u[0], u[1], 0]), foot = V.add(tubeHookW, V.mul(u2, r[0] * u2[0] + r[1] * u2[1]));
        this.dashed(x, [this.proj(crNow), this.proj([foot[0], foot[1], crNow[2]])], { color: COL.gold, alpha: aL, width: 2.5, dash: [3, 5] });
        this.text(x, 'ΔM = F · d', ...this.proj(V.add(V.lerp(crNow, foot, 0.5), [1.5, -3.5, 0])).slice(0, 2), { size: 24, weight: 800, color: COL.gold, alpha: aL, align: 'left' });
      }
      // controlled trajectories (green)
      const aT = win(t, 45.2, 51.2, 0.4, 0.4);
      if (aT > 0.01 && P.scen === 'B') {
        const traj = (fn) => { const pts = []; for (let i = 0; i <= 30; i++) pts.push(this.proj(fn(poseLerp(START, END_B, P.s * i / 30)))); return pts; };
        this.dashed(x, traj(cusp), { color: COL.green, alpha: aT, width: 4, glow: true });
        this.dashed(x, traj(apexM), { color: COL.green, alpha: aT * 0.85, width: 3, glow: true });
        this.dashed(x, traj(apexD), { color: COL.green, alpha: aT * 0.85, width: 3, glow: true });
      }
      // still-present reactive intrusion on the anchor segment (faded)
      this.force3(x, V.add(hookW, [0, 0.8, 1.5]), [0, -1, 0], 5, { color: COL.red, alpha: 0.45 * win(t, 43.2, 50.9, 0.4, 0.5), width: 4, head: 16 });
      const ok = win(t, 50.7, 52.2, 0.15, 0.6);
      if (ok > 0.01) this.contactRing(x, this.contactB, t - 50.7, ok, COL.green);
    }

    // ---------- 07: final result — overlay of start / extrusive end / controlled end
    if (t > 51.0 && t < 57.6) {
      const a = win(t, 51.3, 57.5, 0.5, 0.5);
      const axisLine = (ps, len0, len1) => { const c = V.add(L47.cr, ps.shift), d = applyDir(ps, L47.axis); return [this.proj(V.add(c, V.mul(d, -len0))), this.proj(V.add(c, V.mul(d, len1)))]; };
      const [s0, s1] = axisLine(START, 9, 17), [e0, e1] = axisLine(END_B, 9, 17);
      this.dashed(x, [s0, s1], { color: '#dff4ff', alpha: a * 0.9, width: 3, dash: [10, 8] });
      x.save(); x.globalAlpha = a; x.strokeStyle = COL.green; x.lineWidth = 4.5; x.shadowColor = COL.green; x.shadowBlur = 12;
      x.beginPath(); x.moveTo(...e0.slice(0, 2)); x.lineTo(...e1.slice(0, 2)); x.stroke(); x.restore();
      // angle arc between the long axes (about the CR)
      const crB = V.add(L47.cr, END_B.shift), aa = win(t, 51.8, 57.4, 0.4, 0.5);
      const angS = 90 + START.theta + Math.atan2(L47.axis[1], L47.axis[0]) / DEG - 90, angE = 90 + END_B.theta + Math.atan2(L47.axis[1], L47.axis[0]) / DEG - 90;
      this.moment3(x, crB, 12, angS, angE, { color: COL.green, alpha: aa, width: 4, head: 16, progress: easeOut((t - 51.8) / 0.8) });
      this.callout(x, V.add(crB, V.mul(applyDir(END_B, L47.axis), 15)), 'LONG AXIS', { dx: -150, dy: -70, color: COL.green, alpha: aa * win(t, 52.0, 57.4, 0.3, 0.5), size: 24, sub: 'tipping corrected' });
      // crown and root displacement
      const ad = win(t, 52.4, 57.4, 0.4, 0.5);
      this.arrow(x, this.proj(cusp(START)), this.proj(cusp(END_B)), { color: COL.green, width: 5, alpha: ad, head: 18, progress: easeOut((t - 52.4) / 0.6) });
      this.arrow(x, this.proj(apexD(START)), this.proj(apexD(END_B)), { color: COL.green, width: 4, alpha: ad, head: 16, progress: easeOut((t - 52.7) / 0.6) });
      { const q = this.proj(V.add(cusp(START), [2.5, 1.5, 0])); this.text(x, 'CROWN → DISTAL', q[0] + 16, q[1], { size: 20, color: COL.green, alpha: ad * win(t, 52.6, 57.4, 0.3, 0.5), spacing: 2, align: 'left' }); }
      this.text(x, 'ROOTS → MESIAL', ...this.proj(V.add(apexD(START), [1, -4.2, 0])).slice(0, 2), { size: 20, color: COL.green, alpha: ad * win(t, 52.9, 57.4, 0.3, 0.5), spacing: 2 });
      // legend: start (white) · cantilever only (red) · controlled (green)
      const al = win(t, 51.6, 57.4, 0.4, 0.5);
      const items = [['#dff4ff', 'START'], [COL.red, 'CANTILEVER ONLY'], [COL.green, 'VERTICAL CONTROL']];
      items.forEach(([c, s], i) => {
        const y = 1290 + i * 38;
        x.save(); x.globalAlpha = al; x.fillStyle = c; x.shadowColor = c; x.shadowBlur = 10; x.beginPath(); x.roundRect(110, y - 7, 34, 14, 7); x.fill(); x.restore();
        this.text(x, s, 160, y, { size: 22, weight: 700, color: c === '#dff4ff' ? COL.white : c, alpha: al, align: 'left', spacing: 3 });
      });
    }
    // invitation to discuss under the question (lands after the last word, holds into the outro dissolve)
    {
      const a = win(t, WT.question + 1.35, 57.6, 0.45, 0.6);
      if (a > 0.003) {
        this.text(x, 'SHARE YOUR CLINICAL VIEW', W / 2, 560 + (1 - easeOut((t - WT.question - 1.35) / 0.5)) * 12, { size: 30, weight: 800, color: COL.green, alpha: a, spacing: 6 });
        this.text(x, 'IN THE COMMENTS', W / 2, 600 + (1 - easeOut((t - WT.question - 1.5) / 0.5)) * 12, { size: 24, weight: 700, color: '#d7e6f3', alpha: a * smooth((t - WT.question - 1.5) / 0.4), spacing: 6 });
      }
    }
    // qualitative disclaimer & anatomy attribution
    const dA = Math.max(win(t, 22.6, 51.0, 0.5, 0.5), win(t, 51.4, 57.2, 0.5, 0.4));
    this.text(x, 'QUALITATIVE BIOMECHANICS · NOT A FINITE-ELEMENT SIMULATION', W / 2, 1560, { size: 17, weight: 600, color: COL.dim, alpha: dA * 0.75, spacing: 2 });
    this.text(x, 'Anatomy: Z-Anatomy / BodyParts3D © DBCLS · CC BY-SA 4.0', W / 2, 1585, { size: 15, weight: 500, color: COL.dim, alpha: win(t, 51.4, 57.2, 0.5, 0.4) * 0.65, spacing: 1 });
  }

  contactRing(x, p3, u, a, color = COL.red) {
    const p = this.proj(p3);
    x.save();
    for (let k = 0; k < 2; k++) {
      const uu = ((u + k * 0.35) % 0.9 + 0.9) % 0.9;
      x.globalAlpha = a * (1 - uu / 0.9) * 0.9; x.strokeStyle = color; x.lineWidth = 3; x.shadowColor = color; x.shadowBlur = 16;
      x.beginPath(); x.arc(p[0], p[1], 14 + uu * 60, 0, Math.PI * 2); x.stroke();
    }
    x.globalAlpha = a; x.fillStyle = color; x.shadowBlur = 20; x.beginPath(); x.arc(p[0], p[1], 7, 0, Math.PI * 2); x.fill();
    x.restore();
  }

  drawSubtitle(x, t) {
    const cue = (this.dc ? SUBS_DC : SUBS).find((c) => t >= c[0] && t < c[1]);
    if (!cue || t >= OUTRO_T0 + (this.dc ? EDIT.d : 0)) return;
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
  kwColor(c) { return { blue: COL.blue, white: '#ffffff', gold: COL.gold, red: COL.red, green: COL.green }[c]; }
  drawKeywords(x, t) {
    for (const k of KEYWORDS) {
      const s = keywordState(k, t), sk = kickerState(k, t);
      if (!s && !sk) continue;
      this.drawOneKeyword(x, k, s, sk);
    }
  }
  drawOneKeyword(x, k, s, sk) {
    {
      const cx0 = W / 2, cy0 = k.place === 'mid' ? 380 : (k.kicker ? 380 : 345);
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
  }
  mixColor(a, b, u) {
    const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const A = p(a), B = p(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * u)).join(',')})`;
  }

  grab(type = 'image/jpeg', q = 0.95) { return this.out.toDataURL(type, q); }
}
