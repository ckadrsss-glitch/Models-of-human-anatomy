// Soundtrack builder.
//  1. Procedural, licence-free sound design synchronised to src/timeline.js: soft pad, air,
//     whoosh on the hook push-in and camera moves, soft "lock" when each tooth finishes its step,
//     a low thud on NO SPACE, a bright chime on SPACE CREATED, a resolve chord on the outro.
//  2. Voice-over track: the ElevenLabs clips (assets/voice/vo*.mp3) placed at VOICE[].start.
//  3. Final mix: SFX ducked under the voice, −16 LUFS integrated, true peak −1.5 dBTP.
// usage: node tools/build_audio.mjs [voiceover.(wav|mp3|m4a)]   (optional full-length VO starting at 00:00)
// outputs: assets/audio/{sfx,voiceover,mix}.m4a (+ build/*.wav masters)
import fs from 'fs';
import { execFileSync } from 'child_process';
import { VOICE, DURATION, SCHEDULE, OUTRO_T0 } from '../src/timeline.js';
import { SYNC, KEYWORDS } from '../src/kinetic.js';
const SR = 48000, DUR = DURATION, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);
let seed = 2026; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const env = (t, a, b, fi, fo) => Math.max(0, Math.min(1, (t - a) / fi, (b - t) / fo));

