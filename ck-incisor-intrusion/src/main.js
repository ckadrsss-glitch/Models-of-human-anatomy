// Player: Play / Pause / Restart, scrubbing, scenes, fullscreen, sound, subtitles, audio import,
// WebM recording (MediaRecorder, with sound), frame-accurate MP4 export (WebCodecs + mp4-muxer),
// headless render API (window.CK) for tools/render.cjs.
import { Film } from './film.js';
import { SCENES, DURATION, FPS } from './timeline.js';

const q = new URLSearchParams(location.search);
const RENDER = q.has('render');
const film = new Film();
film.subtitles = q.get('subs') !== '0';
film.setLook((q.get('look') || 'B').toUpperCase());
const $ = (id) => document.getElementById(id);
const NAME = 'CK_BIOMECHANICS_Incisor_Intrusion_Three_Piece_Arch_FINAL';
const DUR = DURATION;

$('stage').appendChild(film.out);
if (RENDER) document.body.classList.add('render');

try {
  await film.init();
} catch (e) {
  console.error(e);
  const l = $('loading'); if (l) l.textContent = 'Не удалось загрузить 3D-сцену. Откройте проект через веб-сервер (см. README).';
  throw e;
}
window.CK = { duration: DUR, fps: FPS, renderFrame: (i) => film.renderFrame(i), renderTime: (t) => film.renderTime(t), grab: (t, qq) => film.grab(t, qq), setSubtitles: (on) => { film.subtitles = on; }, setCamera: (c) => { film.camOverride = c; } };
window.ready = true;
$('loading')?.remove();

