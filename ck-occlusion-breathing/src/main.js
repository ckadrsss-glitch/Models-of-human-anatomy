import { Film } from './film.js';
import { DURATION, FPS, WIDTH, HEIGHT, SCENES, VOICE } from './timeline.js';

const params = new URLSearchParams(location.search);
const RENDER = params.has('render');
const MIX_FILE = 'assets/audio/mix.m4a';
if (RENDER) document.body.classList.add('render');

const gl = document.getElementById('gl');
const ov = document.getElementById('ov');
const film = new Film(gl, ov);

// composite canvas (WebGL + overlay) used for frame grabs and exports
const comp = document.createElement('canvas');
comp.width = WIDTH; comp.height = HEIGHT;
const cctx = comp.getContext('2d');
function composite() {
  cctx.drawImage(gl, 0, 0);
  cctx.drawImage(ov, 0, 0);
  return comp;
}

await document.fonts.load('800 40px Montserrat');
await document.fonts.load('500 40px Montserrat');
await film.load('');
document.getElementById('loading').remove();

// --------------------------------------------------------------- headless API
window.CK = {
  duration: DURATION, fps: FPS,
  renderFrame(i) { film.render(i / FPS); composite(); return true; },
  grab(type = 'image/jpeg', q = 0.92) { return comp.toDataURL(type, q); },
  render(t) { film.render(t); composite(); },
  voice: VOICE,
};
window.ready = true;

if (!RENDER) initPlayer();
else film.render(+params.get('t') || 0);

