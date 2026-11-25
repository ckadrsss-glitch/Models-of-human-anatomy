// ============================================================================
//  EDIT: DOUBLE CANTILEVER MECHANICS (replaces the miniscrew demonstration of scene 06).
//
//  The original film (src/timeline.js, 60 s) is untouched. This module describes the local edit:
//   • frames before EDIT.a are the original renders (re-used, not re-rendered);
//   • [EDIT.a, EDIT.join) is the new scene (own schedule, camera, overlays);
//   • from EDIT.join on, the original timeline continues shifted by EDIT.d seconds
//     (scene 07 and the brand outro unchanged in content; re-rendered only up to the end of the
//     outro dissolve because the miniscrew/anchor state of the original frames differs).
//  Voice: the miniscrew line is replaced by the new line (Принц Нури, same model); the final
//  lines are shifted by EDIT.d. No force magnitudes or activation values are claimed.
// ============================================================================
import { VOICE as VOICE0 } from './voice.js';
import { V, apply, applyDir } from './model.js';
import { SCENE } from './scene.js';

export const EDIT = { a: 39.7, d: 3.3, join: 51.0 + 3.3, reuseFrom: 57.95 + 3.3 };
export const DURATION_DC = 60 + EDIT.d;

// new voice line 6 (pauses after «способ.» and «зубы.» shortened, tempo ×1.08 — same voice)
const RAW = [['Но', 0, 0.325], ['есть', 0.65, 0.94], ['и', 0.964, 0.987], ['другой', 1.022, 1.312], ['способ.', 1.358, 1.916], ['Второй', 2.426, 2.833], ['кантилевер', 2.891, 3.448], ['создаёт', 3.773, 4.191], ['противоположные', 4.226, 4.888], ['вертикальные', 4.911, 5.457], ['силы,', 5.503, 5.805], ['компенсируя', 5.828, 6.374], ['экструзию', 6.42, 6.908], ['моляра', 6.966, 7.314], ['и', 7.372, 7.419], ['интрузивную', 7.442, 8.092], ['нагрузку', 8.127, 8.545], ['на', 8.591, 8.661], ['опорные', 8.696, 9.056], ['зубы.', 9.102, 9.532], ['При', 10.228, 10.414], ['правильной', 10.449, 10.855], ['активации', 10.879, 11.378], ['мы', 11.413, 11.482], ['сохраняем', 11.529, 11.935], ['выпрямляющий', 11.981, 12.574], ['момент', 12.608, 12.957], ['и', 12.98, 13.003], ['контролируем', 13.05, 13.63], ['вертикальное', 13.677, 14.234], ['перемещение.', 14.28, 15.325]];
const MAP = (t) => (t - (t >= 10.15 ? 0.9 : t >= 2.3 ? 0.35 : 0)) / 1.08;
export const WORDS6 = RAW.map(([w, a, b]) => [w, MAP(a), MAP(b)]);
export const VO6 = { file: 'assets/voice/nuri6_dc.mp3', start: 39.75, dur: 13.4, speech: MAP(15.325),
  text: 'Но есть и другой способ. Второй кантилевер создаёт противоположные вертикальные силы, компенсируя экструзию моляра и интрузивную нагрузку на опорные зубы. При правильной активации мы сохраняем выпрямляющий момент и контролируем вертикальное перемещение.',
  chunks: ['Но есть и другой способ.', 'Второй кантилевер создаёт', 'противоположные вертикальные силы,', 'компенсируя экструзию моляра', 'и интрузивную нагрузку на опорные зубы.', 'При правильной активации', 'мы сохраняем выпрямляющий момент', 'и контролируем вертикальное перемещение.'] };
export const VOICE_DC = VOICE0.map((v, i) => (i === 5 ? VO6 : i >= 6 ? { ...v, start: v.start + EDIT.d } : v));
const w6 = (stem) => { const w = WORDS6.find((x) => x[0].toLowerCase().replace(/[.,]/g, '').startsWith(stem)); return VO6.start + w[1]; };
export const W6 = {
  other: w6('другой'), second: w6('второй'), vertical: w6('вертикальные'), compensate: w6('компенсируя'),
  anchorTeeth: w6('опорные'), activation: w6('активации'), keep: w6('сохраняем'), moment: w6('момент'), control: w6('контролируем'),
};
export const SUBS_DC = VOICE_DC.flatMap((v) => {
  const total = v.chunks.reduce((n, c) => n + c.length, 0);
  let t = v.start;
  return v.chunks.map((c, i) => { const d = v.speech * c.length / total; const cue = [t, i === v.chunks.length - 1 ? v.start + v.speech + 0.3 : t + d, c]; t += d; return cue; });
});

