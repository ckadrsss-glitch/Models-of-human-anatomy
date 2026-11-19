// Final mix: ElevenLabs voice-over (Evgeniy Rybakov) at the layout positions,
// soft ambient music ducked under the voice, sound-design cues, loudness
// normalised for Instagram (≈ −14 LUFS). Output: build/audio.m4a + assets/audio/mix.m4a
// usage: node tools/build_audio.mjs
import { VOICE, DURATION, SFX, SFX_BEDS, MUSIC, newFromBase, tonsilSeg, OUTRO_T0 } from '../src/timeline.js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync } from 'node:fs';

mkdirSync('build', { recursive: true }); mkdirSync('assets/audio', { recursive: true });
const T = tonsilSeg();
const at = (c, kb = 'b', ku = 'u') => {
  if (c[kb] != null) return newFromBase(c[kb]);
  if (c[ku] != null) return c[ku] >= 0 ? T.t0 + c[ku] : T.t1 + c[ku];
  if (c.uEnd != null) return T.t1 + c.uEnd;
  if (c.o != null) return OUTRO_T0 + c.o;
  return null;
};
const args = ['-y', '-v', 'error'];
const f = [];
let n = 0;
const labels = { vo: [], fx: [] };
// voice
for (const v of VOICE) {
  args.push('-i', v.file);
  const d = Math.round(v.start * 1000);
  f.push(`[${n}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${d}|${d}[v${n}]`); labels.vo.push(`[v${n}]`); n++;
}
// one-shot cues
for (const c of SFX) {
  const t = at(c); if (t == null || t < 0) continue;
  args.push('-i', c.file);
  const d = Math.round(t * 1000);
  f.push(`[${n}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${c.gain},adelay=${d}|${d}[x${n}]`); labels.fx.push(`[x${n}]`); n++;
}
// looped beds
for (const c of SFX_BEDS) {
  const t0 = c.b0 != null ? newFromBase(c.b0) : T.t0 + c.u0;
  const t1 = c.b1 != null ? newFromBase(c.b1) : (c.u1 < 0 ? T.t1 + c.u1 : T.t0 + c.u1);
  const len = t1 - t0, d = Math.round(t0 * 1000);
  args.push('-stream_loop', '-1', '-i', c.file);
  f.push(`[${n}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${len.toFixed(3)},afade=t=in:d=1.2,afade=t=out:st=${(len - 1.5).toFixed(3)}:d=1.5,volume=${c.gain},adelay=${d}|${d}[x${n}]`); labels.fx.push(`[x${n}]`); n++;
}
// music
args.push('-i', MUSIC.file);
const mi = n++;
f.push(`[${mi}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${DURATION},afade=t=in:d=1.5,afade=t=out:st=${(DURATION - 3).toFixed(3)}:d=3,volume=${MUSIC.gain}[mus]`);
f.push(`${labels.vo.join('')}amix=inputs=${labels.vo.length}:normalize=0,asplit=2[vo][vok]`);
f.push(`${labels.fx.join('')}amix=inputs=${labels.fx.length}:normalize=0[fx]`);
f.push(`[mus][vok]sidechaincompress=threshold=0.015:ratio=5:attack=60:release=700[musd]`);
f.push(`[vo][fx][musd]amix=inputs=3:normalize=0,apad=whole_dur=${DURATION},atrim=0:${DURATION},afade=t=out:st=${(DURATION - 0.6).toFixed(3)}:d=0.6,loudnorm=I=-14:TP=-1.5:LRA=11[out]`);
args.push('-filter_complex', f.join(';'), '-map', '[out]', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', 'build/audio.m4a');
execFileSync('ffmpeg', args, { stdio: 'inherit' });
copyFileSync('build/audio.m4a', 'assets/audio/mix.m4a');
console.log(`audio → build/audio.m4a (${labels.vo.length} voice clips, ${labels.fx.length} sfx, music), ${DURATION.toFixed(2)} s`);
