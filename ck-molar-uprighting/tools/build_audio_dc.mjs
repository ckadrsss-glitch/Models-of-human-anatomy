// DOUBLE CANTILEVER edit — soundtrack of CK_BIOMECHANICS_Molar_Uprighting_Double_Cantilever_FINAL (63.3 s).
// Same procedural music and sound design as tools/build_audio.mjs; everything before 40.5 s is identical,
// the scene-06 music is time-stretched over the longer new scene, events after it are shifted by EDIT.d,
// the miniscrew sounds are replaced by the second-cantilever sounds. Output: assets/audio/*_dc.m4a
// Soundtrack builder (licence-free, procedural, synchronised to src/timeline.js):
//  1. music bed — minimal cinematic / technological: soft pad (Dm9 → B♭maj7 → Gm9 → A7sus → Dm(add9)),
//     muted pulse (100 BPM) entering with the design scene, sub on downbeats, a riser into
//     THE SIDE EFFECT, half-time in the slow motion, resolve on the result, outro chord;
//  2. sound design — metal bending (creak + inharmonic ping), helix coiling, insertion scrape + click,
//     activation tension + engage click, vector ticks, occlusal-contact thud, miniscrew ratchet,
//     elastic stretch, positive contact chime, logo chime, whooshes on camera cuts;
//  3. voice-over (ElevenLabs «Принц Нури», assets/voice/nuri*.mp3) placed at VOICE[].start;
//  4. mix — bed side-chain ducked under the voice, −15 LUFS integrated, true peak −1.5 dBTP.
// usage: node tools/build_audio.mjs   → assets/audio/{music,sfx,voiceover,mix}.m4a (+ build/*.wav)
import fs from 'fs';
import { execFileSync } from 'child_process';
import { DURATION as DUR0, OUTRO_T0 as OUT0, S, W as W0 } from '../src/timeline.js';
import { VOICE_DC, DURATION_DC, EDIT, DS, W6 } from '../src/dc.js';
const VOICE = VOICE_DC, D = EDIT.d, DURATION = DURATION_DC, OUTRO_T0 = OUT0 + D;
// old-timeline word events after scene 06 move by D
const W = { ...W0, question: W0.question + D };
// musical time: identical before 40.5 s, scene 06 stretched over the new scene, then shifted
const warp = (t) => (t < 40.5 ? t : t < 51 + D ? 40.5 + (t - 40.5) * (10.5 / (10.5 + D)) : t - D);
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
  [0, 73.42, [1, 1.5, 2, 2.4, 3.0, 4.5]],        // Dm9
  [14, 58.27, [1, 1.5, 2, 2.52, 3.0, 3.78]],     // B♭maj7
  [22, 49.0, [1, 1.5, 2, 2.4, 3.0, 4.5]],        // Gm9
  [32, 55.0, [1, 1.5, 2, 2.67, 3.0, 3.56]],      // A7sus
  [40, 73.42, [1, 1.5, 2, 2.4, 3.0, 4.5]],       // Dm9
  [51, 58.27, [1, 1.5, 2, 2.52, 3.0, 4.5]],      // B♭maj9
  [OUT0, 73.42, [1, 1.5, 2, 2.25, 3.0, 4.0]],      // D (add9) resolve (musical time)
];
const chordAt = (t) => { let i = 0; while (i < chords.length - 1 && t >= chords[i + 1][0]) i++; return i; };
const energy = (t) =>                          // overall bed energy across the story
  0.55 + 0.25 * sm((t - 5) / 2) + 0.2 * sm((t - 22) / 3) - 0.35 * (sm((t - 32.2) / 0.5) - sm((t - 35.2) / 1.5)) + 0.15 * sm((t - 41) / 3) - 0.3 * sm((t - 51) / 2);
