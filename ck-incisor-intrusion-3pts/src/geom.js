// ============================================================================
//  Procedural appliance geometry (Three.js): rounded boxes, bracket, molar tube with
//  hook, rectangular-wire sweep, miniscrew, elastomeric chain link.
//  Units: mm. Local frames: x = mesio-distal (slot direction), y = occluso-gingival,
//  z = out of the tooth surface (bracket normal).
// ============================================================================
import * as THREE from 'three';

/** concatenate non-indexed geometries (position + normal) */
function mergeGeometries(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}

/** box with rounded edges (radius r) — box segments pushed onto an inner box + radius */
export function roundedBox(w, h, d, r = 0.2, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const p = g.attributes.position, n = g.attributes.normal;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
    const dlt = v.clone().sub(c);
    if (dlt.lengthSq() > 1e-12) { dlt.normalize(); v.copy(c).addScaledVector(dlt, r); n.setXYZ(i, dlt.x, dlt.y, dlt.z); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
const at = (g, x, y, z) => g.translate(x, y, z);

/** twin bracket: pad, body, four tie-wings, open slot (along x) at z ≈ slotZ */
export function bracketGeometry(slotZ = 1.55) {
  const parts = [];
  parts.push(at(roundedBox(3.1, 3.0, 0.32, 0.12), 0, 0, 0.16));                    // mesh pad on the enamel
  parts.push(at(roundedBox(2.1, 1.7, slotZ - 0.32 - 0.12, 0.18), 0, 0, (slotZ - 0.12 + 0.32) / 2));   // body under the slot
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {                             // tie-wings
    const wing = roundedBox(1.05, 0.95, 2.05, 0.22);
    wing.translate(sx * 0.68, sy * 0.92, 1.25);
    parts.push(wing);
    const lip = roundedBox(1.05, 0.5, 0.42, 0.16);                                  // undercut lip of the wing
    lip.translate(sx * 0.68, sy * 1.42, 2.02); parts.push(lip);
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

/** single molar tube with a gingival hook for an elastic; lumen axis along x at z = 1.75 */
export function tubeGeometry() {
  const parts = [];
  parts.push(at(roundedBox(4.0, 3.2, 0.3, 0.12), 0, 0, 0.15));                     // pad
  const shell = roundedBox(4.4, 1.55, 1.15, 0.45);                                  // tube body around the lumen
  shell.translate(0, 0, 1.75); parts.push(shell);
  parts.push(at(roundedBox(3.2, 1.0, 1.3, 0.25), 0, -0.2, 0.9));                    // web pad → tube
  // gingival hook (for the elastic): post from the tube, bent distally
  const post = new THREE.CylinderGeometry(0.32, 0.32, 1.9, 12); post.translate(-0.9, -1.55, 1.9); parts.push(post);
  const ball = new THREE.SphereGeometry(0.5, 14, 10); ball.translate(-0.9, -2.55, 1.9); parts.push(ball);
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/**
 * Sweep a rounded-rectangle profile (w × h) along a polyline; parallel-transport frames,
 * with `up` as the initial profile height direction. Returns / updates a BufferGeometry.
 */
export function sweepRect(points, w, h, up = [0, 1, 0], geo = null, rr = 0.08) {
  // profile: rounded rectangle, 4 corners × 3 = 12 points
  const prof = [];
  const cw = w / 2 - rr, ch = h / 2 - rr;
  for (const [cx, cy, a0] of [[cw, ch, 0], [-cw, ch, 90], [-cw, -ch, 180], [cw, -ch, 270]])
    for (let k = 0; k < 3; k++) { const a = (a0 + k * 45) * Math.PI / 180; prof.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a), Math.cos(a), Math.sin(a)]); }
  const n = points.length, m = prof.length;
  const pos = new Float32Array(n * m * 3), nor = new Float32Array(n * m * 3);
  const P = points.map((p) => new THREE.Vector3(...p));
  let T = P[1].clone().sub(P[0]).normalize();
  let U = new THREE.Vector3(...up); U.sub(T.clone().multiplyScalar(U.dot(T))).normalize();
  for (let i = 0; i < n; i++) {
    const Tn = (i < n - 1 ? P[i + 1].clone().sub(P[i]) : P[i].clone().sub(P[i - 1])).normalize();
    if (i > 0) {                                                   // parallel transport of U
      const ax = T.clone().cross(Tn); const s = ax.length();
      if (s > 1e-8) U.applyAxisAngle(ax.divideScalar(s), Math.asin(Math.min(1, s)) * (T.dot(Tn) < 0 ? -1 : 1));
      U.sub(Tn.clone().multiplyScalar(U.dot(Tn))).normalize();
      T = Tn;
    } else T = Tn;
    const B = T.clone().cross(U);
    for (let j = 0; j < m; j++) {
      const [x, y, nx, ny] = prof[j], k = (i * m + j) * 3;
      pos[k] = P[i].x + B.x * x + U.x * y; pos[k + 1] = P[i].y + B.y * x + U.y * y; pos[k + 2] = P[i].z + B.z * x + U.z * y;
      nor[k] = B.x * nx + U.x * ny; nor[k + 1] = B.y * nx + U.y * ny; nor[k + 2] = B.z * nx + U.z * ny;
    }
  }
  if (!geo) {
    geo = new THREE.BufferGeometry();
    const idx = [];
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < m; j++) {
      const a = i * m + j, b = i * m + (j + 1) % m, c = (i + 1) * m + j, d = (i + 1) * m + (j + 1) % m;
      idx.push(a, c, b, b, c, d);
    }
    geo.setIndex(idx);
    geo.userData.n = n;
  }
  if (geo.userData.n !== n) throw new Error('sweepRect: point count changed');
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.computeBoundingSphere();
  return geo;
}

/** resample a polyline to exactly n points (uniform arc length) */
export function resample(pts, n) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const tot = L[L.length - 1], out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = tot * i / (n - 1);
    while (j < L.length - 2 && L[j + 1] < s) j++;
    const u = (s - L[j]) / Math.max(1e-9, L[j + 1] - L[j]);
    out.push([0, 1, 2].map((k) => pts[j][k] + (pts[j + 1][k] - pts[j][k]) * u));
  }
  return out;
}

