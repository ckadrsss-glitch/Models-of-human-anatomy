// Render selected film times to JPEG (quick visual checks).  usage: node tools/frames.cjs <outDir> t1 t2 …
const { chromium } = require('playwright'); const { start } = require('./serve.cjs');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const port = 8193; const srv = await start(port);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`http://localhost:${port}/index.html?render=1`); await p.waitForFunction('window.ready===true', null, { timeout: 300000 });
  for (const t of process.argv.slice(3).map(Number)) {
    const data = await p.evaluate((tt) => { CK.renderTime(tt); return CK.grab('image/jpeg', 0.9); }, t);
    fs.writeFileSync(path.join(out, `t${t.toFixed(2)}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
  }
  await b.close(); srv.close();
})();
