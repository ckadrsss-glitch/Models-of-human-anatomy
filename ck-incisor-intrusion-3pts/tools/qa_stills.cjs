// Control images of the construction and the three force systems, rendered before the full render.
// usage: node tools/qa_stills.cjs <outDir>
//  01 frontal · 02 occlusal · 03 vestibular (cantilever + stepped extension) · 04–06 close-ups of the tie at A / B / C
//  07 sagittal projection of the three force systems (start pose: F, line of action, d, M)
//  08 crown / root trajectories of the three outcomes (final comparison) · 09 reactive forces and moments on the anchors
const { chromium } = require('playwright'); const { start } = require('./serve.cjs');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2] || 'docs/qa'; fs.mkdirSync(out, { recursive: true });
  const port = 8191; const srv = await start(port);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`http://localhost:${port}/index.html?render=1&subs=0`); await p.waitForFunction('window.ready===true', null, { timeout: 300000 });
  const shot = async (name, fn, arg) => {
    const data = await p.evaluate(fn, arg);
    fs.writeFileSync(path.join(out, name + '.jpg'), Buffer.from(data.split(',')[1], 'base64')); console.log(name);
  };
  const hw = ([c, u]) => { CK.setOverlay(false); CK.setCamera(c); CK.setTie(u); CK.setAct(1); CK.renderTime(13.5); const g = CK.grab('image/jpeg', 0.93); CK.setOverlay(true); CK.setCamera(null); CK.setTie(null); CK.setAct(null); return g; };
  await shot('qa_01_frontal_construction', hw, [{ az: 0, el: 6, dist: 205, tgt: [0, 6, -9], fov: 30 }, 0]);
  await shot('qa_02_occlusal_construction', hw, [{ az: 0, el: 84, dist: 215, tgt: [0, 8, -12], fov: 30 }, 0]);
  await shot('qa_03_vestibular_cantilever_extension', hw, [{ az: 70, el: 4, dist: 150, tgt: [16, 6, -10], fov: 30 }, 0]);
  await shot('qa_04_tie_A_closeup', hw, [{ az: 34, el: 12, dist: 62, tgt: [6, 9.5, 8.5], fov: 30 }, 0]);
  await shot('qa_05_tie_B_closeup', hw, [{ az: 58, el: 10, dist: 62, tgt: [17.5, 7.5, 0.5], fov: 30 }, 1]);
  await shot('qa_06_tie_C_closeup', hw, [{ az: 66, el: 10, dist: 62, tgt: [21.5, 7.5, -4], fov: 30 }, 2]);
  const plain = (t) => { CK.renderTime(t); return CK.grab('image/jpeg', 0.93); };
  for (const [n, t] of [['qa_07a_force_system_A', 20.2], ['qa_07b_force_system_B', 32.4], ['qa_07c_force_system_C', 41.5],
    ['qa_08_trajectories_comparison', 56.4], ['qa_08a_trajectories_A', 22.55], ['qa_08b_trajectories_B', 35.95], ['qa_08c_trajectories_C', 45.0],
    ['qa_09_reactive_loads_anchorage', 52.4]]) await shot(n, plain, t);
  await b.close(); srv.close();
})();