/** miniscrew along −y from the head (y = 0): head + collar + threaded body (length len) */
export function screwGeometry(len = 8, dia = 1.6) {
  const parts = [];
  // head: hexagonal collar, button with a cross slot and a hole (for the elastic)
  const hex = new THREE.CylinderGeometry(1.35, 1.35, 1.0, 6); hex.translate(0, -0.2, 0); parts.push(hex);
  const btn = new THREE.CylinderGeometry(1.05, 1.25, 0.9, 28); btn.translate(0, 0.65, 0); parts.push(btn);
  const neck = new THREE.CylinderGeometry(0.75, 0.75, 0.7, 24); neck.translate(0, 1.35, 0); parts.push(neck);
  const cap = new THREE.SphereGeometry(1.05, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.55, 1); cap.translate(0, 1.7, 0); parts.push(cap);
  // transmucosal collar (smooth, polished)
  const col = new THREE.CylinderGeometry(0.95, 1.2, 1.6, 28); col.translate(0, -1.5, 0); parts.push(col);
  // threaded body: core (tapered) + helical thread
  const core = new THREE.CylinderGeometry(dia * 0.36, dia * 0.24, len, 24, 1); core.translate(0, -2.3 - len / 2, 0); parts.push(core);
  const turns = len / 0.75, pts = [];
  for (let i = 0; i <= turns * 28; i++) {
    const a = i / 28 * Math.PI * 2, y = -2.4 - i / 28 * 0.75, taper = 1 - 0.35 * Math.max(0, (-(y + 2.3) - len * 0.7) / (len * 0.3));
    pts.push(new THREE.Vector3(Math.cos(a) * dia * 0.43 * taper, y, Math.sin(a) * dia * 0.43 * taper));
  }
  const thread = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length, 0.12, 6, false); parts.push(thread);
  const tip = new THREE.ConeGeometry(dia * 0.24, 0.8, 18); tip.rotateX(Math.PI); tip.translate(0, -2.3 - len - 0.4, 0); parts.push(tip);
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/** double molar tube (36 / 46): main lumen (buccal segment wire) at z = 1.75 + auxiliary gingival lumen
 *  (cantilever) at y = −AUX.down, z = 1.75 + AUX.out; both along x. Mesial-gingival hook omitted. */
export function doubleTubeGeometry(down = 1.75, out = 0.35) {
  const parts = [];
  parts.push(at(roundedBox(4.2, 4.6, 0.3, 0.14), 0, -0.85, 0.15));                    // band-welded pad
  const shell = roundedBox(4.4, 1.5, 1.15, 0.44); shell.translate(0, 0, 1.75); parts.push(shell);
  const aux = roundedBox(3.6, 1.35, 1.05, 0.42); aux.translate(0, -down, 1.75 + out); parts.push(aux);
  parts.push(at(roundedBox(3.4, 3.2, 1.2, 0.3), 0, -0.85, 0.85));                    // web pad → both lumens
  // dark lumen openings (mesial faces) are suggested by small recessed boxes
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}
/** single buccal tube (37 / 47) */
export function singleTubeGeometry() {
  const parts = [];
  parts.push(at(roundedBox(3.8, 3.0, 0.3, 0.12), 0, 0, 0.15));
  const shell = roundedBox(4.0, 1.5, 1.15, 0.44); shell.translate(0, 0, 1.75); parts.push(shell);
  parts.push(at(roundedBox(3.0, 1.0, 1.3, 0.25), 0, -0.1, 0.9));
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}
