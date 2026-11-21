// Export the reusable CK BIOMECHANICS brand assets from src/brand.js:
//   assets/brand/ck_background_1080x1920.png   — brand background
//   assets/brand/ck_logo_transparent.png       — logo (circle + CK, BIOMECHANICS below) on transparency
//   export/CK_BIOMECHANICS_outro_3s.mp4         — universal 3-second outro (1080×1920, 30 fps, silent)
const { chromium } = require('playwright');
const { start } = require('./serve.cjs');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
(async () => {
  fs.mkdirSync('assets/brand', { recursive: true }); fs.mkdirSync('export', { recursive: true });
  const tmp = 'build/outro_frames'; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const srv = await start(8150);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.goto('http://localhost:8150/brand.html?render=1');
  await p.waitForFunction('window.ready === true');
  const save = (f, d) => fs.writeFileSync(f, Buffer.from(d.split(',')[1], 'base64'));
  save('assets/brand/ck_background_1080x1920.png', await p.evaluate(() => { BRANDKIT.bg(); return BRANDKIT.grab(); }));
  save('assets/brand/ck_logo_transparent.png', await p.evaluate(() => { BRANDKIT.logoOnly(); return BRANDKIT.grab(); }));
  const N = 90;
  for (let i = 0; i < N; i++) save(path.join(tmp, `${String(i).padStart(3, '0')}.png`), await p.evaluate((u) => { BRANDKIT.frame(u); return BRANDKIT.grab(); }, i / 30));
  await b.close(); srv.close();
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', '30', '-i', `${tmp}/%03d.png`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'export/CK_BIOMECHANICS_outro_3s.mp4'], { stdio: 'inherit' });
  console.log('brand assets exported');
})();
