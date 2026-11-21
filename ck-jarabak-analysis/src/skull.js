// ============================================================================
//  Skull mesh (Z-Anatomy / BodyParts3D) + GPU morphology warp.
//  One shared BufferGeometry; every skull instance owns its own uniforms
//  (vertical pattern v, schematic mandibular rotation r).
// ============================================================================
import * as THREE from 'three';
import { WARP_GLSL } from './morph.js';

export async function loadSkullGeometry(url = 'assets/skull') {
  const [hdr, buf] = await Promise.all([
    fetch(url + '.json').then((r) => r.json()),
    fetch(url + '.bin').then((r) => r.arrayBuffer()),
  ]);
  const T = { float32: Float32Array, int8: Int8Array, uint8: Uint8Array, uint32: Uint32Array };
  const get = (n) => { const c = hdr.chunks.find((c) => c.name === n); return new T[c.dtype](buf, c.offset, c.bytes / T[c.dtype].BYTES_PER_ELEMENT); };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(get('position'), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(get('normal'), 3, true));
  g.setAttribute('aAO', new THREE.BufferAttribute(get('ao'), 1, true));
  g.setAttribute('aPart', new THREE.BufferAttribute(get('part'), 1, false));
  g.setAttribute('aSuture', new THREE.BufferAttribute(get('suture'), 1, false));
  g.setAttribute('aEnamel', new THREE.BufferAttribute(get('enamel'), 1, false));
  g.setAttribute('aRigid', new THREE.BufferAttribute(get('rigid'), 1, true));
  g.setAttribute('aAnchor', new THREE.BufferAttribute(get('anchor'), 3));
  const idx = get('index');
  // split triangles into bone / enamel / root groups (material index 0/1/2)
  const part = get('part'), ena = get('enamel');
  const buckets = [[], [], []];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const k = part[a] < 2 ? 0 : (ena[a] + ena[b] + ena[c] >= 2 ? 1 : 2);
    buckets[k].push(a, b, c);
  }
  const all = new Uint32Array(idx.length); let o = 0;
  buckets.forEach((bk, k) => { all.set(bk, o); g.addGroup(o, bk.length, k); o += bk.length; });
  g.setIndex(new THREE.BufferAttribute(all, 1));
  g.computeBoundingSphere(); g.boundingSphere.radius *= 1.3; // warp headroom
  g.userData.header = hdr;
  return g;
}

// ---------------------------------------------------------------------------
// Bone: ivory, slightly porous (procedural triplanar noise), baked AO, darker
// sutures. Enamel: brighter, glossier. Roots: dentine colour (mostly hidden).
// ---------------------------------------------------------------------------
const NOISE = /* glsl */`
float h3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=.5; } return s; }
`;

export function makeMaterials(uniforms, kind = 'bone') {
  const defs = [
    { color: 0xd2c09f, roughness: 0.7, metalness: 0.0, tex: 1.0 },   // bone
    { color: 0xe6dccb, roughness: 0.3, metalness: 0.0, tex: 0.12 },  // enamel
    { color: 0xd8c39a, roughness: 0.6, metalness: 0.0, tex: 0.3 },   // root / dentine
  ];
  return defs.map((d, k) => {
    const m = new THREE.MeshStandardMaterial({ color: d.color, roughness: d.roughness, metalness: d.metalness, envMapIntensity: 0.55 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute float aAO; attribute float aPart; attribute float aSuture; attribute float aRigid; attribute vec3 aAnchor;
varying float vAO; varying float vSuture; varying vec3 vObj;
${WARP_GLSL}`)
        .replace('#include <beginnormal_vertex>', `
vec3 objectNormal = normal;
vec3 wP = position;
{
  vec3 n0 = normal;
  vec3 pw = warpPoint(position, aPart, aAnchor, aRigid);
  float e = 0.35;
  vec3 dx = warpPoint(position+vec3(e,0,0), aPart, aAnchor+vec3(e,0,0)*(1.0-aRigid), aRigid) - pw;
  vec3 dy = warpPoint(position+vec3(0,e,0), aPart, aAnchor+vec3(0,e,0)*(1.0-aRigid), aRigid) - pw;
  vec3 dz = warpPoint(position+vec3(0,0,e), aPart, aAnchor+vec3(0,0,e)*(1.0-aRigid), aRigid) - pw;
  mat3 J = mat3(dx, dy, dz) / e;
  // cofactor matrix = inverse-transpose up to scale
  mat3 C = mat3(cross(J[1], J[2]), cross(J[2], J[0]), cross(J[0], J[1]));
  objectNormal = normalize(C * n0);
  wP = pw;
}
#ifdef USE_TANGENT
vec3 objectTangent = vec3( tangent.xyz );
#endif`)
        .replace('#include <begin_vertex>', `vec3 transformed = wP; vAO = aAO; vSuture = aSuture; vObj = position;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying float vAO; varying float vSuture; varying vec3 vObj;
uniform float uTex; ${NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  float n = fbm(vObj*0.55);
  float pores = smoothstep(0.62, 0.82, vnoise(vObj*2.4));
  diffuseColor.rgb *= mix(1.0, 0.80 + 0.32*n - 0.14*pores, uTex);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(0.80,0.74,0.66), vSuture*0.55*uTex);
}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + uTex*0.12*(vnoise(vObj*1.7)-0.5), 0.05, 1.0);`)
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{
  float ao = pow(clamp(vAO*1.1+0.04, 0.0, 1.0), 1.6);
  reflectedLight.indirectDiffuse *= ao;
  reflectedLight.directDiffuse *= mix(1.0, ao, 0.7);
  reflectedLight.indirectSpecular *= ao;
  reflectedLight.directSpecular *= ao;
}`);
      sh.uniforms.uTex = { value: d.tex };
    };
    m.customProgramCacheKey = () => 'skull' + k;
    return m;
  });
}

export function createSkull(geometry, opts = {}) {
  const uniforms = {
    uV: { value: 0 }, uR: { value: 0 },
  };
  const mats = makeMaterials(uniforms);
  const mesh = new THREE.Mesh(geometry, mats);
  mesh.frustumCulled = false;
  const group = new THREE.Group(); group.add(mesh);
  return {
    group, mesh, uniforms, mats,
    set(v, r = 0) { uniforms.uV.value = v; uniforms.uR.value = r; },
    setVisible(on) { group.visible = on; },
  };
}
