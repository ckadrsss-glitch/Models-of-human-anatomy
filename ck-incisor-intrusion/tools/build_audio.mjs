// Soundtrack builder (licence-free, procedural, synchronised to src/timeline.js — same engine as the series):
//  1. music bed — minimal cinematic / technological, no vocals: pad (Dm9 → B♭maj7 → Gm9 → A7sus → Dm9 → B♭maj9 → D),
//     muted pulse (100 BPM) from the design scene, sub on downbeats in the force analysis, stop on the second hook,
//     riser into the pure intrusion, resolve on the comparison, outro chord;
//  2. sound design — wire forming (creak + inharmonic ping), insertion scrape + click, activation tension + tie
//     click, vector appearance ticks, point-of-application glides, CR chime, moment compensation (resolving dyad),
//     reactive-load thuds, logo chime, whooshes on camera cuts;
//  3. voice-over (ElevenLabs «Принц Нури», assets/voice/nuri*.mp3) placed at VOICE[].start;
//  4. mix — bed side-chain ducked under the voice, −15 LUFS integrated, true peak −1.5 dBTP.
// usage: node tools/build_audio.mjs   → assets/audio/{music,sfx,voiceover,mix}.m4a (+ build/*.wav)
import fs from 'fs';
import { execFileSync } from 'child_process';
import { VOICE } from '../src/voice.js';
import { DURATION, OUTRO_T0, S, W } from '../src/timeline.js';
import { KEYWORDS } from '../src/kinetic.js';

const SR = 48000, N = SR * DURATION;
const mk = () => [new Float32Array(N), new Float32Array(N)];
const [ML, MR] = mk(), [XL, XR] = mk();
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sm = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const add = (L, R, i, l, r = l) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } };

// ------------------------------------------------------------------ music
const BPM = 100, beat = 60 / BPM;
const chords = [   // [t, root Hz, voicing ratios]
  [0, 73.42, [1, 1.5, 2, 2.4, 3.0, 4.5]],        // Dm9   hook
  [10.2, 58.27, [1, 1.5, 2, 2.52, 3.0, 3.78]],   // B♭maj7 cantilever design
  [18.8, 49.0, [1, 1.5, 2, 2.4, 3.0, 4.5]],      // Gm9   five points / CR
  [25.1, 55.0, [1, 1.5, 2, 2.67, 3.0, 3.56]],    // A7sus proclination
  [31.6, 73.42, [1, 1.5, 2, 2.4, 3.0, 4.5]],     // Dm9   second hook → pure intrusion
  [41.4, 55.0, [1, 1.5, 2, 2.67, 3.0, 3.56]],    // A7sus retroclination
  [48.3, 49.0, [1, 1.5, 2, 2.4, 3.0, 4.5]],      // Gm9   reactions
  [53.4, 58.27, [1, 1.5, 2, 2.52, 3.0, 4.5]],    // B♭maj9 comparison
  [OUTRO_T0, 73.42, [1, 1.5, 2, 2.25, 3.0, 4.0]],  // D (add9) resolve
];
const chordAt = (t) => { let i = 0; while (i < chords.length - 1 && t >= chords[i + 1][0]) i++; return i; };
const HOLD = [W.what - 0.15, S.slide4[0]];          // second hook: the bed thins out, camera stops
const energy = (t) => 0.62 + 0.2 * sm((t - 10.2) / 2) + 0.18 * sm((t - 19) / 3) - 0.45 * (sm((t - HOLD[0]) / 0.4) - sm((t - HOLD[1]) / 1.2))
  + 0.12 * sm((t - 37) / 3) - 0.1 * sm((t - 48.3) / 2) - 0.25 * sm((t - 53.4) / 2);
