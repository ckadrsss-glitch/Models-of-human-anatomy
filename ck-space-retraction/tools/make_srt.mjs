// Writes docs/subtitles_ru.srt (short on-screen chunks, SUBS) and docs/voiceover_ru.srt (full phrases, VOICE) from src/timeline.js.
import fs from 'fs';
import { VOICE, SUBS } from '../src/timeline.js';
const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
fs.writeFileSync('docs/subtitles_ru.srt', SUBS.map(([a, b, s], i) => `${i + 1}\n${ts(a)} --> ${ts(b)}\n${s}\n`).join('\n'));
fs.writeFileSync('docs/voiceover_ru.srt', VOICE.map((v, i) => `${i + 1}\n${ts(v.start)} --> ${ts(v.start + v.dur)}\n${v.text}\n`).join('\n'));
console.log('docs/subtitles_ru.srt, docs/voiceover_ru.srt');
