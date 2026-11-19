// Re-generate the voice-over with the ElevenLabs Text-to-Speech API.
// The texts and start times live in src/timeline.js (VOICE).
//
//   ELEVENLABS_API_KEY=... node tools/voiceover.mjs [voiceId] [modelId]
//
// Voice: "Evgeniy Rybakov" (ws3YyKFd5whKb21yaXES, Russian) — approved project voice; do not replace without the owner's permission.
// After regenerating, check clip lengths: each clip must end before the next
// start time (node tools/voiceover.mjs --check), then rebuild the audio mix.
import { VOICE, DURATION } from '../src/timeline.js';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const check = process.argv.includes('--check');
if (check) {
  VOICE.forEach((v, i) => {
    const d = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', v.file]).toString();
    const next = VOICE[i + 1] ? VOICE[i + 1].start : DURATION;
    console.log(`${v.file}: ${d.toFixed(2)} s, ends ${(v.start + d).toFixed(2)} / next ${next} ${v.start + d > next ? '⚠ OVERLAP' : 'ok'}`);
  });
  process.exit(0);
}
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('Set ELEVENLABS_API_KEY'); process.exit(1); }
const voice = process.argv[2] || 'ws3YyKFd5whKb21yaXES';
const model = process.argv[3] || 'eleven_multilingual_v2';
for (const v of VOICE) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: v.text, model_id: model, voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } }),
  });
  if (!r.ok) { console.error(v.file, r.status, await r.text()); process.exit(1); }
  writeFileSync(v.file, Buffer.from(await r.arrayBuffer()));
  console.log('✓', v.file);
}