for (let i = 0; i < N; i++) {
  const t = i / SR, ci = chordAt(t), [t0, root, vo] = chords[ci];
  const nxt = chords[Math.min(ci + 1, chords.length - 1)];
  const xf = ci < chords.length - 1 ? sm((t - (nxt[0] - 1.6)) / 1.6) : 0;
  const g = sm(t / 0.6) * (1 - sm((t - (DURATION - 1.5)) / 1.5)) * 0.032 * energy(t);
  let l = 0, r = 0;
  for (const [rt, v, w] of [[root, vo, 1 - xf], [nxt[1], nxt[2], xf]]) {
    if (w < 1e-4) continue;
    v.forEach((k, j) => {
      const f = rt * k * 2, amp = (j === 0 ? 0.8 : 0.55) / (1 + j * 0.25) * (0.8 + 0.2 * Math.sin(t * 0.37 + j * 1.3));
      l += w * amp * Math.sin(2 * Math.PI * f * t + 0.6 * Math.sin(t * 0.21 + j));
      r += w * amp * Math.sin(2 * Math.PI * f * 1.0025 * t + 0.6 * Math.sin(t * 0.19 + j * 2));
    });
  }
  add(ML, MR, i, l * g, r * g);
}
function pluck(t0, f, d, gain, pan = 0) {
  let y = 0;
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + d) * SR); i++) {
    const u = i / SR - t0, e = Math.exp(-u * 14) * Math.min(1, u * 800);
    const s = (Math.sin(2 * Math.PI * f * u) + 0.35 * Math.sin(4 * Math.PI * f * u) + 0.12 * Math.sin(6 * Math.PI * f * u)) * e;
    y += 0.35 * (s - y);
    add(ML, MR, i, y * gain * (1 - pan), y * gain * (1 + pan));
  }
}
const arp = [0, 2, 1, 3, 2, 4, 1, 3];
for (let t = 0.3; t < 56.8; t += beat / 2) {
  if (t > HOLD[0] && t < HOLD[1]) continue;              // the question: silence of the pulse
  if (t > 5.2 && t < 10.2 && Math.round((t - 0.3) / (beat / 2)) % 2) continue;
  const k = Math.round((t - 0.3) / (beat / 2));
  const [, root, vo] = chords[chordAt(t)];
  const f = root * 4 * vo[arp[k % 8] % vo.length] / (vo[arp[k % 8] % vo.length] > 3 ? 2 : 1);
  pluck(t, f, 0.5, 0.045 * energy(t) * (k % 2 ? 0.65 : 1), (k % 2 ? 0.25 : -0.25));
}
function sub(t0, f, gain) {
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + 1.2) * SR); i++) {
    const u = i / SR - t0, e = Math.exp(-u * 3.2) * Math.min(1, u * 200);
    add(ML, MR, i, Math.sin(2 * Math.PI * f * u) * e * gain);
  }
}
for (let t = 19.0; t < 53.4; t += beat * 2) { if (t > HOLD[0] - 0.3 && t < HOLD[1]) continue; sub(t, chords[chordAt(t)][1], 0.085); }
function riser(t1, d, gain) {
  let y = 0;
  for (let i = Math.floor((t1 - d) * SR); i < Math.min(N, t1 * SR); i++) {
    const u = (i / SR - (t1 - d)) / d, c = 0.01 + 0.25 * u * u;
    y += c * (rnd() - y);
    add(ML, MR, i, y * gain * u * u, y * gain * u * u * 0.9);
  }
}
riser(HOLD[0], 1.6, 0.12); riser(W.through, 1.8, 0.1); riser(53.4, 1.2, 0.08);

// ------------------------------------------------------------------ sound design
function whoosh(t0, d, gain) {
  let y1 = 0, y2 = 0;
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + d) * SR); i++) {
    const u = (i / SR - t0) / d, e = Math.sin(Math.PI * u) ** 2, c = 0.004 + 0.05 * u;
    y1 += c * (rnd() - y1); y2 += c * (y1 - y2);
    add(XL, XR, i, y2 * e * gain * (1 - u * 0.6), y2 * e * gain * (0.4 + u * 0.6));
  }
}
/** metallic ping: inharmonic partials of a thin bar */
function ping(t0, f, gain, decay = 9) {
  const parts = [[1, 1], [2.756, 0.5], [5.404, 0.28], [8.933, 0.12]];
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + 1.2) * SR); i++) {
    const u = i / SR - t0, a = Math.min(1, u * 2000);
    let s = 0; for (const [k, w] of parts) s += w * Math.sin(2 * Math.PI * f * k * u) * Math.exp(-u * decay * (0.7 + k * 0.25));
    add(XL, XR, i, s * a * gain);
  }
}
/** wire creak while bending: band-passed noise with a slowly gliding resonance */
function creak(t0, d, gain, f0 = 1800) {
  let bp1 = 0, bp2 = 0;
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + d) * SR); i++) {
    const u = (i / SR - t0) / d, f = f0 * (1 + 0.25 * Math.sin(u * 7)), w = 2 * Math.PI * f / SR, q = 0.035;
    const x = rnd() * (0.4 + 0.6 * Math.abs(Math.sin(u * 60)));    // grainy friction
    bp1 += w * (x - bp1 - bp2 * q * 10); bp2 += w * bp1;
    add(XL, XR, i, bp2 * gain * Math.sin(Math.PI * u) * 0.6, bp2 * gain * Math.sin(Math.PI * u) * 0.6);
  }
}
function click(t0, gain, f = 3200) {
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + 0.06) * SR); i++) {
    const u = i / SR - t0, e = Math.exp(-u * 160);
    add(XL, XR, i, (rnd() * 0.6 + Math.sin(2 * Math.PI * f * u)) * e * gain);
  }
}
function thud(t0, gain) {
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + 0.9) * SR); i++) {
    const u = i / SR - t0, f = 72 * Math.exp(-u * 3), e = Math.exp(-u * 5) * Math.min(1, u * 400);
    add(XL, XR, i, Math.sin(2 * Math.PI * f * u) * e * gain);
  }
}
function tone(t0, f, d, gain, decay = 6) {
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + d) * SR); i++) {
    const u = i / SR - t0, e = Math.exp(-u * decay) * Math.min(1, u * 300);
    add(XL, XR, i, (Math.sin(2 * Math.PI * f * u) + 0.25 * Math.sin(4 * Math.PI * f * u)) * e * gain);
  }
}
function tension(t0, d, gain) {                 // activation: a soft rising sine "spring" tone
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + d) * SR); i++) {
    const u = (i / SR - t0) / d, f = 220 + 260 * u * u, e = Math.sin(Math.PI * Math.min(1, u * 1.1)) * 0.9;
    add(XL, XR, i, Math.sin(2 * Math.PI * f * (i / SR - t0)) * e * gain);
  }
}

