// Mix the ElevenLabs voice-over clips at their timeline positions with a soft
// procedural ambient bed, normalised for Instagram (≈ −14 LUFS).
// usage: node tools/build_audio.mjs [out=build/audio.m4a]
import { VOICE, DURATION } from '../src/timeline.js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
const out = process.argv[2] || 'build/audio.m4a';
mkdirSync('build', { recursive: true });
const args = ['-y', '-v', 'error'];
const clips = VOICE.filter((v) => existsSync(v.file));
for (const v of clips) args.push('-i', v.file);
// ambient pad: A-major add9 sine chord with slow movement, low-passed
const pad = "0.05*sin(2*PI*110*t)*(0.6+0.4*sin(2*PI*0.05*t))+0.035*sin(2*PI*164.81*t)*(0.6+0.4*sin(2*PI*0.07*t+1))+0.03*sin(2*PI*246.94*t)*(0.5+0.5*sin(2*PI*0.04*t+2))+0.022*sin(2*PI*329.63*t)*(0.5+0.5*sin(2*PI*0.06*t+3))";
args.push('-f', 'lavfi', '-i', `aevalsrc=${pad}|${pad.replace(/\*t\)/g, '*t+0.4)')}:s=48000:d=${DURATION}`);
const f = [];
clips.forEach((v, i) => f.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(v.start * 1000)}|${Math.round(v.start * 1000)}[v${i}]`));
const padIdx = clips.length;
f.push(`[${padIdx}:a]lowpass=f=900,volume=0.55,afade=t=in:d=2,afade=t=out:st=${DURATION - 3}:d=3[pad]`);
f.push(`${clips.map((_, i) => `[v${i}]`).join('')}amix=inputs=${clips.length}:normalize=0,asplit=2[vo][vok]`);
// gentle ducking of the pad under the voice
f.push(`[pad][vok]sidechaincompress=threshold=0.02:ratio=6:attack=40:release=600[padd]`);
f.push(`[vo][padd]amix=inputs=2:normalize=0,apad=whole_dur=${DURATION},atrim=0:${DURATION},loudnorm=I=-14:TP=-1.5:LRA=9[out]`);
args.push('-filter_complex', f.join(';'), '-map', '[out]', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', out);
execFileSync('ffmpeg', args, { stdio: 'inherit' });
console.log('audio →', out);
