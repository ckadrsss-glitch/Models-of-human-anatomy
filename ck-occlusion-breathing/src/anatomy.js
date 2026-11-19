import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { glassMaterial, toothMaterial, tissueMaterial, archShiftX, setOpacity } from './materials.js';
import { smooth } from './util.js';

// ----------------------------------------------------------------------------
// Anatomy built from the Z-Anatomy (BodyParts3D-derived) meshes exported by
// tools/export_head.py. Coordinates: metres, +Y up, +Z anterior (face), +X left.
// Missing structures (primary dentition, pharyngeal tonsil, airflow) are
// generated here and in airway.js — see docs/ASSETS.md.
// ----------------------------------------------------------------------------

const TOOTH_TYPES = [
  ['medial incisor', 'I1'], ['lateral incisor', 'I2'], ['canine', 'C'],
  ['first premolar', 'P1'], ['second premolar', 'P2'],
  ['first molar', 'M1'], ['second molar', 'M2'],
];

function parseTooth(name) {
  // GLTFLoader sanitises names: "Upper first molar tooth.l" → "Upper_first_molar_toothl"
  const n = name.replace(/_/g, ' ');
  const jaw = /^Upper/.test(n) ? 'U' : /^Lower/.test(n) ? 'L' : null;
  if (!jaw) return null;
  const side = n.trim().slice(-1);
  for (const [k, code] of TOOTH_TYPES) if (n.includes(k)) return { jaw, side, code };
  return null;
}

function meshesOf(node) {
  const out = [];
  node.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
}

// --- tooth geometry analysis ---------------------------------------------------
function analyseTooth(crownGeo, rootGeo) {
  const cc = new THREE.Vector3(), rc = new THREE.Vector3(), all = new THREE.Vector3();
  const pc = crownGeo.attributes.position, pr = rootGeo ? rootGeo.attributes.position : null;
  const v = new THREE.Vector3();
  for (let i = 0; i < pc.count; i++) cc.add(v.fromBufferAttribute(pc, i));
  cc.divideScalar(pc.count);
  if (pr) { for (let i = 0; i < pr.count; i++) rc.add(v.fromBufferAttribute(pr, i)); rc.divideScalar(pr.count); }
  const nAll = pc.count + (pr ? pr.count : 0);
  all.copy(cc).multiplyScalar(pc.count);
  if (pr) all.addScaledVector(rc, pr.count);
  all.divideScalar(nAll);
  const axis = new THREE.Vector3().subVectors(cc, pr ? rc : all).normalize();
  let mn = Infinity, mx = -Infinity, crownMin = Infinity;
  const scan = (pos, isCrown) => {
    for (let i = 0; i < pos.count; i++) {
      const d = v.fromBufferAttribute(pos, i).sub(all).dot(axis);
      mn = Math.min(mn, d); mx = Math.max(mx, d);
      if (isCrown) crownMin = Math.min(crownMin, d);
    }
  };
  scan(pc, true); if (pr) scan(pr, false);
  // CEJ ≈ lower bound of the enamel group (robust 3% quantile)
  const ds = [];
  for (let i = 0; i < pc.count; i++) ds.push(v.fromBufferAttribute(pc, i).sub(all).dot(axis));
  ds.sort((a, b) => a - b);
  const cej = ds[Math.floor(ds.length * 0.03)];
  return { center: all, axis, min: mn, max: mx, len: mx - mn, cejH: (cej - mn) / (mx - mn) };
}

function writeH(geo, info, center) {
  const p = geo.attributes.position, h = new Float32Array(p.count), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const d = v.fromBufferAttribute(p, i).sub(center).dot(info.axis);
    h[i] = (d - info.min) / info.len;
  }
  geo.setAttribute('aH', new THREE.BufferAttribute(h, 1));
}

export class Anatomy {
  constructor() {
    this.root = new THREE.Group();
    this.skull = new THREE.Group();       // fixed: neurocranium + maxilla + upper teeth
    this.mandibleGroup = new THREE.Group(); // rotates about the condylar hinge axis
    this.root.add(this.skull, this.mandibleGroup);
    this.nodes = {};
    this.teeth = [];        // permanent teeth {mesh, info, ...}
    this.primary = [];      // generated primary teeth
    this.boneMats = [];
    this.jawAngle = 0;
  }

