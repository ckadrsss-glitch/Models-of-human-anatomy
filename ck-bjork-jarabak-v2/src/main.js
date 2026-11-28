// Player: Play / Pause / Restart, scrubbing, sound, audio import, WebM recording (MediaRecorder,
// with sound), frame-accurate MP4 export (WebCodecs H.264 + AAC + mp4-muxer), headless render API.
import { Film } from './film.js';
import { SCENES, DURATION, FPS } from './timeline.js';
import { VOICE } from './voice.js';

const q = new URLSearchParams(location.search);
const RENDER = q.has('render');
const film = new Film();
film.subtitles = q.has('subs');
const $ = (id) => document.getElementById(id);
const NAME = 'CK_BIOMECHANICS_BJORK_JARABAK_V2';

$('stage').appendChild(film.out);
if (RENDER) document.body.classList.add('render');

await film.init();
window.CK = { duration: DURATION, fps: FPS, renderFrame: (i) => film.renderFrame(i), renderTime: (t) => film.renderTime(t), grab: (t, qq) => film.grab(t, qq), setSubtitles: (on) => { film.subtitles = on; } };
window.ready = true;
$('loading')?.remove();

if (!RENDER) {
  let playing = false, t = +(q.get('t') || 0), last = 0, recording = null;
  const audio = $('audio');
  const scrub = $('scrub'), time = $('time');
  // subtitle durations from the actual clips

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  function draw() { film.renderTime(t); scrub.value = t / DURATION * 1000; time.textContent = `${fmt(t)} / ${fmt(DURATION)}`; }
  function syncAudio(force = false) {
    if (audio.muted && !recording) { audio.pause(); return; }
    if (playing) { if (force || Math.abs(audio.currentTime - t) > 0.12) audio.currentTime = t; audio.play().catch(() => {}); } else audio.pause();
  }
  function setPlaying(p) { playing = p; $('play').textContent = p ? '❚❚ Пауза' : '▶ Play'; last = performance.now(); syncAudio(true); }
  function loop(now) {
    if (playing) {
      // audio is the master clock while it plays (lip-tight sync); otherwise wall clock
      if (!audio.paused && !audio.muted && audio.readyState >= 2 && !audio.ended) t = audio.currentTime;
      else t += (now - last) / 1000;
      last = now;
      if (t >= DURATION) { t = DURATION - 1e-3; setPlaying(false); if (recording) recording.stop(); }
      draw();
    }
    requestAnimationFrame(loop);
  }
  $('play').onclick = () => { if (t >= DURATION - 0.01) t = 0; setPlaying(!playing); };
  $('restart').onclick = () => { t = 0; draw(); setPlaying(true); };
  scrub.oninput = () => { t = scrub.value / 1000 * DURATION; draw(); syncAudio(true); };
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
    if (e.code === 'ArrowRight') { t = Math.min(DURATION - 1e-3, t + (e.shiftKey ? 1 : 1 / FPS)); draw(); syncAudio(true); }
    if (e.code === 'ArrowLeft') { t = Math.max(0, t - (e.shiftKey ? 1 : 1 / FPS)); draw(); syncAudio(true); }
  });
  SCENES.forEach((s) => { const b = document.createElement('button'); b.textContent = `${s.id} ${s.name}`; b.onclick = () => { t = s.t0; draw(); syncAudio(true); }; $('scenes').appendChild(b); });
  $('sound').onclick = () => { audio.muted = !audio.muted; $('sound').textContent = audio.muted ? '🔇 Звук выкл.' : '🔊 Звук вкл.'; syncAudio(true); };
  $('subs').onclick = () => { film.subtitles = !film.subtitles; $('subs').textContent = film.subtitles ? '💬 Субтитры вкл.' : '💬 Субтитры выкл.'; draw(); };
  $('audioFile').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    audio.src = URL.createObjectURL(f); audio.load();
    status(`Аудиодорожка заменена: ${f.name} (начинается с 00:00)`);
  };

  const status = (s) => ($('status').textContent = s);
  const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

  // WebAudio graph: audio element → speakers + a MediaStream (for recording)
  let actx = null, streamDest = null;
  function audioGraph() {
    if (actx) return;
    actx = new AudioContext();
    const src = actx.createMediaElementSource(audio);
    streamDest = actx.createMediaStreamDestination();
    src.connect(actx.destination); src.connect(streamDest);
  }

  // ---- 1. real-time WebM recording of the output canvas + soundtrack (MediaRecorder)
  $('rec').onclick = async () => {
    if (recording) { recording.stop(); return; }
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!mime) { status('MediaRecorder / WebM не поддерживается этим браузером'); return; }
    audioGraph(); await actx.resume();
    const stream = film.out.captureStream(FPS);
    streamDest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    const wasMuted = audio.muted; audio.muted = false;
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 14e6, audioBitsPerSecond: 160e3 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => { recording = null; audio.muted = wasMuted; $('rec').textContent = '● Запись WebM'; save(new Blob(chunks, { type: 'video/webm' }), `${NAME}.webm`); status('WebM сохранён. Конвертация в MP4 — см. README (ffmpeg).'); };
    recording = rec; rec.start(500);
    $('rec').textContent = '■ Остановить запись';
    status('Запись в реальном времени — держите вкладку видимой…');
    t = 0; draw(); setPlaying(true);
  };

  // ---- 2. frame-accurate MP4 export (WebCodecs H.264 + AAC, mp4-muxer), independent of playback speed
  $('mp4').onclick = async () => {
    if (!('VideoEncoder' in window)) { status('WebCodecs недоступен — используйте «Запись WebM» или офлайн-рендер'); return; }
    const { Muxer, ArrayBufferTarget } = await import('../vendor/mp4-muxer/mp4-muxer.mjs');
    setPlaying(false);
    const vcfg = { codec: 'avc1.640033', width: 1080, height: 1920, bitrate: 2.6e6, framerate: FPS, avc: { format: 'avc' } };
    if (!(await VideoEncoder.isConfigSupported(vcfg)).supported) { status('H.264 энкодер недоступен — используйте «Запись WebM»'); return; }
    // soundtrack → AudioBuffer (48 kHz stereo)
    let pcm = null;
    try {
      const buf = await (await fetch(audio.currentSrc || audio.src)).arrayBuffer();
      const oc = new OfflineAudioContext(2, 48000 * DURATION, 48000);
      pcm = await oc.decodeAudioData(buf);
    } catch (e) { console.warn('audio decode failed', e); }
    const acfg = { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 };
    const withAudio = pcm && 'AudioEncoder' in window && (await AudioEncoder.isConfigSupported(acfg)).supported;
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: 1080, height: 1920, frameRate: FPS },
      ...(withAudio ? { audio: { codec: 'aac', sampleRate: 48000, numberOfChannels: 2 } } : {}), fastStart: 'in-memory' });
    const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => status('ошибка энкодера: ' + e.message) });
    enc.configure(vcfg);
    if (withAudio) {
      const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => console.warn(e) });
      aenc.configure(acfg);
      const n = Math.min(pcm.length, 48000 * DURATION), L = pcm.getChannelData(0), R = pcm.numberOfChannels > 1 ? pcm.getChannelData(1) : L;
      for (let i = 0; i < n; i += 4800) {
        const len = Math.min(4800, n - i), data = new Float32Array(len * 2);
        data.set(L.subarray(i, i + len), 0); data.set(R.subarray(i, i + len), len);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: len, numberOfChannels: 2, timestamp: Math.round(i / 48000 * 1e6), data });
        aenc.encode(ad); ad.close();
      }
      await aenc.flush();
    }
    const N = Math.round(DURATION * FPS);
    for (let i = 0; i < N; i++) {
      film.renderFrame(i);
      const vf = new VideoFrame(film.out, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame: i % 60 === 0 }); vf.close();
      if (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 1));
      if (i % 15 === 0) { status(`Экспорт MP4… ${Math.round(i / N * 100)} %`); await new Promise((r) => setTimeout(r, 0)); }
    }
    await enc.flush(); muxer.finalize();
    save(new Blob([muxer.target.buffer], { type: 'video/mp4' }), `${NAME}.mp4`);
    status(`MP4 экспортирован (1080×1920, 30 fps${withAudio ? ', со звуком' : ', без звука'}).`);
    draw();
  };

  draw();
  requestAnimationFrame(loop);
  if (q.has('autoplay')) setPlaying(true);
}
