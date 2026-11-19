import { smooth, smoother, track, win, lerp, clamp, easeInOut } from './util.js';

// ============================================================================
//  CK BIOMECHANICS · «Как дыхание и положение языка связаны с формированием прикуса?»
//  Master timeline. Every value is a pure function of t (seconds).
// ============================================================================

export const FPS = 30;
export const WIDTH = 1080, HEIGHT = 1920;
// The original 69-s animation is kept intact as the "base clock" (evaluateBase).
// v2 re-times its scenes to the new narration and inserts the palatine-tonsil
// scene between the tongue and dental-arch scenes (see LAYOUT below).
export const BASE_DURATION = 69;

// ElevenLabs voice-over — voice "Evgeniy Rybakov" (ws3YyKFd5whKb21yaXES),
// eleven_multilingual_v2. dur = clip length (s); start is computed by the layout.
export const VOICE = [
  { file: 'assets/voice/vo1.mp3', dur: 10.11, text: 'Прикус формируется с раннего детства. Сначала прорезываются молочные зубы, затем их сменяют постоянные. Но развитие зубочелюстной системы зависит не только от зубов.' },
  { file: 'assets/voice/vo2.mp3', dur: 9.33, text: 'Важную роль играют носовое дыхание, положение языка и работа окружающих мышц. В покое язык обычно располагается вблизи нёба, а губы сомкнуты.' },
  { file: 'assets/voice/vo3.mp3', dur: 8.78, text: 'При увеличении аденоидов просвет носоглотки может сужаться. Ребёнку становится сложнее дышать носом, и он может переходить на ротовое дыхание.' },
  { file: 'assets/voice/vo4.mp3', dur: 8.96, text: 'При привычном ротовом дыхании положение языка и нижней челюсти иногда изменяется. Это может влиять на функциональное равновесие зубочелюстной системы в период роста.' },
  { file: 'assets/voice/vo5.mp3', dur: 13.27, text: 'Но аденоиды — не единственная причина. Увеличенные нёбные миндалины тоже могут сужать ротоглотку. Иногда ребёнок адаптирует положение языка и выдвигает челюсть вперёд. Это не означает обязательного мезиального прикуса.' },
  { file: 'assets/voice/vo6.mp3', dur: 9.61, text: 'У части детей нарушения дыхания сопровождаются сужением верхней зубной дуги, высоким нёбом и изменениями окклюзии. Однако эти признаки возникают не у каждого ребёнка.' },
  { file: 'assets/voice/vo7.mp3', dur: 9.04, text: 'Исследования также связывают нарушения носового дыхания с более вертикальным ростом лица. При этом направление роста определяется множеством факторов.' },
  { file: 'assets/voice/vo8.mp3', dur: 10.68, text: 'Поэтому важно оценивать не только зубы, но и дыхание, язык, мягкие ткани и рост челюстей. Своевременная диагностика помогает выбрать правильное лечение.' },
];

// ---------------------------------------------------------------- layout
// Each segment lasts lead + narration + gap, so speech is continuous (gaps ≈ 0.32 s).
// Base segments are linearly re-timed; the tonsil scene has its own clock.
const GAP = 0.32;
export const OUTRO_DURATION = 3.8;
export const LAYOUT = [
  { name: 'Как формируется прикус', base: [0, 15], vo: 0, lead: 0.35 },
  { name: 'Дыхание и положение языка', base: [15, 24], vo: 1 },
  { name: 'Аденоиды и ротовое дыхание', base: [24, 37], vo: 2 },
  { name: 'Что происходит с языком', base: [37, 49], vo: 3 },
  { name: 'Нёбные миндалины', tonsil: true, vo: 4 },
  { name: 'Изменения зубных дуг', base: [50.0, 56.8], vo: 5 },
  { name: 'Вертикальная тенденция роста', base: [56.8, 62], vo: 6 },
  { name: 'Заключение', base: [62, 66], vo: 7, overlapOutro: 1.3 },
  { name: 'Логотип', base: [66, 69], outro: true },
];
{
  let t = 0;
  for (const seg of LAYOUT) {
    seg.t0 = t;
    let dur;
    if (seg.outro) dur = OUTRO_DURATION;
    else {
      const lead = seg.lead ?? 0;
      VOICE[seg.vo].start = +(t + lead).toFixed(3);
      dur = lead + VOICE[seg.vo].dur + (seg.overlapOutro ? -seg.overlapOutro : GAP);
    }
    t += dur; seg.t1 = t;
  }
}
export const DURATION = Math.ceil(LAYOUT[LAYOUT.length - 1].t1 * FPS) / FPS;
export const OUTRO_T0 = LAYOUT[LAYOUT.length - 1].t0;
export const SCENES = LAYOUT.filter((g) => !g.outro).map((g, i) => ({ id: i + 1, t0: g.t0, t1: g.t1, name: g.name }));

