// ============================================================================
//  40-second timeline — every value is a pure function of time t (seconds),
//  so any frame renders identically in playback, scrubbing and export.
// ============================================================================
export const DURATION = 40;
export const FPS = 30;

export const SCENES = [
  { id: '01', name: 'Intro', t0: 0, t1: 5 },
  { id: '02', name: 'Sagittal', t0: 5, t1: 13 },
  { id: '03', name: 'Vertical', t0: 13, t1: 21 },
  { id: '04', name: '9 patterns', t0: 21, t1: 34.8 },
  { id: '04b', name: 'Next: Jarabak', t0: 34.8, t1: 37 },
  { id: '05', name: 'Outro', t0: 37, t1: 40 },
];

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const easeInOut = (x) => { const t = clamp01(x); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const lerp = (a, b, t) => a + (b - a) * t;
/** 0→1 between a and b, eased */
export const ramp = (t, a, b, ease = easeInOut) => ease((t - a) / (b - a));
/** fade in over [a, a+fi], hold, fade out over [b-fo, b] */
export const win = (t, a, b, fi = 0.5, fo = 0.5) => Math.min(smooth((t - a) / fi), 1 - smooth((t - (b - fo)) / fo));

/** piecewise keyframes [[t, value], ...] with eased segments */
export function keys(t, k, ease = easeInOut) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return lerp(k[i - 1][1], k[i][1], ease((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0])));
  return k[k.length - 1][1];
}

// ---------------------------------------------------------------- the 3 × 3 matrix
export const COLS = [{ label: 'CLASS I', s: 0 }, { label: 'CLASS II', s: 1 }, { label: 'CLASS III', s: -1 }];
export const ROWS = [{ label: 'HYPODIVERGENT', v: -1 }, { label: 'NORMODIVERGENT', v: 0 }, { label: 'HYPERDIVERGENT', v: 1 }];
export const GRID = {
  k: 1.56,                         // px per mm in the matrix
  colX: [192, 540, 888],           // cell centres (px)
  rowLabelY: [500, 896, 1292],
  rowY: [698, 1094, 1490],         // skull centres (px)
  headerY: 424,
};

// ---------------------------------------------------------------- single-skull morph schedule
const S_KEYS = [[6.3, 0], [7.6, 0], [8.8, 1], [10.0, 1], [11.5, -1], [12.6, -1], [13.5, 0]];
const V_KEYS = [[13.5, 0], [14.7, -1], [16.0, -1], [17.1, 0], [18.3, 0], [19.5, 1]];

export const T_GRID0 = 21.0, T_GRID1 = 24.6;
export const T_TEASE = 34.0;   // matrix dissolves → teaser for the next film (Jarabak analysis) → brand outro at 37 s

/** camera: k = px per mm, (cz, cy) = world point at the frame centre */
function camera(t) {
  if (t < T_GRID0) {
    const u = ramp(t, 5.0, 6.4);
    return { k: lerp(3.9, 4.3, u), cz: 0, cy: lerp(36, -4, u) };
  }
  const u = ramp(t, T_GRID0, T_GRID1 - 0.6);
  return { k: lerp(4.3, GRID.k, u), cz: 0, cy: lerp(-4, 0, u) };
}

export function cellWorld(c, r) {
  return [(GRID.colX[c] - 540) / GRID.k, -(GRID.rowY[r] - 960) / GRID.k];
}

/** full scene state at time t */
export function stateAt(t) {
  const cam = camera(t);
  const s1 = keys(t, S_KEYS), v1 = keys(t, V_KEYS);
  const skulls = [];
  if (t < T_GRID0) {
    skulls.push({ s: s1, v: v1, z: 0, y: 0, depth: 0, alpha: smooth((t - 0.2) / 2.2), cell: null });
  } else {
    // the single skull (Class I · hyperdivergent) becomes cell (0, 2); eight copies emerge from behind it.
    // Positions are interpolated in screen space so the spread reads as one clean motion while the camera pulls back.
    const u = ramp(t, T_GRID0 + 0.5, T_GRID1);
    const m = ramp(t, T_GRID0 + 0.3, T_GRID1 - 0.2);
    let n = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const isOrig = c === 0 && r === 2;
      const px = lerp(540, GRID.colX[c], u), py = lerp(960 - (0 - cam.cy) * cam.k, GRID.rowY[r], u);
      const z = (px - 540) / cam.k + cam.cz, y = -(py - 960) / cam.k + cam.cy;
      const s = lerp(0, COLS[c].s, m), v = lerp(1, ROWS[r].v, m);
      skulls.push({ s, v, z, y, depth: isOrig ? 0 : 40 + 6 * n++, alpha: 1 - smooth((t - T_TEASE) / 0.8), cell: [c, r] });
    }
  }
  return { t, cam, skulls };
}

// ---------------------------------------------------------------- texts (alpha windows)
export const TEXT = {
  title: (t) => win(t, 1.1, 5.4, 1.4, 0.6),
  subtitle: (t) => win(t, 2.0, 5.4, 1.2, 0.6),
  sagHeader: (t) => win(t, 5.6, 13.2, 0.7, 0.5),
  classI: (t) => Math.max(win(t, 6.0, 8.1, 0.6, 0.45), 0),
  classII: (t) => win(t, 8.25, 10.65, 0.5, 0.45),
  classIII: (t) => win(t, 10.75, 13.0, 0.5, 0.45),
  vertHeader: (t) => win(t, 13.2, 21.0, 0.7, 0.5),
  hypo: (t) => win(t, 13.9, 16.4, 0.5, 0.45),
  normo: (t) => win(t, 16.5, 18.75, 0.5, 0.45),
  hyper: (t) => win(t, 18.85, 21.0, 0.5, 0.45),
  gridTitle: (t) => win(t, 23.6, 34.8, 0.9, 0.7),
  colHead: (t) => win(t, 23.9, 34.8, 0.8, 0.7),
  rowHead: (t) => win(t, 24.3, 34.8, 0.8, 0.7),
  footnote: (t) => win(t, 25.0, 34.8, 1.0, 0.7),
  attribution: (t) => win(t, 25.6, 34.8, 1.0, 0.7),
};

/** cephalometric line visibility */
export const LINES = {
  sagittal: (t) => win(t, 6.6, 13.3, 0.8, 0.6),     // S–N, N–A, N–B + points
  vertical: (t) => win(t, 13.4, 21.1, 0.8, 0.5),    // S–N, Go–Me, lower face height
  grid: (t) => win(t, 26.2, 34.8, 1.4, 0.7),        // S–N & Go–Me in every cell
};
export const TEASER = {
  small: (t) => win(t, 34.9, 37.6, 0.7, 0.3),
  big: (t) => win(t, 35.2, 37.6, 0.8, 0.3),
};
export const OUTRO_T0 = DURATION - 3; // brand-kit outro: exactly the last 3 s, as in every CK BIOMECHANICS film
