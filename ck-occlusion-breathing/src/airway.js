import * as THREE from 'three';
import { tissueMaterial } from './materials.js';
import { hash, clamp, smooth } from './util.js';

// ----------------------------------------------------------------------------
// Airway, pharyngeal tonsil (adenoid) and airflow.
// Z-Anatomy contains no pharyngeal tonsil and its airway shells are schematic,
// so these are generated and fitted to the midsagittal landmarks measured on
// the exported skull (tools/sagittal_plot.py): posterior nasopharyngeal wall
// along the basisphenoid/basiocciput, soft palate, choanae, oropharynx.
// ----------------------------------------------------------------------------

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildPaths() {
  const nasal = (s) => new THREE.CatmullRomCurve3([
    V(0.0065 * s, 0.0075, 0.053),  // nostril
    V(0.0072 * s, 0.014, 0.040),
    V(0.0075 * s, 0.020, 0.024),
    V(0.0068 * s, 0.021, 0.008),
    V(0.0050 * s, 0.019, -0.004),  // choana
    V(0.0020 * s, 0.0155, -0.017),
    V(0.0, 0.0105, -0.028),        // nasopharynx (below the adenoid)
    V(0.0, 0.000, -0.0355),        // behind the soft palate
    V(0.0, -0.013, -0.0370),
    V(0.0, -0.028, -0.0345),       // oropharynx
    V(0.0, -0.044, -0.0320),
    V(0.0, -0.062, -0.0300),       // towards the larynx
  ], false, 'centripetal');
  const oral = new THREE.CatmullRomCurve3([
    V(0.0, -0.0175, 0.062),        // between the lips
    V(0.0, -0.0150, 0.045),
    V(0.0, -0.0080, 0.026),
    V(0.0, -0.0040, 0.006),
    V(0.0, -0.0075, -0.014),
    V(0.0, -0.0150, -0.030),
    V(0.0, -0.028, -0.0345),
    V(0.0, -0.044, -0.0320),
    V(0.0, -0.062, -0.0300),
  ], false, 'centripetal');
  return { nasalL: nasal(1), nasalR: nasal(-1), oral };
}