whoosh(0.0, 0.7, 0.45);
[[5.05, 0.9, 0.38], [10.05, 0.8, 0.35], [13.2, 1.0, 0.3], [19.6, 1.3, 0.3], [21.9, 1.1, 0.32], [31.5, 0.9, 0.3], [35.2, 1.0, 0.25], [36.6, 0.8, 0.22],
 [41.3, 0.9, 0.3], [42.4, 0.9, 0.22], [48.4, 1.6, 0.3], [53.25, 0.9, 0.35], [OUTRO_T0 - 0.1, 1.4, 0.14]].forEach((w) => whoosh(...w));
// 01: the three outcomes start together
thud(S.hookMove[0], 0.12); tone(S.hookMove[0] + 0.02, 293.66, 1.2, 0.016, 2.5);
// 02: segments installed
creak(S.buccalWire[0], S.buccalWire[1] - S.buccalWire[0], 0.03, 2600); click(S.buccalWire[1], 0.09, 2400);
creak(S.antWire[0], S.antWire[1] - S.antWire[0], 0.03, 2900); click(S.antWire[1], 0.1, 2700);
creak(S.extension[0], 0.35, 0.04, 2100); ping(S.extension[0] + 0.33, 1900, 0.03); creak(S.extension[0] + 0.4, 0.35, 0.04, 2300); ping(S.extension[1] - 0.05, 2050, 0.03);
// 03: forming one cantilever (metal), mirror copy, insertion, activation, tie
const F_ = S.fab;
ping(F_.grow[0], 2100, 0.03, 10); creak(F_.grow[0], F_.grow[1] - F_.grow[0], 0.025, 3200);
creak(F_.tip[0], F_.tip[1] - F_.tip[0], 0.055, 2000); ping(F_.tip[1] - 0.05, 1850, 0.04);
creak(F_.arch[0], F_.arch[1] - F_.arch[0], 0.05, 1600); ping(F_.arch[1] - 0.05, 1700, 0.04);
creak(F_.hook[0], F_.hook[1] - F_.hook[0], 0.05, 2600); ping(F_.hook[1] - 0.05, 2400, 0.045);
tone(S.mirror[0] + 0.1, 1318.5, 0.9, 0.018, 4); tone(S.mirror[0] + 0.25, 1975.5, 0.8, 0.012, 5);
creak(S.insert[0] + 0.25, S.insert[1] - S.insert[0] - 0.25, 0.035, 3400); click(S.insert[1], 0.12, 2600); click(S.insert[1] + 0.03, 0.08, 2900);
tension(S.activate[0], S.activate[1] - S.activate[0] + 0.05, 0.024);
click(S.tie, 0.16, 3000); ping(S.tie + 0.01, 2200, 0.05, 12);
// vectors appear (soft ticks + air)
[W.intrForce, W.direction, W.ahead, W.intr5 - 0.25, W.opposite, W.reactive, W.moments9].forEach((t) => { tone(t, 1567.98, 0.35, 0.014, 14); whoosh(t - 0.05, 0.3, 0.1); });
// 04: points 1…5 (rising pentatonic ticks), CR chime
S.points.forEach((t, i) => tone(t, [880, 987.77, 1174.66, 1318.5, 1479.98][i], 0.4, 0.016, 10));
tone(S.crIn, 587.33, 1.6, 0.03, 2.2); tone(S.crIn + 0.02, 880, 1.4, 0.022, 2.4); ping(S.crIn, 2637, 0.012, 6);
S.hl123.forEach((t, i) => tone(t, [880, 987.77, 1174.66][i], 0.3, 0.013, 12));
// change of the point of application: glides (pitch follows the lever arm)
function glide(t0, d, f0, f1, gain) { for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + d) * SR); i++) { const u = (i / SR - t0) / d, f = f0 * Math.pow(f1 / f0, u), e = Math.sin(Math.PI * u) * gain; add(XL, XR, i, Math.sin(2 * Math.PI * f * (i / SR - t0)) * e); } }
glide(S.slide4[0], S.slide4[1] - S.slide4[0], 660, 440, 0.016); glide(S.slide5[0], S.slide5[1] - S.slide5[0], 440, 330, 0.016); glide(S.back8[0], S.back8[1] - S.back8[0], 330, 440, 0.012);
// moment compensation: M → 0 resolves into a pure dyad
tone(W.through, 440, 2.0, 0.026, 1.6); tone(W.through + 0.02, 659.25, 2.0, 0.02, 1.6); tone(W.centre7 + 0.55, 880, 1.6, 0.018, 2.0);
tone(W.pure, 587.33, 1.8, 0.02, 2); tone(W.pure + 0.03, 880, 1.6, 0.016, 2);
// opposite moment: low tension
tone(W.opposite, 220, 1.3, 0.02, 3); tone(W.opposite + 0.02, 233.08, 1.3, 0.012, 3);
// 08: reactive loads (soft thuds) and possible tipping
thud(W.reactive + 0.02, 0.16); thud(W.moments9 + 0.02, 0.12); creak(S.buccalTip[0] + 0.1, 1.0, 0.012, 700);
// 09: comparison + question
tone(53.42, 659.25, 1.4, 0.02, 2.6); tone(W.three10, 880, 1.0, 0.012, 3);
tone(W.bio10 - 0.02, 587.33, 2.6, 0.02, 1.2); tone(W.bio10, 880, 2.6, 0.016, 1.2); tone(W.bio10 + 0.03, 1318.5, 2.2, 0.011, 1.5);
KEYWORDS.forEach((k) => tone(Math.max(0.02, k.at - 0.04), 1975.5, 0.25, 0.006, 16));
// outro (logo): chime on the circle, second on BIOMECHANICS
tone(OUTRO_T0 + 0.55, 440, 2.4, 0.05, 1.6); tone(OUTRO_T0 + 0.57, 659.25, 2.4, 0.04, 1.6); tone(OUTRO_T0 + 1.15, 880, 1.8, 0.035, 1.8);

