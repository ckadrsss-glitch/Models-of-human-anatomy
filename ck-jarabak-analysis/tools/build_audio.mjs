// Soundtrack builder.
//  1. Procedural, licence-free technological sound design synchronised to src/timeline.js
//     (soft pad, air, whooshes on transitions, ticks when landmarks appear, sweeps when lines are drawn).
//  2. Voice-over track: the ElevenLabs clips (assets/voice/vo*.mp3) placed at VOICE[].start.
//  3. Final mix: SFX ducked under the voice (sidechain), −16 LUFS integrated, true peak −1.5 dBTP.
// usage: node tools/build_audio.mjs [voiceover.(wav|mp3|m4a)]
//   optional argument: a ready-made full-length voice-over (starting at 00:00) that replaces the clips.
// outputs: assets/audio/sfx.m4a, assets/audio/voiceover.m4a, assets/audio/mix.m4a (+ build/*.wav masters)
import fs from 'fs';
import { execFileSync } from 'child_process';
import { VOICE, DURATION, TEXT } from '../src/timeline.js';
const SR = 48000, DUR = DURATION, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);
let seed = 2024; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const env = (t, a, b, fi, fo) => Math.max(0, Math.min(1, (t - a) / fi, (b - t) / fo));
// 1) pad: slowly evolving D minor add9 → Bb maj7 → D, detuned sines (very quiet)
const chA = [73.42, 110, 146.83, 220, 329.63], chB = [58.27, 116.54, 174.61, 220, 293.66];
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const m = 0.5 - 0.5 * Math.cos(Math.min(1, Math.max(0, (t - 28) / 6)) * Math.PI);
  const m2 = 0.5 - 0.5 * Math.cos(Math.min(1, Math.max(0, (t - 50) / 5)) * Math.PI);
  const w = m * (1 - m2), g = env(t, 0, DUR, 3, 3.5) * 0.05;
  let l = 0, r = 0;
  for (let k = 0; k < 5; k++) {
    const f = chA[k] * (1 - w) + chB[k] * w;
    const amp = (k === 0 ? 1 : 0.5) * (0.75 + 0.25 * Math.sin(t * 0.37 + k * 1.9));
    l += Math.sin(2 * Math.PI * f * t + Math.sin(t * 0.3 + k)) * amp;
    r += Math.sin(2 * Math.PI * f * 1.003 * t + Math.sin(t * 0.27 + k)) * amp;
  }
  L[i] += l * g; R[i] += r * g;
}
// 2) air
let a1 = 0, a2 = 0;
for (let i = 0; i < N; i++) { const t = i / SR; a1 += 0.02 * (rnd() - a1); a2 += 0.02 * (rnd() - a2); const g = env(t, 0, DUR, 4, 4) * 0.045; L[i] += a1 * g; R[i] += a2 * g; }
// 3) whooshes on transitions
function whoosh(t0, d, gain) {
  let y1 = 0, y2 = 0;
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + d) * SR); i++) {
    const u = (i / SR - t0) / d, e = Math.sin(Math.PI * u) ** 2, c = 0.004 + 0.05 * u;
    y1 += c * (rnd() - y1); y2 += c * (y1 - y2);
    L[i] += y2 * e * gain * (1 - u * 0.6); R[i] += y2 * e * gain * (0.4 + u * 0.6);
  }
}
[[6.0, 1.4, 0.5], [17.2, 1.2, 0.4], [23.5, 1.6, 0.55], [30.2, 1.4, 0.45], [38.2, 1.6, 0.45], [42.8, 1.2, 0.4], [52.8, 1.2, 0.4], [56.9, 1.4, 0.45]].forEach((w) => whoosh(...w));
// 4) ticks (landmarks) and soft sweeps (lines / arcs)
function tick(t0, f, gain) {
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + 0.5) * SR); i++) {
    const u = i / SR - t0, e = Math.exp(-u * 11) * Math.min(1, u * 500);
    const s = (Math.sin(2 * Math.PI * f * u) + 0.3 * Math.sin(4 * Math.PI * f * u)) * e * gain; L[i] += s; R[i] += s;
  }
}
function sweep(t0, d, f0, f1, gain) {
  let ph = 0;
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + d) * SR); i++) {
    const u = (i / SR - t0) / d, f = f0 * Math.pow(f1 / f0, u); ph += 2 * Math.PI * f / SR;
    const e = Math.sin(Math.PI * u) ** 2 * gain; const s = Math.sin(ph) * e; L[i] += s * (1 - u * 0.5); R[i] += s * (0.5 + u * 0.5);
  }
}
Object.values(TEXT.pts).forEach((t, k) => tick(t + 0.05, 1318.5 + k * 60, 0.035));
Object.values(TEXT.pts4).forEach((t, k) => tick(t + 0.05, 1174.7 + k * 60, 0.032));
sweep(TEXT.sgo, 1.0, 420, 840, 0.018); sweep(TEXT.nme, 1.0, 470, 940, 0.018); sweep(TEXT.poly, 1.0, 400, 800, 0.016);
Object.values(TEXT.arcs).forEach((t) => sweep(t, 0.7, 600, 1000, 0.014));
[18.7, 21.3, 22.6].forEach((t) => tick(t, 880, 0.03));
tick(24.9, 659.25, 0.045); tick(24.92, 987.77, 0.03); tick(37.5, 659.25, 0.04); tick(39.7, 659.25, 0.04);
sweep(44.7, 2.8, 300, 520, 0.014);
tick(57.65, 440, 0.06); tick(57.67, 659.25, 0.045); tick(58.25, 880, 0.04);
// write WAV helper
function wav(path, Lc, Rc) {
  const n = Lc.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Lc[i])) * 32000), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Rc[i])) * 32000), 46 + i * 4); }
  fs.writeFileSync(path, buf);
}
fs.mkdirSync('build', { recursive: true });
wav('build/sfx.wav', L, R);
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
// voice-over track (60 s, clips at their start times) — or an imported full-length track
const ext = process.argv[2];
if (ext) ff(['-i', ext, '-af', `apad,atrim=0:${DUR}`, '-ar', '48000', '-ac', '2', 'build/voiceover.wav']);
else {
  const ins = VOICE.flatMap((v) => ['-i', v.file]);
  const chains = VOICE.map((v, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(v.start * 1000)}|${Math.round(v.start * 1000)}[v${i}]`).join(';');
  ff([...ins, '-filter_complex', `${chains};${VOICE.map((_, i) => `[v${i}]`).join('')}amix=inputs=${VOICE.length}:normalize=0,apad,atrim=0:${DUR}[vo]`, '-map', '[vo]', 'build/voiceover.wav']);
}
// final mix: sfx −23 LUFS bed, ducked by the voice; voice ≈ −16 LUFS; final loudnorm −16 LUFS / −1.5 dBTP
ff(['-i', 'build/voiceover.wav', '-i', 'build/sfx.wav', '-filter_complex',
  '[0:a]loudnorm=I=-16:TP=-2:LRA=9,asplit=2[vo][sc];[1:a]loudnorm=I=-26:TP=-6:LRA=11[bed];' +
  '[bed][sc]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[duck];' +
  `[vo][duck]amix=inputs=2:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=0:${DUR}[out]`,
  '-map', '[out]', '-ar', '48000', 'build/mix.wav']);
ff(['-i', 'build/sfx.wav', '-af', 'loudnorm=I=-26:TP=-6', '-c:a', 'aac', '-b:a', '160k', 'assets/audio/sfx.m4a']);
ff(['-i', 'build/voiceover.wav', '-c:a', 'aac', '-b:a', '160k', 'assets/audio/voiceover.m4a']);
ff(['-i', 'build/mix.wav', '-c:a', 'aac', '-b:a', '160k', 'assets/audio/mix.m4a']);
console.log('assets/audio/{sfx,voiceover,mix}.m4a');