// base clock → new clock (used to place sound cues authored on the base clock)
export function newFromBase(b) {
  for (const g of LAYOUT) {
    if (!g.base) continue;
    if (b >= g.base[0] && b <= g.base[1]) return g.t0 + (b - g.base[0]) / (g.base[1] - g.base[0]) * (g.t1 - g.t0);
  }
  return null;
}
export const tonsilSeg = () => LAYOUT.find((g) => g.tonsil);

// ---------------------------------------------------------------- dentition
// Approximate eruption windows (years) — used only to order the animation; the
// film deliberately does not display tooth-by-tooth ages.
export const PRIMARY = {
  A: { L: [0.55, 0.85], U: [0.8, 1.1], succ: 'I1' },
  B: { L: [1.0, 1.3], U: [0.9, 1.2], succ: 'I2' },
  D: { L: [1.2, 1.6], U: [1.25, 1.65], succ: 'P1' },
  C: { L: [1.55, 1.95], U: [1.6, 2.0], succ: 'C' },
  E: { L: [2.0, 2.5], U: [2.3, 2.8], succ: 'P2' },
};
export const PERMANENT = {
  M1: { L: [5.8, 6.5], U: [6.0, 6.7], form: [-0.5, 2.6], depth: 0.008 },
  I1: { L: [6.0, 6.9], U: [6.8, 7.7], form: [0.0, 4.0], depth: 0.013, lingual: 0.0032 },
  I2: { L: [7.0, 7.8], U: [7.9, 8.7], form: [0.4, 4.6], depth: 0.013, lingual: 0.0032 },
  C: { L: [9.3, 10.3], U: [11, 12], form: [0.4, 6.0], depth: 0.017, lingual: 0.0022 },
  P1: { L: [10, 11], U: [10, 11], form: [1.6, 6.0], depth: 0.0135 },
  P2: { L: [10.8, 11.8], U: [10.8, 11.8], form: [2.2, 6.8], depth: 0.0135 },
  M2: { L: [11.5, 12.5], U: [12, 13], form: [2.6, 7.6], depth: 0.009 },
};

// Scene-1 clock: seconds → child age in years (accelerated, non-linear)
export function ageAt(t) {
  return track([[0, 0], [1.4, 0.15], [6.2, 3.0], [7.6, 5.4], [13.0, 8.9], [15, 8.9]], t, (k) => k);
}

