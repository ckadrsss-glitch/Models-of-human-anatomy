import * as THREE from 'three';

// One shared section plane (sagittal: keeps x >= -constant; coronal: keeps z <= constant).
// constant = 1 → nothing is cut. The camera looks from the patient's left (−X).
export const sectionPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1);   // sagittal: keeps x >= -constant
// Second, independent coronal plane (keeps z <= constant). Both act together, so a
// coronal cut can sweep away while the sagittal cut is already in place.
export const coronalPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1);

// Shared maxillary "arch form" uniforms (scene 5): narrowing + palatal vault height.
export const archUniforms = {
  uNarrow: { value: 0 },
};

// Arch narrowing displacement shared by the maxilla, upper gingiva and upper teeth.
// k grows posteriorly (molars) and fades towards the incisors.
export function archShiftX(x, y, z, narrow) {
  const s = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const k = 0.0042 * s(0.034, 0.0, z);
  const alveolar = s(0.03, 0.0, y); // only the lower (dental) part of the maxilla
  return -Math.sign(x) * narrow * k * alveolar * s(0.0, 0.006, Math.abs(x));
}
const ARCH_GLSL = /* glsl */`
  uniform float uNarrow;
  float sstep(float a, float b, float v){ float t = clamp((v-a)/(b-a),0.0,1.0); return t*t*(3.0-2.0*t); }
  vec3 archWarp(vec3 p){
    float k = 0.0042 * sstep(0.034, 0.0, p.z);
    float alveolar = sstep(0.03, 0.0, p.y);
    p.x += -sign(p.x) * uNarrow * k * alveolar * sstep(0.0, 0.006, abs(p.x));
    // palatal vault rises when the arch is narrow
    float mid = 1.0 - sstep(0.0, 0.016, abs(p.x));
    float band = sstep(-0.004, 0.004, p.y) * (1.0 - sstep(0.012, 0.02, p.y)) * sstep(-0.006, 0.004, p.z) * (1.0 - sstep(0.03, 0.04, p.z));
    p.y += uNarrow * 0.0035 * mid * band;
    return p;
  }
`;

// "Glass" X-ray material: fresnel rim + faint body, depth-sorted, double sided.
export function glassMaterial({ color = 0xdfe8f5, rim = 0xffffff, opacity = 0.5, minAlpha = 0.06, power = 2.2, light = 0.35, arch = false } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uRim: { value: new THREE.Color(rim) },
      uOpacity: { value: opacity },
      uMinAlpha: { value: minAlpha },
      uPower: { value: power },
      uLight: { value: light },
      uGlow: { value: 0 },
      uGlowColor: { value: new THREE.Color(0x2de2d0) },
      ...(arch ? archUniforms : {}),
    },
    vertexShader: /* glsl */`
      #include <clipping_planes_pars_vertex>
      ${arch ? ARCH_GLSL : ''}
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        vec3 p = position;
        ${arch ? 'p = archWarp(p);' : ''}
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <clipping_planes_pars_fragment>
      uniform vec3 uColor, uRim, uGlowColor; uniform float uOpacity, uMinAlpha, uPower, uLight, uGlow;
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        #include <clipping_planes_fragment>
        vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n;
        float f = pow(1.0 - abs(dot(n, normalize(vV))), uPower);
        float diff = 0.55 + 0.45 * max(dot(n, normalize(vec3(0.4, 0.8, 0.5))), 0.0);
        vec3 c = mix(uColor * mix(1.0, diff, uLight), uRim, f * 0.85);
        c = mix(c, uGlowColor, uGlow * (0.35 + 0.65 * f));
        float a = uOpacity * (uMinAlpha + (1.0 - uMinAlpha) * f) + uGlow * 0.25 * uOpacity;
        gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    clipping: true,
  });
  m.clippingPlanes = [sectionPlane, coronalPlane];
  return m;
}

// Tooth material: physically based enamel/root with an axial "formation cut".
// aH (0 = apex, 1 = incisal/occlusal tip) is a per-vertex attribute; fragments
// below uCut are discarded → root formation and physiological root resorption.
export function toothMaterial({ root = false, primary = false, arch = false } = {}) {
  const color = root
    ? new THREE.Color(primary ? 0xeedfc8 : 0xe7d2b0)
    : new THREE.Color(primary ? 0xfbf9f4 : 0xf6efe2);
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness: root ? 0.55 : 0.28,
    metalness: 0.0,
    clearcoat: root ? 0.0 : 0.65,
    clearcoatRoughness: 0.22,
    sheen: 0.25,
    sheenColor: new THREE.Color(0xfff4e0),
    envMapIntensity: 0.8,
    side: THREE.DoubleSide,
    transparent: false,
  });
  m.clippingPlanes = [sectionPlane, coronalPlane];
  m.userData.uCut = { value: 0 };
  m.userData.uGlow = { value: 0 };
  m.userData.uGerm = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCut = m.userData.uCut;
    sh.uniforms.uGerm = m.userData.uGerm;
    sh.uniforms.uGlowT = m.userData.uGlow;
    if (arch) Object.assign(sh.uniforms, archUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aH; varying float vH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = aH;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCut; uniform float uGlowT; uniform float uGerm; varying float vH;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vH < uCut) discard;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // soft cervical darkening on the formation front + inner wall shading
        float front = 1.0 - smoothstep(0.0, 0.035, vH - uCut);
        diffuseColor.rgb *= mix(1.0, 0.82, front * step(0.001, uCut));
        if (!gl_FrontFacing) diffuseColor.rgb *= 0.55;
        // unerupted germs read as 'inside the bone': cooler, dimmer
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.70, 0.82), 0.5 * uGerm);
        totalEmissiveRadiance += vec3(0.18, 0.88, 0.82) * uGlowT * 0.35;`);
  };
  m.customProgramCacheKey = () => 'tooth' + (arch ? 'A' : '');
  return m;
}

// Fade helper: switch to real alpha blending only while partially transparent
// (no dithering noise, opaque depth behaviour otherwise).
export function setOpacity(m, a) {
  m.opacity = a;
  const tr = a < 0.999;
  if (m.transparent !== tr) { m.transparent = tr; m.depthWrite = true; m.needsUpdate = true; }
}

export function tissueMaterial(color, opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
    sheen: 0.6,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xffc0c0),
    side: THREE.DoubleSide,
    transparent: false,
    ...opts,
  });
  m.userData.uGlow = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlowT = m.userData.uGlow;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlowT;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fr = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);
        totalEmissiveRadiance += vec3(0.18, 0.88, 0.82) * uGlowT * (0.25 + 0.9 * fr);`);
  };
  m.customProgramCacheKey = () => 'tissue';
  return m;
}
