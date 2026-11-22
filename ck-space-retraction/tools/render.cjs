// Frame-accurate offline render: headless Chromium (WebGL via SwiftShader) → JPEG frames.
// usage: node tools/render.cjs [framesDir=build/frames] [workers=3] [from=0] [to=end]
// then:  bash tools/encode.sh build/frames
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2] || 'build/frames';
  const workers = +(process.argv[3] || 3);
  fs.mkdirSync(out, { recursive: true });
  const port = 8140; const srv = await start(port);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const total = 55 * 30;
  const from = +(process.argv[4] || 0), to = +(process.argv[5] || total);
  const todo = [];
  for (let i = from; i < to; i++) if (!fs.existsSync(path.join(out, `${String(i).padStart(5, '0')}.jpg`))) todo.push(i);
  // interleave heavy (matrix) and light frames across workers
  console.log(`frames ${from}-${to}: ${todo.length} to render with ${workers} workers`);
  let next = 0, done = 0; const t0 = Date.now();
  async function worker() {
    const p = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    p.on('pageerror', (e) => console.log('pageerror', e.message));
    await p.goto(`http://localhost:${port}/index.html?render=1${process.env.SUBS === "0" ? "&subs=0" : ""}${process.env.LOOK ? "&look=" + process.env.LOOK : ""}`);
    await p.waitForFunction('window.ready === true', null, { timeout: 300000 });
    while (next < todo.length) {
      const i = todo[next++];
      const data = await p.evaluate((i) => { CK.renderFrame(i); return CK.grab('image/jpeg', 0.96); }, i);
      fs.writeFileSync(path.join(out, `${String(i).padStart(5, '0')}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
      if (++done % 30 === 0) { const el = (Date.now() - t0) / 1000; console.log(`${done}/${todo.length}  ${(el / done).toFixed(2)} s/frame  ETA ${(el / done * (todo.length - done) / 60).toFixed(1)} min`); }
    }
    await p.close();
  }
  await Promise.all(Array.from({ length: workers }, worker));
  await browser.close(); srv.close();
  console.log('done in', ((Date.now() - t0) / 60000).toFixed(1), 'min');
})();