// ---------------------------------------------------------------- camera
// [t, position, target, fov, up]
const CAM = [
  [0.0, [-0.215, 0.020, 0.150], [0, -0.008, 0.016], 26],
  [3.6, [-0.175, 0.004, 0.175], [0, -0.009, 0.018], 25],
  [6.2, [-0.035, -0.004, 0.252], [0, -0.010, 0.020], 25],
  [7.8, [-0.030, -0.006, 0.248], [0, -0.010, 0.020], 25],
  [9.6, [-0.235, -0.002, 0.050], [0, -0.011, 0.014], 25],
  [10.9, [-0.200, 0.080, 0.060], [0, -0.016, 0.016], 25],
  [11.9, [-0.010, 0.215, 0.060], [0, -0.022, 0.014], 26, [0, 0, 1]],
  [13.3, [0.000, 0.215, 0.064], [0, -0.022, 0.014], 26, [0, 0, 1]],
  [14.6, [-0.300, 0.040, 0.090], [0, -0.010, 0.010], 27],
  [17.0, [-0.640, 0.020, 0.060], [0, 0.000, 0.004], 28],
  [23.6, [-0.470, 0.004, 0.020], [0, -0.002, 0.000], 28],
  [26.0, [-0.180, 0.034, 0.000], [0, 0.020, -0.022], 26],
  [31.0, [-0.165, 0.030, -0.002], [0, 0.018, -0.022], 26],
  [33.2, [-0.300, -0.002, 0.020], [0, -0.006, 0.002], 27],
  [36.6, [-0.290, -0.004, 0.022], [0, -0.008, 0.004], 27],
  [38.4, [-0.215, -0.006, 0.026], [0, -0.008, 0.006], 26],
  [43.6, [-0.205, -0.008, 0.030], [0, -0.009, 0.006], 26],
  [45.0, [-0.050, -0.008, 0.360], [0, -0.012, 0.004], 25],
  [48.8, [-0.040, -0.008, 0.355], [0, -0.012, 0.004], 25],
  [50.0, [0.000, -0.235, 0.060], [0, 0.000, 0.014], 25, [0, 0, 1]],
  [54.0, [0.000, -0.232, 0.062], [0, 0.000, 0.014], 25, [0, 0, 1]],
  [54.9, [-0.030, -0.010, 0.300], [0, -0.010, 0.006], 24],
  [56.3, [-0.025, -0.010, 0.296], [0, -0.010, 0.006], 24],
  [57.4, [-0.430, 0.006, 0.050], [0, -0.008, 0.010], 28],
  [61.8, [-0.410, 0.006, 0.050], [0, -0.010, 0.010], 28],
  [64.5, [-0.540, 0.012, 0.030], [0, 0.000, 0.000], 28],
  [69.0, [-0.900, 0.040, 0.030], [0, 0.030, 0.000], 28],
];

function camAt(t) {
  let i = 0;
  while (i < CAM.length - 2 && t > CAM[i + 1][0]) i++;
  const a = CAM[i], b = CAM[i + 1];
  const k = easeInOut(clamp((t - a[0]) / (b[0] - a[0])));
  const L = (u, v) => u.map((x, j) => lerp(x, v[j], k));
  const pos = L(a[1], b[1]), target = L(a[2], b[2]);
  // framing: pull close-ups back so the subject sits inside the 9:16 safe area
  const d = Math.hypot(pos[0] - target[0], pos[1] - target[1], pos[2] - target[2]);
  const m = lerp(1.5, 1.08, smooth(0.25, 0.5, d));
  return { pos: pos.map((x, j) => target[j] + (x - target[j]) * m), target, fov: lerp(a[3], b[3], k), up: L(a[4] || [0, 1, 0], b[4] || [0, 1, 0]) };
}

// ---------------------------------------------------------------- texts
// { text, t0, t1, y (px of 1920), size, weight, color }
export const TITLES = [
  { text: 'КАК ФОРМИРУЕТСЯ ПРИКУС?', t0: 0.5, t1: 6.6, y: 300, size: 74 },
  { text: 'ДЫХАНИЕ И ПОЛОЖЕНИЕ ЯЗЫКА', t0: 16.0, t1: 23.6, y: 300, size: 68 },
  { text: 'ГИПЕРТРОФИЯ АДЕНОИДОВ', t0: 25.4, t1: 31.4, y: 300, size: 70 },
  { text: 'РОТОВОЕ ДЫХАНИЕ', t0: 32.0, t1: 36.8, y: 300, size: 74 },
  { text: 'ИЗМЕНЕНИЕ ПОЛОЖЕНИЯ ЯЗЫКА', t0: 37.6, t1: 48.6, y: 300, size: 68 },
  { text: 'ИЗМЕНЕНИЯ ЗУБНЫХ ДУГ', t0: 50.1, t1: 56.2, y: 300, size: 72 },
  { text: 'ВЕРТИКАЛЬНАЯ ТЕНДЕНЦИЯ РОСТА', t0: 56.8, t1: 61.8, y: 300, size: 64 },
];

