// Apple Books-style page curl, in 2D.
//
// The page corner C is pulled to point P (the finger). The fold line is the perpendicular
// bisector of C–P: the part of the page on C's side of it is cut away (revealing the page
// underneath) and drawn mirrored across the fold as the curled-over flap.

// Keep the part of polygon `poly` where h(point) <= 0 (Sutherland–Hodgman, one edge).
function clipHalf(poly, h) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ha = h(a), hb = h(b);
    if (ha <= 0) out.push(a);
    if ((ha < 0 && hb > 0) || (ha > 0 && hb < 0)) {
      const t = ha / (ha - hb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

const polygon = (pts) => pts.length >= 3 ? `polygon(${pts.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(',')})` : 'polygon(0 0,0 0,0 0)';

// front: the turning page as it looks now; back: another copy of it, seen through the paper
// mirrored on the curled-over flap, as in Books. Both fill `host` and are already positioned.
export function createCurl(host, front, back, corner = 'bottom') {
  const W = host.clientWidth, H = host.clientHeight;
  const C = { x: W, y: corner === 'top' ? 0 : H };
  const rect = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];

  const root = document.createElement('div');
  root.className = 'curl';
  const top = document.createElement('div');
  top.className = 'curl-top';
  top.appendChild(front);
  const shadow = document.createElement('div');
  shadow.className = 'curl-shadow';
  const flapWrap = document.createElement('div');
  flapWrap.className = 'curl-flap-wrap';
  const flap = document.createElement('div');
  flap.className = 'curl-flap';
  back.classList.add('curl-back');
  const shade = document.createElement('div');
  shade.className = 'curl-shade';
  flap.append(back, shade);
  flapWrap.appendChild(flap);
  root.append(top, shadow, flapWrap);
  host.appendChild(root);

  // A linear-gradient whose stops are measured in px from point `o` along direction (dx, dy).
  const gradient = (o, dx, dy, stops) => {
    const t = Math.atan2(dx, -dy);
    const L = Math.abs(W * Math.sin(t)) + Math.abs(H * Math.cos(t));
    const s0 = (o.x - W / 2) * dx + (o.y - H / 2) * dy + L / 2;
    return `linear-gradient(${(t * 180 / Math.PI).toFixed(2)}deg, ${stops.map(([off, c]) => `${c} ${(s0 + off).toFixed(1)}px`).join(', ')})`;
  };

  let P = { ...C };
  function set(x, y) {
    P = { x: Math.max(-W, Math.min(W, x)), y: Math.max(-H * 0.4, Math.min(H * 1.4, y)) };
    const nx = C.x - P.x, ny = C.y - P.y;
    const len = Math.hypot(nx, ny);
    if (len < 1) {
      top.style.clipPath = 'none';
      shadow.style.display = flapWrap.style.display = 'none';
      return;
    }
    shadow.style.display = flapWrap.style.display = '';
    const ux = nx / len, uy = ny / len;
    const M = { x: (C.x + P.x) / 2, y: (C.y + P.y) / 2 };
    const f = (p) => (p.x - M.x) * ux + (p.y - M.y) * uy;
    const kept = clipHalf(rect, f);
    const folded = clipHalf(rect, (p) => -f(p));
    const mirrored = folded.map((p) => { const d = 2 * f(p); return { x: p.x - d * ux, y: p.y - d * uy }; });
    const depth = len / 2;

    top.style.clipPath = polygon(kept);
    shadow.style.clipPath = polygon(folded);
    // The page casts a soft shadow on the page underneath, just past the fold.
    shadow.style.background = gradient(M, ux, uy, [[0, 'rgba(0,0,0,.22)'], [Math.min(36, depth), 'rgba(0,0,0,0)']]);
    flap.style.clipPath = polygon(mirrored);
    // The back of the page is the turning page reflected across the fold line.
    const k = 2 * (M.x * ux + M.y * uy);
    back.style.transform = `matrix(${1 - 2 * ux * ux},${-2 * ux * uy},${-2 * ux * uy},${1 - 2 * uy * uy},${k * ux},${k * uy})`;
    // Paper colour with a bright band where it rolls over at the fold, darkening a touch at the crease.
    shade.style.backgroundImage = gradient(M, -ux, -uy, [
      [0, 'rgba(0,0,0,.10)'], [3, 'rgba(255,255,255,.18)'],
      [Math.max(6, Math.min(40, depth * 0.3)), 'rgba(255,255,255,.28)'],
      [Math.max(10, depth * 0.8), 'rgba(255,255,255,.06)'], [Math.max(12, depth), 'rgba(0,0,0,.05)'],
    ]);
  }

  // Animate the corner from its current position to (x, y); `lift` bows the path like a real page.
  function animateTo(x, y, ms = 300, lift = 0) {
    const from = { ...P };
    return new Promise((resolve) => {
      const t0 = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = 1 - Math.pow(1 - t, 3);
        const bow = Math.sin(Math.PI * e) * lift * (C.y === 0 ? 1 : -1);
        set(from.x + (x - from.x) * e, from.y + (y - from.y) * e + bow);
        if (t < 1) requestAnimationFrame(frame); else resolve();
      };
      requestAnimationFrame(frame);
    });
  }

  set(C.x, C.y);
  return { W, H, C, set, animateTo, get P() { return P; }, destroy: () => root.remove() };
}
