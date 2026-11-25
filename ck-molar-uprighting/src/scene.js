// ============================================================================
//  Appliance geometry shared by the player and tools/qa.mjs (segment frame, mm).
//  Brackets on 43–44–45 (anchor segment, rigid rectangular stainless-steel segment wire),
//  auxiliary/molar tube on 47, cantilever hooked on the anchor wire between 44 and 43,
//  miniscrew in the buccal shelf (site found by tools/build_assets.py).
//  No wire sizes, activation magnitudes or force values are specified anywhere (qualitative film).
// ============================================================================
import { V } from './model.js';

export const SCENE = {
  bracketOff: 1.55,        // slot centre ↔ enamel surface along the bracket normal
  tubeOff: 1.75,
  anchorTeeth: ['43', '44', '45'],
  hookBetween: ['44', '43', 0.45],
  meshByName(hdr, n) { return hdr.meshes.find((m) => m.name === n); },
  slot(hdr, fdi) {
    const m = this.meshByName(hdr, 'L' + fdi);
    return V.add(m.fa, V.mul(m.faN, fdi === '47' ? this.tubeOff : this.bracketOff));
  },
  /** anchor segment wire control points: 2 mm distal of 45 → slots → 1.5 mm mesial of 43 */
  anchorWire(hdr) {
    const s45 = this.slot(hdr, '45'), s44 = this.slot(hdr, '44'), s43 = this.slot(hdr, '43');
    const d0 = V.norm(V.sub(s45, s44)), d1 = V.norm(V.sub(s43, s44));
    return [V.add(s45, V.mul(d0, 2.2)), s45, s44, s43, V.add(s43, V.mul(d1, 1.6))];
  },
  hook(hdr) {
    const [a, b, s] = this.hookBetween;
    return V.lerp(this.slot(hdr, a), this.slot(hdr, b), s);
  },
  screwHead(hdr) { return hdr.screw.head; },
};