// chips: small state labels
export const CHIPS = [
  { text: 'НОСОВОЕ ДЫХАНИЕ', tag: 'А', t0: 38.4, t1: 41.0, y: 1500 },
  { text: 'РОТОВОЕ ДЫХАНИЕ', tag: 'Б', t0: 41.4, t1: 44.4, y: 1500, warm: true },
  { text: 'РАВНОВЕСИЕ', tag: 'А', t0: 45.2, t1: 46.9, y: 1500 },
  { text: 'ЯЗЫК НИЖЕ', tag: 'Б', t0: 47.2, t1: 48.8, y: 1500, warm: true },
  { text: 'ШИРОКАЯ ДУГА', tag: 'А', t0: 50.2, t1: 52.0, y: 1500 },
  { text: 'УЗКАЯ ДУГА · ВЫСОКОЕ НЁБО', tag: 'Б', t0: 52.4, t1: 54.4, y: 1500, warm: true },
  { text: 'ВОЗМОЖНЫЙ ПЕРЕКРЁСТНЫЙ ПРИКУС', tag: 'Б', t0: 54.9, t1: 56.4, y: 1500, warm: true },
];

// ---------------------------------------------------------------- state
export function evaluateBase(t) {
  const s = {};
  s.t = t;
  s.cam = camAt(t);
  s.age = ageAt(t);

  // --- visibility ---------------------------------------------------------
  // scene 1: jaws only; skin + soft tissues appear in scene 2
  s.bone = 0.55;
  s.skin = 0.42 * smooth(14.0, 17.0, t) * (1 - 0.55 * win(t, 24.5, 26.5, 31.2, 33.2)) * (1 - 0.8 * win(t, 44.6, 45.4, 48.6, 49.4)) * (1 - win(t, 49.2, 49.8, 54.4, 55.0)) * (1 - 0.7 * win(t, 54.4, 55.0, 56.6, 57.4));
  s.soft = smooth(14.5, 17.0, t);            // tongue, soft palate, mucosa, adenoid
  s.mucosa = (0.35 + 0.35 * win(t, 25, 26.5, 31, 32.5)) * smooth(16, 18.5, t) * (1 - smooth(48.6, 49.4, t) * (1 - smooth(61.6, 63, t)));
  s.lowerJaw = 1 - win(t, 49.2, 49.8, 54.3, 54.9); // mandible (hidden for the upper occlusal view)
  s.upperJaw = 1 - win(t, 10.95, 11.5, 13.2, 13.8);   // hide maxilla + upper teeth for the lower occlusal view
  s.neuro = (1 - win(t, 10.9, 11.4, 13.3, 13.9)) * (1 - win(t, 49.2, 49.8, 54.3, 54.9));
  s.gingiva = 0.55;
  s.tongueVis = smooth(15, 17.2, t) * (1 - win(t, 49.2, 49.8, 56.4, 57.2));
  s.coronal = win(t, 44.4, 45.2, 48.8, 49.3) + win(t, 54.3, 54.8, 56.4, 56.9);
  s.adenoidVis = 1 - win(t, 48.8, 49.6, 61.4, 62.4) * 0.85;

  // section plane: sagittal reveal in scenes 2–4; coronal in the equilibrium & crossbite shots
  s.sectionMode = 'sagittal';
  s.section = 1;
  const sag = smoother(18.0, 21.0, t) * (1 - smoother(43.8, 44.6, t)) + smoother(61.6, 63.6, t) * 0;
  if (t < 44.4) s.section = lerp(1, 0.0, sag);
  if (t >= 44.4 && t < 49.2) { s.sectionMode = 'coronal'; s.section = lerp(1, 0.008, smoother(44.6, 45.6, t)); }
  if (t >= 54.4 && t < 56.8) { s.sectionMode = 'coronal'; s.section = lerp(1, 0.008, smoother(54.5, 55.2, t)) + smoother(56.2, 56.8, t); }
  s.tongueClip = s.sectionMode === 'coronal';

  // --- function -------------------------------------------------------------
  // jaw angle (rad, + opens), tongue posture (+1 at palate, −1 low)
  const open = 0.115;
  s.jaw = track([[0, 0], [32.0, 0], [34.0, open], [37.2, open], [38.4, 0], [40.8, 0], [42.2, open], [44.4, open], [45.4, 0], [47.0, 0], [47.9, open * 0.8], [49.0, open * 0.8], [49.6, 0], [57.2, 0], [60.0, 0.072], [62.4, 0.072], [64.0, 0]], t);
  s.tongueUp = track([[0, 1], [32.2, 1], [34.0, -0.85], [37.2, -0.85], [38.4, 1], [40.8, 1], [42.2, -1], [44.4, -1], [45.4, 1], [47.0, 1], [47.9, -1], [49.0, -1], [49.6, 1]], t);
  s.adenoid = track([[0, 0], [26.6, 0], [30.6, 1], [37.2, 1], [38.4, 0.0], [40.8, 0.0], [42.0, 1], [44.4, 1], [45.0, 0.6], [62.0, 0.6], [63.0, 0.35]], t);
  s.nasalFlow = track([[0, 1], [27.5, 1], [31.0, 0.4], [37.2, 0.4], [38.4, 1], [40.8, 1], [42.2, 0.35], [44.4, 0.35], [45.0, 1]], t);
  s.oralFlow = track([[0, 0], [32.4, 0], [34.0, 1], [37.2, 1], [38.4, 0], [40.8, 0], [42.2, 1], [44.4, 1], [45.0, 0]], t);
  s.flowOpacity = win(t, 16.4, 18.0, 44.4, 45.0) + win(t, 62.2, 63.4, 68.0, 69.0) * 0.8;
  s.lumen = 0.85 * win(t, 17.6, 19.6, 44.2, 44.8) + 0.7 * win(t, 62.2, 63.2, 68.0, 69.0);

  // --- muscle equilibrium (scene 4, coronal section) ---------------------------
  s.arrows = win(t, 45.4, 46.0, 48.6, 49.1);
  s.balance = smooth(46.9, 47.9, t); // 0 balanced (A) → 1 tongue low (B)

  // --- arch form + vertical pattern (scene 5) -------------------------------
  s.narrow = track([[0, 0], [52.0, 0], [54.0, 1], [61.8, 1], [63.0, 0]], t);
  s.vault = win(t, 54.9, 55.5, 56.2, 56.7);
  s.ceph = win(t, 57.2, 58.0, 61.6, 62.2);
  s.cephRot = smooth(57.2, 60.0, t);

  // --- highlights (scene 6) ----------------------------------------------------
  s.glowNaso = win(t, 62.4, 63.2, 68.4, 69.0);
  s.glowTongue = win(t, 63.4, 64.2, 68.4, 69.0);
  s.glowJaws = win(t, 64.4, 65.2, 68.4, 69.0);
  s.toothGlow = 0;

  // --- overlay ----------------------------------------------------------------
  s.ageUI = win(t, 1.0, 1.8, 13.6, 14.4);
  s.spacing = win(t, 6.4, 7.0, 8.0, 8.6);     // highlight physiological spacing
  s.final = win(t, 63.2, 64.0, 65.5, 66.0);   // «ПРИКУС — ЭТО НЕ ТОЛЬКО ЗУБЫ»
  s.credit = win(t, 63.6, 64.3, 65.5, 66.0);
  s.disclaimer = win(t, 58.0, 58.8, 61.6, 62.2);
  return s;
}

