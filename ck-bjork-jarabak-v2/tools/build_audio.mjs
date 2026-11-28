// Soundtrack builder — Björk–Jarabak V2.
//  1. Music bed: restrained cinematic scientific ambient (no vocals, no percussion):
//     evolving detuned pads (Dm9 → B♭maj7 → Fmaj9 → Gm9 → Dm9), soft sub, airy shimmer,
//     a muted 1/8 pulse from scene 07 on, thinning to near-silence on «в чём подвох?».
//  2. Accents synchronised to src/timeline.js: landmark ticks, line/arc sweeps, number chimes,
//     a riser into SAME SUM and a soft low impact + bell on DIFFERENT ANATOMY.
//  3. Voice-over (ElevenLabs «Принц Нури», assets/voice/v01…v11.mp3) at VOICE[].start.
//  4. Mix: bed ducked under the voice (sidechain), −15 LUFS integrated, true peak −1.5 dBTP.
// usage: node tools/build_audio.mjs [ready_voiceover.wav]
// outputs: assets/audio/{music,voiceover,mix}.m4a and build/*.wav masters
import fs from 'fs';
import { execFileSync } from 'child_process';
import { T, SAD_KEYS, RAM_KEYS } from '../src/timeline.js';
import { LANG, VOICE, DURATION_OUT, unwarp as U, EN_TEMPO_ACTIVE } from '../src/lang.js';
const DURATION = DURATION_OUT;
const SUF = LANG === 'en' ? '_en' : '';
const SR = 48000, DUR = DURATION, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const sm = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const env = (t, a, b, fi, fo) => Math.max(0, Math.min(1, (t - a) / fi, (b - t) / fo));
// ---- 1. pads: chord roots (Hz) and intervals (ratios), crossfaded
const CH = [
  [0, [73.42, [1, 1.5, 2, 2.4, 3.0, 4.5]]],          // Dm9
  [17.0, [58.27, [1, 1.5, 2, 2.52, 3.0, 3.78]]],     // B♭maj7
  [31.2, [73.42, [1, 1.5, 2, 2.4, 3.0, 4.5]]],       // Dm9 — the catch
  [39.0, [87.31, [1, 1.5, 2, 2.52, 3.0, 4.5]]],      // Fmaj9
  [56.6, [98.0, [1, 1.5, 2, 2.4, 3.0, 4.5]]],        // Gm9
  [63.4, [73.42, [1, 1.5, 2, 2.4, 3.0, 4.5]]],       // Dm9 — payoff
];
const thin = (t) => 1 - 0.85 * sm((t - U(31.25)) / 0.3) * (1 - sm((t - U(T.sum6 - 0.05)) / 0.15));   // near-silence before SAME SUM
for (let ci = 0; ci < CH.length; ci++) {
  const t0 = U(CH[ci][0]), [root, iv] = CH[ci][1], t1 = ci + 1 < CH.length ? U(CH[ci + 1][0]) : DUR;
  const a0 = Math.max(0, t0 - 1.5), a1 = Math.min(DUR, t1 + 1.5);
  for (let i = Math.floor(a0 * SR); i < a1 * SR; i++) {
    const t = i / SR;
    const g = Math.min(sm((t - a0) / 2.6), 1 - sm((t - (t1 - 1.0)) / 2.5)) * env(t, 0, DUR, 1.2, 3) * 0.045 * thin(t);
    let l = 0, r = 0;
    iv.forEach((m, k) => {
      const f = root * m, amp = (k === 0 ? 1.1 : 0.55) * (0.7 + 0.3 * Math.sin(t * 0.31 + k * 1.7));
      l += Math.sin(2 * Math.PI * f * t + 0.6 * Math.sin(t * 0.21 + k)) * amp;
      r += Math.sin(2 * Math.PI * f * 1.0035 * t + 0.6 * Math.sin(t * 0.19 + k * 2)) * amp;
    });
    L[i] += l * g; R[i] += r * g;
  }
}
// ---- sub + air + shimmer
let a1 = 0, a2 = 0, s1 = 0, s2 = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, th = thin(t);
  const sub = Math.sin(2 * Math.PI * 36.71 * t) * 0.03 * env(t, 0, DUR, 2, 3) * th;
  a1 += 0.018 * (rnd() - a1); a2 += 0.018 * (rnd() - a2);
  const air = 0.04 * env(t, 0, DUR, 2, 3) * th;
  s1 += 0.35 * (rnd() - s1); s2 += 0.35 * (rnd() - s2);             // bright noise, amplitude-modulated = shimmer
  const sh = 0.006 * (0.5 + 0.5 * Math.sin(t * 1.3)) * env(t, 0, DUR, 3, 3) * th;
  L[i] += sub + a1 * air + s1 * sh; R[i] += sub + a2 * air + s2 * sh;
}
// ---- muted pulse (scene 07 → 10), soft, filtered, no transients
for (let n = 0; ; n++) {
  const t0 = U(39.0) + n * 0.3; if (t0 > U(71.2)) break;
  const f = (n % 8 < 4) ? 174.6 : 196.0, g = 0.012 * sm((t0 - U(39)) / 3) * (1 - sm((t0 - U(69.5)) / 1.7));
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + 0.26) * SR); i++) {
    const u = i / SR - t0, e = Math.min(1, u / 0.02) * Math.exp(-u * 10);
    const s = Math.sin(2 * Math.PI * f * u) * e * g; L[i] += s * 0.9; R[i] += s;
  }
}
// ---- 2. accents
function tick(t0, f, gain, pan = 0) {
  t0 = U(t0);
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + 0.5) * SR); i++) {
    const u = i / SR - t0, e = Math.exp(-u * 12) * Math.min(1, u * 600);
    const s = (Math.sin(2 * Math.PI * f * u) + 0.25 * Math.sin(4 * Math.PI * f * u)) * e * gain; L[i] += s * (1 - pan); R[i] += s * (1 + pan);
  }
}
function toneOut(t0, f, gain) {   // output-clock tick (used for impact bells)
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + 0.5) * SR); i++) {
    const u = i / SR - t0, e = Math.exp(-u * 12) * Math.min(1, u * 600);
    const s = (Math.sin(2 * Math.PI * f * u) + 0.25 * Math.sin(4 * Math.PI * f * u)) * e * gain; L[i] += s; R[i] += s;
  }
}
function sweep(t0, d, f0, f1, gain) {
  t0 = U(t0);
  let ph = 0;
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + d) * SR); i++) {
    const u = (i / SR - t0) / d, f = f0 * Math.pow(f1 / f0, u); ph += 2 * Math.PI * f / SR;
    const e = Math.sin(Math.PI * u) ** 2 * gain, s = Math.sin(ph) * e; L[i] += s * (1 - u * 0.5); R[i] += s * (0.5 + u * 0.5);
  }
}
function chime(t0, f, gain) { [1, 2.01, 3.03].forEach((m, k) => tick(t0 + k * 0.004, f * m, gain / (k + 1.5))); }   // anim time (tick converts)
function whoosh(t0, d, gain) {
  t0 = U(t0);
  let y1 = 0, y2 = 0;
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + d) * SR); i++) {
    const u = (i / SR - t0) / d, e = Math.sin(Math.PI * u) ** 2, c = 0.004 + 0.05 * u;
    y1 += c * (rnd() - y1); y2 += c * (y1 - y2); L[i] += y2 * e * gain * (1 - u * 0.6); R[i] += y2 * e * gain * (0.4 + u * 0.6);
  }
}
function riser(t0, t1, gain) {
  t0 = U(t0); t1 = U(t1);
  let ph = 0, y = 0;
  for (let i = Math.floor(t0 * SR); i < Math.min(N, t1 * SR); i++) {
    const u = (i / SR - t0) / (t1 - t0), f = 120 * Math.pow(6, u); ph += 2 * Math.PI * f / SR;
    y += (0.01 + 0.2 * u) * (rnd() - y);
    const e = u * u * gain, s = (Math.sin(ph) * 0.5 + y) * e; L[i] += s; R[i] += s;
  }
}
function impact(t0, gain) {      // soft low impact (sine drop) + bell
  t0 = U(t0);
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + 2.2) * SR); i++) {
    const u = i / SR - t0, f = 70 * Math.exp(-u * 1.5) + 34, e = Math.exp(-u * 2.2) * Math.min(1, u * 300);
    const s = Math.sin(2 * Math.PI * f * u) * e * gain; L[i] += s; R[i] += s;
  }
  ICH.push([t0 + 0.02, gain]);
}
const ICH = [];
// scene transitions
[[4.6, 1.2, 0.35], [30.95, 0.9, 0.3], [38.75, 1.0, 0.3], [56.35, 1.0, 0.32], [63.15, 1.0, 0.32], [71.4, 1.1, 0.3], [76.8, 1.3, 0.35]].forEach((w) => whoosh(...w));
// 01 hook
tick(0.05, 659.25, 0.05); tick(T.length + 0.15, 880, 0.04); chime(T.why + 0.6, 739.99, 0.05); chime(T.diff, 587.33, 0.06);
// 02 polygon: one tick per landmark, sweep per segment
[6.15, 6.75, 7.35, 7.95, 8.55].forEach((t, k) => { tick(t, 1046.5 + k * 70, 0.035, -0.4 + k * 0.2); sweep(t + 0.05, 0.5, 500, 900, 0.008); });
// 03–05 angles + morphs
[11.2, 17.3, 23.3].forEach((t) => sweep(t, 0.6, 600, 1100, 0.012));
SAD_KEYS.slice(1).forEach(([t]) => tick(t, 784, 0.025));
sweep(T.split, 0.8, 500, 950, 0.012); tick(T.split + 0.5, 987.8, 0.03); tick(T.split + 0.9, 880, 0.03); chime(T.detail + 0.9, 659.25, 0.045);
// 06 the catch → SAME SUM → DIFFERENT ANATOMY → COMPENSATION
tick(T.catch, 440, 0.05);
riser(T.catch + 0.35, T.sum6 - 0.02, 0.05);
[0.05, 0.45, 0.85].forEach((d, k) => tick(T.even + d, 880 + k * 110, 0.03));
impact(T.sum6, 0.16);
chime(T.sum6 + 0.35, 880, 0.05);
impact(T.diff6, 0.2);
chime(36.95, 739.99, 0.055);
// 07–08 measurements, ratio
[T.base7 - 0.1, T.base7 + 0.5, T.ramus7, T.body7].forEach((t, k) => { tick(t, 987.8 - k * 60, 0.035); sweep(t, 0.5, 450, 800, 0.008); });
RAM_KEYS.slice(1).forEach(([t]) => tick(t, 784, 0.02));
sweep(T.post8, 0.6, 400, 800, 0.012); sweep(T.ant8, 0.6, 450, 900, 0.012); chime(T.vert8, 783.99, 0.06);
// 09 patterns — one chime per model
[T.low9 - 0.1, T.vert9 + 0.25, T.high9 - 0.1].forEach((t, k) => chime(t + 0.3, [523.25, 659.25, 783.99][k], 0.045));
// 10 payoff highlights, 11 question options
[T.analyse, T.analyse + 0.85, T.numbers + 0.25, T.rel].forEach((t, k) => tick(t, 659.25 + k * 110, 0.035));
impact(T.rel, 0.09);
[0, 0.45, 0.9].forEach((d) => tick(T.trg + d, 1174.7, 0.035));
tick(77.65, 440, 0.06); tick(77.67, 659.25, 0.045); tick(78.25, 880, 0.04);
// outro: soft D-major-add9 swell under the logo (fades to the end)
for (let i = Math.floor(U(77.2) * SR); i < N; i++) {
  const t = i / SR, g = sm((t - U(77.2)) / 0.8) * (1 - sm((t - U(78.6)) / 1.4)) * 0.05;
  let s = 0; [146.83, 220, 293.66, 369.99, 440].forEach((f, k) => { s += Math.sin(2 * Math.PI * f * t + k) * (k ? 0.6 : 1); });
  L[i] += s * g; R[i] += s * g * 0.96;
}
chime(77.65, 587.33, 0.08); chime(78.25, 880, 0.06);
for (const [t0, g] of ICH) [1, 2.01, 3.03].forEach((m, k) => toneOut(t0 + k * 0.004, 587.3 * m, g * 0.5 / (k + 1.5)));
// ---- write masters
function wav(path, Lc, Rc) {
  const n = Lc.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Lc[i])) * 32000), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Rc[i])) * 32000), 46 + i * 4); }
  fs.writeFileSync(path, buf);
}
fs.mkdirSync('build', { recursive: true }); fs.mkdirSync('assets/audio', { recursive: true });
wav(`build/music${SUF}.wav`, L, R);
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
const ext = process.argv[2];
if (ext) ff(['-i', ext, '-af', `apad,atrim=0:${DUR}`, '-ar', '48000', '-ac', '2', `build/voiceover${SUF}.wav`]);
else {
  const ins = VOICE.flatMap((v) => ['-i', v.file]);
  const ch = VOICE.map((v, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo${EN_TEMPO_ACTIVE !== 1 ? `,atempo=${EN_TEMPO_ACTIVE}` : ''},adelay=${Math.round(v.start * 1000)}|${Math.round(v.start * 1000)}[v${i}]`).join(';');
  ff([...ins, '-filter_complex', `${ch};${VOICE.map((_, i) => `[v${i}]`).join('')}amix=inputs=${VOICE.length}:normalize=0,apad,atrim=0:${DUR}[vo]`, '-map', '[vo]', `build/voiceover${SUF}.wav`]);
}
ff(['-i', `build/voiceover${SUF}.wav`, '-i', `build/music${SUF}.wav`, '-filter_complex',
  '[0:a]apad=pad_dur=4,loudnorm=I=-15:TP=-2:LRA=9,asplit=2[vo][sc];[1:a]apad=pad_dur=4,loudnorm=I=-25:TP=-5:LRA=12[bed];' +
  '[bed][sc]sidechaincompress=threshold=0.035:ratio=5:attack=20:release=380[duck];' +
  `[vo][duck]amix=inputs=2:normalize=0:duration=longest,apad=pad_dur=4,loudnorm=I=-15:TP=-1.5:LRA=11,apad,atrim=0:${DUR}[out]`,
  '-map', '[out]', '-ar', '48000', `build/mix${SUF}.wav`]);
ff(['-i', `build/music${SUF}.wav`, '-af', `apad=pad_dur=4,loudnorm=I=-25:TP=-5,atrim=0:${DUR}`, '-c:a', 'aac', '-b:a', '192k', `assets/audio/music${SUF}.m4a`]);
ff(['-i', `build/voiceover${SUF}.wav`, '-c:a', 'aac', '-b:a', '192k', `assets/audio/voiceover${SUF}.m4a`]);
ff(['-i', `build/mix${SUF}.wav`, '-c:a', 'aac', '-b:a', '192k', `assets/audio/mix${SUF}.m4a`]);
console.log(`assets/audio/{music,voiceover,mix}${SUF}.m4a  (${DUR} s)`);
