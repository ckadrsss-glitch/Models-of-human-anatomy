// Control stills at given times: node tools/stills.cjs <outDir> t1 t2 ...
const { chromium } = require('playwright'); const { start } = require('./serve.cjs');
const fs = require('fs'), path = require('path');
(async () => {
  const [out, ...ts] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
  const port = 8150 + Math.floor(Math.random() * 40); const srv = await start(port);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text()); });
  await p.goto(`http://localhost:${port}/index.html?render=1${""}${process.env.SUBS ? "&subs=1" : ""}${process.env.LOOK ? "&look=" + process.env.LOOK : ""}`); await p.waitForFunction('window.ready===true', null, { timeout: 300000 });
  for (const t of ts) {
    const t0 = Date.now();
    const data = await p.evaluate((t) => { CK.renderTime(+t); return CK.grab('image/jpeg', 0.92); }, t);
    fs.writeFileSync(path.join(out, `t${String(t).padStart(5, '0')}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
    console.log('t', t, (Date.now() - t0) + ' ms');
  }
  await b.close(); srv.close();
})();
