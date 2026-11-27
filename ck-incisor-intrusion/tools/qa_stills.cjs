// Pre-render test frames of the construction: frontal / vestibular (buccal) / occlusal, for tie points 3, 4, 5.
// usage: node tools/qa_stills.cjs <outDir>   (writes qa_<view>_p<k>.jpg)
const { chromium } = require('playwright'); const { start } = require('./serve.cjs');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2] || 'build/qa'; fs.mkdirSync(out, { recursive: true });
  const port = 8191; const srv = await start(port);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`http://localhost:${port}/index.html?render=1&subs=0`); await p.waitForFunction('window.ready===true', null, { timeout: 300000 });
  const views = {
    frontal: { az: 0, el: 6, dist: 200, tgt: [0, 6, -9], fov: 30 },
    vestibular_left: { az: 72, el: 8, dist: 175, tgt: [12, 6, -10], fov: 30 },
    vestibular_right: { az: -72, el: 8, dist: 175, tgt: [-12, 6, -10], fov: 30 },
    occlusal: { az: 0, el: 82, dist: 175, tgt: [0, 8, -12], fov: 30 },
    macro_extension: { az: 48, el: 10, dist: 80, tgt: [11, 7, 2], fov: 30 },
  };
  for (const k of [3, 4, 5]) for (const [name, c] of Object.entries(views)) {
    if (name.startsWith('macro') && k === 3) continue;
    const data = await p.evaluate(([c, k]) => { CK.setCamera(c); CK.setTie(k); CK.renderTime(17.6); return CK.grab('image/jpeg', 0.92); }, [c, k]);
    fs.writeFileSync(path.join(out, `qa_${name}_p${k}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
    console.log(name, k);
  }
  await b.close(); srv.close();
})();