// ------------------------------------------------------------------ write + mix
function wav(path, Lc, Rc) {
  const n = Lc.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(clamp(Lc[i], -1, 1) * 32000), 44 + i * 4); buf.writeInt16LE(Math.round(clamp(Rc[i], -1, 1) * 32000), 46 + i * 4); }
  fs.writeFileSync(path, buf);
}
fs.mkdirSync('build', { recursive: true }); fs.mkdirSync('assets/audio', { recursive: true });
wav('build/music.wav', ML, MR); wav('build/sfx.wav', XL, XR);
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
const ins = VOICE.flatMap((v) => ['-i', v.file]);
const chains = VOICE.map((v, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(v.start * 1000)}|${Math.round(v.start * 1000)}[v${i}]`).join(';');
ff([...ins, '-filter_complex', `${chains};${VOICE.map((_, i) => `[v${i}]`).join('')}amix=inputs=${VOICE.length}:normalize=0,apad,atrim=0:${DURATION}[vo]`, '-map', '[vo]', 'build/voiceover.wav']);
ff(['-i', 'build/voiceover.wav', '-i', 'build/music.wav', '-i', 'build/sfx.wav', '-filter_complex',
  `[0:a]loudnorm=I=-15:TP=-2:LRA=9,apad,atrim=0:${DURATION},asplit=2[vo][sc];` +
  '[1:a]loudnorm=I=-27:TP=-8:LRA=11[mu];[2:a]loudnorm=I=-24:TP=-5:LRA=14[fx];' +
  `[mu][fx]amix=inputs=2:normalize=0,apad,atrim=0:${DURATION}[bed];` +
  '[bed][sc]sidechaincompress=threshold=0.025:ratio=6:attack=12:release=380[duck];' +
  `[vo][duck]amix=inputs=2:normalize=0:duration=longest,loudnorm=I=-15:TP=-1.5:LRA=11,apad,atrim=0:${DURATION}[out]`,
  '-map', '[out]', '-ar', '48000', 'build/mix.wav']);
for (const n of ['music', 'sfx', 'voiceover', 'mix']) ff(['-i', `build/${n}.wav`, '-c:a', 'aac', '-b:a', '160k', `assets/audio/${n}.m4a`]);
console.log('assets/audio/{music,sfx,voiceover,mix}.m4a');