if (!RENDER) {
  let playing = false, t = +(q.get('t') || (location.hash.match(/t=([\d.]+)/) || [])[1] || 0), last = 0, recording = null;
  const audio = $('audio');
  const scrub = $('scrub'), time = $('time');
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  function draw() {
    film.renderTime(t); scrub.value = t / DUR * 1000;
    scrub.style.setProperty('--p', `${t / DUR * 100}%`);
    time.textContent = `${fmt(t)} / ${fmt(DUR)}`;
    document.querySelectorAll('#scenes button').forEach((b, i) => b.classList.toggle('on', t >= SCENES[i].t0 && t < SCENES[i].t1));
  }
  function syncAudio(force = false) {
    if (audio.muted && !recording) { audio.pause(); return; }
    if (playing) { if (force || Math.abs(audio.currentTime - t) > 0.12) audio.currentTime = t; audio.play().catch(() => {}); } else audio.pause();
  }
  function setPlaying(p) {
    playing = p; document.body.classList.toggle('playing', p);
    $('play').setAttribute('aria-label', p ? 'Пауза' : 'Воспроизвести');
    $('play').innerHTML = p ? '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>';
    last = performance.now(); syncAudio(true);
  }
  function loop(now) {
    if (playing) {
      // audio is the master clock while it plays (tight voice sync); otherwise the wall clock
      if (!audio.paused && !audio.muted && audio.readyState >= 2 && !audio.ended) t = audio.currentTime;
      else t += (now - last) / 1000;
      last = now;
      if (t >= DUR) { t = DUR - 1e-3; setPlaying(false); if (recording) recording.stop(); }
      draw();
    }
    requestAnimationFrame(loop);
  }
  const togglePlay = () => { if (t >= DUR - 0.01) t = 0; setPlaying(!playing); };
  $('play').onclick = togglePlay;
  film.out.addEventListener('click', togglePlay);
  $('restart').onclick = () => { t = 0; draw(); setPlaying(true); };
  scrub.oninput = () => { t = scrub.value / 1000 * DUR; draw(); syncAudio(true); };

  // fullscreen (iPhone Safari cannot fullscreen an element → CSS pseudo-fullscreen)
  const player = $('player');
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  async function toggleFs() {
    if (fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    if (document.body.classList.contains('pseudo-fs')) { document.body.classList.remove('pseudo-fs'); return; }
    const req = player.requestFullscreen || player.webkitRequestFullscreen;
    if (req) { try { await req.call(player, { navigationUI: 'hide' }); return; } catch (e) { /* fallback */ } }
    document.body.classList.add('pseudo-fs');
  }
  $('fs').onclick = toggleFs;
  const onFs = () => document.body.classList.toggle('is-fs', !!fsEl());
  document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.code === 'Space' || e.key === 'k') { e.preventDefault(); togglePlay(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); t = Math.min(DUR - 1e-3, t + (e.shiftKey ? 1 : 1 / FPS)); draw(); syncAudio(true); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); t = Math.max(0, t - (e.shiftKey ? 1 : 1 / FPS)); draw(); syncAudio(true); }
    else if (e.key === 'f' || e.key === 'F' || e.key === 'а') toggleFs();
    else if (e.key === 'Escape') document.body.classList.remove('pseudo-fs');
    else if (e.key === 'Home') { t = 0; draw(); syncAudio(true); }
  });
  SCENES.forEach((s) => { const b = document.createElement('button'); b.textContent = `${s.id} ${s.name}`; b.onclick = () => { t = s.t0 + 0.001; draw(); syncAudio(true); }; $('scenes').appendChild(b); });
  const soundLabel = () => { $('sound').textContent = audio.muted ? '🔇 Звук' : '🔊 Звук'; $('sound').classList.toggle('on', !audio.muted); };
  $('sound').onclick = () => { audio.muted = !audio.muted; soundLabel(); syncAudio(true); };
  const subsLabel = () => { $('subs').classList.toggle('on', film.subtitles); };
  $('subs').onclick = () => { film.subtitles = !film.subtitles; subsLabel(); draw(); };
  subsLabel(); soundLabel();
  $('audioFile').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    audio.src = URL.createObjectURL(f); audio.load(); audio.muted = false; soundLabel();
    status(`Аудиодорожка заменена: ${f.name} (начинается с 00:00)`);
  };

  const status = (s) => ($('status').textContent = s);
  const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

  let actx = null, streamDest = null;
  function audioGraph() {
    if (actx) return;
    actx = new AudioContext();
    const src = actx.createMediaElementSource(audio);
    streamDest = actx.createMediaStreamDestination();
    src.connect(actx.destination); src.connect(streamDest);
  }

  // ---- 1. real-time WebM recording of the output canvas + soundtrack
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
    rec.onstop = () => { recording = null; audio.muted = wasMuted; soundLabel(); $('rec').textContent = '● Запись WebM'; save(new Blob(chunks, { type: 'video/webm' }), `${NAME}.webm`); status('WebM сохранён. Конвертация в MP4 — см. README (ffmpeg).'); };
    recording = rec; rec.start(500);
    $('rec').textContent = '■ Стоп';
    status('Запись в реальном времени — держите вкладку видимой…');
    t = 0; draw(); setPlaying(true);
  };

  // ---- 2. frame-accurate MP4 export (WebCodecs H.264 + AAC, mp4-muxer)
  $('mp4').onclick = async () => {
    if (!('VideoEncoder' in window)) { status('WebCodecs недоступен — используйте «Запись WebM» или офлайн-рендер (README)'); return; }
    const { Muxer, ArrayBufferTarget } = await import('../vendor/mp4-muxer/mp4-muxer.mjs');
    setPlaying(false);
    const vcfg = { codec: 'avc1.640033', width: 1080, height: 1920, bitrate: 6e6, framerate: FPS, avc: { format: 'avc' } };
    if (!(await VideoEncoder.isConfigSupported(vcfg)).supported) { status('H.264 энкодер недоступен — используйте «Запись WebM»'); return; }
    let pcm = null;
    try {
      const buf = await (await fetch(audio.currentSrc || audio.src)).arrayBuffer();
      const oc = new OfflineAudioContext(2, 48000 * DUR, 48000);
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
      const n = Math.min(pcm.length, 48000 * DUR), L = pcm.getChannelData(0), R = pcm.numberOfChannels > 1 ? pcm.getChannelData(1) : L;
      for (let i = 0; i < n; i += 4800) {
        const len = Math.min(4800, n - i), data = new Float32Array(len * 2);
        data.set(L.subarray(i, i + len), 0); data.set(R.subarray(i, i + len), len);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: len, numberOfChannels: 2, timestamp: Math.round(i / 48000 * 1e6), data });
        aenc.encode(ad); ad.close();
      }
      await aenc.flush();
    }
    const N = Math.round(DUR * FPS);
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