// ============================================================================
//  v2: palatine-tonsil scene (inserted between the tongue and arch scenes)
//  u = seconds into the scene, D = scene length. Starts from the base state at
//  49.0 s (end of the tongue scene) and ends exactly on the base state at
//  49.5 s, where the dental-arch scene resumes.
// ============================================================================
const NUMERIC_SKIP = new Set(['t', 'age']);
function mixState(a, b, k) {
  if (k <= 0) return a;
  if (k >= 1) return { ...b };
  const o = { ...a };
  for (const key of Object.keys(b)) {
    const va = a[key], vb = b[key];
    if (typeof va === 'number' && typeof vb === 'number' && !NUMERIC_SKIP.has(key)) o[key] = lerp(va, vb, k);
  }
  o.cam = {
    pos: a.cam.pos.map((x, j) => lerp(x, b.cam.pos[j], k)),
    target: a.cam.target.map((x, j) => lerp(x, b.cam.target[j], k)),
    up: a.cam.up.map((x, j) => lerp(x, b.cam.up[j], k)),
    fov: lerp(a.cam.fov, b.cam.fov, k),
  };
  return o;
}

const TCAM = [
  // [u, pos, target, fov]
  [1.8, [0.0, -0.004, 0.300], [0, -0.006, -0.030], 24],
  [5.2, [0.0, -0.005, 0.275], [0, -0.007, -0.030], 24],
  [6.8, [-0.300, -0.004, 0.030], [0, -0.012, 0.010], 26],
  [12.6, [-0.285, -0.004, 0.034], [0, -0.013, 0.012], 26],
];

