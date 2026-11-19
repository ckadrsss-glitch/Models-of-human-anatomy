import { TITLES, CHIPS, WIDTH, HEIGHT } from './timeline.js';
import { smooth, clamp, easeOut } from './util.js';

const TEAL = '#2de2d0';
const WARM = '#ff9a8a';
const F = 'Montserrat, system-ui, sans-serif';

function yearsRu(n) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return 'год';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'года';
  return 'лет';
}

function spaced(ctx, text, x, y, spacing, align = 'center') {
  // canvas letterSpacing (Chrome ≥ 99) with a fallback
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = spacing + 'px';
    ctx.textAlign = align;
    ctx.fillText(text, x + (align === 'center' ? spacing / 2 : 0), y);
    ctx.letterSpacing = '0px';
    return;
  }
  ctx.textAlign = align; ctx.fillText(text, x, y);
}

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function drawLogo(ctx, cx, cy, scale, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  // emblem: open ring + "CK" monogram + biomechanical arc
  const r = 64;
  ctx.lineWidth = 5;
  ctx.strokeStyle = TEAL;
  ctx.shadowColor = 'rgba(45,226,208,0.55)';
  ctx.shadowBlur = 24;
  ctx.beginPath(); ctx.arc(0, -96, r, Math.PI * 0.62, Math.PI * 2.38); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 58px ${F}`;
  ctx.textBaseline = 'middle';
  spaced(ctx, 'CK', 0, -94, 2);
  ctx.beginPath(); ctx.fillStyle = TEAL; ctx.arc(0, -96 + r, 6, 0, Math.PI * 2); ctx.fill();
  // wordmark — one word, never split
  ctx.font = `700 54px ${F}`;
  ctx.textBaseline = 'alphabetic';
  const ck = 'CK', bio = 'BIOMECHANICS', gap = 22;
  ctx.letterSpacing = '6px';
  const w1 = ctx.measureText(ck).width;
  ctx.font = `500 54px ${F}`;
  const w2 = ctx.measureText(bio).width;
  const total = w1 + gap + w2, x0 = -total / 2;
  ctx.textAlign = 'left';
  ctx.font = `800 54px ${F}`; ctx.fillStyle = TEAL; ctx.fillText(ck, x0, 40);
  ctx.font = `500 54px ${F}`; ctx.fillStyle = '#ffffff'; ctx.fillText(bio, x0 + w1 + gap, 40);
  ctx.letterSpacing = '0px';
  ctx.restore();
}

export class Overlay {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
  }

  draw(s, project) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.textBaseline = 'alphabetic';
    const t = s.t;

    // cinematic vignette
    const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.48, HEIGHT * 0.25, WIDTH / 2, HEIGHT * 0.5, HEIGHT * 0.75);
    g.addColorStop(0, 'rgba(2,8,24,0)'); g.addColorStop(1, 'rgba(2,8,24,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // brand bug
    if (s.brand > 0) {
      ctx.save(); ctx.globalAlpha = 0.85 * s.brand;
      ctx.font = `800 26px ${F}`; ctx.fillStyle = TEAL; ctx.textAlign = 'left';
      ctx.letterSpacing = '4px'; ctx.fillText('CK', 72, 140);
      const w = ctx.measureText('CK').width;
      ctx.font = `500 26px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText('BIOMECHANICS', 72 + w + 12, 140);
      ctx.letterSpacing = '0px';
      ctx.restore();
    }

    // titles
    for (const T of TITLES) {
      const a = smooth(T.t0, T.t0 + 0.6, t) * (1 - smooth(T.t1 - 0.5, T.t1, t));
      if (a <= 0) continue;
      const rise = (1 - easeOut((t - T.t0) / 0.8)) * 26;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `800 ${T.size}px ${F}`;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,10,30,0.8)'; ctx.shadowBlur = 18;
      const lines = wrap(ctx, T.text, 900);
      lines.forEach((ln, i) => spaced(ctx, ln, WIDTH / 2, T.y + rise + i * T.size * 1.12, 3));
      ctx.shadowBlur = 0;
      // accent bar grows under the title
      const bw = 140 * easeOut((t - T.t0 - 0.2) / 0.9);
      ctx.fillStyle = TEAL;
      ctx.fillRect(WIDTH / 2 - bw / 2, T.y + rise + (lines.length - 1) * T.size * 1.12 + 34, bw, 5);
      ctx.restore();
    }

    // state chips
    for (const C of CHIPS) {
      const a = smooth(C.t0, C.t0 + 0.4, t) * (1 - smooth(C.t1 - 0.35, C.t1, t));
      if (a <= 0) continue;
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = `600 34px ${F}`; ctx.letterSpacing = '2px';
      const tw = ctx.measureText(C.text).width;
      const col = C.warm ? WARM : TEAL;
      const w = tw + 130, h = 76, x = WIDTH / 2 - w / 2, y = C.y;
      ctx.fillStyle = 'rgba(6,20,48,0.72)';
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      roundRect(ctx, x, y, w, h, 38); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + 40, y + h / 2, 24, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#061430'; ctx.font = `800 30px ${F}`; ctx.textAlign = 'center'; ctx.letterSpacing = '0px';
      ctx.fillText(C.tag, x + 40, y + h / 2 + 11);
      ctx.fillStyle = '#ffffff'; ctx.font = `600 34px ${F}`; ctx.textAlign = 'left'; ctx.letterSpacing = '2px';
      ctx.fillText(C.text, x + 82, y + h / 2 + 12);
      ctx.restore();
    }

    if (s.ageUI > 0) this.drawAge(s);
    if (s.spacing > 0 && project) this.drawSpacing(s, project);
    if (s.arrowsLabels && s.arrows > 0) this.drawArrowLabels(s, project);
    if (s.ceph > 0 && project) this.drawCeph(s, project);

    if (s.disclaimer > 0) {
      ctx.save(); ctx.globalAlpha = 0.8 * s.disclaimer;
      ctx.font = `500 28px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.textAlign = 'center';
      ctx.fillText('Сравнительная схема, а не индивидуальный прогноз', WIDTH / 2, 1610);
      ctx.restore();
    }

    // finale
    if (s.final > 0) {
      ctx.save();
      ctx.globalAlpha = s.final;
      const rise = (1 - easeOut(s.final)) * 30;
      ctx.font = `800 64px ${F}`; ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,10,30,0.85)'; ctx.shadowBlur = 20;
      spaced(ctx, 'ПРИКУС —', WIDTH / 2, 290 + rise, 3);
      spaced(ctx, 'ЭТО НЕ ТОЛЬКО ЗУБЫ', WIDTH / 2, 370 + rise, 3);
      ctx.shadowBlur = 0;
      ctx.font = `500 40px ${F}`; ctx.fillStyle = TEAL;
      spaced(ctx, 'Дыхание • Язык • Рост челюстей', WIDTH / 2, 450 + rise, 1);
      ctx.restore();
    }
    drawLogo(ctx, WIDTH / 2, 1390, 1.0, s.logo);
    if (s.credit > 0) {
      ctx.save(); ctx.globalAlpha = 0.55 * s.credit;
      ctx.font = `500 21px ${F}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
      ctx.fillText('Схематическая визуализация. Не является индивидуальным прогнозом.', WIDTH / 2, 1560);
      ctx.fillText('3D: Z-Anatomy · BodyParts3D (DBCLS) — CC BY-SA', WIDTH / 2, 1594);
      ctx.restore();
    }

    if (s.fadeIn < 1) { ctx.fillStyle = `rgba(3,9,26,${1 - s.fadeIn})`; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
  }

  drawAge(s) {
    const ctx = this.ctx, a = s.ageUI, age = s.age;
    ctx.save(); ctx.globalAlpha = a;
    const x0 = 120, x1 = WIDTH - 120, y = 1500;
    // label + value
    ctx.font = `600 26px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'left';
    ctx.letterSpacing = '4px'; ctx.fillText('ВОЗРАСТ', x0, y - 92); ctx.letterSpacing = '0px';
    let val;
    if (age < 1) val = `${Math.max(0, Math.round(age * 12))} мес.`;
    else { const n = Math.floor(age); val = `${n} ${yearsRu(n)}`; }
    ctx.font = `700 64px ${F}`; ctx.fillStyle = '#ffffff';
    ctx.fillText(val, x0, y - 26);
    // stage label
    const stage = age < 0.5 ? 'беззубые десневые валики' : age < 5.8 ? 'молочный прикус' : 'смешанный прикус';
    ctx.font = `600 30px ${F}`; ctx.fillStyle = age < 5.8 ? TEAL : '#ffd27a'; ctx.textAlign = 'right';
    ctx.fillText(stage, x1, y - 30);
    // bar 0–12 years
    const pos = (v) => x0 + (x1 - x0) * clamp(v / 12);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x0, y, x1 - x0, 4);
    const grad = ctx.createLinearGradient(x0, 0, pos(age), 0);
    grad.addColorStop(0, TEAL); grad.addColorStop(1, age < 5.8 ? TEAL : '#ffd27a');
    ctx.fillStyle = grad; ctx.fillRect(x0, y, pos(age) - x0, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let k = 0; k <= 12; k += 3) { ctx.fillRect(pos(k) - 1, y + 10, 2, 10); }
    ctx.font = `500 20px ${F}`; ctx.textAlign = 'center';
    for (let k = 0; k <= 12; k += 3) ctx.fillText(String(k), pos(k), y + 44);
    ctx.beginPath(); ctx.fillStyle = '#fff'; ctx.arc(pos(age), y + 2, 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawSpacing(s, project) {
    const ctx = this.ctx;
    if (!s.gaps) return;
    ctx.save(); ctx.globalAlpha = s.spacing;
    for (const p of s.gaps) {
      const q = project(p); if (!q) continue;
      ctx.strokeStyle = TEAL; ctx.lineWidth = 3;
      ctx.shadowColor = TEAL; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(q.x, q.y, 16, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.font = `600 32px ${F}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    ctx.fillText('физиологические промежутки', WIDTH / 2, 1290);
    ctx.restore();
  }

  drawArrowLabels(s, project) {
    const ctx = this.ctx;
    ctx.save(); ctx.globalAlpha = s.arrows;
    ctx.font = `700 28px ${F}`; ctx.textAlign = 'center'; ctx.letterSpacing = '3px';
    for (const L of s.arrowsLabels) {
      const q = project(L.p); if (!q) continue;
      ctx.fillStyle = L.color; ctx.shadowColor = 'rgba(0,10,30,0.9)'; ctx.shadowBlur = 10;
      ctx.fillText(L.text, q.x, q.y);
    }
    ctx.restore();
  }

  drawCeph(s, project) {
    const ctx = this.ctx, L = s.cephPts; if (!L) return;
    const P = (k) => project(L[k]);
    ctx.save(); ctx.globalAlpha = s.ceph;
    const line = (a, b, col, w = 3, dash = []) => {
      if (!a || !b) return;
      ctx.setLineDash(dash); ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    };
    const dot = (p, col) => { if (!p) return; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill(); };
    // S–N reference
    line(P('S'), P('N'), 'rgba(255,255,255,0.75)', 2.5);
    // mandibular plane: initial (dashed ghost) and current
    const ext = (a, b, k) => a && b ? { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k } : null;
    const go0 = P('Go0'), me0 = P('Me0'), go = P('Go'), me = P('Me');
    line(ext(me0, go0, 1.25), ext(go0, me0, 1.2), 'rgba(255,255,255,0.45)', 2.5, [10, 10]);
    ctx.shadowColor = TEAL; ctx.shadowBlur = 12;
    line(ext(me, go, 1.25), ext(go, me, 1.2), TEAL, 4);
    ctx.shadowBlur = 0;
    // lower anterior face height bracket ANS–Me
    const ans = P('ANS'), me1 = P('Me'), me00 = P('Me0');
    if (ans && me1) {
      const x = Math.max(ans.x, me1.x) + 70;
      ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 14, ans.y); ctx.lineTo(x, ans.y); ctx.lineTo(x, me1.y); ctx.lineTo(x - 14, me1.y); ctx.stroke();
      if (me00) { ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(255,210,122,0.5)'; ctx.beginPath(); ctx.moveTo(x - 30, me00.y); ctx.lineTo(x + 10, me00.y); ctx.stroke(); ctx.setLineDash([]); }
      ctx.save(); ctx.translate(x + 34, (ans.y + me1.y) / 2); ctx.rotate(-Math.PI / 2);
      ctx.font = `600 24px ${F}`; ctx.fillStyle = '#ffd27a'; ctx.textAlign = 'center';
      ctx.fillText('нижняя высота лица', 0, 0); ctx.restore();
    }
    for (const k of ['S', 'N', 'Go', 'Me', 'ANS']) dot(P(k), k === 'Go' || k === 'Me' ? TEAL : '#ffffff');
    // rotation arc label
    if (go && me) {
      ctx.font = `600 26px ${F}`; ctx.fillStyle = TEAL; ctx.textAlign = 'center';
      ctx.fillText('задняя ротация', (go.x + me.x) / 2, Math.max(go.y, me.y) + 70);
    }
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
