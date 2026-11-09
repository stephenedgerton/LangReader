// A short, quiet celebration for finishing a session: a burst of soft confetti and sparkles from the
// result (the ring or the check), a few firework blooms and a light confetti fall for a finished day.
// Drawn on one canvas above the sheet that ignores taps and removes itself when the last piece fades.
// Colours come from the app's tokens (mint first, then gem yellow, blue, purple), so it follows the
// light/dark appearance. With reduced motion there are no particles, only the CSS glow on the result.

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function palette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, d) => cs.getPropertyValue(n).trim() || d;
  const gem = v('--gem', '255, 200, 61');
  // Weighted: mostly mint, so it reads as the app's own colour.
  return [
    [v('--tint-fill', '#6fedbd'), 5], [v('--tint', '#2fbf8a'), 2], [`rgb(${gem})`, 3],
    [v('--blue', '#2585ea'), 2], [v('--purple', '#7e5fe0'), 1.5],
  ];
}
function picker(pal) {
  const total = pal.reduce((a, [, w]) => a + w, 0);
  return () => { let r = Math.random() * total; for (const [c, w] of pal) if ((r -= w) <= 0) return c; return pal[0][0]; };
}
const rand = (a, b) => a + Math.random() * (b - a);

// big: a whole day's session is done (blooms and a confetti fall too); otherwise just the burst.
export function celebrate(origin, { big = false } = {}) {
  if (reduced() || typeof document === 'undefined') return;
  const W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  const cv = document.createElement('canvas');
  cv.className = 'celebrate';
  cv.setAttribute('aria-hidden', 'true');
  cv.width = W * dpr; cv.height = H * dpr;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) { cv.remove(); return; }
  ctx.scale(dpr, dpr);
  const color = picker(palette());
  const r = origin?.getBoundingClientRect?.();
  const ox = r && r.width ? r.left + r.width / 2 : W / 2, oy = r && r.height ? r.top + r.height / 2 : H * 0.32;
  const unit = Math.min(1.2, Math.max(0.75, W / 390)); // speeds scale a little with the screen

  const parts = [];
  const add = (p) => parts.push({ age: 0, delay: 0, drag: 2.4, g: 120, rot: 0, vr: 0, phase: Math.random() * 6.28, ...p });

  // The burst from the result: ribbons, dots and sparkles, fanned out mostly upward.
  const n = big ? 46 : 28;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + rand(-1, 1) * (Math.PI * 0.85), sp = rand(240, 520) * unit;
    const shape = i % 5 < 2 ? 'ribbon' : i % 5 < 4 ? 'dot' : 'spark';
    add({ shape, x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(1.3, 2), delay: rand(0, 0.08),
      size: shape === 'ribbon' ? rand(4, 5.5) : shape === 'dot' ? rand(2.2, 3.6) : rand(5, 7.5),
      color: color(), vr: rand(-6, 6) });
  }
  if (big) {
    // Firework blooms: an even ring of dots around a soft flash, each in one colour.
    const blooms = [[0.24, 0.2, 0.3], [0.78, 0.15, 0.62], [0.52, 0.09, 0.95]];
    for (const [fx, fy, t] of blooms) {
      const x = W * fx, y = H * fy + 20, c = color(), k = 16, spin = Math.random();
      add({ shape: 'glow', x, y, vx: 0, vy: 0, g: 0, life: 0.6, delay: t, size: 34 * unit, color: c });
      for (let i = 0; i < k; i++) {
        const a = ((i + spin) / k) * Math.PI * 2, sp = rand(150, 170) * unit;
        add({ shape: 'dot', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.2, g: 36, life: rand(1.2, 1.5), delay: t, size: 2.4, color: c, trail: true });
        if (i % 4 === 0) add({ shape: 'spark', x, y, vx: Math.cos(a) * sp * 0.55, vy: Math.sin(a) * sp * 0.55, drag: 2.2, g: 30, life: 1.3, delay: t + 0.05, size: 5, color: c });
      }
    }
    // A light confetti fall from the top.
    for (let i = 0; i < 34; i++) {
      add({ shape: 'ribbon', x: rand(0, W), y: rand(-40, -10), vx: rand(-15, 15), vy: rand(70, 120) * unit, drag: 0, g: 0,
        life: rand(2.6, 3.4), delay: 0.35 + rand(0, 1.1), size: rand(4, 5.5), color: color(), vr: rand(-3, 3), sway: rand(14, 26) });
    }
  }

  let last = performance.now(), raf = 0, stopped = false;
  const stop = () => { if (stopped) return; stopped = true; cancelAnimationFrame(raf); cv.remove(); };

  const draw = (p, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    if (p.shape === 'dot') {
      if (p.trail) { // a short fading tail behind each bloom dot
        ctx.globalAlpha = alpha * 0.35;
        ctx.beginPath(); ctx.arc(p.x - p.vx * 0.04, p.y - p.vy * 0.04, p.size * 0.7, 0, 6.283); ctx.fill();
        ctx.globalAlpha = alpha;
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill();
      return;
    }
    if (p.shape === 'glow') {
      const t = p.age / p.life, rad = p.size * (0.4 + t);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
      g.addColorStop(0, p.color); g.addColorStop(1, 'transparent');
      ctx.globalAlpha = alpha * 0.45 * (1 - t);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 6.283); ctx.fill();
      return;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.shape === 'ribbon') {
      // Flutters by squashing one way, like a strip of paper turning over.
      ctx.scale(1, Math.abs(Math.cos(p.phase + p.age * 7)) * 0.8 + 0.2);
      const w = p.size, h = p.size * 2.1;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, w / 2) : ctx.rect(-w / 2, -h / 2, w, h);
      ctx.fill();
    } else { // spark: a four-pointed star that twinkles
      const s = p.size * (0.75 + 0.25 * Math.sin(p.phase + p.age * 14)), q = s * 0.22;
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.quadraticCurveTo(q, -q, s, 0); ctx.quadraticCurveTo(q, q, 0, s);
      ctx.quadraticCurveTo(-q, q, -s, 0); ctx.quadraticCurveTo(-q, -q, 0, -s);
      ctx.fill();
    }
    ctx.restore();
  };

  const tick = (now) => {
    if (stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of parts) {
      if (p.delay > 0) { p.delay -= dt; alive++; continue; }
      p.age += dt;
      if (p.age >= p.life) continue;
      alive++;
      const f = Math.exp(-p.drag * dt);
      p.vx *= f; p.vy = p.vy * f + p.g * dt;
      p.x += (p.vx + (p.sway ? Math.sin(p.phase + p.age * 2.4) * p.sway : 0)) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const t = p.age / p.life;
      const alpha = Math.min(1, p.age * 12) * (t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1);
      draw(p, alpha);
    }
    ctx.globalAlpha = 1;
    if (alive) raf = requestAnimationFrame(tick); else stop();
  };
  raf = requestAnimationFrame(tick);
  return { stop };
}
