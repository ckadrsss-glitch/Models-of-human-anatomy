// ============================================================================
//  Film renderer: Three.js scene (Z-Anatomy upper dentition as 14 separate teeth,
//  translucent alveolar bone and gingiva that follow the teeth, lower jaw and a
//  schematic soft-tissue envelope for the hook) + 2D overlay (titles, vectors,
//  subtitles, brand outro) composited into one 1080×1920 canvas that is shown,
//  recorded and exported.
// ============================================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BRAND, backgroundCanvas, drawLogo } from './brand.js';
import { DURATION, FPS, OUTRO_T0, SUBS, SCHEDULE, VIS, TEXT, IPR_MM, storyAt, cameraAt, clamp01, smooth, lerp, ramp, win, easeOut } from './timeline.js';
import { buildModel, poseAt, startPose, apply, V } from './model.js';
import { KEYWORDS, KW, SYNC, keywordState, kickerState, noteState, focusLevel, activeStem } from './kinetic.js';

const W = BRAND.width, H = BRAND.height;
const F = BRAND.font;
const COL = {
  cyan: '#58dfff',           // space / movement vectors
  accent: BRAND.colors.accent, // brand turquoise
  red: '#ff5a4e',            // problem: protruded anterior teeth, "no space"
  white: '#ffffff',
  dim: '#a9c1d2',            // secondary typography
  gold: '#ffd28a',
};
const DEG = Math.PI / 180;

// Visual treatments (same geometry, timing, camera and text):
//   A — Original Dark: brand background unchanged; refined enamel, lighting and typography.
//   B — Enhanced Dark: + subtle radial illumination behind the model, stronger cyan rim, a little more contrast.
export const LOOKS = {
  A: { glow: 0, rim: 2.6, rim2: 1.4, rimColor: 0x9fd0ff, exposure: 1.0, edge: 0.16, key: 2.5, front: 0.45, env: 0.55 },
  B: { glow: 1, rim: 3.9, rim2: 2.2, rimColor: 0x8fe4ff, exposure: 1.12, edge: 0.22, key: 3.0, front: 0.95, env: 0.68 },
};

