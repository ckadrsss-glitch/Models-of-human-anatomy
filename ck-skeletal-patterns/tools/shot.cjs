// Screenshots of local pages in headless Chromium (SwiftShader WebGL).
// usage: node tools/shot.cjs WxH "<path?query>" out.png ["<path?query>" out.png ...]
const { chromium } = require('playwright'); const { start } = require('./serve.cjs');
(async () => {
  const [size, ...rest] = process.argv.slice(2); const [w, h] = size.split('x').map(Number);
  const port = 8150 + Math.floor(Math.random() * 40);
  const srv = await start(port);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (let i = 0; i < rest.length; i += 2) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', (e) => console.log('pageerror', e.message));
    p.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
    await p.goto(`http://localhost:${port}/` + rest[i]); await p.waitForFunction('window.ready===true', null, { timeout: 180000 });
    await p.waitForTimeout(200); await p.screenshot({ path: rest[i + 1] }); await p.close();
  }
  await b.close(); srv.close();
})();
