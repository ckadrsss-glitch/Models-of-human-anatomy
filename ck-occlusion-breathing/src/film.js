import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Anatomy } from './anatomy.js';
import { Adenoid, Airflow, Lumen, buildPaths } from './airway.js';
import { Overlay } from './overlay.js';
import { sectionPlane, archUniforms, archShiftX, setOpacity } from './materials.js';
import { evaluate, PRIMARY, PERMANENT, WIDTH, HEIGHT } from './timeline.js';
import { smooth, smoother, easeInOut, easeOut, lerp, clamp } from './util.js';

const TEAL = new THREE.Color(0x2de2d0);

function makeBackground() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 512;
  const g = c.getContext('2d');
  const lg = g.createLinearGradient(0, 0, 0, 512);
  lg.addColorStop(0, '#0c2350'); lg.addColorStop(0.45, '#071a3d'); lg.addColorStop(1, '#020a1e');
  g.fillStyle = lg; g.fillRect(0, 0, 64, 512);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function arrowMesh(color) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthTest: false, depthWrite: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.00075, 0.00075, 1, 16), mat);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.0019, 0.0042, 24), mat);
  shaft.renderOrder = head.renderOrder = 60;
  grp.add(shaft, head);
  grp.userData = { shaft, head, mat };
  return grp;
}
// place an arrow from point a pointing along dir with length L
function setArrow(arr, a, dir, L, opacity) {
  const { shaft, head, mat } = arr.userData;
  const d = dir.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  arr.position.copy(a); arr.quaternion.copy(q);
  const sl = Math.max(0.0005, L - 0.0042);
  shaft.scale.set(1, sl, 1); shaft.position.set(0, sl / 2, 0);
  head.position.set(0, sl + 0.0021, 0);
  mat.opacity = opacity; arr.visible = opacity > 0.01;
}

