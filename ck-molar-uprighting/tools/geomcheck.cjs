// Geometry check of the double cantilever: fixed vestibular / occlusal / junction cameras at given times.
// usage: DC=1 node tools/geomcheck.cjs <outDir> t1 t2 ...
const { chromium } = require('playwright'); const { start } = require('./serve.cjs');
const fs = require('fs'), path = require('path');
(async () => {
  const [out, ...ts] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
  const port = 8190 + Math.floor(Math.random() * 30); const srv = await start(port);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`http://localhost:${port}/index.html?render=1&dc=1&subs=0`); await p.waitForFunction('window.ready===true', null, { timeout: 300000 });
  const views = { vest: { az: 0, el: 0, dist: 150, tgt: [14, 6, 2], fov: 30 }, occl: { az: 0, el: 88, dist: 150, tgt: [14, 6, 3], fov: 30 }, junction: { az: -28, el: 12, dist: 52, tgt: [6.6, 7.4, 6.2], fov: 30 } };
  for (const t of ts) for (const [name, cam] of Object.entries(views)) {
    const data = await p.evaluate(([t, cam]) => { CK.setCamera(cam); CK.renderTime(+t); return CK.grab('image/jpeg', 0.9); }, [t, cam]);
    fs.writeFileSync(path.join(out, `${name}_${t}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
  }
  await b.close(); srv.close();
})();