  async load(url) {
    const gltf = await new GLTFLoader().loadAsync(url);
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const top = [...scene.children];
    for (const n of top) this.nodes[n.name] = n;
    this._classify(top);
    this._buildHinge();
    this._buildPrimary();
    this._buildTongue();
    this._buildSkin();
    this._splitGingiva();
    this._buildPalateField();
    return this;
  }

  _classify(top) {
    const boneMat = () => { const m = glassMaterial({ color: 0xe9eef6, rim: 0xffffff, opacity: 0.55, minAlpha: 0.05, power: 2.0 }); this.boneMats.push(m); return m; };
    this.mats = {
      skin: glassMaterial({ color: 0xf2c4a8, rim: 0xffe6d6, opacity: 0.0, minAlpha: 0.04, power: 2.6, light: 0.6 }),
      mucosa: glassMaterial({ color: 0xff8a8a, rim: 0xffc4c4, opacity: 0.0, minAlpha: 0.12, power: 1.6 }),
      gingiva: glassMaterial({ color: 0xe0707a, rim: 0xffc2c6, opacity: 0.55, minAlpha: 0.1, power: 1.7, light: 0.6 }),
      gingivaU: glassMaterial({ color: 0xe0707a, rim: 0xffc2c6, opacity: 0.55, minAlpha: 0.1, power: 1.7, light: 0.6, arch: true }),
      maxilla: glassMaterial({ color: 0xe9eef6, rim: 0xffffff, opacity: 0.55, minAlpha: 0.05, power: 2.0, arch: true }),
      tongue: tissueMaterial(0xb04e5a, { sheenColor: new THREE.Color(0xff9aa6), roughness: 0.5 }),
      softPalate: tissueMaterial(0xd86a74),
      tonsil: tissueMaterial(0xd77a7a),
      eye: glassMaterial({ color: 0xffffff, rim: 0xffffff, opacity: 0.0, minAlpha: 0.1 }),
    };
    this.boneMats.push(this.mats.maxilla);
    this.groups = { bones: [], mandible: [], teeth: [], soft: [] };
    for (const node of top) {
      const name = node.name;
      const t = parseTooth(name);
      const meshes = meshesOf(node);
      if (t) {
        this._addTooth(node, meshes, t);
        continue;
      }
      let mat = null, parent = this.skull;
      if (/^Mandible/.test(name)) { mat = boneMat(); parent = this.mandibleGroup; this.mandible = node; }
      else if (/^Maxilla/.test(name)) mat = this.mats.maxilla;
      else if (/bone|Vomer|Atlas|Axis|Hyoid|cartilage/i.test(name)) mat = boneMat();
      else if (name === 'Skin') { mat = this.mats.skin; this.skin = node; }
      else if (/^Tongue/.test(name)) { mat = this.mats.tongue; this.tongue = node; }
      else if (/Genioglossus|Hyoglossus|Orbicularis/.test(name)) { node.visible = false; }
      else if (/Gingiva/.test(name)) { mat = this.mats.gingiva; this.gingiva = node; }
      else if (/Soft_palate|Uvula/.test(name)) { mat = this.mats.softPalate; (this.softPalate ||= []).push(node); }
      else if (/tonsil/i.test(name)) { mat = this.mats.tonsil; (this.tonsils ||= []).push(node); }
      else if (/pharynx|Mucosa|Epiglottis/.test(name)) { mat = this.mats.mucosa; (this.mucosa ||= []).push(node); }
      else if (/eyeball/.test(name)) { mat = this.mats.eye; (this.eyes ||= []).push(node); }
      else mat = boneMat();
      for (const m of meshes) {
        if (mat) m.material = mat;
        m.renderOrder = mat === this.mats.skin ? 30 : 10;
        m.frustumCulled = false;
      }
      if (/^Hyoid/.test(name)) this.hyoid = node;
      parent.add(node);
    }
  }

