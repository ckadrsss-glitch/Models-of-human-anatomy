// Procedural, licence-free ambient soundtrack synchronised to the timeline
// (soft pad + air + whooshes on scene changes + quiet ticks on morph keys).
// usage: node tools/build_audio.mjs   → build/ambient.wav → assets/audio/ambient.m4a (−16 LUFS)
import fs from 'fs';
import { execFileSync } from 'child_process';
const SR = 48000, DUR = 40, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);
let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const env = (t, a, b, fi, fo) => Math.max(0, Math.min(1, (t - a) / fi, (b - t) / fo));
// 1) pad: two slowly evolving chords (A minor add9 → F maj7), detuned sines
const chordA = [110, 164.81, 220, 246.94, 329.63], chordB = [87.31, 130.81, 174.61, 220, 261.63];
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const m = 0.5 - 0.5 * Math.cos(Math.min(1, Math.max(0, (t - 18) / 6)) * Math.PI);       // crossfade to chord B
  const m2 = 0.5 - 0.5 * Math.cos(Math.min(1, Math.max(0, (t - 35) / 3)) * Math.PI);      // back to A for the logo
  const w = m * (1 - m2);
  const g = env(t, 0, DUR, 3, 3.5) * 0.06;
  let l = 0, r = 0;
  for (let k = 0; k < 5; k++) {
    const fa = chordA[k], fb = chordB[k];
    const a1 = Math.sin(2 * Math.PI * fa * t + Math.sin(t * 0.3 + k)) * (1 - w);
    const b1 = Math.sin(2 * Math.PI * fb * t + Math.sin(t * 0.27 + k)) * w;
    const det = Math.sin(2 * Math.PI * (fa * (1 - w) + fb * w) * 1.003 * t);
    const amp = (k === 0 ? 1 : 0.55) * (0.75 + 0.25 * Math.sin(t * 0.4 + k * 1.7));
    l += (a1 + b1) * amp + det * amp * 0.35 * (k % 2);
    r += (a1 + b1) * amp + det * amp * 0.35 * ((k + 1) % 2);
  }
  L[i] += l * g; R[i] += r * g;
}
// 2) air: low-passed noise, very quiet
let lp1 = 0, lp2 = 0;
for (let i = 0; i < N; i++) { const t = i / SR; lp1 += 0.02 * (rnd() - lp1); lp2 += 0.02 * (rnd() - lp2); const g = env(t, 0, DUR, 4, 4) * 0.05; L[i] += lp1 * g; R[i] += lp2 * g; }
// 3) whooshes (band-swept noise) on scene transitions
function whoosh(t0, d, gain) {
  let y1 = 0, y2 = 0;
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + d) * SR); i++) {
    const u = (i / SR - t0) / d, e = Math.sin(Math.PI * u) ** 2;
    const c = 0.004 + 0.05 * u;          // rising cutoff
    y1 += c * (rnd() - y1); y2 += c * (y1 - y2);
    const pan = u; L[i] += y2 * e * gain * (1 - pan * 0.6); R[i] += y2 * e * gain * (0.4 + pan * 0.6);
  }
}
[[4.6, 1.6, 0.55], [12.9, 1.4, 0.45], [20.8, 3.2, 0.7], [33.8, 1.4, 0.45], [36.9, 1.6, 0.5]].forEach((w) => whoosh(...w));
// 4) soft ticks on morph keys (sine blip with fast decay)
function tick(t0, f, gain) {
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + 0.6) * SR); i++) {
    const u = i / SR - t0, e = Math.exp(-u * 9) * Math.min(1, u * 400);
    const s = Math.sin(2 * Math.PI * f * u) * e * gain; L[i] += s; R[i] += s;
  }
}
[7.6, 10.0, 12.6, 13.5, 16.0, 18.3].forEach((t) => tick(t, 880, 0.05));
[6.3, 8.8, 11.5, 14.7, 17.1, 19.5].forEach((t) => tick(t, 1318.5, 0.04));
tick(24.6, 659.25, 0.07); tick(24.62, 987.77, 0.05);
tick(35.2, 659.25, 0.06); tick(35.22, 987.77, 0.04);
tick(37.7, 440, 0.08); tick(37.72, 659.25, 0.06); tick(38.3, 880, 0.05);
// write WAV
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32000), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32000), 46 + i * 4); }
fs.mkdirSync('build', { recursive: true }); fs.writeFileSync('build/ambient.wav', buf);
// mix: ambience + voiced call to action at 0.3 s (ElevenLabs, voice Evgeniy Rybakov), ambience only lightly ducked, voice kept soft
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', 'build/ambient.wav', '-i', 'assets/voice/cta_subscribe.mp3', '-filter_complex',
  "[0:a]volume='if(lt(t,3.3),0.85,1)':eval=frame[bg];[1:a]aresample=48000,aformat=channel_layouts=stereo,adelay=300|300,volume=0.8[vo];" +
  "[bg][vo]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11",
  '-ar', '48000', '-c:a', 'aac', '-b:a', '160k', 'assets/audio/ambient.m4a']);
console.log('assets/audio/ambient.m4a');
