// V5 control frames of the corrected cantilever geometry (rendered before the full render).
// usage: node tools/v5_stills.cjs <outDir>
//  1 vestibular view of the whole cantilever · 2 exit from the auxiliary gingival tube 36 · 3 arm gingival to the
//  canine / premolar brackets · 4 hook (macro, B and A) · 5 occlusal view · 6 passive vs activated · 7 the three
//  configurations (same camera). Composites (6, 7) are assembled with ffmpeg.
const { chromium } = require('playwright'); const { start } = require('./serve.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
(async () => {
  const out = process.argv[2] || 'docs/qa_v5'; fs.mkdirSync(out, { recursive: true });
  const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
  const port = 8100 + Math.floor(Math.random() * 40); const srv = await start(port);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
  await p.goto(`http://localhost:${port}/index.html?render=1&subs=0`); await p.waitForFunction('window.ready===true', null, { timeout: 300000 });
  const shot = async (name, cam, u, act = 1) => {
    if (only && !only.test(name)) return;
    const data = await p.evaluate(([c, u, act]) => { CK.setOverlay(false); CK.setCamera(c); CK.setTie(u); CK.setAct(act); CK.renderTime(12.95); const g = CK.grab('image/jpeg', 0.93); CK.setOverlay(true); CK.setCamera(null); CK.setTie(null); CK.setAct(null); return g; }, [cam, u, act]);
    fs.writeFileSync(path.join(out, name + '.jpg'), Buffer.from(data.split(',')[1], 'base64')); console.log(name);
  };
  const VEST = { az: 80, el: 4, dist: 150, tgt: [19, 9, -6], fov: 30 };
  await shot('V5_01_vestibular_whole_cantilever_A', VEST, 0);
  await shot('V5_01_vestibular_whole_cantilever_B', VEST, 1);
  await shot('V5_02_exit_from_aux_gingival_tube_36', { az: 66, el: 8, dist: 42, tgt: [28.4, 10, -17.2], fov: 30 }, 1);
  await shot('V5_03_arm_below_buccal_brackets', { az: 76, el: 2, dist: 78, tgt: [22.5, 9.5, -6], fov: 30 }, 0);
  await shot('V5_04a_hook_macro_B', { az: 58, el: 16, dist: 22, tgt: [21.2, 8.4, 0.2], fov: 30 }, 1);
  await shot('V5_04b_hook_macro_A', { az: 32, el: 12, dist: 26, tgt: [6.9, 12.8, 10.6], fov: 30 }, 0);
  await shot('V5_04c_hook_macro_C', { az: 70, el: 16, dist: 22, tgt: [23.9, 8.4, -3.8], fov: 30 }, 2);
  await shot('V5_05_occlusal_view', { az: 0, el: 84, dist: 205, tgt: [0, 8, -10], fov: 30 }, 1);
  const PA = { az: 74, el: 4, dist: 140, tgt: [18, 8, -3], fov: 30 };
  await shot('_pa_passive', PA, 0, 0); await shot('_pa_active', PA, 0, 1);
  const CMP = { az: 60, el: 8, dist: 170, tgt: [15, 9.0, -3], fov: 30 };
  for (const [n, u] of [['_cmp_A', 0], ['_cmp_B', 1], ['_cmp_C', 2]]) await shot(n, CMP, u);
  await b.close(); srv.close();
  const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
  const f = (n) => path.join(out, n + '.jpg');
  const lab = (t) => `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${t}':fontcolor=white:fontsize=44:x=40:y=60:box=1:boxcolor=black@0.55:boxborderw=14`;
  const fontOk = fs.existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf');
  if (fs.existsSync(f('_pa_passive'))) ff(['-i', f('_pa_passive'), '-i', f('_pa_active'), '-filter_complex',
    fontOk ? `[0]${lab('PASSIVE')}[a];[1]${lab('ACTIVATED + HOOKED')}[b];[a][b]hstack` : '[0][1]hstack', '-q:v', '3', f('V5_06_passive_vs_activated')]);
  if (fs.existsSync(f('_cmp_A'))) ff(['-i', f('_cmp_A'), '-i', f('_cmp_B'), '-i', f('_cmp_C'), '-filter_complex',
    fontOk ? `[0]${lab('A · INTRUSION + PROCLINATION')}[a];[1]${lab('B · PURE INTRUSION')}[b];[2]${lab('C · INTRUSION + RETROCLINATION')}[c];[a][b][c]hstack=inputs=3,scale=2430:-2` : '[0][1][2]hstack=inputs=3,scale=2430:-2', '-q:v', '3', f('V5_07_three_configurations')]);
})();
