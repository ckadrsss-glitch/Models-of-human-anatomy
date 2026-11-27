// Control images of the construction and the three force systems, rendered before the full render.
// usage: node tools/qa_stills.cjs <outDir>
//  01 frontal (levelling completed) · 02 occlusal (three segments) · 03 vestibular (straight rigid SS buccal segment) ·
//  04 anterior sectional wire · 05 up-turned tip of the extension (vestibular / occlusal) · 06 ligature · 07 passive /
//  activated cantilever · 08 ties A / B / C · 09 force systems · 10 trajectories · 11 reactive loads · 12–15 film frames ·
//  V4_construction_A/B/C — the three constructions (buccal oblique, cf. the Machado-type schematic)
//  Film times below are OUTPUT times (the film maps them through WARP).
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
  const hw = ([c, u, act = 1]) => { CK.setOverlay(false); CK.setCamera(c); CK.setTie(u); CK.setAct(act); CK.renderTime(12.95); const g = CK.grab('image/jpeg', 0.93); CK.setOverlay(true); CK.setCamera(null); CK.setTie(null); CK.setAct(null); return g; };
  // §10 control frames (V3): levelling completed, three rigid SS segments, sectional wire, terminal bend, ligature,
  // passive vs activated cantilever, the three tie configurations
  const A = [6.6, 13.2, 10.6];
  await shot('qa_01_frontal_levelled', hw, [{ az: 0, el: 6, dist: 205, tgt: [0, 6, -9], fov: 30 }, 0]);
  await shot('qa_02_occlusal_three_segments', hw, [{ az: 0, el: 84, dist: 215, tgt: [0, 8, -12], fov: 30 }, 0]);
  await shot('qa_03_vestibular_buccal_SS_segment', hw, [{ az: 82, el: 3, dist: 150, tgt: [20, 9, -14], fov: 30 }, 0]);
  await shot('qa_04_anterior_sectional_wire_closeup', hw, [{ az: 8, el: 6, dist: 92, tgt: [0, 11.5, 9.5], fov: 30 }, 0]);
  await shot('qa_05a_extension_tip_vestibular', hw, [{ az: 74, el: 4, dist: 46, tgt: [22.6, 9.6, -3.4], fov: 30 }, 1]);
  await shot('qa_05b_extension_tip_occlusal', hw, [{ az: 84, el: 58, dist: 50, tgt: [22.6, 9.8, -3.2], fov: 30 }, 1]);
  await shot('qa_06_ligature_closeup_B', hw, [{ az: 62, el: 16, dist: 44, tgt: [21.4, 8.6, 0.2], fov: 30 }, 1]);
  await shot('qa_07a_cantilever_passive', hw, [{ az: 48, el: 6, dist: 118, tgt: [13, 10.5, 1], fov: 30 }, 0, 0]);
  await shot('qa_07b_cantilever_activated', hw, [{ az: 48, el: 6, dist: 118, tgt: [13, 10.5, 1], fov: 30 }, 0, 1]);
  await shot('qa_08a_tie_A_closeup', hw, [{ az: 34, el: 12, dist: 62, tgt: [6, 11.5, 9.5], fov: 30 }, 0]);
  await shot('qa_08b_tie_B_closeup', hw, [{ az: 58, el: 10, dist: 62, tgt: [19.5, 8.5, 0.5], fov: 30 }, 1]);
  await shot('qa_08c_tie_C_closeup', hw, [{ az: 66, el: 10, dist: 62, tgt: [21.5, 8.5, -4], fov: 30 }, 2]);
  // the three constructions (activated and tied), identical camera: straight cantilever + sectional wire with up-turned tips
  for (const [n, u] of [['V4_construction_A', 0], ['V4_construction_B', 1], ['V4_construction_C', 2]])
    await shot(n, hw, [{ az: 56, el: 8, dist: 182, tgt: [14, 9.0, -3], fov: 30 }, u]);
  const plain = (t) => { CK.renderTime(t); return CK.grab('image/jpeg', 0.93); };
  for (const [n, t] of [['qa_09a_force_system_A', 18.9], ['qa_09b_force_system_B', 28.6], ['qa_09c_force_system_C', 39.6],
    ['qa_10a_trajectories_A', 21.25], ['qa_10b_trajectories_B', 32.15], ['qa_10c_trajectories_C', 41.6], ['qa_10_trajectories_comparison', 57.3],
    ['qa_11_reactive_loads_anchorage', 45.5], ['qa_12_film_activation', 11.04], ['qa_13_film_closeup_occlusal', 14.0], ['qa_14_film_closeup_vestibular', 15.06],
    ['qa_15_film_retie', 23.4], ['qa_16_film_macro_extension', 10.0]]) await shot(n, plain, t);
  await b.close(); srv.close();
})();
