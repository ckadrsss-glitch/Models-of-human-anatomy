// Render selected timestamps to JPEGs (review / thumbnails).
// usage: node tools/stills.js <outDir> t1 t2 ...
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');
const fs = require('fs'), path = require('path');
(async () => {
  const [out, ...times] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const srv = await start(8130);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.text().slice(0, 300)); });
  await p.goto('http://localhost:8130/index.html?render=1');
  await p.waitForFunction('window.ready === true', null, { timeout: 300000 });
  for (const t of times) {
    const t0 = Date.now();
    const data = await p.evaluate((t) => { CK.render(t); return CK.grab('image/jpeg', 0.9); }, +t);
    fs.writeFileSync(path.join(out, `f_${String(times.indexOf(t)).padStart(2, '0')}_${t}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
    console.log('t', t, 'ms', Date.now() - t0);
  }
  await b.close(); srv.close();
})();
