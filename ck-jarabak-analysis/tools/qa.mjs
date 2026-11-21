// Numerical QA of the morphology: prints every value that the film shows, measured on the warped bone.
// usage: node tools/qa.mjs
import { ceph, PATTERNS, K, warp2 } from '../src/morph.js';
const f1 = (x) => x.toFixed(1), p = (a) => `(${f1(a[0])}, ${f1(a[1])})`;
console.log('K', JSON.stringify(K));
const rows = [['base v=0', 0, 0], ...PATTERNS.map((q) => [q.key + ' v=' + q.v.toFixed(3), q.v, 0])];
for (const r of [-7, 7]) rows.push([`neutral + rot ${r}°`, PATTERNS[1].v, r]);
for (const [name, v, r] of rows) {
  const c = ceph(v, r);
  console.log(`${name.padEnd(22)} S-Go ${f1(c.SGo)}  N-Me ${f1(c.NMe)}  ratio ${c.ratio.toFixed(2)}%  saddle ${f1(c.saddle)}  articular ${f1(c.articular)}  gonial ${f1(c.gonial)}  sum ${f1(c.sum)}  Ar${p(c.Ar)} Go${p(c.Go)} Me${p(c.Me)}`);
}
const U1 = [92.3, -74.6], L1 = [89.0, -73.5];
for (const q of PATTERNS) console.log(q.key, 'U1', p(warp2(U1, 2, q.v)), 'L1', p(warp2(L1, 3, q.v)));
// geometric identity check: Björk sum = 360° + angle between S→N and Go→Me (closed polygon N-S-Ar-Go-Me)
const { angle } = await import('../src/morph.js');
for (const q of PATTERNS) {
  const c = ceph(q.v);
  const sn = [c.N[0] - c.S[0], c.N[1] - c.S[1]], mp = [c.Me[0] - c.Go[0], c.Me[1] - c.Go[1]];
  const a = angle([sn[0], sn[1]], [0, 0], [mp[0], mp[1]]);
  console.log(`${q.key}: Björk sum ${c.sum.toFixed(2)}°  vs  360 + SN/Go-Me ${(360 + a).toFixed(2)}°  (Δ ${(c.sum - 360 - a).toFixed(3)})`);
}
// Ar check: articulare lies on both the condylar contour and the cranial-base contour by construction (segment intersection)
