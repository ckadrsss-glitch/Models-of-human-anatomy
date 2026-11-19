// Frame-accurate offline render: headless Chromium (WebGL) → JPEG frames on disk.
// usage: node tools/render.cjs <framesDir> [workers=2] [from=0] [to=end]
// Then: node tools/build_audio.mjs && bash tools/encode.sh <framesDir>
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');
const fs = require('fs'), path = require('path');

(async () => {
  const out = process.argv[2] || 'build/frames';
  const workers = +(process.argv[3] || 2);
  fs.mkdirSync(out, { recursive: true });
  const srv = await start(8140);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const probe = await browser.newPage();
  await probe.goto('http://localhost:8140/index.html?render=1');
  await probe.waitForFunction('window.ready === true', null, { timeout: 300000 });
  const { duration, fps } = await probe.evaluate(() => ({ duration: CK.duration, fps: CK.fps }));
  await probe.close();
  const total = Math.round(duration * fps);
  const from = +(process.argv[4] || 0), to = +(process.argv[5] || total);
  const todo = [];
  for (let i = from; i < to; i++) if (!fs.existsSync(path.join(out, `${String(i).padStart(5, '0')}.jpg`))) todo.push(i);
  console.log(`frames ${from}-${to}, ${todo.length} to render, ${workers} workers`);
  let next = 0, done = 0; const t0 = Date.now();
  async function worker(id) {
    const p = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    p.on('pageerror', (e) => console.log('pageerror', e.message));
    await p.goto('http://localhost:8140/index.html?render=1');
    await p.waitForFunction('window.ready === true', null, { timeout: 300000 });
    while (next < todo.length) {
      const i = todo[next++];
      const data = await p.evaluate((i) => { CK.renderFrame(i); return CK.grab('image/jpeg', 0.95); }, i);
      fs.writeFileSync(path.join(out, `${String(i).padStart(5, '0')}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
      if (++done % 30 === 0) {
        const el = (Date.now() - t0) / 1000, eta = el / done * (todo.length - done);
        console.log(`${done}/${todo.length}  ${(el / done).toFixed(2)} s/frame  ETA ${(eta / 60).toFixed(1)} min`);
      }
    }
    await p.close();
  }
  await Promise.all(Array.from({ length: workers }, (_, k) => worker(k)));
  await browser.close(); srv.close();
  console.log('done in', ((Date.now() - t0) / 60000).toFixed(1), 'min');
})();