  _addTooth(node, meshes, t) {
    const crown = meshes.find((m) => /crown/.test(m.material.name)) || meshes[0];
    const root = meshes.find((m) => /root/.test(m.material.name));
    const info = analyseTooth(crown.geometry, root ? root.geometry : null);
    const center = info.center.clone();
    for (const m of meshes) {
      writeH(m.geometry, info, center);
      m.geometry.translate(-center.x, -center.y, -center.z);
      const isRoot = m === root;
      m.userData.isRoot = isRoot;
      m.material = toothMaterial({ root: isRoot });
      m.castShadow = false;
      m.renderOrder = 5;
      m.frustumCulled = false;
    }
    node.position.copy(center);
    const rec = { node, meshes, info, ...t, final: center.clone(), kind: 'perm', id: `${t.jaw}${t.side}${t.code}` };
    this.teeth.push(rec);
    (t.jaw === 'U' ? this.skull : this.mandibleGroup).add(node);
  }

  tooth(jaw, side, code) { return this.teeth.find((r) => r.jaw === jaw && r.side === side && r.code === code); }

  // Condylar hinge axis: average of the highest posterior mandibular vertices.
  _buildHinge() {
    const g = meshesOf(this.mandible)[0].geometry, p = g.attributes.position, v = new THREE.Vector3();
    let maxY = -Infinity;
    for (let i = 0; i < p.count; i++) maxY = Math.max(maxY, p.getY(i));
    const acc = new THREE.Vector3(); let n = 0;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      if (v.y > maxY - 0.006 && v.z < 0 && Math.abs(v.x) > 0.03) { acc.add(v); n++; }
    }
    this.hinge = acc.divideScalar(n); this.hinge.x = 0;
    // re-parent the mandible group around the hinge so rotation.x opens the jaw
    for (const c of [...this.mandibleGroup.children]) c.position.sub(this.hinge);
    this.mandibleGroup.position.copy(this.hinge);
    // occlusal plane level
    const up = this.teeth.filter((r) => r.jaw === 'U'), lo = this.teeth.filter((r) => r.jaw === 'L');
    const tipY = (r) => r.final.y + r.info.axis.y * r.info.max;
    this.occY = (up.reduce((s, r) => s + tipY(r), 0) / up.length + lo.reduce((s, r) => s + tipY(r), 0) / lo.length) / 2;
  }

  // Primary dentition derived from the permanent BodyParts3D crowns:
  // scaled, whiter, shorter roots; positioned in the primary-arch sites.
  _buildPrimary() {
    const plan = [
      ['A', 'I1', 'I1', 0.74], ['B', 'I2', 'I2', 0.74], ['C', 'C', 'C', 0.76],
      ['D', 'M1', 'P1', 0.6], ['E', 'M1', 'P2', 0.76],
    ];
    for (const jaw of ['U', 'L']) for (const side of ['l', 'r']) for (const [code, src, site, sc] of plan) {
      const s = this.tooth(jaw, side, src), target = this.tooth(jaw, side, site);
      if (!s || !target) continue;
      const node = new THREE.Group();
      const meshes = [];
      for (const m of s.meshes) {
        const g = m.geometry.clone();
        const pos = g.attributes.position, h = g.attributes.aH, v = new THREE.Vector3();
        const cej = s.info.cejH;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          let hh = h.getX(i);
          if (hh < cej) { // shorten the root (primary crown:root proportions)
            const nh = cej - (cej - hh) * 0.78;
            v.addScaledVector(s.info.axis, (nh - hh) * s.info.len);
            h.setX(i, nh);
          }
          v.multiplyScalar(sc);
          pos.setXYZ(i, v.x, v.y, v.z);
        }
        g.computeVertexNormals();
        const mm = new THREE.Mesh(g, toothMaterial({ root: !!m.userData.isRoot, primary: true }));
        mm.renderOrder = 5; mm.frustumCulled = false;
        node.add(mm); meshes.push(mm);
      }
      // align the primary crown tip with the occlusal tip of the site tooth
      const tTip = target.final.clone().addScaledVector(target.info.axis, target.info.max);
      const pos = tTip.addScaledVector(s.info.axis, -s.info.max * sc);
      // primary arch is slightly smaller than the permanent one
      pos.x *= 0.97;
      node.position.copy(pos);
      const info = { ...s.info, len: s.info.len * sc, max: s.info.max * sc, min: s.info.min * sc };
      const rec = { node, meshes, info, jaw, side, code, final: pos.clone(), kind: 'prim', id: `${jaw}${side}${code}` };
      this.primary.push(rec);
      if (jaw === 'U') this.skull.add(node);
      else { node.position.sub(this.hinge); this.mandibleGroup.add(node); }
    }
  }

  // tooth placement in skull space (mandibular teeth are stored hinge-relative)
  placeTooth(rec, worldPos) {
    rec.node.position.copy(worldPos);
    if (rec.jaw === 'L') rec.node.position.sub(this.hinge);
  }

  setToothCut(rec, cut) { for (const m of rec.meshes) m.material.userData.uCut.value = cut; }
  setToothOpacity(rec, a) {
    for (const m of rec.meshes) setOpacity(m.material, a);
    rec.node.visible = a > 0.004;
  }
  setToothGlow(rec, g) { for (const m of rec.meshes) m.material.userData.uGlow.value = g; }
  setToothGerm(rec, g) { for (const m of rec.meshes) m.material.userData.uGerm.value = g; }

  // ---------------------------------------------------------------- tongue
  _buildTongue() {
    const mesh = meshesOf(this.tongue)[0];
    mesh.geometry.computeVertexNormals();
    const p = mesh.geometry.attributes.position;
    this.tongueBase = Float32Array.from(p.array);
    const bb = new THREE.Box3().setFromBufferAttribute(p);
    this.tongueBB = bb;
    this.tongueMesh = mesh;
    // tongue moves partly with the mandible: keep it in skull space and rotate manually
  }

  // Heightfield of the oral roof (hard palate + upper gingiva + soft palate) above the tongue.
  _buildPalateField() {
    const targets = [];
    for (const k of ['Maxillal', 'Maxillar', 'Palatine_bonel', 'Palatine_boner']) if (this.nodes[k]) targets.push(...meshesOf(this.nodes[k]));
    if (this.gingivaU) targets.push(this.gingivaU);
    for (const n of this.softPalate || []) targets.push(...meshesOf(n));
    const bb = this.tongueBB;
    const NX = 24, NZ = 40;
    this.palate = { NX, NZ, x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z + 0.004, H: new Float32Array(NX * NZ).fill(NaN) };
    const rc = new THREE.Raycaster();
    rc.firstHitOnly = true;
    for (const t of targets) t.updateMatrixWorld(true);
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      const x = this.palate.x0 + (this.palate.x1 - this.palate.x0) * i / (NX - 1);
      const z = this.palate.z0 + (this.palate.z1 - this.palate.z0) * j / (NZ - 1);
      rc.set(new THREE.Vector3(x, bb.max.y - 0.006, z), new THREE.Vector3(0, 1, 0));
      rc.far = 0.03;
      const hit = rc.intersectObjects(targets, false)[0];
      if (hit) this.palate.H[i * NZ + j] = hit.point.y;
    }
  }
  palateAt(x, z) {
    const P = this.palate;
    const fi = (x - P.x0) / (P.x1 - P.x0) * (P.NX - 1), fj = (z - P.z0) / (P.z1 - P.z0) * (P.NZ - 1);
    const i = Math.round(fi), j = Math.round(fj);
    if (i < 0 || j < 0 || i >= P.NX || j >= P.NZ) return NaN;
    return P.H[i * P.NZ + j];
  }

  // up ∈ [-1, 1]: +1 = rest posture near the palate, −1 = low posture.
  updateTongue(up, jawAngle, protr = 0) {
    const p = this.tongueMesh.geometry.attributes.position, b = this.tongueBase, bb = this.tongueBB;
    const h = this.hinge, ca = Math.cos(jawAngle), sa = Math.sin(jawAngle);
    const len = bb.max.z - bb.min.z, hgt = bb.max.y - bb.min.y;
    for (let i = 0; i < p.count; i++) {
      let x = b[i * 3], y = b[i * 3 + 1], z = b[i * 3 + 2];
      const hn = (y - bb.min.y) / hgt;
      const dors = smooth(0.4, 0.95, hn);
      const front = smooth(bb.min.z + 0.15 * len, bb.min.z + 0.55 * len, z);
      if (up > 0) {
        const H = this.palateAt(x, z);
        if (!Number.isNaN(H)) {
          const gap = Math.max(0, H - 0.0009 - y);
          y += up * dors * Math.min(gap, 0.009) * (0.35 + 0.65 * front);
        }
      } else {
        y += up * 0.0045 * dors * (0.4 + 0.6 * front);
        z += up * 0.0012 * dors;            // slightly retruded, flattened dorsum
        x *= 1 - up * 0.04 * dors;          // spreads a little laterally when low
      }
      // follows the mandible (genioglossus attachment): lower/anterior parts more
      const follow = 0.35 + 0.45 * (1 - hn) * front;
      const a = jawAngle * follow, c = Math.cos(a), s = Math.sin(a);
      const ry = y - h.y, rz = z - h.z;
      y = h.y + ry * c - rz * s; z = h.z + ry * s + rz * c;
      z += protr * (0.55 + 0.35 * (1 - hn));   // tongue follows a protruded mandible
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
    this.tongueMesh.geometry.computeVertexNormals();
  }

  // ---------------------------------------------------------------- skin
  _buildSkin() {
    const mesh = meshesOf(this.skin)[0];
    this.skinMesh = mesh;
    const p = mesh.geometry.attributes.position;
    this.skinBase = Float32Array.from(p.array);
    const w = new Float32Array(p.count);
    const yLip = this.occY - 0.0015;
    const h = this.hinge;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let k = smooth(yLip + 0.0025, yLip - 0.0035, y);
      k *= smooth(h.z + 0.012, h.z + 0.04, z);         // anterior to the ramus
      k *= smooth(-0.085, -0.045, y);                  // fades into the neck
      // lateral cheeks stretch rather than rotate fully
      k *= 1 - 0.35 * smooth(0.03, 0.06, Math.abs(x)) * (1 - smooth(yLip - 0.03, yLip - 0.045, y));
      w[i] = k;
    }
    this.skinW = w;
  }
  updateSkin(jawAngle, protr = 0) {
    const key = jawAngle + '|' + protr;
    if (this._skinKey === key) return;
    this._skinKey = key;
    const p = this.skinMesh.geometry.attributes.position, b = this.skinBase, w = this.skinW, h = this.hinge;
    for (let i = 0; i < p.count; i++) {
      const a = jawAngle * w[i];
      if (w[i] === 0 || (a === 0 && protr === 0)) { p.setXYZ(i, b[i * 3], b[i * 3 + 1], b[i * 3 + 2]); continue; }
      const c = Math.cos(a), s = Math.sin(a);
      const ry = b[i * 3 + 1] - h.y, rz = b[i * 3 + 2] - h.z;
      p.setXYZ(i, b[i * 3], h.y + ry * c - rz * s, h.z + ry * s + rz * c + protr * w[i]);
    }
    p.needsUpdate = true;
    this.skinMesh.geometry.computeVertexNormals();
  }

  // ---------------------------------------------------------------- gingiva
  _splitGingiva() {
    const mesh = meshesOf(this.gingiva)[0];
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const p = g.attributes.position, nrm = g.attributes.normal;
    const up = [], lo = [], upN = [], loN = [];
    for (let t = 0; t < p.count; t += 3) {
      const cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
      const dst = cy > this.occY ? up : lo, dn = cy > this.occY ? upN : loN;
      for (let k = 0; k < 3; k++) { dst.push(p.getX(t + k), p.getY(t + k), p.getZ(t + k)); dn.push(nrm.getX(t + k), nrm.getY(t + k), nrm.getZ(t + k)); }
    }
    const mk = (arr, n, mat) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
      const m = new THREE.Mesh(geo, mat); m.renderOrder = 12; m.frustumCulled = false; return m;
    };
    this.gingivaU = mk(up, upN, this.mats.gingivaU);
    this.gingivaL = mk(lo, loN, this.mats.gingiva);
    this.gingivaL.position.sub(this.hinge);
    this.skull.add(this.gingivaU);
    this.mandibleGroup.add(this.gingivaL);
    this.gingiva.visible = false;
  }

  // angle: opening rotation about the condylar axis; protr: anterior translation (m)
  setJaw(angle, protr = 0) {
    this.jawAngle = angle;
    this.mandibleGroup.rotation.x = angle;
    this.mandibleGroup.position.set(this.hinge.x, this.hinge.y, this.hinge.z + protr);
  }

  // horizontal arch narrowing of an upper tooth (scene 5)
  archOffset(rec, narrow) {
    const f = rec.final;
    return archShiftX(f.x, f.y, f.z, narrow);
  }
}
