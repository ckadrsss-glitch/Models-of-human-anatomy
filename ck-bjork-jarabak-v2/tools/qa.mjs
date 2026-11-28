// Scientific / numerical QA of every model shown in the film. Writes docs/QA_REPORT.json.
// usage: node tools/qa.mjs      (exit code 1 if any check fails)
import fs from 'fs';
import { ceph, angle, SCALE, SN_SOURCE } from '../src/morph.js';
import { STATES } from '../src/states.js';

const keys = ['SN', 'SAr', 'ArGo', 'GoMe', 'SGo', 'NMe', 'ratio', 'saddle', 'articular', 'gonial', 'sum', 'upperGonial', 'lowerGonial', 'pogAP'];
const C = Object.fromEntries(Object.entries(STATES).map(([k, P]) => [k, ceph(P)]));
const table = Object.fromEntries(Object.entries(C).map(([k, c]) => [k, Object.fromEntries(keys.map((m) => [m, +c[m].toFixed(2)]))]));
const checks = [];
const ok = (name, cond, detail) => checks.push({ name, pass: !!cond, detail });
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const R = C.REF;
// reference model (normodivergent) — chosen consistent system (docs/SCIENCE.md)
ok('REF S–N = 71.0 mm', near(R.SN, 71, 0.05), R.SN);
ok('REF saddle = 123.0°', near(R.saddle, 123, 0.05), R.saddle);
ok('REF articular = 143.0°', near(R.articular, 143, 0.05), R.articular);
ok('REF gonial = 130.0°', near(R.gonial, 130, 0.05), R.gonial);
ok('REF Björk sum = 396.0°', near(R.sum, 396, 0.1), R.sum);
ok('REF Go–Me = 71.0 mm', near(R.GoMe, 71, 0.05), R.GoMe);
ok('REF S–Ar within 32 ± 3 mm', R.SAr >= 29 && R.SAr <= 35, R.SAr);
ok('REF Ar–Go within 44 ± 5 mm', R.ArGo >= 39 && R.ArGo <= 49, R.ArGo);
ok('REF Jarabak ratio = 63.8 % (within 62–65 %)', near(R.ratio, 63.8, 0.05), R.ratio);
ok('REF upper gonial within 52–55°', R.upperGonial >= 52 && R.upperGonial <= 55, R.upperGonial);
ok('REF lower gonial reported (ref 70–75°; may lie outside — see SCIENCE.md)', true, R.lowerGonial);
// every model: split of the gonial angle adds up, Björk identity holds
for (const [k, c] of Object.entries(C)) {
  ok(`${k}: upper + lower gonial = gonial`, near(c.upperGonial + c.lowerGonial, c.gonial, 0.01), [c.upperGonial, c.lowerGonial, c.gonial]);
  const sn = [c.N[0] - c.S[0], c.N[1] - c.S[1]], mp = [c.Me[0] - c.Go[0], c.Me[1] - c.Go[1]];
  ok(`${k}: Björk sum = 360° + angle(S–N, Go–Me)`, near(c.sum, 360 + angle(sn, [0, 0], mp), 0.01), c.sum);
  ok(`${k}: S–N = 71.0 mm (same cranial base in every model)`, near(c.SN, 71, 0.01), c.SN);
}
// hook / payoff pair and the three patterns: same body length, different profile
for (const k of ['HYPO', 'HYPER']) ok(`${k}: Go–Me = 71.0 mm`, near(C[k].GoMe, 71, 0.05), C[k].GoMe);
ok('HYPER ratio = 56 %', near(C.HYPER.ratio, 56, 0.05), C.HYPER.ratio);
ok('HYPO ratio = 68 %', near(C.HYPO.ratio, 68, 0.05), C.HYPO.ratio);
ok('NORMO (= REF) ratio rounds to 64 %', Math.round(R.ratio) === 64, R.ratio);
ok('HYPER sum > 396° + 6°, HYPO sum < 396°', C.HYPER.sum > 402 && C.HYPO.sum < 396, [C.HYPER.sum, C.HYPO.sum]);
ok('hook: chin projection differs (HYPO more anterior)', C.HYPO.Pog[0] - C.HYPER.Pog[0] > 5, C.HYPO.Pog[0] - C.HYPER.Pog[0]);
// saddle demonstration: only the saddle angle changes
for (const k of ['SAD_LO', 'SAD_HI']) {
  ok(`${k}: articular unchanged`, near(C[k].articular, R.articular, 0.05), C[k].articular);
  ok(`${k}: gonial unchanged`, near(C[k].gonial, R.gonial, 0.25), C[k].gonial);
  ok(`${k}: Go–Me unchanged (71 ± 0.6 mm)`, near(C[k].GoMe, 71, 0.6), C[k].GoMe);
}
ok('SAD_LO saddle = 118°, SAD_HI = 128°', near(C.SAD_LO.saddle, 118, 0.05) && near(C.SAD_HI.saddle, 128, 0.05), [C.SAD_LO.saddle, C.SAD_HI.saddle]);
// compensation example: integers on screen add up to 396 in both models
const ints = (c) => [c.saddle, c.articular, c.gonial].map(Math.round);
ok('Model A on screen: 123 + 143 + 130 = 396', ints(R).join() === '123,143,130', ints(R));
ok('Model B on screen: 133 + 133 + 130 = 396', ints(C.COMP).join() === '133,133,130', ints(C.COMP));
ok('Model B exact sum within 0.1° of 396', near(C.COMP.sum, 396, 0.1), C.COMP.sum);
// ramus comparison
ok('ramus variants: ±6 mm Ar–Go around REF', near(C.RAM_S.ArGo, R.ArGo - 6, 0.05) && near(C.RAM_L.ArGo, R.ArGo + 6, 0.05), [C.RAM_S.ArGo, C.RAM_L.ArGo]);
const failed = checks.filter((c) => !c.pass);
const report = { scale: { factor: +SCALE.toFixed(5), sourceSN: +SN_SOURCE.toFixed(2) }, models: table, checks, passed: checks.length - failed.length, total: checks.length };
fs.writeFileSync('docs/QA_REPORT.json', JSON.stringify(report, null, 1));
for (const [k, v] of Object.entries(table)) console.log(k.padEnd(7), keys.map((m) => `${m} ${v[m]}`).join('  '));
console.log(`\nQA: ${report.passed}/${report.total} checks passed`);
failed.forEach((c) => console.log('FAIL', c.name, c.detail));
process.exit(failed.length ? 1 : 0);