export class Film {
  constructor(glCanvas, overlayCanvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(WIDTH, HEIGHT, false);
    this.renderer.localClippingEnabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = makeBackground();
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
    this.scene.environmentIntensity = 0.75;
    this.camera = new THREE.PerspectiveCamera(26, WIDTH / HEIGHT, 0.005, 5);
    this.scene.add(new THREE.HemisphereLight(0xe4f0ff, 0x0b1b3c, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-0.7, 0.9, 0.8); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd8ff, 0.8); fill.position.set(0.6, -0.2, 0.9); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0x7ff7ea, 1.4); rim.position.set(0.5, 0.4, -1); this.scene.add(rim);
    this.overlay = new Overlay(overlayCanvas);
    this.glCanvas = glCanvas;
  }

  async load(base = '') {
    const A = this.A = await new Anatomy().load(base + 'assets/head.glb');
    this.scene.add(A.root);
    // airway
    this.paths = buildPaths();
    this.adenoid = new Adenoid(); A.skull.add(this.adenoid.mesh);
    this.flow = new Airflow(this.paths); this.scene.add(this.flow.points);
    this.lumenL = new Lumen(this.paths.nasalL); this.lumenR = new Lumen(this.paths.nasalR);
    this.scene.add(this.lumenL.mesh, this.lumenR.mesh);
    // muscle equilibrium arrows (coronal section)
    this.arrows = {
      tongueL: arrowMesh(TEAL), tongueR: arrowMesh(TEAL),
      cheekL: arrowMesh(0xffffff), cheekR: arrowMesh(0xffffff),
    };
    for (const a of Object.values(this.arrows)) this.scene.add(a);
    this._prepTeeth();
    this._prepCeph();
    this.tongueMat = A.mats.tongue;
    return this;
  }

  _prepTeeth() {
    const A = this.A;
    for (const r of A.teeth) {
      const P = PERMANENT[r.code];
      r.sched = P;
      const lingual = new THREE.Vector3(-r.final.x, 0, 0.0 - r.final.z).normalize();
      r.germ = r.final.clone().addScaledVector(r.info.axis, -P.depth);
      if (P.lingual) r.germ.addScaledVector(lingual, P.lingual);
      const succ = A.primary.find((p) => p.jaw === r.jaw && p.side === r.side && PRIMARY[p.code].succ === r.code);
      r.pred = succ || null;
    }
    for (const p of A.primary) {
      p.sched = PRIMARY[p.code];
      p.germ = p.final.clone().addScaledVector(p.info.axis, -0.0105);
      p.succ = A.teeth.find((r) => r.jaw === p.jaw && r.side === p.side && r.code === p.sched.succ);
    }
    // physiological spacing markers (primate spaces + incisor diastemata)
    const crown = (rec) => rec.final.clone().addScaledVector(rec.info.axis, rec.info.max * 0.55);
    const pr = (j, s, c) => A.primary.find((p) => p.jaw === j && p.side === s && p.code === c);
    this.gaps = [];
    for (const s of ['l', 'r']) {
      this.gaps.push(crown(pr('U', s, 'B')).lerp(crown(pr('U', s, 'C')), 0.5));
      this.gaps.push(crown(pr('L', s, 'C')).lerp(crown(pr('L', s, 'D')), 0.5));
    }
    this.gaps.push(crown(pr('U', 'l', 'A')).lerp(crown(pr('U', 'r', 'A')), 0.5));
  }

  _prepCeph() {
    const A = this.A;
    const g = A.mandible.children[0]?.geometry || A.mandible.geometry;
    // mandible geometry is in hinge-relative coordinates (node offset) → use node world matrix
    const mesh = A.mandible.isMesh ? A.mandible : A.mandible.children.find((c) => c.isMesh);
    const p = mesh.geometry.attributes.position, v = new THREE.Vector3();
    let me = null, meY = Infinity, go = null, goS = -Infinity;
    const off = A.mandible.position.clone().add(A.hinge); // node pos is (−hinge) → world = v + off
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).add(off);
      if (Math.abs(v.x) < 0.004 && v.y < meY) { meY = v.y; me = v.clone(); }
      if (v.x < -0.025) { const sc = -v.z * 0.75 - v.y; if (sc > goS) { goS = sc; go = v.clone(); } }
    }
    this.ceph = { Me0: me, Go0: go, S: new THREE.Vector3(0, 0.0505, -0.0135), N: new THREE.Vector3(0, 0.0515, 0.0325), ANS: new THREE.Vector3(0, 0.0105, 0.0415) };
  }

  // ------------------------------------------------------------------ teeth
  _updateTeeth(s) {
    const A = this.A, age = s.age;
    const up = s.upperJaw, lo = s.lowerJaw;
    for (const p of A.primary) {
      const [e0, e1] = p.sched[p.jaw];
      const e = smooth(e0, e1, age);
      const pos = p.germ.clone().lerp(p.final, easeOut(e));
      let cut = p.info.cejH * (1 - smooth(e0 - 0.2, e1 + 0.9, age));
      // crown formation in the crypt before birth/early infancy
      cut = Math.max(cut, lerp(0.75, p.info.cejH, smooth(-0.6, 0.35, age)) * (1 - smooth(e0 - 0.2, e1 + 0.9, age)) );
      let opacity = 1;
      const S = p.succ ? p.succ.sched[p.jaw] : null;
      if (S) {
        const s0 = S[0];
        const res = smooth(s0 - 1.6, s0 + 0.15, age);           // physiological root resorption
        cut = Math.max(cut, res * p.info.cejH * 1.02);
        const ex = smooth(s0 + 0.05, s0 + 0.4, age);           // exfoliation
        pos.addScaledVector(p.info.axis, 0.0035 * easeInOut(ex));
        opacity = 1 - ex;
      }
      if (p.jaw === 'U') pos.x += archShiftX(p.final.x, p.final.y, p.final.z, s.narrow);
      A.placeTooth(p, pos);
      A.setToothCut(p, cut);
      A.setToothOpacity(p, opacity * (p.jaw === 'U' ? up : lo));
      A.setToothGlow(p, s.glowJaws * 0.4);
      A.setToothGerm(p, 1 - smooth(e0 - 0.15, e1, age));
    }
    for (const r of A.teeth) {
      const [p0, p1] = r.sched[r.jaw];
      const [f0, f1] = r.sched.form;
      const e = smooth(p0 + 0.1, p1, age);
      const pos = r.germ.clone().lerp(r.final, easeInOut(e));
      let cut;
      if (age < f1) cut = lerp(0.93, r.info.cejH, smooth(f0, f1, age));
      else cut = r.info.cejH * (1 - smooth(f1, p1 + 1.6, age));
      let opacity = smooth(f0 - 0.25, f0 + 0.35, age);
      if (r.jaw === 'U') pos.x += archShiftX(r.final.x, r.final.y, r.final.z, s.narrow);
      A.placeTooth(r, pos);
      A.setToothCut(r, cut);
      A.setToothOpacity(r, opacity * (r.jaw === 'U' ? up : lo));
      A.setToothGlow(r, s.glowJaws * 0.4);
      A.setToothGerm(r, 1 - smooth(p0, p1, age));
    }
  }

  apply(s) {
    const A = this.A;
    // camera
    const c = this.camera;
    c.position.set(...s.cam.pos);
    c.up.set(...s.cam.up).normalize();
    c.fov = s.cam.fov; c.updateProjectionMatrix();
    c.lookAt(...s.cam.target);

    // section plane
    if (s.sectionMode === 'coronal') { sectionPlane.normal.set(0, 0, -1); sectionPlane.constant = s.section; }
    else { sectionPlane.normal.set(1, 0, 0); sectionPlane.constant = s.section; }
    const wantClip = s.tongueClip ? 1 : 0;
    if (this._tongueClip !== wantClip) {
      this._tongueClip = wantClip;
      for (const m of [this.tongueMat, A.mats.softPalate, A.mats.tonsil]) { m.clippingPlanes = wantClip ? [sectionPlane] : []; m.needsUpdate = true; }
    }

    // bones
    for (const node of A.skull.children) this._boneVis(node, s.bone * s.neuro * (1 - 0.6 * s.coronal));
    const setBone = (node, op, glow) => node.traverse((o) => { if (o.isMesh && o.material.uniforms) { o.material.uniforms.uOpacity.value = op; o.material.uniforms.uGlow.value = glow; } });
    for (const k of Object.keys(A.nodes)) {
      const n = A.nodes[k];
      if (/^Maxilla|^Palatine_bone/.test(k)) setBone(n, s.bone * s.upperJaw, s.glowJaws);
    }
    setBone(A.mandible, s.bone * s.lowerJaw, s.glowJaws);
    A.mats.gingivaU.uniforms.uOpacity.value = s.gingiva * s.upperJaw;
    A.mats.gingiva.uniforms.uOpacity.value = s.gingiva * s.lowerJaw;
    A.mats.skin.uniforms.uOpacity.value = s.skin;
    A.skin.visible = s.skin > 0.003;
    A.mats.mucosa.uniforms.uOpacity.value = s.mucosa;
    for (const n of A.mucosa || []) n.visible = s.mucosa > 0.003;
    A.mats.eye.uniforms.uOpacity.value = s.skin * 0.6;
    archUniforms.uNarrow.value = s.narrow;

    // soft tissues
    const tv = s.tongueVis;
    setOpacity(this.tongueMat, tv); A.tongue.visible = tv > 0.004;
    this.tongueMat.userData.uGlow.value = s.glowTongue;
    setOpacity(A.mats.softPalate, s.soft * s.upperJaw);
    for (const n of A.softPalate || []) n.visible = s.soft > 0.004;
    // palatine tonsils stay hidden: they read as extra lumps next to the adenoid in lateral views
    A.mats.tonsil.opacity = 0;
    for (const n of A.tonsils || []) n.visible = A.mats.tonsil.opacity > 0.004;
    setOpacity(this.adenoid.mat, s.soft * s.neuro * s.adenoidVis);
    this.adenoid.mesh.visible = s.soft > 0.004;
    this.adenoid.mat.userData.uGlow.value = s.glowNaso;
    this.adenoid.setSize(s.adenoid);

    // jaw + tongue + skin
    A.setJaw(s.jaw);
    const tkey = s.tongueUp.toFixed(4) + '|' + s.jaw.toFixed(5);
    if (tkey !== this._tkey && tv > 0) { this._tkey = tkey; A.updateTongue(s.tongueUp, s.jaw); }
    if (s.skin > 0.003) A.updateSkin(s.jaw);

    // teeth
    this._updateTeeth(s);

    // airflow
    const narrow = s.adenoid;
    this.flow.points.visible = s.flowOpacity > 0.003;
    if (this.flow.points.visible) this.flow.update(s.t, { nasal: s.nasalFlow, oral: s.oralFlow, narrow, opacity: s.flowOpacity });
    this.flow.mat.uniforms.uScale.value = 1.6 * HEIGHT / (2 * Math.tan(THREE.MathUtils.degToRad(c.fov / 2))) * 0.0012;
    const lum = s.lumen;
    for (const L of [this.lumenL, this.lumenR]) {
      L.mesh.visible = lum > 0.003;
      L.mat.uniforms.uOpacity.value = lum * (1 + s.glowNaso);
    }
    if (lum > 0.003) {
      const rf = (u) => {
        const base = u < 0.4 ? 0.0028 : 0.0045;
        const sq = 1 - 0.62 * narrow * Math.exp(-((u - 0.53) ** 2) / 0.006);
        return lerp(0.0028, base, smooth(0.3, 0.45, u)) * sq * (1 - smooth(0.92, 1.0, u) * 0.6);
      };
      const key = narrow.toFixed(4);
      if (key !== this._lkey) { this._lkey = key; this.lumenL.update(rf); this.lumenR.update(rf); }
    }

    // equilibrium arrows (coronal section, first-molar level)
    const ar = s.arrows, b = s.balance;
    const z = 0.0075, yO = A.occY;
    const tY = lerp(yO + 0.0075, yO - 0.0015, b), tL = lerp(0.0085, 0.0045, b);
    setArrow(this.arrows.tongueL, new THREE.Vector3(0.0085, tY, z), new THREE.Vector3(1, 0, 0), tL, ar);
    setArrow(this.arrows.tongueR, new THREE.Vector3(-0.0085, tY, z), new THREE.Vector3(-1, 0, 0), tL, ar);
    const cL = lerp(0.0085, 0.0105, b), cY = yO + 0.006;
    setArrow(this.arrows.cheekL, new THREE.Vector3(0.0455, cY, z), new THREE.Vector3(-1, 0, 0), cL, ar);
    setArrow(this.arrows.cheekR, new THREE.Vector3(-0.0455, cY, z), new THREE.Vector3(1, 0, 0), cL, ar);
    s.arrowsLabels = ar > 0 ? [
      { text: 'ЯЗЫК', p: new THREE.Vector3(0, tY - 0.009, z), color: '#2de2d0' },
      { text: 'ЩЁКИ', p: new THREE.Vector3(-0.047, cY + 0.011, z), color: '#ffffff' },
      { text: 'ЩЁКИ', p: new THREE.Vector3(0.047, cY + 0.011, z), color: '#ffffff' },
    ] : null;

    // ceph tracing for the vertical pattern shot
    if (s.ceph > 0) {
      const rot = (v) => {
        const a = s.jaw, h = A.hinge, ry = v.y - h.y, rz = v.z - h.z;
        return new THREE.Vector3(v.x, h.y + ry * Math.cos(a) - rz * Math.sin(a), h.z + ry * Math.sin(a) + rz * Math.cos(a));
      };
      s.cephPts = { ...this.ceph, Me: rot(this.ceph.Me0), Go: rot(this.ceph.Go0) };
    }
    s.gaps = this.gaps;
    // palatal vault comparison (coronal shot)
    if (s.vault > 0) {
      const H0 = A.palateAt(0, 0.008);
      const y0 = A.occY + 0.0075;
      const curve = (w, h) => { const pts = []; for (let i = 0; i <= 40; i++) { const x = -w + 2 * w * i / 40; pts.push(new THREE.Vector3(x, y0 + (h) * Math.pow(Math.max(0, 1 - (x / w) ** 2), 0.75), 0.0075)); } return pts; };
      const hA = (Number.isNaN(H0) ? 0.006 : H0) - y0;
      s.lines = [
        { pts: curve(0.0165, hA), color: 'rgba(255,255,255,0.8)', width: 3, dash: [10, 9], alpha: s.vault },
        { pts: curve(0.0165 - 0.0042, hA + 0.0035), color: '#ff9a8a', width: 5, alpha: s.vault },
      ];
    }
  }

  _boneVis(node, op) {
    if (node === this.A.mandible || node === this.A.skin) return;
    node.traverse((o) => {
      if (o.isMesh && o.material.uniforms && this.A.boneMats.includes(o.material) && o.material !== this.A.mats.maxilla) o.material.uniforms.uOpacity.value = op;
    });
  }

  project(v) {
    const p = v.clone().project(this.camera);
    if (p.z > 1) return null;
    return { x: (p.x * 0.5 + 0.5) * WIDTH, y: (-p.y * 0.5 + 0.5) * HEIGHT };
  }

  render(t) {
    const s = evaluate(t);
    this.apply(s);
    this.renderer.render(this.scene, this.camera);
    this.overlay.draw(s, (v) => this.project(v));
    if (s.lines) this._drawLines(s.lines);
    return s;
  }

  _drawLines(lines) {
    const ctx = this.overlay.ctx;
    for (const L of lines) {
      ctx.save(); ctx.globalAlpha = L.alpha; ctx.strokeStyle = L.color; ctx.lineWidth = L.width; ctx.setLineDash(L.dash || []);
      ctx.shadowColor = L.color; ctx.shadowBlur = L.dash ? 0 : 12;
      ctx.beginPath();
      L.pts.forEach((p, i) => { const q = this.project(p); if (!q) return; i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
      ctx.stroke(); ctx.restore();
    }
  }
}