// --------------------------------------------------------------- player
function initPlayer() {
  const $ = (id) => document.getElementById(id);
  const playBtn = $('play'), scrub = $('scrub'), time = $('time'), status = $('status');
  let playing = false, t = +params.get('t') || 0, startWall = 0, startT = 0, muted = false;
  let actx = null, buffers = null, tracks = [], sources = [], gain = null;

  scrub.max = DURATION.toFixed(3);
  const fmt = (x) => `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`;

  async function loadAudio() {
    if (buffers) return;
    actx = new AudioContext();
    gain = actx.createGain(); gain.connect(actx.destination);
    // full mix (voice + music + sound design) built by tools/build_audio.mjs; fallback: voice clips only
    const load = async (f) => { try { const r = await fetch(f); if (!r.ok) return null; return await actx.decodeAudioData(await r.arrayBuffer()); } catch { return null; } };
    const mix = await load(MIX_FILE);
    if (mix) { buffers = [mix]; tracks = [{ start: 0 }]; }
    else { buffers = await Promise.all(VOICE.map((v) => load(v.file))); tracks = VOICE; }
  }
  function stopAudio() { for (const s of sources) try { s.stop(); } catch {} sources = []; }
  function startAudio(from) {
    stopAudio();
    if (!buffers || muted) return;
    tracks.forEach((v, i) => {
      const b = buffers[i]; if (!b) return;
      const end = v.start + b.duration; if (end <= from) return;
      const src = actx.createBufferSource(); src.buffer = b; src.connect(gain);
      const when = actx.currentTime + Math.max(0, v.start - from);
      src.start(when, Math.max(0, from - v.start));
      sources.push(src);
    });
  }

  async function play() {
    await loadAudio();
    if (actx.state === 'suspended') await actx.resume();
    if (t >= DURATION - 0.05) t = 0;
    playing = true; startWall = performance.now(); startT = t;
    startAudio(t);
    playBtn.textContent = '❚❚ Пауза';
  }
  function pause() { playing = false; stopAudio(); playBtn.textContent = '▶︎ Пуск'; }
  playBtn.onclick = () => (playing ? pause() : play());
  playBtn.disabled = false;
  $('mute').onclick = () => { muted = !muted; $('mute').textContent = muted ? '🔇' : '🔊'; if (playing) startAudio(t); };
  scrub.oninput = () => { t = +scrub.value; if (playing) { startWall = performance.now(); startT = t; startAudio(t); } draw(); };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
    if (e.code === 'ArrowRight') { t = Math.min(DURATION, t + (e.shiftKey ? 5 : 1 / FPS)); draw(); }
    if (e.code === 'ArrowLeft') { t = Math.max(0, t - (e.shiftKey ? 5 : 1 / FPS)); draw(); }
  });
  const sc = $('scenes');
  for (const S of SCENES) {
    const b = document.createElement('button');
    b.textContent = `${S.id}. ${S.name}`;
    b.onclick = () => { t = S.t0; if (playing) { startWall = performance.now(); startT = t; startAudio(t); } draw(); };
    sc.appendChild(b);
  }
  function draw() { film.render(t); scrub.value = t; time.textContent = `${fmt(t)} / ${fmt(DURATION)}`; }
  function loop() {
    if (playing) {
      t = startT + (performance.now() - startWall) / 1000;
      if (t >= DURATION) { t = DURATION; pause(); }
      draw();
    }
    requestAnimationFrame(loop);
  }
  draw(); loop();

  // ---------------- real-time WebM capture (works anywhere MediaRecorder exists)
  const webmBtn = $('exportWebm'); webmBtn.disabled = false;
  webmBtn.onclick = async () => {
    await loadAudio();
    const vStream = comp.captureStream(FPS);
    const dest = actx.createMediaStreamDestination(); gain.connect(dest);
    const stream = new MediaStream([...vStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 2_600_000 });
    const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => { gain.disconnect(dest); download(new Blob(chunks, { type: 'video/webm' }), 'CK_BIOMECHANICS_occlusion_breathing.webm'); status.textContent = 'WebM готов'; };
    t = 0; rec.start(); await play(); status.textContent = 'Идёт запись в реальном времени…';
    const tick = setInterval(() => { composite(); if (!playing) { clearInterval(tick); rec.stop(); } }, 1000 / FPS);
  };

  // ---------------- frame-accurate MP4 export via WebCodecs
  const mp4Btn = $('exportMp4');
  mp4Btn.disabled = !('VideoEncoder' in window);
  mp4Btn.onclick = async () => {
    pause(); mp4Btn.disabled = true;
    try { await exportMp4((p) => { status.textContent = `Рендер MP4: ${(p * 100).toFixed(0)}%`; }); status.textContent = 'MP4 готов'; }
    catch (e) { console.error(e); status.textContent = 'Ошибка экспорта: ' + e.message; }
    mp4Btn.disabled = false;
  };

  async function exportMp4(progress) {
    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
    await loadAudio();
    // mix voice-over offline
    const SR = 48000;
    const off = new OfflineAudioContext(2, Math.ceil(DURATION * SR), SR);
    tracks.forEach((v, i) => { const b = buffers[i]; if (!b) return; const s = off.createBufferSource(); s.buffer = b; s.connect(off.destination); s.start(v.start); });
    const mix = await off.startRendering();
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({ target, fastStart: 'in-memory', video: { codec: 'avc', width: WIDTH, height: HEIGHT, frameRate: FPS }, audio: { codec: 'aac', numberOfChannels: 2, sampleRate: SR } });
    const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { throw e; } });
    venc.configure({ codec: 'avc1.640028', width: WIDTH, height: HEIGHT, bitrate: 2_600_000, framerate: FPS, bitrateMode: 'variable' });
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { throw e; } });
    aenc.configure({ codec: 'mp4a.40.2', numberOfChannels: 2, sampleRate: SR, bitrate: 128000 });
    const N = Math.round(DURATION * FPS);
    for (let i = 0; i < N; i++) {
      film.render(i / FPS); composite();
      const frame = new VideoFrame(comp, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      venc.encode(frame, { keyFrame: i % (FPS * 2) === 0 }); frame.close();
      if (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
      if (i % 10 === 0) { progress(i / N); await new Promise((r) => setTimeout(r, 0)); }
    }
    const CH = 1024;
    const L = mix.getChannelData(0), R = mix.getChannelData(1);
    for (let i = 0; i < mix.length; i += CH) {
      const n = Math.min(CH, mix.length - i), data = new Float32Array(n * 2);
      data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
      aenc.encode(new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i * 1e6 / SR), data }));
    }
    await venc.flush(); await aenc.flush(); muxer.finalize();
    download(new Blob([target.buffer], { type: 'video/mp4' }), 'CK_BIOMECHANICS_occlusion_breathing.mp4');
  }
}

function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