function tonsilState(u, D) {
  const A = evaluateBase(49.0), B = evaluateBase(50.0);
  const T = { ...A };
  T.t = 49.05;                       // base title clock: nothing from the base scenes shows here
  T.arrows = 0; T.balance = 0;
  T.coronal = win(u, -1, 0.1, 5.4, 6.2);
  T.skin = lerp(A.skin, 0.3, smooth(5.6, 7.0, u));
  T.mucosa = 0.55; T.soft = 1; T.tongueVis = 1;
  T.lowerJaw = 1; T.upperJaw = 1; T.neuro = 1;
  T.adenoid = 0.35; T.adenoidVis = 0.6;
  T.jaw = track([[0, A.jaw], [1.3, 0], [8.0, 0], [9.8, 0.035], [11.8, 0.035], [12.9, 0]], u);
  T.protr = track([[0, 0], [8.0, 0], [10.0, 0.0035], [11.8, 0.0035], [12.9, 0]], u);
  T.tongueUp = track([[0, A.tongueUp], [1.3, 1], [3.4, 1], [5.6, 0.3], [8.0, 0.3], [9.8, -0.45], [11.8, -0.45], [12.9, 1]], u);
  T.tonsil = track([[0, 0], [2.2, 0], [5.4, 1]], u);
  T.tonsilVis = smooth(0.3, 1.2, u);
  T.nasalFlow = track([[0, 1], [3.0, 1], [5.6, 0.55]], u);
  T.oralFlow = track([[0, 0], [8.0, 0], [9.8, 0.65], [11.8, 0.65], [12.9, 0]], u);
  T.flowOpacity = smooth(0.8, 1.8, u);
  T.lumen = 0.75 * smooth(0.8, 1.8, u);
  T.protrArrow = win(u, 8.4, 9.0, 11.8, 12.4);
  // camera
  let cam;
  if (u <= TCAM[0][0]) {
    const k = easeInOut(clamp(u / TCAM[0][0]));
    cam = { pos: A.cam.pos.map((x, j) => lerp(x, TCAM[0][1][j], k)), target: A.cam.target.map((x, j) => lerp(x, TCAM[0][2][j], k)), fov: lerp(A.cam.fov, TCAM[0][3], k), up: [0, 1, 0] };
  } else {
    let i = 0; while (i < TCAM.length - 2 && u > TCAM[i + 1][0]) i++;
    const a = TCAM[i], b = TCAM[i + 1], k = easeInOut(clamp((u - a[0]) / (b[0] - a[0])));
    cam = { pos: a[1].map((x, j) => lerp(x, b[1][j], k)), target: a[2].map((x, j) => lerp(x, b[2][j], k)), fov: lerp(a[3], b[3], k), up: [0, 1, 0] };
  }
  T.cam = cam;
  // overlays (titles + chips use the scene clock u)
  T.extra = [
    { kind: 'title', text: 'НЁБНЫЕ МИНДАЛИНЫ', t0: 0.3, t1: 6.0, size: 72 },
    { kind: 'title', text: 'ВОЗМОЖНОЕ ВЫДВИЖЕНИЕ НИЖНЕЙ ЧЕЛЮСТИ', t0: 7.3, t1: 12.6, size: 62 },
    { kind: 'chip', text: 'НОРМАЛЬНЫЙ РАЗМЕР', tag: 'А', t0: 1.0, t1: 2.6 },
    { kind: 'chip', text: 'ГИПЕРТРОФИЯ · УЖЕ РОТОГЛОТКА', tag: 'Б', t0: 3.4, t1: 6.0, warm: true },
    { kind: 'chip', text: 'ФУНКЦИОНАЛЬНАЯ АДАПТАЦИЯ', tag: 'Б', t0: 8.6, t1: 12.5, warm: true },
  ].map((e) => ({ ...e, u }));

  // blend in from the end of the tongue scene, blend out into the arch scene
  const kIn = smooth(0, 1.4, u), kOut = smooth(D - 1.5, D, u);
  let s = mixState(mixState(A, T, kIn), B, kOut);
  s.extra = T.extra; s.t = 49.05; s.age = A.age;
  // pull the camera back mid-flight so the transitions stay clear of the anatomy
  const boost = 1 + 0.55 * Math.sin(Math.PI * kOut) + 0.25 * Math.sin(Math.PI * kIn);
  s.cam = { ...s.cam, pos: s.cam.pos.map((x, j) => s.cam.target[j] + (x - s.cam.target[j]) * boost) };
  s.protr = T.protr * (1 - kOut); s.tonsil = T.tonsil; s.tonsilVis = T.tonsilVis * (1 - kOut) * kIn;
  s.protrArrow = T.protrArrow;
  // section planes: coronal cut through the tonsils → camera orbits to lateral while
  // the sagittal cut closes in → the coronal cut sweeps forward and releases.
  s.cor = lerp(0.008, -0.0285, smoother(0.2, 1.9, u)) + (0.2 + 0.0285) * smoother(6.5, 7.6, u);
  s.sag = lerp(lerp(1, 0.0, smoother(5.3, 6.4, u)), 1, kOut);
  s.cor = lerp(s.cor, 1, smooth(7.6, 7.8, u));
  s.tongueClip = s.sectionMode === 'coronal';
  return s;
}

