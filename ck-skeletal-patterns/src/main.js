// Player: Play / Pause / Restart, scrubbing, WebM recording (MediaRecorder),
// frame-accurate MP4 export (WebCodecs + mp4-muxer), headless render API.
import { Film } from './film.js';
import { SCENES, DURATION, FPS } from './timeline.js';

const q = new URLSearchParams(location.search);
const RENDER = q.has('render');
const film = new Film();
const $ = (id) => document.getElementById(id);

const stage = $('stage');
stage.appendChild(film.out);
if (RENDER) document.body.classList.add('render');

await film.init();
window.CK = { duration: DURATION, fps: FPS, renderFrame: (i) => film.renderFrame(i), renderTime: (t) => film.renderTime(t), grab: (t, qq) => film.grab(t, qq) };
window.ready = true;
$('loading')?.remove();

if (!RENDER) {
  let playing = false, t = +(q.get('t') || 0), last = 0, recording = null;
  const audio = $('audio');
  const scrub = $('scrub'), time = $('time');
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  function draw() { film.renderTime(t); scrub.value = t / DURATION * 1000; time.textContent = `${fmt(t)} / ${fmt(DURATION)}`; }
  function syncAudio() {
    if (!audio || audio.muted) return;
    if (playing) { if (Math.abs(audio.currentTime - t) > 0.15) audio.currentTime = t; audio.play().catch(() => {}); } else audio.pause();
  }
  function setPlaying(p) { playing = p; $('play').textContent = p ? '❚❚ Pause' : '▶ Play'; last = performance.now(); syncAudio(); }
  function loop(now) {
    if (playing) {
      t += (now - last) / 1000; last = now;
      if (t >= DURATION) { t = DURATION - 1e-3; setPlaying(false); if (recording) recording.stop(); }
      draw();
    }
    requestAnimationFrame(loop);
  }
  $('play').onclick = () => { if (t >= DURATION - 0.01) t = 0; setPlaying(!playing); };
  $('restart').onclick = () => { t = 0; draw(); setPlaying(true); };
  scrub.oninput = () => { t = scrub.value / 1000 * DURATION; draw(); syncAudio(); };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
    if (e.code === 'ArrowRight') { t = Math.min(DURATION - 1e-3, t + (e.shiftKey ? 1 : 1 / FPS)); draw(); }
    if (e.code === 'ArrowLeft') { t = Math.max(0, t - (e.shiftKey ? 1 : 1 / FPS)); draw(); }
  });
  const sc = $('scenes');
  SCENES.forEach((s) => { const b = document.createElement('button'); b.textContent = `${s.id} ${s.name}`; b.onclick = () => { t = s.t0; draw(); syncAudio(); }; sc.appendChild(b); });
  $('sound').onclick = () => { audio.muted = !audio.muted; $('sound').textContent = audio.muted ? '🔇 Sound off' : '🔊 Sound on'; syncAudio(); };

  const status = (s) => ($('status').textContent = s);
  const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

  // ---- 1. real-time WebM recording of the output canvas (MediaRecorder)
  $('rec').onclick = () => {
    if (recording) { recording.stop(); return; }
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!mime) { status('MediaRecorder / WebM is not supported in this browser'); return; }
    const stream = film.out.captureStream(FPS);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16e6 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => { recording = null; $('rec').textContent = '● Record WebM'; save(new Blob(chunks, { type: 'video/webm' }), 'CK_BIOMECHANICS_9_skeletal_patterns.webm'); status('WebM saved. Convert: see README (ffmpeg)'); };
    recording = rec; rec.start(500);
    $('rec').textContent = '■ Stop recording';
    status('Recording in real time — keep this tab visible…');
    t = 0; draw(); setPlaying(true);
  };

  // ---- 2. frame-accurate MP4 export (WebCodecs H.264 + mp4-muxer), independent of playback speed
  $('mp4').onclick = async () => {
    if (!('VideoEncoder' in window)) { status('WebCodecs not available — use “Record WebM” or the offline renderer'); return; }
    const { Muxer, ArrayBufferTarget } = await import('../vendor/mp4-muxer/mp4-muxer.mjs');
    setPlaying(false);
    const codec = 'avc1.640033';
    const cfg = { codec, width: 1080, height: 1920, bitrate: 12e6, framerate: FPS, avc: { format: 'avc' } };
    if (!(await VideoEncoder.isConfigSupported(cfg)).supported) { status('H.264 encoder not supported here — use “Record WebM”'); return; }
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: 1080, height: 1920, frameRate: FPS }, fastStart: 'in-memory' });
    const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => status('encoder error: ' + e.message) });
    enc.configure(cfg);
    const N = Math.round(DURATION * FPS);
    for (let i = 0; i < N; i++) {
      film.renderFrame(i);
      const vf = new VideoFrame(film.out, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame: i % 60 === 0 }); vf.close();
      if (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 1));
      if (i % 15 === 0) { status(`Exporting MP4… ${Math.round(i / N * 100)} %`); await new Promise((r) => setTimeout(r, 0)); }
    }
    await enc.flush(); muxer.finalize();
    save(new Blob([muxer.target.buffer], { type: 'video/mp4' }), 'CK_BIOMECHANICS_9_skeletal_patterns_silent.mp4');
    status('MP4 exported (silent, 1080×1920, 30 fps).');
    draw();
  };

  draw();
  requestAnimationFrame(loop);
  if (q.has('autoplay')) setPlaying(true);
}