for (let i = 0; i < N; i++) {
  const t = i / SR, tau = warp(t), ci = chordAt(tau), [t0, root, vo] = chords[ci];
  const nxt = chords[Math.min(ci + 1, chords.length - 1)];
  const xf = ci < chords.length - 1 ? sm((tau - (nxt[0] - 1.6)) / 1.6) : 0;
  const g = sm(t / 1.2) * (1 - sm((t - (DURATION - 1.5)) / 1.5)) * 0.032 * energy(tau);
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
// muted pulse (plucked, low-passed): 8ths from 5 s, half-time during the slow motion, off in the result
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
for (let t = 5.0; t < 51.0 + D; t += beat / 2) {
  const slow = t > 32.2 && t < 35.2;
  const k = Math.round((t - 5) / (beat / 2));
  if (slow && k % 2) continue;
  const [, root, vo] = chords[chordAt(warp(t))];
  const f = root * 4 * vo[arp[k % 8] % vo.length] / (vo[arp[k % 8] % vo.length] > 3 ? 2 : 1);
  pluck(t, f, 0.5, 0.05 * energy(warp(t)) * (k % 2 ? 0.65 : 1), (k % 2 ? 0.25 : -0.25));
}
// sub on downbeats (every 2 beats) during the force scenes and the control scene
function sub(t0, f, gain) {
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + 1.2) * SR); i++) {
    const u = i / SR - t0, e = Math.exp(-u * 3.2) * Math.min(1, u * 200);
    add(ML, MR, i, Math.sin(2 * Math.PI * f * u) * e * gain);
  }
}
for (let t = 22.0; t < 51 + D; t += beat * 2) { if (t > 32.2 && t < 35.2) continue; sub(t, chords[chordAt(warp(t))][1], 0.09); }
// riser into THE SIDE EFFECT and into the control scene
function riser(t1, d, gain) {
  let y = 0;
  for (let i = Math.floor((t1 - d) * SR); i < Math.min(N, t1 * SR); i++) {
    const u = (i / SR - (t1 - d)) / d, c = 0.01 + 0.25 * u * u;
    y += c * (rnd() - y);
    add(ML, MR, i, y * gain * u * u, y * gain * u * u * 0.9);
  }
}
riser(W.problem - 0.05, 2.2, 0.16); riser(41.0, 1.4, 0.1);

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