// ============================================================================
//  v2 master evaluate: new clock → base clock / tonsil scene, plus global layers
// ============================================================================
export function evaluate(t) {
  let seg = LAYOUT[LAYOUT.length - 1];
  for (const g of LAYOUT) if (t < g.t1) { seg = g; break; }
  let s;
  if (seg.tonsil) s = tonsilState(t - seg.t0, seg.t1 - seg.t0);
  else {
    const k = clamp((t - seg.t0) / (seg.t1 - seg.t0));
    s = evaluateBase(seg.base[0] + k * (seg.base[1] - seg.base[0]));
    s.protr = 0; s.tonsil = 0; s.tonsilVis = 0; s.protrArrow = 0;
  }
  s.clock = t;                               // continuous clock (particles, breathing)
  s.outro = Math.max(0, t - OUTRO_T0);       // universal CK BIOMECHANICS outro
  s.brandBar = 1;                            // persistent top wordmark (fades in the outro)
  s.extra = s.extra || [];
  return s;
}

// ============================================================================
//  Sound design cues. `b` = base-clock time, `u` = seconds into the tonsil
//  scene, `o` = seconds into the outro. Placed on actual visual events.
// ============================================================================
export const SFX = [
  // eruption accents (primary teeth, then first permanent molars / incisors)
  ...[2.33, 2.75, 3.0, 3.59, 4.18, 5.27, 8.83, 9.3, 10.53, 12.23].map((b) => ({ file: 'assets/sfx/tick.mp3', b, gain: 0.22 })),
  // camera moves
  ...[6.0, 9.4, 10.9, 14.2, 25.2, 32.2, 44.4, 54.4, 56.9, 64.5].map((b) => ({ file: 'assets/sfx/whoosh.mp3', b: b - 0.25, gain: 0.2 })),
  { file: 'assets/sfx/whoosh.mp3', u: 0.05, gain: 0.2 },
  { file: 'assets/sfx/whoosh.mp3', u: 5.2, gain: 0.2 },
  { file: 'assets/sfx/whoosh.mp3', uEnd: -1.5, gain: 0.2 },
  // tongue / jaw motion accents
  ...[32.2, 37.4, 40.9, 46.9, 57.3].map((b) => ({ file: 'assets/sfx/move.mp3', b, gain: 0.28 })),
  { file: 'assets/sfx/move.mp3', u: 2.3, gain: 0.24 },
  { file: 'assets/sfx/move.mp3', u: 8.0, gain: 0.28 },
  // logo accent when the circle appears
  { file: 'assets/sfx/logo.mp3', o: 0.5, gain: 0.42 },
];
// quiet looped airflow while breathing is shown
export const SFX_BEDS = [
  { file: 'assets/sfx/breath.mp3', b0: 16.6, b1: 44.6, gain: 0.09 },
  { file: 'assets/sfx/breath.mp3', u0: 0.6, u1: -1.2, gain: 0.08 },
  { file: 'assets/sfx/breath.mp3', b0: 62.4, b1: 66.0, gain: 0.07 },
];
export const MUSIC = { file: 'assets/music/ambient_bed.mp3', gain: 0.32 };