// --------------------------------------------------------------- adenoid
export class Adenoid {
  constructor() {
    // posterosuperior nasopharyngeal wall: centre on the roof/posterior wall
    this.C = V(0, 0.0322, -0.0300);
    this.n = V(0, -0.80, 0.60).normalize();                 // towards the lumen
    this.t = new THREE.Vector3().crossVectors(V(1, 0, 0), this.n).normalize(); // along the wall
    this.base = new THREE.SphereGeometry(1, 96, 64);
    this.geo = this.base.clone();
    this.mat = tissueMaterial(0xe0838a, { sheenColor: new THREE.Color(0xffb0b0), roughness: 0.5 });
    // keep only the part that protrudes from the mucosal wall
    this.mat.clippingPlanes = [new THREE.Plane(this.n.clone(), -this.n.dot(this.C) + 0.0008)];
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.renderOrder = 8; this.mesh.frustumCulled = false;
    this._T = -1;
    this.setSize(0);
  }
  // s: 0 = physiological, 1 = marked hypertrophy (lumen narrowed, not closed)
  setSize(s) {
    const T = 0.0032 + 0.0138 * s;
    if (Math.abs(T - this._T) < 1e-6) return;
    this._T = T;
    const Rx = 0.0105 + 0.0025 * s, Rt = 0.0125 + 0.0022 * s;
    const bp = this.base.attributes.position, p = this.geo.attributes.position;
    const C = this.C, n = this.n, tt = this.t;
    for (let i = 0; i < bp.count; i++) {
      const ux = bp.getX(i), uy = bp.getY(i), uz = bp.getZ(i);
      // vertical (sagittal) clefts between lobules + fine lobulation
      // 5–6 sagittal ridges separated by deep clefts, plus transverse lobulation
      const cleft = Math.pow(Math.abs(Math.cos(ux * Math.PI * 2.75)), 0.45);
      const lob = 0.07 * Math.sin(uy * 11.0 + ux * 3.0) * Math.cos(ux * 13.0 - uy * 2.0) + 0.04 * Math.sin(uy * 23.0);
      const front = Math.pow(Math.max(0, uz), 0.7); // only the free surface is furrowed
      const r = 1 - front * (0.3 * (1 - cleft) - lob);
      const x = ux * Rx * r, along = uy * Rt * r, out = uz * T * r;
      p.setXYZ(i, C.x + x, C.y + tt.y * along + n.y * out, C.z + tt.z * along + n.z * out);
    }
    p.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
  // forward-most point of the free surface (for lumen narrowing)
  frontPoint() { return this.C.clone().addScaledVector(this.n, this._T); }
}

// --------------------------------------------------------------- lumen ribbon
// A soft glowing tube visualising the nasal airway lumen; radius shrinks where
// the adenoid encroaches on the nasopharynx.
export class Lumen {
  constructor(curve) {
    this.curve = curve;
    this.N = 140; this.R = 14;
    const frames = curve.computeFrenetFrames(this.N, false);
    this.frames = frames;
    this.centers = [];
    for (let i = 0; i <= this.N; i++) this.centers.push(curve.getPointAt(i / this.N));
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array((this.N + 1) * (this.R + 1) * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
    const idx = [];
    for (let i = 0; i < this.N; i++) for (let j = 0; j < this.R; j++) {
      const a = i * (this.R + 1) + j, b = a + this.R + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    geo.setIndex(idx);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0x35e6d6) } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uOpacity; uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
        void main(){ float f = pow(1.0-abs(dot(normalize(vN),normalize(vV))),1.6); gl_FragColor = vec4(uColor*(0.5+0.7*f), uOpacity*(0.015+0.32*f*f)); }`,
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 40; this.mesh.frustumCulled = false;
    this.radius = (u) => 0.003;
  }
  update(radiusFn) {
    const p = this.geo.attributes.position, nn = this.geo.attributes.normal;
    for (let i = 0; i <= this.N; i++) {
      const u = i / this.N, c = this.centers[i], r = radiusFn(u, c);
      const Nn = this.frames.normals[Math.min(i, this.N)], B = this.frames.binormals[Math.min(i, this.N)];
      for (let j = 0; j <= this.R; j++) {
        const a = j / this.R * Math.PI * 2, cx = Math.cos(a), sy = Math.sin(a);
        const dx = Nn.x * cx + B.x * sy, dy = Nn.y * cx + B.y * sy, dz = Nn.z * cx + B.z * sy;
        const k = i * (this.R + 1) + j;
        p.setXYZ(k, c.x + dx * r, c.y + dy * r, c.z + dz * r);
        nn.setXYZ(k, dx, dy, dz);
      }
    }
    p.needsUpdate = true; nn.needsUpdate = true;
  }
}

// --------------------------------------------------------------- particles
export class Airflow {
  constructor(paths, count = 900) {
    this.paths = paths;
    this.count = count;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.alpha = new Float32Array(count);
    this.size = new Float32Array(count);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1 }, uColor: { value: new THREE.Color(0x4ff5e6) } },
      vertexShader: `attribute float aAlpha; attribute float aSize; uniform float uScale; varying float vA;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = aSize*uScale/(-mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uColor; varying float vA;
        void main(){ vec2 d = gl_PointCoord-0.5; float r = length(d); float a = smoothstep(0.5,0.0,r); a = a*a; gl_FragColor = vec4(uColor*(0.7+0.9*smoothstep(0.25,0.0,r)), a*vA); }`,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.renderOrder = 50; this.points.frustumCulled = false;
    // pre-sample curves for speed
    this.samples = {};
    for (const k of Object.keys(paths)) {
      const arr = [];
      for (let i = 0; i <= 400; i++) arr.push(paths[k].getPointAt(i / 400));
      this.samples[k] = arr;
    }
  }
  _at(key, u) {
    const a = this.samples[key], f = clamp(u) * 400, i = Math.min(399, Math.floor(f)), k = f - i;
    return a[i].clone().lerp(a[i + 1], k);
  }
  // nasal, oral ∈ [0,1] flow strength; narrow ∈ [0,1] nasopharyngeal narrowing
  update(t, { nasal = 1, oral = 0, narrow = 0, opacity = 1 } = {}) {
    const n = this.count;
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const h1 = hash(i * 1.37 + 0.11), h2 = hash(i * 2.91 + 5.3), h3 = hash(i * 0.73 + 9.1), h4 = hash(i * 4.17 + 2.2);
      const isOral = i % 3 === 0;
      const key = isOral ? 'oral' : (i % 3 === 1 ? 'nasalL' : 'nasalR');
      const strength = isOral ? oral : nasal;
      // quiet breathing rhythm: inspiratory speed pulses
      const speed = 0.16 + 0.08 * h2;
      const ph = h1 + t * speed + 0.06 * Math.sin(t * 2.2 + h3 * 6.28);
      let u = ph - Math.floor(ph);
      let a = smooth(0.0, 0.06, u) * (1 - smooth(0.88, 1.0, u));
      // nasal particles thin out through the narrowed nasopharynx
      if (!isOral && narrow > 0) {
        const block = smooth(0.48, 0.56, u);
        if (h4 < narrow * 0.75) a *= 1 - block;
      }
      a *= h4 < strength ? 1 : 0;
      const c = this._at(key, u);
      // cross-sectional jitter, narrower where the lumen narrows
      let rad = isOral ? 0.0035 : 0.0028;
      if (!isOral) rad *= 1 - 0.55 * narrow * Math.exp(-((u - 0.55) ** 2) / 0.004);
      const ang = h3 * 6.283 + t * 0.7 * (h2 - 0.5);
      v.set(Math.cos(ang) * rad * Math.sqrt(h2), Math.sin(ang) * rad * Math.sqrt(h2) * 1.4, 0);
      this.pos[i * 3] = c.x + v.x; this.pos[i * 3 + 1] = c.y + v.y; this.pos[i * 3 + 2] = c.z + v.x * 0.3;
      this.alpha[i] = a * opacity * (0.55 + 0.45 * h3);
      this.size[i] = 0.9 + 1.6 * h2;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
  }
}