// ---------------------------------------------------------------- schedule of the new scene (absolute, new timeline)
export const DS = {
  reset: [39.9, 40.9],                 // (original) back to the start position
  v1Ext: 40.95, v1Int: 41.3,           // 1–2: vectors of the first cantilever
  slotIn: [41.6, 42.0],                // vertical slot + distal extension of the 47 wire appear (on «Второй кантилевер»)
  wire2In: [41.9, 42.2],               // second cantilever appears above the slot (passive shape)
  insert2: [42.2, 42.85],              // 3: fixed end inserted into the vertical slot
  activate2: [43.0, 43.6],             // elastic deformation: free end pressed down onto the extension
  engage2: 43.65,
  v2: [43.7, 44.0],                    // 4: opposite vertical vectors (on «противоположные вертикальные силы»)
  balance: [44.9, 46.6],               // 5: compensation of the vertical forces (on «компенсируя»)
  moments: [46.8, 48.4],               // 6: resulting moments (re-emphasised on «момент»)
  upright: [48.6, 50.2 + EDIT.d],      // 7: controlled uprighting (ends where the original did, shifted)
};
export const DELTA2 = 5.0;             // passive offset of the 2nd cantilever's hook (illustrative, never shown)

// ---------------------------------------------------------------- appliance geometry of the 2nd cantilever
export function dcGeometry(hdr) {
  const L47 = hdr.meshes.find((m) => m.name === 'L47');
  const wEnd = SCENE.anchorWire(hdr)[0];                        // distal end of the rigid anchor wire (2.2 mm distal of the 45 slot)
  const slotC = V.add(wEnd, [-0.35, 1.35, 2.6]);                 // vertical slot: buccal of the wire end, its lower end soldered to the wire
  const S0 = V.add(slotC, [0, -1.9, 0]);                         // bottom of the wire inside the slot (local origin)
  // distal extension of the wire bonded to 47: from the occlusal barrel of the molar tube, distally along the tube axis
  const fz = V.norm(L47.faN), fx = V.norm(V.sub([1, 0, 0], V.mul(fz, fz[0]))), fo = V.cross(fz, fx);
  const tubeC = V.add(L47.fa, V.mul(L47.faN, SCENE.tubeOff));
  const E0 = V.add(tubeC, V.add(V.mul(fo, 2.1), V.mul(fz, 1.9)));   // occlusal-buccal barrel: keeps the 2nd cantilever buccal of the 1st
  // direction chosen so the extension stays near-horizontal between the tipped start and the upright end
  // (anatomical frame: 7° gingival of distal) and the hook point D lies DISTAL to the CR in every pose (tools/qa_dc.mjs)
  const de = V.norm([-Math.cos(7 * Math.PI / 180), -Math.sin(7 * Math.PI / 180), 0]);
  const E1 = V.add(E0, V.mul(de, 13.4));
  const D = V.add(E0, V.mul(de, 12.3));                         // hook point of the 2nd cantilever (anatomical coordinates of 47)
  return { wEnd, slotC, S0, E0, E1, D, de, fx, fo, fz };
}

/**
 * Force system of the double cantilever for 47 in `pose` (unit force F1 of the first cantilever, F2 = k·F1).
 * Moments are sagittal (+z = crown distal = uprighting) about the CR of 47 and about the anchor's slot.
 */
export function forceSystemDC(L47, pose, hook1, G, k = 1) {
  const cr = V.add(L47.cr, pose.shift);
  const tube = apply(pose, L47.fa, L47.cr), D = apply(pose, G.D, L47.cr);
  const F1 = 1, F2 = k * F1;
  const L1 = hook1[0] - tube[0];
  const M1c = F1 * L1;                                            // couple of cantilever 1 at the tube (crown distal)
  const M1F = (tube[0] - cr[0]) * F1;                             // moment of its extrusive force about the CR
  const M2F = (D[0] - cr[0]) * -F2;                               // intrusive F2 at D (distal of the CR) → +z (uprighting)
  const L2 = G.slotC[0] - D[0];
  const Manchor2 = -F2 * L2;                                      // couple of cantilever 2 on the anchor (clockwise in the buccal view)
  return { cr, tube, D, F1, F2, L1, M1c, M1F, M2F, Mmolar: M1c + M1F + M2F, Mmolar1: M1c + M1F, Fv_molar: F1 - F2, Fv_anchor: -F1 + F2, Manchor2, L2, dCR: cr[0] - D[0] };
}
