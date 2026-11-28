// Subtitles (SRT) from the voice-over timing: docs/voiceover_ru.srt (one cue per phrase), docs/subtitles_ru.srt (on-screen chunks)
import fs from 'fs';
import { VOICE } from '../src/voice.js';
import { SUBS, toOut } from '../src/timeline.js';
import { LANG } from '../src/lang.js';
const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
fs.writeFileSync(`docs/voiceover_${LANG}.srt`, VOICE.map((v, i) => `${i + 1}\n${ts(v.start)} --> ${ts(v.start + v.speech)}\n${v.text}\n`).join('\n'));
fs.writeFileSync(`docs/subtitles_${LANG}.srt`, SUBS.map((c, i) => `${i + 1}\n${ts(toOut(c[0]))} --> ${ts(toOut(c[1]))}\n${c[2]}\n`).join('\n'));
console.log(`docs/voiceover_${LANG}.srt, docs/subtitles_${LANG}.srt`);
