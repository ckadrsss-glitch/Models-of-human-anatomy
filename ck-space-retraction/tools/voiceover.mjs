// Re-generate the voice-over with the ElevenLabs Text-to-Speech API (texts and start times: src/timeline.js → VOICE).
//   ELEVENLABS_API_KEY=... node tools/voiceover.mjs        regenerate all clips
//   node tools/voiceover.mjs --check                        clip lengths vs. timeline (no API key needed)
// Voice: «Принц Нури» (gJEfHTTiifXEDmO687lC, Russian) — the project voice chosen by the owner (earlier take: Evgeniy Rybakov, assets/voice/rybakov/).
// After regenerating: update VOICE[].dur, then `node tools/build_audio.mjs`.
import { VOICE, DURATION } from '../src/timeline.js';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
if (process.argv.includes('--check')) {
  VOICE.forEach((v, i) => {
    const d = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', v.file]).toString();
    const next = VOICE[i + 1] ? VOICE[i + 1].start : DURATION;
    console.log(`${v.file}: ${d.toFixed(2)} s (timeline dur ${v.dur}), ${v.start} → ${(v.start + d).toFixed(2)} / next ${next} ${v.start + d > next ? '⚠ OVERLAP' : 'ok'}`);
  });
  process.exit(0);
}
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('Set ELEVENLABS_API_KEY'); process.exit(1); }
for (const v of VOICE) {
  const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/gJEfHTTiifXEDmO687lC?output_format=mp3_44100_128', {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: v.tts || v.text, model_id: 'eleven_multilingual_v2' }),
  });
  if (!r.ok) { console.error(v.file, r.status, await r.text()); process.exit(1); }
  writeFileSync(v.file, Buffer.from(await r.arrayBuffer())); console.log('✓', v.file);
}
