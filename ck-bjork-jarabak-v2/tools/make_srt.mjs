// Writes docs/voiceover_ru.srt from the VOICE timing (src/timeline.js) and the real clip durations.
import fs from 'fs'; import { execFileSync } from 'child_process';
import { VOICE } from '../src/voice.js';
const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
const out = VOICE.map((v, i) => {
  const d = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', v.file]).toString();
  return `${i + 1}\n${ts(v.start)} --> ${ts(v.start + d)}\n${v.text}\n`;
}).join('\n');
fs.writeFileSync('docs/voiceover_ru.srt', out); console.log(out);