// pad: A minor add9 → F maj7 (space created) → C → A (outro)
const chords = [[0, [110, 164.81, 220, 246.94, 329.63]], [24.4, [87.31, 130.81, 174.61, 220, 329.63]], [36.0, [98, 146.83, 196, 246.94, 293.66]], [46.4, [65.41, 130.81, 196, 246.94, 329.63]], [OUTRO_T0, [110, 164.81, 220, 277.18, 329.63]]];
const chordAt = (t) => {
  let i = 0; while (i < chords.length - 1 && t >= chords[i + 1][0]) i++;
  const a = chords[i][1], b = chords[Math.min(i + 1, chords.length - 1)][1];
  const tn = i < chords.length - 1 ? chords[i + 1][0] : 1e9;
  const m = 0.5 - 0.5 * Math.cos(Math.min(1, Math.max(0, (t - (tn - 3)) / 3)) * Math.PI);
  return a.map((f, k) => f * (1 - m) + b[k] * m);
};
for (let i = 0; i < N; i++) {
  const t = i / SR, ch = chordAt(t), g = env(t, 0, DUR, 2.5, 2.5) * 0.045;
  let l = 0, r = 0;
  for (let k = 0; k < 5; k++) {
    const amp = (k === 0 ? 1 : 0.5) * (0.75 + 0.25 * Math.sin(t * 0.41 + k * 1.7));
    l += Math.sin(2 * Math.PI * ch[k] * t + Math.sin(t * 0.3 + k)) * amp;
    r += Math.sin(2 * Math.PI * ch[k] * 1.003 * t + Math.sin(t * 0.27 + k)) * amp;
  }
  L[i] += l * g; R[i] += r * g;
}
let a1 = 0, a2 = 0;
for (let i = 0; i < N; i++) { const t = i / SR; a1 += 0.02 * (rnd() - a1); a2 += 0.02 * (rnd() - a2); const g = env(t, 0, DUR, 3, 3) * 0.04; L[i] += a1 * g; R[i] += a2 * g; }
function whoosh(t0, d, gain) {
  let y1 = 0, y2 = 0;
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + d) * SR); i++) {
    const u = (i / SR - t0) / d, e = Math.sin(Math.PI * u) ** 2, c = 0.004 + 0.05 * u;
    y1 += c * (rnd() - y1); y2 += c * (y1 - y2);
    L[i] += y2 * e * gain * (1 - u * 0.6); R[i] += y2 * e * gain * (0.4 + u * 0.6);
  }
}
function tone(t0, f, d, gain, decay = 6) {
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + d) * SR); i++) {
    const u = i / SR - t0, e = Math.exp(-u * decay) * Math.min(1, u * 300);
    const s = (Math.sin(2 * Math.PI * f * u) + 0.25 * Math.sin(4 * Math.PI * f * u)) * e * gain; L[i] += s; R[i] += s;
  }
}
function thud(t0, gain) {
  for (let i = Math.floor(t0 * SR); i < Math.min(N, (t0 + 0.8) * SR); i++) {
    const u = i / SR - t0, f = 70 * Math.exp(-u * 3), e = Math.exp(-u * 5) * Math.min(1, u * 400);
    const s = Math.sin(2 * Math.PI * f * u) * e * gain; L[i] += s; R[i] += s;
  }
}
whoosh(0.0, 1.0, 0.6);                       // first frame
// scene transitions (camera moves / dips)
[[5.5, 1.8, 0.4], [11.2, 1.6, 0.4], [23.9, 1.2, 0.45], [35.5, 1.2, 0.45], [46.0, 1.0, 0.35], [50.5, 1.0, 0.35], [OUTRO_T0 - 0.2, 1.2, 0.35]].forEach((w) => whoosh(...w));
tone(SYNC.horse + 0.13, 330, 0.7, 0.035, 6);                        // horse comparison (soft)
tone(SYNC.space, 1318.5, 1.4, 0.03, 2.8); tone(SYNC.space + 0.03, 1760, 1.4, 0.022, 2.8);   // space region
for (const k of [7, 6, 5, 4]) { const [, b] = SCHEDULE.dist[k]; tone(b - 0.05, 880 + (7 - k) * 110, 0.6, 0.028, 9); }
thud(SCHEDULE.ext.remove[0], 0.18);                                 // premolar removed (schematic)
tone(SYNC.extSpace, 1174.7, 1.0, 0.026, 3.5);
tone(SCHEDULE.ext.retr[1] - 0.1, 659.25, 0.9, 0.025, 4);
tone(SYNC.little, 1567.98, 0.6, 0.03, 8);                           // IPR indicator
[0, 0.3, 0.6].forEach((d) => tone(46.7 + d, 987.77 + d * 200, 0.4, 0.02, 10));   // summary cards
tone(SCHEDULE.retr[1] - 0.1, 659.25, 1.0, 0.03, 4);
KEYWORDS.forEach((k) => tone(k.at - 0.04, 1567.98, 0.35, 0.012, 14));            // very soft tick under each keyword
tone(OUTRO_T0 + 0.55, 440, 2.4, 0.05, 1.6); tone(OUTRO_T0 + 0.57, 659.25, 2.4, 0.04, 1.6); tone(OUTRO_T0 + 1.15, 880, 2, 0.035, 1.8);

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
const ext = process.argv[2];
if (ext) ff(['-i', ext, '-af', `apad,atrim=0:${DUR}`, '-ar', '48000', '-ac', '2', 'build/voiceover.wav']);
else {
  const ins = VOICE.flatMap((v) => ['-i', v.file]);
  const chains = VOICE.map((v, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(v.start * 1000)}|${Math.round(v.start * 1000)}[v${i}]`).join(';');
  ff([...ins, '-filter_complex', `${chains};${VOICE.map((_, i) => `[v${i}]`).join('')}amix=inputs=${VOICE.length}:normalize=0,apad,atrim=0:${DUR}[vo]`, '-map', '[vo]', 'build/voiceover.wav']);
}
ff(['-i', 'build/voiceover.wav', '-i', 'build/sfx.wav', '-filter_complex',
  '[0:a]loudnorm=I=-16:TP=-2:LRA=9,asplit=2[vo][sc];[1:a]loudnorm=I=-25:TP=-6:LRA=11[bed];' +
  '[bed][sc]sidechaincompress=threshold=0.03:ratio=5:attack=15:release=350[duck];' +
  `[vo][duck]amix=inputs=2:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=0:${DUR}[out]`,
  '-map', '[out]', '-ar', '48000', 'build/mix.wav']);
ff(['-i', 'build/sfx.wav', '-af', 'loudnorm=I=-25:TP=-6', '-c:a', 'aac', '-b:a', '160k', 'assets/audio/sfx.m4a']);
ff(['-i', 'build/voiceover.wav', '-c:a', 'aac', '-b:a', '160k', 'assets/audio/voiceover.m4a']);
ff(['-i', 'build/mix.wav', '-c:a', 'aac', '-b:a', '160k', 'assets/audio/mix.m4a']);
console.log('assets/audio/{sfx,voiceover,mix}.m4a');