/** brand background, optionally with a very soft radial light behind the model (variant B) */
let _bgB = null;
function lookBackground(look) {
  if (!look.glow) return backgroundCanvas();
  if (_bgB) return _bgB;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.drawImage(backgroundCanvas(), 0, 0);
  const g = x.createRadialGradient(W * 0.5, H * 0.43, 0, W * 0.5, H * 0.43, W * 0.78);
  // V4: central region ≈ 15 % brighter than V2 (measured on the frame centre), edges unchanged
  g.addColorStop(0, 'rgba(21,52,78,0.97)');      // between #102A40 and the cyan accent, low saturation
  g.addColorStop(0.5, 'rgba(18,46,70,0.40)');
  g.addColorStop(1, 'rgba(16,42,64,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const g2 = x.createRadialGradient(W * 0.5, H * 0.43, 0, W * 0.5, H * 0.43, W * 0.42);
  g2.addColorStop(0, 'rgba(88,223,255,0.075)'); g2.addColorStop(1, 'rgba(88,223,255,0)');
  x.fillStyle = g2; x.fillRect(0, 0, W, H);
  _bgB = c; return c;
}

/** brand-kit outro (same timings as brand.js drawOutro) over the film's own background */
function outro(ctx, u, bg) {
  if (u <= 0) return;
  const e = (v) => { const k = Math.min(1, Math.max(0, v)); return k * k * (3 - 2 * k); };
  ctx.save(); ctx.globalAlpha = e(u / 0.9); ctx.drawImage(bg, 0, 0, W, H); ctx.restore();
  drawLogo(ctx, W / 2, H * 0.455, { circleA: e((u - 0.55) / 0.8), wordA: e((u - 1.15) / 0.8) });
}

// ---------------------------------------------------------------------------- shaders
const SKIN_VS = /* glsl */`
uniform mat4 uTooth[14];
attribute vec2 aSkinI; attribute vec2 aSkinW;
vec3 skinP(vec3 p){
  int i0 = int(aSkinI.x + 0.5), i1 = int(aSkinI.y + 0.5);
  float w0 = aSkinW.x, w1 = aSkinW.y;
  return p * (1.0 - w0 - w1) + (uTooth[i0] * vec4(p, 1.0)).xyz * w0 + (uTooth[i1] * vec4(p, 1.0)).xyz * w1;
}
vec3 skinN(vec3 n){
  int i0 = int(aSkinI.x + 0.5), i1 = int(aSkinI.y + 0.5);
  float w0 = aSkinW.x, w1 = aSkinW.y;
  return normalize(n * (1.0 - w0 - w1) + mat3(uTooth[i0]) * n * w0 + mat3(uTooth[i1]) * n * w1);
}`;

/** translucent tissue: fresnel rim + soft wrap lighting; optional skinning to the teeth */
function tissueMaterial({ color, rim, base = 0.1, rimA = 0.5, skinned = false, cropY = null, cropSoft = 6, light = 0.6, side = THREE.DoubleSide, aoAlpha = false }) {
  const uniforms = {
    uColor: { value: new THREE.Color(color) }, uRim: { value: new THREE.Color(rim) },
    uAlpha: { value: 1 }, uBase: { value: base }, uRimA: { value: rimA }, uLight: { value: light },
    uCropY: { value: cropY ?? 1e4 }, uCropSoft: { value: cropSoft },
    uTooth: { value: Array.from({ length: 14 }, () => new THREE.Matrix4()) },
  };
  return new THREE.ShaderMaterial({
    defines: aoAlpha ? { AO_ALPHA: 1 } : {},
    uniforms, transparent: true, depthWrite: false, side,
    vertexShader: /* glsl */`
      ${skinned ? SKIN_VS : 'uniform mat4 uTooth[14];'}
      attribute float aAO;
      varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vAO;
      void main(){
        vec3 p = ${skinned ? 'skinP(position)' : 'position'};
        vec3 n = ${skinned ? 'skinN(normal)' : 'normal'};
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vW = wp.xyz; vN = normalize(mat3(modelMatrix) * n);
        vV = normalize(cameraPosition - wp.xyz); vAO = aAO;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform vec3 uRim; uniform float uAlpha, uBase, uRimA, uLight, uCropY, uCropSoft;
      varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vAO;
      void main(){
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        float fr = pow(1.0 - abs(dot(n, normalize(vV))), 2.2);
        vec3 L = normalize(vec3(-0.45, 0.75, 0.5));
        float dif = 0.55 + 0.45 * dot(n, L);
        #ifdef AO_ALPHA
        float aoC = 1.0, aoA = vAO;
        #else
        float aoC = vAO, aoA = 1.0;
        #endif
        vec3 c = mix(uColor * (0.55 + uLight * dif) * (0.65 + 0.35 * aoC), uRim, fr * 0.85);
        float crop = 1.0 - smoothstep(uCropY - uCropSoft, uCropY, vW.y);
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
      void main(){ float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
        float a = (0.015 + 0.30*fr) * uAlpha; if (a < 0.003) discard; gl_FragColor = vec4(uColor * a, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** glowing space marker (box with bright edges) */
function gapMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(COL.cyan) }, uAlpha: { value: 0 }, uSize: { value: new THREE.Vector3(1, 1, 1) } },
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    vertexShader: /* glsl */`varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uAlpha; uniform vec3 uSize; varying vec3 vP;
      void main(){
        vec3 q = (0.5 - abs(vP)) * uSize;           // distance to faces in mm
        float e1 = min(min(q.x, q.y), q.z);
        vec3 s = sort3(q);
        float edge = 1.0 - smoothstep(0.0, 0.35, s.y);   // near an edge (two faces close)
        float a = (0.16 + 0.6 * edge) * uAlpha;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.25 * edge), a);
        #include <colorspace_fragment>
      }`.replace('void main(){', 'vec3 sort3(vec3 v){ float a=min(v.x,min(v.y,v.z)); float c=max(v.x,max(v.y,v.z)); float b=v.x+v.y+v.z-a-c; return vec3(a,b,c);} void main(){'),
  });
}

/** teeth: physical material + baked AO, enamel/dentine blend, highlight */
function toothMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.32,
    sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color('#cfe3ff'), envMapIntensity: 0.6 });
  const u = { uTint: { value: new THREE.Color(COL.red) }, uTintAmt: { value: 0 }, uGlow: { value: new THREE.Color(COL.cyan) }, uGlowAmt: { value: 0 },
    uTipY: { value: -1e3 }, uEdge: { value: 0.16 }, uDim: { value: 0 },
    uIprN: { value: new THREE.Vector3(1, 0, 0) }, uIprPlane: { value: 1e3 }, uIprAmt: { value: 0 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAO; attribute float aEnamel; varying float vAO; varying float vEn; varying vec3 vVw; varying vec3 vNw; varying float vLy;\nuniform vec3 uIprN; uniform float uIprPlane; uniform float uIprAmt; varying float vIpr;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvIpr = 0.0; if (uIprAmt > 0.0) { float dI = dot(transformed, uIprN) - uIprPlane; vIpr = uIprAmt * aEnamel * smoothstep(-0.3, 0.02, dI); if (dI > 0.0) transformed -= uIprN * dI; }\nvAO = aAO; vEn = aEnamel; vLy = position.y; vVw = (modelMatrix*vec4(position,1.0)).xyz; vNw = normalize(mat3(modelMatrix)*normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint; uniform float uTintAmt; uniform vec3 uGlow; uniform float uGlowAmt; uniform float uTipY; uniform float uEdge; uniform float uDim; varying float vAO; varying float vEn; varying vec3 vVw; varying vec3 vNw; varying float vLy; varying float vIpr;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 enamel = vec3(0.94, 0.92, 0.88);
        vec3 dentine = vec3(0.86, 0.76, 0.58);
        float en = smoothstep(0.15, 0.85, vEn);
        diffuseColor.rgb = mix(dentine, enamel, en);
        // incisal third of anterior teeth: thinner, translucent enamel (cool grey-blue)
        float inc = en * (1.0 - smoothstep(uTipY + 0.4, uTipY + 3.2, vLy));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.76, 0.81, 0.86), inc * 0.38);
        // contour definition: slightly darker at grazing angles → clearer silhouettes and interproximal boundaries
        float frC = pow(1.0 - abs(dot(normalize(vNw), normalize(cameraPosition - vVw))), 3.0);
        diffuseColor.rgb *= 1.0 - uEdge * frC;
        diffuseColor.rgb = mix(diffuseColor.rgb, uTint, uTintAmt * 0.42);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.88, 1.0), vIpr * 0.55);   // reduced proximal enamel
        diffuseColor.rgb *= 1.0 - 0.24 * uDim;                                          // secondary structures step back`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.6, 0.27, vEn);')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        { float ao = mix(1.0, pow(clamp(vAO*1.05+0.05,0.0,1.0), 1.4), mix(0.75, 0.18, vEn));
          reflectedLight.indirectDiffuse *= ao; reflectedLight.directDiffuse *= mix(1.0, ao, 0.6); reflectedLight.indirectSpecular *= ao; }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float fr = pow(1.0 - abs(dot(normalize(vNw), normalize(cameraPosition - vVw))), 2.0);
          totalEmissiveRadiance += vec3(0.62, 0.70, 0.78) * 0.07 * vEn * pow(fr, 1.5);   // light scattering in the enamel
          totalEmissiveRadiance += uTint * uTintAmt * (0.10 + 0.9*fr);
          totalEmissiveRadiance += uGlow * uGlowAmt * (0.05 + 0.8*fr);
          totalEmissiveRadiance += vec3(0.35, 0.87, 1.0) * vIpr * 0.25; }`);
  };
  m.customProgramCacheKey = () => 'ck-tooth';
  return m;
}

// ---------------------------------------------------------------------------- loader
async function loadDentition(url = 'assets/dentition') {
  const [hdr, buf] = await Promise.all([fetch(url + '.json').then((r) => r.json()), fetch(url + '.bin').then((r) => r.arrayBuffer())]);
  const geos = {};
  for (const m of hdr.meshes) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, m.position[0], m.vertices * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(buf, m.normal[0], m.vertices * 3), 3, true));
    g.setAttribute('aAO', new THREE.BufferAttribute(new Uint8Array(buf, m.ao[0], m.vertices), 1, true));
    g.setAttribute('aEnamel', new THREE.BufferAttribute(new Uint8Array(buf, m.enamel[0], m.vertices), 1, false));
    if (m.skinIndex) {
      g.setAttribute('aSkinI', new THREE.BufferAttribute(new Uint8Array(buf, m.skinIndex[0], m.vertices * 2), 2, false));
      g.setAttribute('aSkinW', new THREE.BufferAttribute(new Uint8Array(buf, m.skinWeight[0], m.vertices * 2), 2, true));
    }
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, m.index[0], m.triangles * 3), 1));
    g.computeBoundingSphere();
    geos[m.name] = g;
  }
  return { hdr, geos };
}

// ---------------------------------------------------------------------------- film
export class Film {
  constructor() {
    this.out = document.createElement('canvas'); this.out.width = W; this.out.height = H;
    this.ctx = this.out.getContext('2d');
    this.subtitles = true;
    this.look = LOOKS.A;
  }

  setLook(id) { this.look = LOOKS[id] || LOOKS.A; }

  async init() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1); r.setSize(W, H, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = this.look.exposure;
    const sc = this.scene = new THREE.Scene();
    this.bgCanvas = lookBackground(this.look);
    const bg = new THREE.CanvasTexture(this.bgCanvas); bg.colorSpace = THREE.SRGBColorSpace;
    sc.background = bg;
    const pm = new THREE.PMREMGenerator(r);
    sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    sc.environmentIntensity = this.look.env;

    // camera + camera-relative soft studio lighting (same look from every angle)
    const cam = this.camera = new THREE.PerspectiveCamera(30, W / H, 5, 3000);
    sc.add(cam);
    const key = new THREE.DirectionalLight(0xfff3e6, this.look.key); key.position.set(-120, 200, 220); cam.add(key); key.target = cam;
    const fill = new THREE.DirectionalLight(0xdfe8ff, 1.1); fill.position.set(220, -40, 160); cam.add(fill); fill.target = cam;
    const rim = new THREE.DirectionalLight(this.look.rimColor, this.look.rim); rim.position.set(140, 160, -260); cam.add(rim); rim.target = cam;
    const rim2 = new THREE.DirectionalLight(0x8fc4ff, this.look.rim2); rim2.position.set(-200, -40, -220); cam.add(rim2); rim2.target = cam;
    const front = new THREE.DirectionalLight(0xffffff, this.look.front); front.position.set(0, 40, 300); cam.add(front); front.target = cam;   // soft frontal light on the enamel
    sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x141018, 0.25));

    const { hdr, geos } = await loadDentition();
    this.model = buildModel(hdr.meshes.filter((m) => m.fdi));
    const T = this.model.teeth;

    // upper teeth (separate meshes, local coordinates around each tooth's centre of resistance)
    this.teeth = T.map((th) => {
      const mat = toothMaterial();
      mat.userData.u.uEdge.value = this.look.edge;
      if (th.k <= 3) mat.userData.u.uTipY.value = th.tip[1] - th.cr[1];
      const mesh = new THREE.Mesh(geos['U' + th.fdi], mat);
      mesh.renderOrder = 1; sc.add(mesh);
      const gmat = ghostMaterial('#8fdcff');
      const ghost = new THREE.Mesh(geos['U' + th.fdi], gmat); ghost.renderOrder = 6; sc.add(ghost);
      // contact points (final pose, world): crown extremes along the arch direction
      const pos = geos['U' + th.fdi].attributes.position, en = geos['U' + th.fdi].attributes.aEnamel;
      let mesP = null, disP = null, best1 = -1e9, best2 = 1e9;
      for (let i = 0; i < pos.count; i++) {
        if (!en.getX(i)) continue;
        const p = [pos.getX(i) + th.cr[0], pos.getY(i) + th.cr[1], pos.getZ(i) + th.cr[2]];
        const d = V.dot(p, th.md);
        if (d > best1) { best1 = d; mesP = p; }
        if (d < best2) { best2 = d; disP = p; }
      }
      mat.userData.u.uIprN.value.set(...th.md);
      return { th, mesh, mat, ghost, gmat, mesP, disP, mesMax: V.dot(V.sub(mesP, th.cr), th.md), M: new THREE.Matrix4(), pose: null };
    });
    this.tByFdi = Object.fromEntries(this.teeth.map((o) => [o.th.fdi, o]));
    this.toothIndex = Object.fromEntries(hdr.meshes.filter((m) => m.fdi).map((m, i) => [m.fdi, i]));

    // translucent alveolar bone (follows the teeth near the roots: remodelling) and gingiva
    this.boneMat = tissueMaterial({ color: '#dfd4c0', rim: '#b5e6ff', base: 0.075, rimA: 0.58, skinned: true, cropY: 23, cropSoft: 8, light: 0.55 });
    this.bone = new THREE.Mesh(geos.maxilla, this.boneMat); this.bone.renderOrder = 4; sc.add(this.bone);
    this.gumMat = tissueMaterial({ color: '#d4777f', rim: '#ffc7c9', base: 0.5, rimA: 0.4, skinned: true, light: 0.8, aoAlpha: true });
    this.gum = new THREE.Mesh(geos.gingiva, this.gumMat); this.gum.renderOrder = 3; sc.add(this.gum);
    // lower jaw (hook only)
    this.mandMat = tissueMaterial({ color: '#d9cdb8', rim: '#bfe2ff', base: 0.06, rimA: 0.4, light: 0.55 });
    this.mand = new THREE.Mesh(geos.mandible, this.mandMat); this.mand.renderOrder = 4; sc.add(this.mand);
    this.lowMat = toothMaterial(); this.lowMat.transparent = true;
    this.low = new THREE.Mesh(geos.lowerteeth, this.lowMat); this.low.renderOrder = 2; sc.add(this.low);
    // schematic soft-tissue envelope (procedural, hook only)
    this.skinMat = tissueMaterial({ color: '#c98e7c', rim: '#ffd9c8', base: 0.55, rimA: 0.4, cropY: 1e4, light: 0.9, side: THREE.FrontSide });
    this.skin = new THREE.Mesh(geos.skin, this.skinMat); this.skin.renderOrder = 8; sc.add(this.skin);

    // space markers between neighbouring teeth (both sides): 17-16, 16-15, 15-14, 14-13
    this.gaps = [];
    for (const q of ['1', '2']) for (const [a, b] of [['6', '7'], ['5', '6'], ['4', '5'], ['3', '4']]) {
      const mat = gapMaterial();
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); m.renderOrder = 7; m.visible = false; sc.add(m);
      const A = this.tByFdi[q + a], B = this.tByFdi[q + b];
      // start-pose separation of the contact points (reference for "extra" space)
      const sA = startPose(A.th), sB = startPose(B.th);
      const L0 = V.dot(V.sub(apply(sA, A.disP), apply(sB, B.mesP)), V.norm(V.add(A.th.md, B.th.md)));
      this.gaps.push({ m, mat, A, B, L0, q, kind: 'std' });
    }
    // 02: extraction space between the canine and the second premolar (first premolar removed)
    for (const q of ['1', '2']) {
      const mat = gapMaterial();
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); m.renderOrder = 7; m.visible = false; sc.add(m);
      this.gaps.push({ m, mat, A: this.tByFdi[q + '3'], B: this.tByFdi[q + '5'], L0: 0.25, q, kind: 'ext' });
    }

    await Promise.all([document.fonts.load(`800 60px ${F}`), document.fonts.load(`700 40px ${F}`), document.fonts.load(`600 30px ${F}`),
      document.fonts.load(`600 30px ${F}`, 'ЗУБЫ'), document.fonts.load(`800 60px ${F}`, 'ЗУБЫ')]);
    for (const t of [0.5, 6.5, 20, 28.5, 40, 48, 53]) this.renderTime(t);   // compile all programs once
    this.buildCards();
  }

  // ------------------------------------------------------------------ frame
  renderFrame(i) { return this.renderTime(i / FPS); }

  renderTime(t) {
    t = Math.min(Math.max(t, 0), DURATION - 1e-6);
    this.t = t;
    const st = this.story = storyAt(t);
    this.applyCamera(t);
    this.renderScene(t, st);
    const x = this.ctx;
    x.globalAlpha = 1;
    // soft dips between demonstrations through the identical background (no see-through artefacts)
    if (st.layer < 0.999) x.drawImage(this.bgCanvas, 0, 0);
    if (st.layer > 0.001) { x.globalAlpha = st.layer; x.drawImage(this.renderer.domElement, 0, 0); x.globalAlpha = 1; }
    this.dim = 1 - 0.6 * focusLevel(t);      // secondary labels step back while a keyword is shown
    this.drawOverlay(x, t, st);
    this.drawKeywords(x, t);
    if (this.subtitles) this.drawSubtitle(x, t);
    if (t >= OUTRO_T0) outro(x, t - OUTRO_T0, this.bgCanvas);
    return this.out;
  }

  /** attention per tooth at time t: glow (cyan / gold), red tint, dim of secondary teeth */
  attention(th, t, st) {
    const S = SCHEDULE, k = th.k, ant = k <= 3;
    let glow = 0, gold = 0, red = 0, dim = 0;
    if (st.scen === 'start' || st.scen === 'dist') {
      if (ant) { red = VIS.redFront(t); glow = 0.8 * VIS.cyanFront(t) + 0.5 * focusLevel(t, 'anterior'); }
      if (st.scen === 'dist') {
        if (k >= 4) { const [a, b] = S.dist[k]; glow = Math.max(win(t, a - 0.2, b + 0.35, 0.3, 0.5), 0.6 * focusLevel(t, 'posterior')); }
        else dim = 0.7 * win(t, 13.0, 21.0, 0.4, 0.6);
      }
    } else if (st.scen === 'ext') {
      if (k === 4) red = 0.85 * win(t, S.ext.highlight - 0.05, S.ext.remove[1], 0.3, 0.3);
      if (ant) glow = 0.75 * win(t, S.ext.retr[0] - 0.3, S.ext.retr[1] + 0.5, 0.5, 0.6);
      if (k >= 5) { gold = 0.6 * TEXT.anchorage(t); dim = 0.4 * win(t, S.ext.retr[0] - 0.3, 35.6, 0.5, 0.4) * (1 - TEXT.anchorage(t)); }
    } else if (st.scen === 'ipr') {
      if (th.fdi === '11' || th.fdi === '21') glow = 0.35 * win(t, 37.1, 46.0, 0.5, 0.5) + 0.3 * focusLevel(t, 'ipr');
      else dim = win(t, 36.2, 46.2, 0.5, 0.4);
    } else {
      if (ant) glow = 0.75 * win(t, S.retr[0] - 0.3, S.retr[1] + 0.5, 0.5, 0.7) + 0.4 * focusLevel(t, 'control');
      else dim = 0.5 * win(t, S.retr[0] - 0.3, 56.8, 0.5, 0.5);
    }
    return { glow: Math.min(1, glow), gold, red, dim };
  }

  /** 3D state of the scene at time t (teeth, tissues, markers) and the WebGL render */
  renderScene(t, st) {
    const P = st.P;
    const ghostP = VIS.ghostPost(t), ghostA = VIS.ghostAnt(t);
    const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _cr = new THREE.Vector3(), _pv = new THREE.Vector3();
    this.teeth.forEach((o, i) => {
      const th = o.th, pose = o.pose = poseAt(th, t, P);
      const extracted = st.scen === 'ext' && th.k === 4;
      _q.setFromAxisAngle(new THREE.Vector3(...pose.axis), pose.angle);
      _cr.set(...th.cr); _pv.set(...pose.pivot);
      _p.copy(_cr).sub(_pv).applyQuaternion(_q).add(_pv).add(new THREE.Vector3(...pose.T));
      o.mesh.position.copy(_p); o.mesh.quaternion.copy(_q);
      o.mesh.updateMatrix();
      // final-world → current-world transform for skinned tissue (the socket stays where the tooth was)
      o.M.copy(o.mesh.matrix).multiply(new THREE.Matrix4().makeTranslation(-th.cr[0], -th.cr[1], -th.cr[2]));
      this.boneMat.uniforms.uTooth.value[i].copy(o.M);
      this.gumMat.uniforms.uTooth.value[i].copy(o.M);
      // 02: schematic removal of the illustrative premolar (moves occlusally and fades)
      const vis = extracted ? 1 - st.removed : 1;
      if (extracted) { o.mesh.position.y -= 4 * st.lift; o.mesh.updateMatrix(); }
      o.mesh.visible = vis > 0.004;
      o.mat.transparent = vis < 0.999; o.mat.opacity = vis; o.mat.depthWrite = vis > 0.5;
      // 03: proximal enamel reduction on 11 | 21 (flat cut at the contact)
      const ipr = (th.fdi === '11' || th.fdi === '21') && st.scen === 'ipr' ? st.ipr : 0;
      o.mat.userData.u.uIprAmt.value = ipr > 0 ? Math.max(ipr, 0.001) : 0;
      o.mat.userData.u.uIprPlane.value = o.mesMax - IPR_MM * ipr;
      // attention
      const at = this.attention(th, t, st);
      o.mat.userData.u.uTintAmt.value = at.red;
      o.mat.userData.u.uGlow.value.set(at.gold > at.glow ? COL.gold : COL.cyan);
      o.mat.userData.u.uGlowAmt.value = Math.max(at.glow * 0.58, at.gold * 0.55);
      o.mat.userData.u.uDim.value = at.dim;
      // ghost of the start position
      const ga = (st.scen === 'dist' && th.k >= 4) ? ghostP : ((st.scen === 'ext' || st.scen === 'retr') && th.k <= 3 ? ghostA : 0);
      const sp = startPose(th);
      const gq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...sp.axis), sp.angle);
      const gp = new THREE.Vector3(...th.cr).sub(new THREE.Vector3(...sp.pivot)).applyQuaternion(gq).add(new THREE.Vector3(...sp.pivot)).add(new THREE.Vector3(...sp.T));
      o.ghost.position.copy(gp); o.ghost.quaternion.copy(gq);
      const moved = Math.min(1, Math.hypot(...V.sub(apply(pose, th.crown), apply(sp, th.crown))) / 0.6);
      const gAlpha = ga * moved;
      o.gmat.uniforms.uAlpha.value = gAlpha;
      o.gmat.uniforms.uColor.value.set('#8fdcff');
      o.ghost.visible = gAlpha > 0.004;
    });

    // tissues
    const lowA = VIS.lower(t);
    this.skin.visible = false;
    this.mandMat.uniforms.uAlpha.value = lowA; this.mand.visible = lowA > 0.003;
    this.lowMat.opacity = lowA; this.low.visible = lowA > 0.003; this.lowMat.depthWrite = lowA > 0.98;
    this.gumMat.uniforms.uAlpha.value = VIS.gingiva(t) / 0.62;
    this.boneMat.uniforms.uAlpha.value = VIS.bone(t);

    // space markers
    const gStd = (st.scen === 'dist' || st.scen === 'retr') ? VIS.gaps(t) : 0;
    const gExt = st.scen === 'ext' ? VIS.extGap(t) * smooth((st.removed - 0.5) / 0.4) : 0;
    for (const g of this.gaps) {
      const gv = g.kind === 'ext' ? gExt : gStd;
      if (gv <= 0.003) { g.m.visible = false; continue; }
      const pa = apply(g.A.pose, g.A.disP), pb = apply(g.B.pose, g.B.mesP);
      const dir = V.norm(V.add(g.A.th.md, g.B.th.md));
      const L = V.dot(V.sub(pa, pb), dir), extra = L - g.L0;
      const a = gv * smooth((extra - 0.12) / 0.5);
      g.m.visible = a > 0.004;
      if (!g.m.visible) continue;
      const mid = V.mul(V.add(pa, pb), 0.5);
      const crownY = (g.A.th.crown[1] + g.B.th.crown[1]) / 2;
      const len = Math.max(0.05, L - 0.25);
      g.m.position.set(mid[0], crownY + 0.6, mid[2]);
      const xAxis = new THREE.Vector3(...dir), yAxis = new THREE.Vector3(0, 1, 0), zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
      g.m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
      const hgt = 6.8, dep = g.A.th.k >= 5 ? 9.5 : 8.6;
      g.m.scale.set(len, hgt, dep);
      g.mat.uniforms.uSize.value.set(len, hgt, dep);
      g.mat.uniforms.uAlpha.value = Math.min(1, a * (1 + 0.9 * focusLevel(t, 'gaps')));
      g.center = [mid[0], crownY + 0.6, mid[2]];
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** 3D snapshots for the summary cards (rendered once, deterministic) */
  buildCards() {
    const spec = [[21.0, 'ДИСТАЛИЗАЦИЯ', '01', [540, 760]], [28.4, 'УДАЛЕНИЕ', '02', [540, 760]], [42.0, 'СЕПАРАЦИЯ · IPR', '03', [540, 900]]];
    this.cards = spec.map(([t, label, num, c]) => {
      const st = storyAt(t); this.applyCamera(t); this.renderScene(t, st);
      const cv = document.createElement('canvas'); cv.width = 300; cv.height = 420;
      const cw = 700, ch = 980;
      cv.getContext('2d').drawImage(this.renderer.domElement, c[0] - cw / 2, c[1] - ch / 2, cw, ch, 0, 0, 300, 420);
      return { cv, label, num };
    });
  }

  applyCamera(t) {
    const c = { ...cameraAt(t) };
    c.dist *= 1 - 0.022 * focusLevel(t);     // gentle push-in towards the active region on each keyword
    const az = c.az * DEG, el = c.el * DEG;
    const dir = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
    const up = [-Math.sin(el) * Math.sin(az), Math.cos(el), -Math.sin(el) * Math.cos(az)];
    const cam = this.camera;
    cam.position.set(c.tgt[0] + dir[0] * c.dist, c.tgt[1] + dir[1] * c.dist, c.tgt[2] + dir[2] * c.dist);
    cam.up.set(...up);
    cam.lookAt(...c.tgt);
    cam.fov = c.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    this.cam = c;
  }

  /** world point → screen px */
  proj(p) {
    const v = new THREE.Vector3(...p).project(this.camera);
    return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, v.z];
  }
  /** current world position of a point given in final-pose coordinates of a tooth */
  at(fdi, p) { const o = this.tByFdi[fdi]; return apply(o.pose, p); }

  // ------------------------------------------------------------------ 2D helpers
  text(x, str, px, py, { size = 40, weight = 700, color = COL.white, alpha = 1, spacing = 0, align = 'center', baseline = 'middle', glow = null, shadow = true } = {}) {
    if (alpha <= 0.003) return;
    x.save();
    x.globalAlpha = alpha; x.fillStyle = color;
    x.font = `${weight} ${size}px ${F}`; x.textAlign = align; x.textBaseline = baseline;
    if ('letterSpacing' in x) x.letterSpacing = `${spacing}px`;
    const tx = align === 'center' ? px + spacing / 2 : px;
    if (glow) { x.shadowColor = glow; x.shadowBlur = 26; x.fillText(str, tx, py); }
    if (shadow) { x.shadowColor = 'rgba(0,6,18,0.85)'; x.shadowBlur = 12; }
    x.fillText(str, tx, py);
    x.restore();
  }

  /** glowing vector a → b (screen px) with arrow head; progress p draws it from a */
  arrow(x, a, b, { color = COL.cyan, width = 5, alpha = 1, head = 22, progress = 1, dash = null, glow = true } = {}) {
    if (alpha <= 0.003 || progress <= 0.001) return;
    const B = [a[0] + (b[0] - a[0]) * progress, a[1] + (b[1] - a[1]) * progress];
    const ang = Math.atan2(B[1] - a[1], B[0] - a[0]);
    const hl = Math.min(head, Math.hypot(B[0] - a[0], B[1] - a[1]) * 0.6);
    const S = [B[0] - Math.cos(ang) * hl * 0.7, B[1] - Math.sin(ang) * hl * 0.7];
    x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
    const pass = (w, c, al, blur) => {
      x.globalAlpha = al; x.strokeStyle = c; x.fillStyle = c; x.lineWidth = w;
      x.shadowColor = c; x.shadowBlur = blur;
      if (dash) x.setLineDash(dash); else x.setLineDash([]);
      x.beginPath(); x.moveTo(...a); x.lineTo(...S); x.stroke();
      x.setLineDash([]);
      x.beginPath(); x.moveTo(...B);
      x.lineTo(B[0] - hl * Math.cos(ang - 0.42), B[1] - hl * Math.sin(ang - 0.42));
      x.lineTo(B[0] - hl * Math.cos(ang + 0.42), B[1] - hl * Math.sin(ang + 0.42));
      x.closePath(); x.fill();
    };
    x.globalCompositeOperation = 'source-over';
    pass(width + 5, 'rgba(0,8,22,1)', alpha * 0.45, 0);
    if (glow) { x.globalCompositeOperation = 'lighter'; pass(width + 6, color, alpha * 0.22, 24); x.globalCompositeOperation = 'source-over'; }
    pass(width, color, alpha, 0);
    x.restore();
  }

  /** curved arrow (moment) around c, radius r, from angle a0 to a1 (rad, screen) */
  arcArrow(x, c, r, a0, a1, { color = COL.cyan, width = 5, alpha = 1, head = 20, progress = 1 } = {}) {
    if (alpha <= 0.003 || progress <= 0.001) return;
    const e = a0 + (a1 - a0) * progress, ccw = a1 < a0;
    const tip = [c[0] + r * Math.cos(e), c[1] + r * Math.sin(e)];
    const tang = e + (ccw ? -Math.PI / 2 : Math.PI / 2);
    x.save(); x.lineCap = 'round';
    for (const [w, col, al, comp, blur] of [[width + 5, 'rgba(0,8,22,1)', 0.45, 'source-over', 0], [width + 6, color, 0.22, 'lighter', 24], [width, color, 1, 'source-over', 0]]) {
      x.globalCompositeOperation = comp; x.globalAlpha = alpha * al; x.strokeStyle = col; x.fillStyle = col; x.lineWidth = w; x.shadowColor = col; x.shadowBlur = blur;
      const eb = e - (ccw ? -1 : 1) * (head * 0.6 / r);
      x.beginPath(); x.arc(c[0], c[1], r, a0, eb, ccw); x.stroke();
      x.beginPath(); x.moveTo(...tip);
      x.lineTo(tip[0] - head * Math.cos(tang - 0.45), tip[1] - head * Math.sin(tang - 0.45));
      x.lineTo(tip[0] - head * Math.cos(tang + 0.45), tip[1] - head * Math.sin(tang + 0.45));
      x.closePath(); x.fill();
    }
    x.restore();
  }

  dot(x, p, { r = 9, color = COL.accent, alpha = 1 } = {}) {
    if (alpha <= 0.003) return;
    x.save(); x.globalAlpha = alpha;
    x.globalCompositeOperation = 'lighter'; x.fillStyle = color; x.shadowColor = color; x.shadowBlur = 30;
    x.beginPath(); x.arc(p[0], p[1], r * 1.6, 0, Math.PI * 2); x.globalAlpha = alpha * 0.35; x.fill();
    x.globalCompositeOperation = 'source-over'; x.shadowBlur = 0; x.globalAlpha = alpha;
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(p[0], p[1], r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = color; x.lineWidth = 3.5; x.beginPath(); x.arc(p[0], p[1], r + 4, 0, Math.PI * 2); x.stroke();
    x.restore();
  }

  /** small rounded tag */
  tag(x, str, px, py, { color = COL.cyan, alpha = 1, size = 28, fg = '#03101f', align = 'center' } = {}) {
    if (alpha <= 0.003) return;
    x.save(); x.font = `700 ${size}px ${F}`; if ('letterSpacing' in x) x.letterSpacing = '2px';
    const w = x.measureText(str).width + 30, h = size + 18;
    const x0 = align === 'center' ? px - w / 2 : align === 'left' ? px : px - w;
    x.globalAlpha = alpha; x.fillStyle = color; x.shadowColor = color; x.shadowBlur = 18;
    x.beginPath(); x.roundRect(x0, py - h / 2, w, h, h / 2); x.fill();
    x.shadowBlur = 0; x.fillStyle = fg; x.textAlign = 'left'; x.textBaseline = 'middle';
    x.fillText(str, x0 + 16, py + 1);
    x.restore();
  }

  // ------------------------------------------------------------------ overlay
  drawOverlay(x, t, st) {
    const M = this.model.byFdi;
    const S = SCHEDULE;

    // ---- 01 hook: stylised horse-incisor comparison (≈ 0.9 s), then back to the human dentition
    const hz = TEXT.horse(t);
    if (hz > 0) this.drawHorse(x, hz, t);

    // ---- 02 the real problem: planned retraction direction + where the space would be needed
    const pr = TEXT.plannedRetr(t);
    if (pr > 0) {
      const c = V.mul(V.add(this.at('11', M['11'].tip), this.at('21', M['21'].tip)), 0.5);
      const a = this.proj(V.add(c, [0, 0, 5])), b = this.proj(V.add(c, [0, 0, -11]));
      this.arrow(x, a, b, { color: COL.cyan, width: 9, head: 34, alpha: pr * 0.72, progress: easeOut((t - 6.0) / 0.9) });
    }
    const sz = TEXT.spaceZone(t);
    if (sz > 0) {
      const grow = easeOut((t - SYNC.space) / 0.8);
      for (const q of ['1', '2']) {
        const A = this.tByFdi[q + '3'], B = this.tByFdi[q + '4'];
        const c = this.proj(V.mul(V.add(apply(A.pose, A.disP), apply(B.pose, B.mesP)), 0.5));
        x.save(); x.globalAlpha = sz * 0.85; x.strokeStyle = COL.cyan; x.lineWidth = 4; x.setLineDash([10, 8]);
        x.shadowColor = COL.cyan; x.shadowBlur = 18;
        x.beginPath(); x.ellipse(c[0], c[1], 26 + 26 * grow, 40 + 18 * grow, 0, 0, Math.PI * 2); x.stroke();
        x.globalAlpha = sz * 0.12 * grow; x.fillStyle = COL.cyan; x.fill(); x.restore();
      }
    }

    // ---- 03 distalisation: per-tooth distal vectors, sequence, anatomical limit, before / after
    const da = TEXT.distArrows(t);
    if (da > 0) {
      for (const k of [7, 6, 5, 4]) {
        const [a, b] = S.dist[k];
        const w = win(t, a - 0.15, b + 0.25, 0.3, 0.4);
        if (w <= 0) continue;
        for (const q of ['1', '2']) {
          const th = M[q + k];
          const c = this.at(q + k, th.crown);
          const s0 = this.proj(V.add(c, V.mul(th.f, 9.5)));
          const s1 = this.proj(V.add(V.add(c, V.mul(th.f, 9.5)), V.mul(th.md, -6.5)));
          this.arrow(x, s0, s1, { color: COL.cyan, width: 6, head: 22, alpha: da * w, progress: easeOut((t - a + 0.15) / 0.6) });
        }
      }
    }
    const sp = TEXT.stepper(t);
    if (sp > 0) {
      const keys = [7, 6, 5, 4], y = 1250, gap = 160, x0 = W / 2 - gap * 1.5;
      keys.forEach((k, i) => {
        const [a, b] = S.dist[k];
        const active = win(t, a - 0.1, b + 0.1, 0.25, 0.25), done = t > b ? 1 : 0, px = x0 + i * gap;
        x.save(); x.globalAlpha = sp * this.dim;
        x.strokeStyle = active > 0.5 ? COL.cyan : done ? 'rgba(88,223,255,0.75)' : 'rgba(169,193,210,0.4)';
        x.lineWidth = 4; x.beginPath(); x.arc(px, y, 44, 0, Math.PI * 2); x.stroke();
        if (active > 0.01) { x.globalAlpha = sp * active * 0.9 * this.dim; x.fillStyle = COL.cyan; x.shadowColor = COL.cyan; x.shadowBlur = 24; x.beginPath(); x.arc(px, y, 44, 0, Math.PI * 2); x.fill(); }
        x.restore();
        this.text(x, String(k), px, y + 2, { size: 46, weight: 800, alpha: sp * this.dim, color: active > 0.5 ? '#03101f' : done ? COL.cyan : COL.dim, shadow: false });
        if (i < 3) this.text(x, '→', px + gap / 2, y, { size: 34, weight: 700, alpha: sp * 0.6 * this.dim, color: COL.dim, shadow: false });
      });
      this.text(x, 'схема · последовательность и объём — по плану лечения', W / 2, y + 86, { size: 28, weight: 500, alpha: sp * 0.85 * this.dim, color: COL.dim });
    }
    const tb = TEXT.tuberosity(t);
    if (tb > 0) {
      for (const q of ['1', '2']) {
        const th = M[q + '7'];
        const back = (th.bmax[2] - th.bmin[2]) / 2 + 2.5, pts = [];
        for (let s = -1; s <= 1.001; s += 0.1) pts.push(this.proj(V.add(V.add(th.crown, V.mul(th.md, -back)), V.mul(th.f, s * 7.5))));
        x.save(); x.globalAlpha = tb * 0.85; x.strokeStyle = COL.gold; x.lineWidth = 4; x.setLineDash([10, 10]); x.lineCap = 'round';
        x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(...p) : x.moveTo(...p))); x.stroke(); x.restore();
      }
      const l1 = this.proj(V.add(M['17'].crown, V.mul(M['17'].md, -6))), l2 = this.proj(V.add(M['27'].crown, V.mul(M['27'].md, -6)));
      this.text(x, 'анатомическая граница', (l1[0] + l2[0]) / 2, (l1[1] + l2[1]) / 2 - 10, { size: 32, weight: 600, alpha: tb * 0.95 * this.dim, color: COL.gold });
    }
    const ba = TEXT.beforeAfter(t);
    if (ba > 0) {
      x.save(); x.globalAlpha = ba; x.strokeStyle = '#8fdcff'; x.lineWidth = 3; x.setLineDash([6, 6]);
      x.beginPath(); x.roundRect(W / 2 - 330, 1236, 46, 30, 8); x.stroke(); x.restore();
      this.text(x, 'контур — исходное положение', W / 2 - 270, 1252, { size: 32, weight: 600, alpha: ba, color: COL.dim, align: 'left' });
      x.save(); x.globalAlpha = ba * 0.9; x.fillStyle = COL.cyan; x.beginPath(); x.roundRect(W / 2 - 330, 1296, 46, 30, 8); x.fill(); x.restore();
      this.text(x, 'созданное пространство', W / 2 - 270, 1312, { size: 32, weight: 600, alpha: ba, color: COL.dim, align: 'left' });
    }

    // ---- 04 extraction: canine retraction vectors into the space, anchorage control
    if (st.scen === 'ext') {
      const rw = win(t, S.ext.retr[0] - 0.2, 35.5, 0.4, 0.5);
      if (rw > 0) for (const q of ['1', '2']) {
        const c3 = M[q + '3'], cc = this.at(q + '3', c3.crown);
        const s0 = this.proj(V.add(cc, V.mul(c3.f, 8))), s1 = this.proj(V.add(V.add(cc, V.mul(c3.f, 8)), V.mul(c3.md, -6)));
        this.arrow(x, s0, s1, { color: COL.cyan, width: 6, head: 22, alpha: rw * 0.95, progress: easeOut((t - S.ext.retr[0]) / 0.8) });
      }
      const an = TEXT.anchorage(t);
      if (an > 0) {
        const m6 = M['16'], c6 = this.at('16', m6.crown);
        const a0 = this.proj(V.add(V.add(c6, V.mul(m6.f, 9)), V.mul(m6.md, -2))), a1 = this.proj(V.add(V.add(c6, V.mul(m6.f, 9)), V.mul(m6.md, 5)));
        this.arrow(x, a0, a1, { color: COL.gold, width: 6, head: 22, alpha: an * 0.95 });
        this.tag(x, 'КОНТРОЛЬ ОПОРЫ', W / 2, 1260, { color: COL.gold, alpha: an, size: 34 });
        this.text(x, 'пространство закрывается постепенно', W / 2, 1330, { size: 30, weight: 600, alpha: an * 0.9, color: COL.dim });
      }
    }

    // ---- 05 IPR: magnified contact, small space with a measurement-style indicator (no number)
    if (st.scen === 'ipr') {
      const c11 = this.tByFdi['11'], c21 = this.tByFdi['21'];
      const pa = apply(c11.pose, V.sub(c11.mesP, V.mul(c11.th.md, IPR_MM * st.ipr)));
      const pb = apply(c21.pose, V.sub(c21.mesP, V.mul(c21.th.md, IPR_MM * st.ipr)));
      const A = this.proj(pa), B = this.proj(pb), mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      const ring = win(t, 37.0, 41.0, 0.5, 0.6);
      if (ring > 0) { x.save(); x.globalAlpha = ring * 0.8; x.strokeStyle = COL.cyan; x.lineWidth = 3; x.setLineDash([8, 8]); x.beginPath(); x.arc(mid[0], mid[1], 130, 0, Math.PI * 2); x.stroke(); x.restore(); }
      const ms = TEXT.measure(t);
      if (ms > 0) {
        const y = Math.max(A[1], B[1]) + 150, g = easeOut((t - SYNC.little) / 0.5);
        x.save(); x.globalAlpha = ms; x.strokeStyle = COL.cyan; x.fillStyle = COL.cyan; x.lineWidth = 3; x.shadowColor = COL.cyan; x.shadowBlur = 14;
        x.setLineDash([5, 6]);
        x.beginPath(); x.moveTo(A[0], A[1] + 20); x.lineTo(A[0], y + 16); x.moveTo(B[0], B[1] + 20); x.lineTo(B[0], y + 16); x.stroke();
        x.setLineDash([]);
        const half = (B[0] - A[0]) / 2 * g, cx = mid[0];
        x.beginPath(); x.moveTo(cx - half, y); x.lineTo(cx + half, y); x.stroke();
        for (const [px, d] of [[cx - half, 1], [cx + half, -1]]) { x.beginPath(); x.moveTo(px, y); x.lineTo(px + 12 * d, y - 8); x.lineTo(px + 12 * d, y + 8); x.closePath(); x.fill(); }
        x.restore();
        this.text(x, 'немного места', mid[0], y + 60, { size: 34, weight: 700, alpha: ms * g, color: COL.cyan });
        this.text(x, 'не заменяет удаление при выраженном дефиците места', W / 2, 330, { size: 32, weight: 600, alpha: ms * smooth((t - 42.6) / 0.5) * this.dim, color: COL.dim });
      }
    }

    // ---- 06 conclusion: three methods summary, then controlled anterior retraction
    const cd = TEXT.cards(t);
    if (cd > 0 && this.cards) this.drawCards(x, t, cd);
    const rv = TEXT.retrVec(t);
    if (rv > 0) {
      const run = win(t, S.retr[0] - 0.4, S.retr[1] + 0.3, 0.5, 0.6);
      const th = M['11'], tip = this.proj(this.at('11', th.tip)), apex = this.proj(this.at('11', th.apex));
      const sc_ = this.camScale(), fc = focusLevel(t, 'control');
      this.arrow(x, [tip[0] + 30, tip[1] - 18], [tip[0] - 4.6 * sc_ - 30, tip[1] - 18], { color: COL.cyan, width: 8 + 4 * fc, head: 30 + 8 * fc, alpha: rv * run, progress: easeOut((t - S.retr[0]) / 0.9) });
      this.arrow(x, [apex[0] + 22, apex[1]], [apex[0] - 1.2 * sc_ - 22, apex[1]], { color: COL.accent, width: 5 + 4 * fc, head: 20 + 8 * fc, alpha: rv * run * Math.max(0.95, fc), progress: easeOut((t - S.retr[0] - 0.4) / 0.9) });
      this.text(x, 'коронка', tip[0] - 2.3 * sc_, tip[1] + 40, { size: 34, weight: 600, alpha: rv * run * this.dim, color: COL.cyan });
      this.text(x, 'корень', apex[0] - 0.6 * sc_, apex[1] - 40, { size: 34, weight: 600, alpha: rv * run * this.dim, color: COL.accent });
    }
    const dc = TEXT.disclaimer(t);
    if (dc > 0) this.text(x, 'схема · результат у каждого пациента индивидуален', W / 2, 1330, { size: 30, weight: 600, alpha: dc, color: COL.dim });
  }

  drawCards(x, t, a) {
    const xs = [W / 2 - 330, W / 2, W / 2 + 330], y0 = 640;
    this.cards.forEach((c, i) => {
      const e = smooth((t - (46.7 + i * 0.3)) / 0.45) * a, rise = (1 - easeOut((t - (46.7 + i * 0.3)) / 0.6)) * 30;
      if (e <= 0.003) return;
      const cx = xs[i], cy = y0 + rise, w = 300, h = 420;
      x.save(); x.globalAlpha = e;
      x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 30;
      x.beginPath(); x.roundRect(cx - w / 2, cy, w, h, 22); x.fillStyle = '#071522'; x.fill(); x.shadowBlur = 0;
      x.save(); x.clip(); x.drawImage(c.cv, cx - w / 2, cy, w, h); x.restore();
      x.strokeStyle = 'rgba(88,223,255,0.55)'; x.lineWidth = 2.5; x.stroke();
      x.restore();
      this.text(x, c.num, cx - w / 2 + 22, cy + 34, { size: 30, weight: 800, alpha: e, color: COL.cyan, align: 'left' });
      this.text(x, c.label, cx, cy + h + 44, { size: i === 2 ? 28 : 30, weight: 700, alpha: e, color: '#ffffff' });
    });
  }

  /** stylised, clearly non-human line drawing of a horse head with prominent incisors (hook comparison) */
  drawHorse(x, a, t) {
    const s = 1.35, ox = W / 2 - 300 * s, oy = 640;
    const pop = 0.97 + 0.03 * easeOut((t - 3.0) / 0.3);
    x.save(); x.globalAlpha = a;
    x.fillStyle = 'rgba(4,14,26,0.72)'; x.beginPath(); x.roundRect(W / 2 - 400, oy - 40, 800, 860, 40); x.fill();
    x.translate(W / 2, oy + 400); x.scale(pop, pop); x.translate(-W / 2, -(oy + 400));
    x.translate(ox, oy); x.scale(s, s);
    x.lineJoin = 'round'; x.lineCap = 'round';
    x.strokeStyle = '#e8f4ff'; x.lineWidth = 4 / s * 1.4; x.shadowColor = 'rgba(88,223,255,0.6)'; x.shadowBlur = 10;
    x.beginPath();
    x.moveTo(150, 70); x.bezierCurveTo(190, 40, 230, 60, 260, 90);
    x.bezierCurveTo(330, 160, 420, 250, 480, 330);
    x.bezierCurveTo(520, 380, 545, 405, 548, 432);
    x.bezierCurveTo(550, 452, 540, 460, 528, 462);
    x.moveTo(530, 494); x.bezierCurveTo(538, 508, 522, 526, 495, 528);
    x.bezierCurveTo(430, 532, 360, 515, 300, 480);
    x.bezierCurveTo(230, 440, 190, 420, 170, 380);
    x.bezierCurveTo(150, 340, 140, 300, 120, 280);
    x.moveTo(120, 280); x.bezierCurveTo(90, 360, 70, 450, 60, 600);
    x.moveTo(150, 70); x.bezierCurveTo(110, 120, 70, 220, 20, 330);
    x.moveTo(168, 78); x.lineTo(186, 12); x.lineTo(214, 70);                 // ear
    x.stroke();
    x.beginPath(); x.ellipse(275, 175, 13, 8, -0.3, 0, Math.PI * 2); x.stroke();     // eye
    x.beginPath(); x.arc(512, 410, 9, 0.4, 4.2); x.stroke();                           // nostril
    // prominent incisors (upper and lower), restrained red accent
    x.shadowBlur = 0;
    for (let i = 0; i < 4; i++) {
      x.fillStyle = '#f4efe6'; x.strokeStyle = 'rgba(255,90,78,0.9)'; x.lineWidth = 2.2;
      x.beginPath(); x.roundRect(472 + i * 15, 461, 13.5, 28, 3); x.fill(); x.stroke();
      x.beginPath(); x.roundRect(468 + i * 15, 490, 13.5, 22, 3); x.fill(); x.stroke();
    }
    x.restore();
  }

  /** approximate px per mm at the camera target */
  camScale() { return H / (2 * this.cam.dist * Math.tan(this.cam.fov * DEG / 2)); }

  drawBiomechanics(x, t, a) {
    const M = this.model.byFdi;
    const s = this.camScale();
    // conventional centre of resistance of the anterior segment (lateral projection):
    // mean of the six anterior teeth' CRs (schematic, per tooth ≈ 40 % of the root length from the crest)
    const ids = ['13', '12', '11', '21', '22', '23'];
    let cr = [0, 0, 0];
    ids.forEach((f) => { cr = V.add(cr, this.at(f, M[f].cr)); });
    cr = V.mul(cr, 1 / 6); cr[0] = M['11'].cr[0] - 4;          // keep it in the visible (right) half
    const pc = this.proj(cr);
    // force applied at crown level (attachment / bracket), parallel to the occlusal plane, occlusal to the CR
    const tip = this.at('11', M['11'].crown);
    const fy = tip[1] + 2.0;
    const pf0 = this.proj([cr[0], fy, tip[2] + 3.5]);
    const pf1 = this.proj([cr[0], fy, tip[2] - 12]);
    // ЦС on «контролировать», reaction on the anchorage on «опору», then force, moment, counter-moment
    const T2 = SYNC.control2, TA = SYNC.anchor, TF = TA + 0.8, TM = TA + 1.2, TC = TA + 1.75;
    const k1 = smooth((t - T2) / 0.4), kA = smooth((t - TA) / 0.35), k2 = smooth((t - TF) / 0.5), k3 = smooth((t - TM) / 0.5), k4 = smooth((t - TC) / 0.5);
    const dm = 0.45 + 0.55 * (1 - focusLevel(t, 'anchor'));
    // line of action (extended, dashed) and the retraction vector
    x.save(); x.globalAlpha = a * k2 * 0.6; x.strokeStyle = COL.white; x.lineWidth = 2.5; x.setLineDash([10, 12]);
    x.beginPath(); x.moveTo(pf0[0] + 160, pf0[1]); x.lineTo(pf1[0] - 260, pf1[1]); x.stroke(); x.restore();
    this.arrow(x, pf0, pf1, { color: COL.cyan, width: 8, head: 30, alpha: a * k2, progress: easeOut((t - TF) / 0.5) });
    this.tag(x, 'F', pf1[0] - 34, pf1[1] - 50, { color: COL.cyan, alpha: a * k2, size: 34 });
    // perpendicular distance CR ↔ line of force (moment arm)
    x.save(); x.globalAlpha = a * k2 * 0.8; x.strokeStyle = COL.gold; x.lineWidth = 3; x.setLineDash([6, 8]);
    x.beginPath(); x.moveTo(pc[0], pc[1]); x.lineTo(pc[0], pf0[1]); x.stroke(); x.restore();
    // CR
    this.dot(x, pc, { r: 11, color: COL.accent, alpha: a * k1 });
    this.tag(x, 'ЦС', pc[0] + 66, pc[1] - 8, { color: COL.accent, alpha: a * k1 * dm, size: 34 });
    // tipping tendency (force occlusal to CR → crown lingual, root labial): red moment
    this.arcArrow(x, pc, 120, Math.PI * 0.62, Math.PI * 1.18, { color: COL.red, width: 6, head: 22, alpha: a * k3, progress: easeOut((t - TM) / 0.5) });
    this.tag(x, 'M', pc[0] - 158, pc[1] - 96, { color: COL.red, alpha: a * k3, size: 34, fg: '#fff' });
    // counter-moment (torque control)
    this.arcArrow(x, pc, 168, Math.PI * 1.22, Math.PI * 0.66, { color: COL.accent, width: 6, head: 22, alpha: a * k4, progress: easeOut((t - TC) / 0.5) });
    this.text(x, 'контроль торка', pc[0] - 40, pc[1] - 256, { size: 36, weight: 700, alpha: a * k4, color: COL.accent, align: 'center' });
    // anchorage: the reciprocal force acts on the posterior teeth
    const p5 = this.at('14', M['14'].crown);
    const pa0 = this.proj([p5[0], fy, p5[2] - 2]), pa1 = this.proj([p5[0], fy, p5[2] + 6]);
    const fa = focusLevel(t, 'anchor');
    this.anchorPt = [(pa0[0] + pa1[0]) / 2, pa0[1] + 175];
    this.arrow(x, [pa0[0], pa0[1] + 175], [pa1[0], pa1[1] + 175], { color: COL.gold, width: 5 + 4 * fa, head: 20 + 8 * fa, alpha: a * kA * 0.95, progress: easeOut((t - TA) / 0.45) });
  }

  drawSubtitle(x, t) {
    if (t < 5.3) return;                       // hook: the on-screen titles carry the message
    const cue = SUBS.find((c) => t >= c[0] && t < c[1]);
    if (!cue) return;
    const a = Math.min(smooth((t - cue[0]) / 0.15), smooth((cue[1] - t) / 0.15));
    x.save(); x.font = `600 42px ${F}`;
    const words = cue[2].split(' '), lines = []; let cur = '';
    for (const w of words) { const s = cur ? cur + ' ' + w : w; if (x.measureText(s).width > 860 && cur) { lines.push(cur); cur = w; } else cur = s; }
    lines.push(cur);
    const lh = 56, y0 = 1560 - lines.length * lh;
    const wmax = Math.max(...lines.map((l) => x.measureText(l).width));
    x.globalAlpha = a * 0.62; x.fillStyle = '#02060d';
    x.beginPath(); x.roundRect(W / 2 - wmax / 2 - 26, y0 - 14, wmax + 52, lines.length * lh + 24, 16); x.fill();
    x.restore();
    const stem = activeStem(t);
    lines.forEach((l, i) => {
      const yy = y0 + 12 + i * lh + lh / 2 - 12;
      if (!stem || !l.toLowerCase().includes(stem)) { this.text(x, l, W / 2, yy, { size: 42, weight: 600, alpha: a, shadow: false }); return; }
      // word-by-word so the keyword can take the accent colour
      x.save(); x.font = `600 42px ${F}`; const sp = x.measureText(' ').width; const ws = l.split(' ');
      const widths = ws.map((w) => { x.font = `${w.toLowerCase().startsWith(stem) ? 800 : 600} 42px ${F}`; return x.measureText(w).width; }); x.restore();
      let px = W / 2 - (widths.reduce((u, v) => u + v, 0) + sp * (ws.length - 1)) / 2;
      ws.forEach((w, j) => {
        const hit = w.toLowerCase().startsWith(stem);
        this.text(x, w, px, yy, { size: 42, weight: hit ? 800 : 600, alpha: a, shadow: false, align: 'left', color: hit ? COL.cyan : '#ffffff' });
        px += widths[j] + sp;
      });
    });
  }

  // ------------------------------------------------------------------ kinetic typography
  kwColor(c) { return { cyan: COL.cyan, white: '#ffffff', gold: COL.gold, red: COL.red }[c]; }

  /** layout slot → screen position of the keyword (kept inside the Reels safe area) */
  kwPlace(k) {
    const M = this.model.byFdi;
    if (k.place === 'palate') {
      // empty palatal area between the first molars in the occlusal view
      const a = this.proj(this.at('16', M['16'].crown)), b = this.proj(this.at('26', M['26'].crown));
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 40];
    }
    if (k.place === 'low') return [W / 2, 1300];
    return [W / 2, k.kicker ? 370 : 330];
  }

  drawKeywords(x, t) {
    for (const k of KEYWORDS) {
      const s = keywordState(k, t), sk = kickerState(k, t), sn = noteState(k, t);
      if (!s && !sk && !sn) continue;
      const [cx0, cy0] = this.kwPlace(k);
      const col = this.kwColor(k.color);
      // kicker (number or small lead word) above the keyword, enters on its own word
      if (sk && sk.alpha > 0.003) this.text(x, k.kicker, cx0, cy0 - k.size * 0.95 - (1 - easeOut(sk.reveal)) * 14,
        { size: Math.round(k.size * (k.kicker.length <= 2 ? 0.62 : 0.5)), weight: 800, alpha: sk.alpha, color: k.kicker.length <= 2 ? COL.cyan : '#ffffff', spacing: 6 });
      if (sn && sn.alpha > 0.003) this.text(x, k.note, cx0, cy0 + k.size * 1.05, { size: Math.round(k.size * 0.42) + 6, weight: 700, alpha: sn.alpha, color: k.note === 'IPR' ? COL.cyan : COL.dim, spacing: 4 });
      if (!s || s.alpha <= 0.003) continue;
      const cx = cx0 + k.dir[0] * s.drift, cy = cy0 + k.dir[1] * s.drift;
      const fill = k.from ? this.mixColor(this.kwColor(k.from), col, 1 - s.accent) : col;
      if (k.id === 'dist') this.distalGuides(x, s);
      if (k.id === 'space' && this.story.scen !== 'start') this.gapGuides(x, s, [cx, cy + k.size * 0.7]);
      x.save();
      x.font = `800 ${k.size}px ${F}`;
      if ('letterSpacing' in x) x.letterSpacing = `${s.tracking.toFixed(1)}px`;
      const w = x.measureText(k.text).width, h = k.size * 1.25;
      x.translate(cx, cy); x.scale(s.scale, s.scale);
      x.beginPath();
      if (k.dir[0] < 0) x.rect(w / 2 + 20 - (w + 40) * s.reveal, -h, (w + 40) * s.reveal, h * 2);
      else if (k.dir[0] > 0) x.rect(-w / 2 - 20, -h, (w + 40) * s.reveal, h * 2);
      else if (k.dir[1] > 0) x.rect(-w, -h / 2 - 10, w * 2, (h + 20) * s.reveal);
      else x.rect(-w, h / 2 + 10 - (h + 20) * s.reveal, w * 2, (h + 20) * s.reveal);
      x.clip();
      x.textAlign = 'center'; x.textBaseline = 'middle';
      for (let i = 3; i >= 1 && s.blur > 0.02; i--) {
        x.globalAlpha = s.alpha * 0.16 * s.blur; x.fillStyle = fill;
        x.fillText(k.text, -k.dir[0] * i * 9 * s.blur, -k.dir[1] * i * 9 * s.blur);
      }
      x.globalAlpha = s.alpha;
      x.shadowColor = 'rgba(0,6,18,0.9)'; x.shadowBlur = 16; x.fillStyle = fill; x.fillText(k.text, 0, 0);
      if (k.color !== 'white' || k.from) { x.globalCompositeOperation = 'lighter'; x.shadowColor = fill; x.shadowBlur = 22; x.globalAlpha = s.alpha * 0.26 * Math.max(0.4, s.accent); x.fillText(k.text, 0, 0); }
      x.restore();
      x.save(); x.globalAlpha = s.alpha * 0.85; x.strokeStyle = fill; x.lineWidth = 3; x.lineCap = 'round';
      const uw = w * 0.42 * s.reveal * s.scale, uy = cy + k.size * 0.62;
      x.beginPath(); x.moveTo(cx - uw, uy); x.lineTo(cx + uw, uy); x.stroke(); x.restore();
    }
  }

  mixColor(a, b, u) {
    const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const A = p(a), B = p(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * u)).join(',')})`;
  }

  guide(x, a, b, color, alpha) {
    if (alpha <= 0.003) return;
    x.save(); x.globalAlpha = alpha * 0.7; x.strokeStyle = color; x.lineWidth = 2; x.setLineDash([4, 7]);
    x.beginPath(); x.moveTo(...a); x.lineTo(...b); x.stroke(); x.setLineDash([]);
    x.globalAlpha = alpha; x.fillStyle = color; x.beginPath(); x.arc(b[0], b[1], 5, 0, Math.PI * 2); x.fill(); x.restore();
  }

  /** ДИСТАЛИЗАЦИЯ: one clear distal vector along each buccal segment (premolars → second molar) */
  distalGuides(x, s) {
    const M = this.model.byFdi;
    for (const q of ['1', '2']) {
      const a4 = M[q + '4'], a7 = M[q + '7'];
      const p0 = this.proj(V.add(this.at(q + '4', a4.crown), V.mul(a4.f, 11)));
      const p1 = this.proj(V.add(V.add(this.at(q + '7', a7.crown), V.mul(a7.f, 11)), V.mul(a7.md, -5)));
      this.arrow(x, p0, p1, { color: COL.cyan, width: 7, head: 28, alpha: s.alpha * 0.95, progress: s.reveal });
    }
  }

  /** ПРОСТРАНСТВО: thin guides from the word to the space that is opening */
  gapGuides(x, s, from) {
    for (const g of this.gaps) {
      if (!g.m.visible || !g.center) continue;
      this.guide(x, from, this.proj(g.center), COL.cyan, s.alpha * s.reveal * Math.min(1, g.mat.uniforms.uAlpha.value * 2));
    }
  }

  grab(type = 'image/jpeg', q = 0.95) { return this.out.toDataURL(type, q); }
}
