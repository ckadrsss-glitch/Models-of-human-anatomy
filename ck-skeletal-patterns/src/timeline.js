// ============================================================================
//  40-second timeline — every value is a pure function of time t (seconds),
//  so any frame renders identically in playback, scrubbing and export.
// ============================================================================
export const DURATION = 78;
export const FPS = 30;

export const SCENES = [
  { id: '01', name: 'Intro', t0: 0, t1: 5 },
  { id: '02', name: 'Sagittal', t0: 5, t1: 13 },
  { id: '03', name: 'Vertical', t0: 13, t1: 21 },
  { id: '04', name: '9 patterns', t0: 21, t1: 37 },
  { id: '05', name: 'Jarabak', t0: 37, t1: 75 },
  { id: '06', name: 'Outro', t0: 75, t1: 78 },
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
export const T_COL0 = 37.0, T_COL1 = 39.6;      // matrix collapses back into one skull (Class I · normodivergent)
const J_CELL = [0, 1];
// Jarabak comparison: normo → hypo → hyper → normo
const VJ_KEYS = [[63.0, 0], [64.2, -1], [67.0, -1], [68.6, 1], [72.0, 1], [73.2, 0]];

/** camera: k = px per mm, (cz, cy) = world point at the frame centre */
function camera(t) {
  if (t >= T_COL0) {
    const u = ramp(t, T_COL0, T_COL1);
    return { k: lerp(GRID.k, 4.3, u), cz: 0, cy: lerp(0, -4, u) };
  }
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
  if (t >= T_COL1) {
    skulls.push({ s: 0, v: keys(t, VJ_KEYS), z: 0, y: 0, depth: 0, alpha: 1, cell: null });
  } else if (t >= T_COL0) {
    // reverse of the emergence: every cell slides behind the Class I · normodivergent skull, which returns to the centre
    const u = ramp(t, T_COL0, T_COL1 - 0.3), m = ramp(t, T_COL0, T_COL1 - 0.5);
    let n = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const front = c === J_CELL[0] && r === J_CELL[1];
      const px = lerp(GRID.colX[c], 540, u), py = lerp(GRID.rowY[r], 960 - (0 - cam.cy) * cam.k, u);
      const z = (px - 540) / cam.k + cam.cz, y = -(py - 960) / cam.k + cam.cy;
      skulls.push({ s: lerp(COLS[c].s, 0, m), v: lerp(ROWS[r].v, 0, m), z, y, depth: front ? 0 : 40 + 6 * n++, alpha: 1, cell: [c, r] });
    }
  } else if (t < T_GRID0) {
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
      skulls.push({ s, v, z, y, depth: isOrig ? 0 : 40 + 6 * n++, alpha: 1, cell: [c, r] });
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
  gridTitle: (t) => win(t, 23.6, 37.6, 0.9, 0.6),
  colHead: (t) => win(t, 23.9, 37.6, 0.8, 0.6),
  rowHead: (t) => win(t, 24.3, 37.6, 0.8, 0.6),
  footnote: (t) => win(t, 25.0, 37.6, 1.0, 0.6),
  attribution: (t) => win(t, 25.6, 37.6, 1.0, 0.6),
};

/** cephalometric line visibility */
export const LINES = {
  sagittal: (t) => win(t, 6.6, 13.3, 0.8, 0.6),     // S–N, N–A, N–B + points
  vertical: (t) => win(t, 13.4, 21.1, 0.8, 0.5),    // S–N, Go–Me, lower face height
  grid: (t) => win(t, 26.2, 37.4, 1.4, 0.5),        // S–N & Go–Me in every cell
};
// Jarabak analysis (no numeric values) — [title, description, t0, t1]
export const JARABAK_STEPS = [
  ['BJÖRK POLYGON', 'N – S – Ar – Go – Me', 39.8, 44.6],
  ['SADDLE ANGLE', 'N – S – Ar · anterior and posterior cranial base', 44.6, 48.0],
  ['ARTICULAR ANGLE', 'S – Ar – Go · cranial base and ramus', 48.0, 51.4],
  ['GONIAL ANGLE', 'Ar – Go – Me · upper and lower parts divided by N – Go', 51.4, 55.0],
  ['SUM OF ANGLES', 'Larger sum → clockwise · smaller sum → counter-clockwise', 55.0, 58.6],
  ['FACE HEIGHTS', 'Posterior (S – Go) relative to anterior (N – Me)', 58.6, 63.2],
  ['HYPODIVERGENT', 'Smaller sum · relatively taller posterior face → counter-clockwise', 63.4, 67.2],
  ['HYPERDIVERGENT', 'Larger sum · relatively shorter posterior face → clockwise', 68.2, 72.3],
  ['NORMODIVERGENT', 'Balanced angles and face-height proportion', 72.6, 75.2],
];
export const JAR = {
  header: (t) => win(t, 39.4, 75.2, 0.7, 0.4),
  polygon: (t) => win(t, 40.0, 75.2, 0.6, 0.4),            // drawn progressively 40.0–43.6
  saddle: (t) => Math.max(win(t, 44.8, 48.2, 0.5, 0.4), win(t, 55.0, 75.2, 0.5, 0.4)),
  articular: (t) => Math.max(win(t, 48.2, 51.6, 0.5, 0.4), win(t, 55.0, 75.2, 0.5, 0.4)),
  gonial: (t) => Math.max(win(t, 51.6, 55.2, 0.5, 0.4), win(t, 55.0, 75.2, 0.5, 0.4)),
  split: (t) => win(t, 52.2, 55.2, 0.5, 0.4),
  heights: (t) => win(t, 58.8, 75.2, 0.6, 0.4),
};
export const OUTRO_T0 = DURATION - 3; // brand-kit outro: exactly the last 3 s, as in every CK BIOMECHANICS film
