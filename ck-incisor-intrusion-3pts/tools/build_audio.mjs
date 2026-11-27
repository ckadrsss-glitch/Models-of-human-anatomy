// Soundtrack builder (licence-free, procedural, synchronised to src/timeline.js — same engine as the series):
//  1. music bed — minimal cinematic / technological, no vocals: pad (Dm9 → B♭maj7 → Gm9 → A7sus → Dm9 → A7sus → Gm9 →
//     B♭maj9 → D), muted pulse (100 BPM), sub on downbeats in the force analysis, stop on the second hook,
//     riser into the pure intrusion, resolve on the comparison, outro chord;
//  2. sound design — wire installation (creak + inharmonic ping), insertion scrape + click, activation tension, tie
//     click, re-tie sequence (untie click, release, hook glide, re-activation, re-tie), vector ticks, CR chime,
//     moment compensation (resolving dyad), reactive-load thuds, logo chime, whooshes on camera moves;
//  3. voice-over (ElevenLabs «Принц Нури», assets/voice/v01…v08.mp3) placed at VOICE[].start;
//  4. mix — bed side-chain ducked under the voice, −15 LUFS integrated, true peak −1.5 dBTP.
// usage: node tools/build_audio.mjs   → assets/audio/{music,sfx,voiceover,mix}.m4a (+ build/*.wav)
import fs from 'fs';
import { execFileSync } from 'child_process';
import { VOICE } from '../src/voice.js';
import { DURATION, OUTRO_T0 as OUTRO_A, S as S_A, W as W_A, toOut } from '../src/timeline.js';
// V4: the animation is authored in animation time and played through WARP — every sound event is placed in OUTPUT time
const mapT = (v) => (Array.isArray(v) ? v.map(mapT) : typeof v === 'number' ? toOut(v) : v);
const S = Object.fromEntries(Object.entries(S_A).map(([k, v]) => [k, mapT(v)]));
const W = Object.fromEntries(Object.entries(W_A).map(([k, v]) => [k, mapT(v)]));
const OUTRO_T0 = toOut(OUTRO_A);
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
  [0, 73.42, [1, 1.5, 2, 2.4, 3.0, 4.5]],        // Dm9   hook: intrusion or proclination?
  [toOut(4.0), 58.27, [1, 1.5, 2, 2.52, 3.0, 3.78]],    // B♭maj7 appliance design
  [toOut(13.0), 49.0, [1, 1.5, 2, 2.4, 3.0, 4.5]],      // Gm9   position A
  [toOut(19.5), 55.0, [1, 1.5, 2, 2.67, 3.0, 3.56]],    // A7sus proclination
  [toOut(23.0), 73.42, [1, 1.5, 2, 2.4, 3.0, 4.5]],     // Dm9   second hook → position B
  [toOut(37.0), 55.0, [1, 1.5, 2, 2.67, 3.0, 3.56]],    // A7sus position C
  [toOut(46.0), 49.0, [1, 1.5, 2, 2.4, 3.0, 4.5]],      // Gm9   reactions
  [toOut(53.0), 58.27, [1, 1.5, 2, 2.52, 3.0, 4.5]],    // B♭maj9 comparison
  [OUTRO_T0, 73.42, [1, 1.5, 2, 2.25, 3.0, 4.0]],  // D (add9) resolve
];
const chordAt = (t) => { let i = 0; while (i < chords.length - 1 && t >= chords[i + 1][0]) i++; return i; };
const HOLD = [W.what4 - 0.3, S.slideB[0] + 0.3];   // second hook: the bed thins out, camera stops on the question
const energy = (t) => 0.66 + 0.16 * sm((t - 4) / 2) + 0.16 * sm((t - 13) / 3) - 0.45 * (sm((t - HOLD[0]) / 0.4) - sm((t - HOLD[1]) / 1.2))
  + 0.12 * sm((t - 37) / 3) - 0.1 * sm((t - 46) / 2) - 0.25 * sm((t - 53) / 2);
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
for (let t = 0.3; t < toOut(56.8); t += beat / 2) {
  if (t > HOLD[0] && t < HOLD[1]) continue;              // the question: silence of the pulse
  if (t > 4.0 && t < 9.5 && Math.round((t - 0.3) / (beat / 2)) % 2) continue;
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
for (let t = toOut(16.5); t < toOut(53.0); t += beat * 2) { if (t > HOLD[0] - 0.3 && t < HOLD[1]) continue; sub(t, chords[chordAt(t)][1], 0.085); }
function riser(t1, d, gain) {
  let y = 0;
  for (let i = Math.floor((t1 - d) * SR); i < Math.min(N, t1 * SR); i++) {
    const u = (i / SR - (t1 - d)) / d, c = 0.01 + 0.25 * u * u;
    y += c * (rnd() - y);
    add(ML, MR, i, y * gain * u * u, y * gain * u * u * 0.9);
  }
}
riser(HOLD[0], 1.6, 0.12); riser(W.through5, 1.8, 0.1); riser(toOut(53.0), 1.2, 0.08);

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
[[3.85, 0.9, 0.38], [9.4, 1.0, 0.3], [12.3, 0.9, 0.25], [13.9, 0.9, 0.25], [14.9, 0.8, 0.22], [16.6, 1.2, 0.3], [23.7, 1.1, 0.25], [26.2, 1.2, 0.25],
 [37.2, 0.9, 0.25], [38.3, 0.9, 0.22], [39.6, 0.8, 0.22], [45.85, 0.9, 0.36], [52.85, 0.9, 0.35], [OUTRO_T0 - 0.1, 1.4, 0.14]].forEach((w, i, arr) => whoosh(i === arr.length - 1 ? w[0] : toOut(w[0]), w[1], w[2]));   // V4: animation → output time
// 01: the hook — force down, crowns tip forward (low tension)
thud(0.02, 0.12); tone(0.04, 293.66, 1.2, 0.016, 2.5); tone(W.tilt1, 220, 1.2, 0.016, 3); tone(W.tilt1 + 0.02, 233.08, 1.2, 0.01, 3);
// 02: segments installed (gold sectional wire, extensions, anchor segments)
creak(S.antWire[0], S.antWire[1] - S.antWire[0], 0.03, 2900); click(S.antWire[1], 0.1, 2700);
creak(S.extension[0], 0.3, 0.04, 2100); ping(S.extension[0] + 0.3, 1900, 0.03); creak(S.extension[0] + 0.35, 0.3, 0.04, 2300); ping(S.extension[1] - 0.05, 2050, 0.03);
creak(S.bucR[0], S.bucR[1] - S.bucR[0], 0.03, 2600); click(S.bucR[1], 0.09, 2400);
creak(S.bucL[0], S.bucL[1] - S.bucL[0], 0.03, 2500); click(S.bucL[1], 0.09, 2300);
// cantilevers: insertion into the auxiliary tubes, activation (spring tension), tie click
creak(S.insert[0] + 0.15, S.insert[1] - S.insert[0] - 0.15, 0.035, 3400); click(S.insert[1], 0.12, 2600); click(S.insert[1] + 0.03, 0.08, 2900);
tension(S.activate[0], S.activate[1] - S.activate[0] + 0.05, 0.024);
click(S.tie, 0.16, 3000); ping(S.tie + 0.01, 2200, 0.05, 12);
// 03: tie point A appears, CR chime, vectors
tone(S.badgeA, 880, 0.5, 0.016, 8);
tone(W.cr3, 587.33, 1.6, 0.03, 2.2); tone(W.cr3 + 0.02, 880, 1.4, 0.022, 2.4); ping(W.cr3, 2637, 0.012, 6);
[S.vectors, W.line3, W.ahead3, W.moment3, W.result5, W.opp6, W.reactive7, W.moments7].forEach((t) => { tone(t, 1567.98, 0.35, 0.014, 14); whoosh(t - 0.05, 0.3, 0.1); });
// 04–06: changing the tie point — untie (click), deactivate (release), hook slides (glide), re-activate (tension), re-tie (click)
function glide(t0, d, f0, f1, gain) { for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + d) * SR); i++) { const u = (i / SR - t0) / d, f = f0 * Math.pow(f1 / f0, u), e = Math.sin(Math.PI * u) * gain; add(XL, XR, i, Math.sin(2 * Math.PI * f * (i / SR - t0)) * e); } }
for (const [un, de, sl, re, ti, f0, f1] of [[S.untieB, S.deactB, S.slideB, S.reactB, S.tieB, 660, 440], [S.untieC, S.deactC, S.slideC, S.reactC, S.tieC, 440, 330]]) {
  click(un[0] + 0.05, 0.1, 2400); ping(un[0] + 0.06, 1700, 0.02, 14);
  glide(de[0], de[1] - de[0], 520, 300, 0.012);
  creak(sl[0], sl[1] - sl[0], 0.022, 3000); glide(sl[0], sl[1] - sl[0], f0, f1, 0.016);
  tension(re[0], re[1] - re[0] + 0.05, 0.02);
  click(ti, 0.15, 3000); ping(ti + 0.01, 2200, 0.045, 12);
}
// moment → 0 resolves into a pure dyad; pure intrusion
tone(W.through5, 440, 2.0, 0.026, 1.6); tone(W.through5 + 0.02, 659.25, 2.0, 0.02, 1.6); tone(W.centre5 + 0.1, 880, 1.6, 0.018, 2.0);
tone(W.pure5, 587.33, 1.8, 0.02, 2); tone(W.pure5 + 0.03, 880, 1.6, 0.016, 2);
// opposite moment: low tension
tone(W.opp6, 220, 1.3, 0.02, 3); tone(W.opp6 + 0.02, 233.08, 1.3, 0.012, 3);
// 07: reactive loads (soft thuds) and possible tipping
thud(W.reactive7 + 0.02, 0.16); thud(W.moments7 + 0.02, 0.12); creak(S.buccalTip[0] + 0.1, 1.0, 0.012, 700);
// 08: comparison
tone(toOut(53.02), 659.25, 1.4, 0.02, 2.6); tone(W.three8, 880, 1.0, 0.012, 3);
tone(W.point9 - 0.02, 587.33, 2.6, 0.02, 1.2); tone(W.point9, 880, 2.6, 0.016, 1.2); tone(W.point9 + 0.03, 1318.5, 2.2, 0.011, 1.5);
KEYWORDS.forEach((k) => tone(Math.max(0.02, toOut(k.at) - 0.04), 1975.5, 0.25, 0.006, 16));
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
