// node tools/debugshots.cjs outDir STATE1 STATE2 ...   → morphology debug renders with landmarks
const { chromium } = require('playwright'); const { start } = require('./serve.cjs'); const fs = require('fs'), path = require('path');
(async () => {
  const [out, ...st] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
  const port = 8170 + Math.floor(Math.random() * 20); const srv = await start(port);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const s of st) {
    const p = await b.newPage({ viewport: { width: 1000, height: 1100 } });
    p.on('pageerror', (e) => console.log('pageerror', e.message));
    await p.goto(`http://localhost:${port}/debug.html?s=${s}`); await p.waitForFunction('window.ready===true', null, { timeout: 120000 });
    await p.screenshot({ path: path.join(out, s + '.png') }); await p.close(); console.log(s);
  }
  await b.close(); srv.close();
})();