whoosh(0.0, 0.9, 0.5);
[[4.85, 0.9, 0.4], [13.7, 1.0, 0.35], [21.9, 1.1, 0.35], [32.0, 1.0, 0.3], [39.8, 1.1, 0.4], [50.9 + D, 1.0, 0.3], [OUTRO_T0 - 0.1, 1.4, 0.14]].forEach((w) => whoosh(...w));
// 01: quick uprighting, antagonist closes → premature contact
creak(S.hookUpright[0], S.hookUpright[1] - S.hookUpright[0], 0.02, 600);
thud(3.28, 0.22); ping(3.3, 1480, 0.04, 14); tone(3.31, 311.1, 0.6, 0.02, 7);
// 02: fabrication
ping(5.3, 2100, 0.03, 10);                                                          // straight wire appears
const F_ = S.fab;
creak(F_.step[0], 0.35, 0.05, 2100); ping(F_.step[0] + 0.33, 1900, 0.035);
creak(F_.step[0] + 0.5, 0.35, 0.05, 2300); ping(F_.step[0] + 0.83, 2050, 0.035);
creak(F_.helix[0], F_.helix[1] - F_.helix[0], 0.06, 1500);                          // coiling around the mandrel
for (let k = 0; k < 4; k++) click(F_.helix[0] + (F_.helix[1] - F_.helix[0]) * (k + 1) / 4.2, 0.05, 2800);
ping(F_.helix[1], 1750, 0.04);
creak(F_.arm[0], F_.arm[1] - F_.arm[0], 0.05, 1900); ping(F_.arm[1] - 0.05, 1650, 0.04);   // tip-back bend
creak(F_.hook[0], F_.hook[1] - F_.hook[0], 0.05, 2600); ping(F_.hook[1] - 0.05, 2400, 0.045);
tone(10.55, 1318.5, 1.2, 0.02, 3);                                                   // design complete
// 03: insertion and activation
creak(S.insert[0], S.insert[1] - S.insert[0], 0.035, 3400); click(S.insert[1], 0.12, 2600);
tension(S.activate[0], S.activate[1] - S.activate[0] + 0.05, 0.022);
click(S.engage, 0.16, 3000); ping(S.engage + 0.01, 2200, 0.05, 12);
// vectors / moments appear (soft ticks)
[W.moment, W.system + 0.9, 22.6, W.upMoment, W.extrusive, W.intrusive, DS.v1Ext, DS.v1Int, DS.v2[0], DS.v2[0] + 0.15, DS.moments[0], DS.moments[0] + 0.4].forEach((t) => { tone(t, 1567.98, 0.35, 0.014, 14); whoosh(t - 0.05, 0.3, 0.12); });
// 05: interference
thud(38.18, 0.24); ping(38.2, 1480, 0.045, 14); tone(38.21, 311.1, 0.7, 0.024, 6);
// 06 (edit): reset, second cantilever — vertical slot, insertion, activation, engagement, force balance, controlled contact
whoosh(39.9, 1.0, 0.25);
ping(DS.slotIn[0] + 0.1, 2300, 0.035, 10); ping(DS.wire2In[0] + 0.1, 2050, 0.03, 10);
creak(DS.insert2[0], DS.insert2[1] - DS.insert2[0], 0.035, 3200); click(DS.insert2[1], 0.12, 2500);
tension(DS.activate2[0], DS.activate2[1] - DS.activate2[0] + 0.05, 0.022);
click(DS.engage2, 0.16, 3000); ping(DS.engage2 + 0.01, 2100, 0.05, 12);
for (let i = Math.floor(DS.balance[0] * SR); i < Math.floor((DS.balance[1] + 0.3) * SR); i++) {          // balance: two tones gliding into unison
  const t = i / SR, u = (t - DS.balance[0]) / (DS.balance[1] + 0.3 - DS.balance[0]), e = Math.sin(Math.PI * Math.min(1, u * 1.05)) * 0.016;
  const f1 = 523.25 * (1 + 0.06 * (1 - u)), f2 = 523.25 * (1 - 0.06 * (1 - u));
  add(XL, XR, i, (Math.sin(2 * Math.PI * f1 * t) * e), (Math.sin(2 * Math.PI * f2 * t) * e));
}
tone(DS.balance[1] + 0.05, 1046.5, 1.2, 0.022, 3);
tone(50.72 + D, 880, 1.0, 0.03, 4); tone(50.76 + D, 1318.5, 1.0, 0.02, 4);
// 07: result, question
tone(51.4 + D, 659.25, 1.2, 0.02, 3);
// the question: a soft suspended sting, then a gentle swell that resolves into the logo chime (no hard cut)
tone(W.question - 0.02, 587.33, 2.6, 0.022, 1.2); tone(W.question, 880, 2.6, 0.018, 1.2); tone(W.question + 0.03, 1318.5, 2.2, 0.012, 1.5);
for (let i = Math.floor((56.0 + D) * SR); i < Math.floor((OUTRO_T0 + 0.6) * SR); i++) {
  const t = i / SR, u = (t - 56.0 - D) / (OUTRO_T0 + 0.6 - 56.0 - D), e = Math.sin(Math.PI * u) * 0.018;
  add(XL, XR, i, (Math.sin(2 * Math.PI * 146.83 * t) + 0.5 * Math.sin(2 * Math.PI * 220 * t) + 0.3 * Math.sin(2 * Math.PI * 293.66 * t)) * e);
}
KEYWORDS.filter((k) => k.at < 40 || k.at > 51).map((k) => (k.at > 51 ? k.at + D : k.at)).concat([W6.second, DS.v2[0], W6.compensate, W6.control])
  .forEach((t) => tone(Math.max(0.02, t - 0.04), 1975.5, 0.25, 0.006, 16));   // very soft tick under each keyword
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
wav('build/music_dc.wav', ML, MR); wav('build/sfx_dc.wav', XL, XR);
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
const ins = VOICE.flatMap((v) => ['-i', v.file]);
const chains = VOICE.map((v, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(v.start * 1000)}|${Math.round(v.start * 1000)}[v${i}]`).join(';');
ff([...ins, '-filter_complex', `${chains};${VOICE.map((_, i) => `[v${i}]`).join('')}amix=inputs=${VOICE.length}:normalize=0,apad,atrim=0:${DURATION}[vo]`, '-map', '[vo]', 'build/voiceover_dc.wav']);
ff(['-i', 'build/voiceover_dc.wav', '-i', 'build/music_dc.wav', '-i', 'build/sfx_dc.wav', '-filter_complex',
  `[0:a]loudnorm=I=-15:TP=-2:LRA=9,apad,atrim=0:${DURATION},asplit=2[vo][sc];` +
  '[1:a]loudnorm=I=-27:TP=-8:LRA=11[mu];[2:a]loudnorm=I=-24:TP=-5:LRA=14[fx];' +
  `[mu][fx]amix=inputs=2:normalize=0,apad,atrim=0:${DURATION}[bed];` +
  '[bed][sc]sidechaincompress=threshold=0.025:ratio=6:attack=12:release=380[duck];' +
  `[vo][duck]amix=inputs=2:normalize=0:duration=longest,loudnorm=I=-15:TP=-1.5:LRA=11,apad,atrim=0:${DURATION}[out]`,
  '-map', '[out]', '-ar', '48000', 'build/mix_dc.wav']);
for (const n of ['music', 'sfx', 'voiceover', 'mix']) ff(['-i', `build/${n}_dc.wav`, '-c:a', 'aac', '-b:a', '160k', `assets/audio/${n}_dc.m4a`]);
console.log('assets/audio/{music,sfx,voiceover,mix}_dc.m4a');
