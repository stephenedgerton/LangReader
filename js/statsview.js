// The Stats tab: your vocabulary against the most common words in Italian fiction (js/freq.js), a rough
// level, coverage of a typical novel and its trend, frequency bands and themes.
import { openSheet, closeSheet, esc, icons, $ } from './ui.js';
import { loadFreq, lemmaStates, wordStats, themeWords, recordSnapshot, bandLabel, freqSource, COMFORT, LEVELS } from './freq.js';
import { THEMES } from './themes.js';
import { getDays, todayKey } from './stats.js';
import { openWordCard } from './wordcard.js';

const pct = (x, d = 0) => `${x.toFixed(d)}%`;
// Known is solid; learning (LingQs) is a hatched layer on top, so the two never rely on colour alone.
const bar = (known, learning, cls = '') => `<div class="sbar ${cls}"><i class="k" style="width:${known}%"></i>${learning >= 0.05 ? `<i class="l" style="width:${learning}%"></i>` : ''}</div>`;

export async function renderStats(v) {
  if (!(await loadFreq())) {
    v.innerHTML = `<div class="view-head"><h1 class="large-title">Stats</h1></div>
      <div class="empty"><h3>Word lists unavailable</h3><p>The frequency list couldn't load. Connect to the internet once and try again.</p></div>`;
    return;
  }
  const st = lemmaStates();
  const s = wordStats(st);
  recordSnapshot(s);
  const days = (await getDays()).filter((d) => d.cover != null);
  if (!days.length || days.at(-1).date !== todayKey()) days.push({ date: todayKey(), cover: s.coverage.known, lemmas: s.known });
  const next = s.next ? LEVELS.find(([, n]) => n === s.next.level)[0] : null;
  const prevAt = LEVELS.filter(([n]) => n <= s.known).at(-1)?.[0] || 0;

  v.innerHTML = `
    <div class="view-head"><h1 class="large-title">Stats</h1></div>
    <div class="card st-level">
      <div class="st-hero"><b>${s.level}</b><span>rough level</span></div>
      <p>You know <b>${s.known.toLocaleString()}</b> of the 20,000 most common words in Italian fiction${s.learning ? `, and you're learning ${s.learning.toLocaleString()} more` : ''}.</p>
      ${next ? `<div class="meter"><i style="width:${Math.min(100, ((s.known - prevAt) / (next - prevAt)) * 100)}%"></i></div>
        <p class="muted small">${s.next.words.toLocaleString()} more to reach ${s.next.level}.</p>` : ''}
      <p class="muted small">Estimated from how many common words you know: A1 500, A2 1,000, B1 2,000, B2 4,000, C1 8,000.</p>
    </div>

    <div class="section-title">Reading fiction</div>
    <div class="card st-cover">
      <div class="st-hero"><b>${pct(s.coverage.known, 1)}</b><span>of the words in a typical novel are known to you${s.coverage.learning >= 0.05 ? ` · +${pct(s.coverage.learning, 1)} learning` : ''}</span></div>
      <div class="cover-scale">
        ${bar(s.coverage.known, s.coverage.learning, 'big')}
        ${COMFORT.map((c) => `<span class="tick" style="left:${c}%" title="${c}%"></span>`).join('')}
      </div>
      <p class="muted small">The two lines mark 95%, where reading gets comfortable (about one new word every two lines), and 98%, where you can read without a dictionary.</p>
    </div>
    ${trendHTML(days)}

    <div class="section-title">Most common words</div>
    <div class="card st-bands">
      <div class="legend"><span><i class="k"></i>Known</span><span><i class="l"></i>Learning</span></div>
      ${s.bands.map((b) => `<div class="band" title="${bandLabel(b.top)}: ${b.known.toLocaleString()} known, ${b.learning.toLocaleString()} learning, of ${b.top.toLocaleString()}">
        <span class="bl">${bandLabel(b.top)}</span>${bar(b.knownPct, b.learningPct)}
        <span class="bv">${pct(b.knownPct)}${b.learningPct >= 0.5 ? `<small> +${pct(b.learningPct)}</small>` : ''}</span></div>`).join('')}
    </div>

    <div class="section-title">Themes</div>
    <div class="list st-themes">${THEMES.map((t) => {
      const ws = themeWords(t.words, st);
      const known = ws.filter((w) => w.state >= 2).length, learning = ws.filter((w) => w.state === 1).length;
      const kp = (known / ws.length) * 100, lp = (learning / ws.length) * 100;
      return `<button class="row theme-row" data-theme="${t.id}"><span class="ti">${t.icon}</span>
        <div class="txt"><div class="tn">${esc(t.name)}<span>${known} of ${ws.length}</span></div>${bar(kp, lp)}</div>
        <span class="bv">${pct(kp)}</span></button>`;
    }).join('')}</div>
    <p class="muted small st-source">Word frequencies: ${esc(freqSource())}. Names are left out; Ignored words count as known in coverage.</p>`;

  v.onclick = (e) => {
    const b = e.target.closest('[data-theme]');
    if (b) themeSheet(THEMES.find((t) => t.id === b.dataset.theme), () => renderStats(v));
  };
  initTrendHover(v);
}

// Coverage over time from the daily snapshots, with a forecast of when you'd reach 95%.
function trendHTML(days) {
  const pts = days.map((d) => ({ t: Date.parse(d.date + 'T12:00'), v: d.cover, date: d.date }));
  const head = '<div class="section-title">Your progress</div>';
  if (pts.length < 2) {
    return `${head}<div class="card st-trend"><p class="muted small">Your trend starts today. Each day you open the app, your coverage is saved here, so a line appears after a second day.</p></div>`;
  }
  const W = 340, H = 150, L = 34, Rr = 44, T = 10, B = 22;
  const t0 = pts[0].t, t1 = pts.at(-1).t;
  const lo = Math.floor(Math.min(...pts.map((p) => p.v)) - 1), hi = Math.ceil(Math.max(...pts.map((p) => p.v)) + 1);
  const x = (t) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - Rr);
  const y = (v) => T + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - T - B);
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const last = pts.at(-1);
  const fmt = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${head}<div class="card st-trend">
    <div class="tt-title">Fiction coverage</div>
    <svg viewBox="0 0 ${W} ${H}" class="trend" role="img" aria-label="Fiction coverage from ${pct(pts[0].v, 1)} on ${fmt(t0)} to ${pct(last.v, 1)} on ${fmt(t1)}">
      ${ticks.map((v) => `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`).join('')}
      <text class="ax" x="${L}" y="${H - 4}">${fmt(t0)}</text><text class="ax" x="${W - Rr}" y="${H - 4}" text-anchor="end">${fmt(t1)}</text>
      <path class="line" d="${path}"/>
      <circle class="dot" cx="${x(last.t)}" cy="${y(last.v)}" r="4"/>
      <text class="end" x="${x(last.t) + 8}" y="${y(last.v) + 4}">${pct(last.v, 1)}</text>
      <line class="cross" y1="${T}" y2="${H - B}" visibility="hidden"/>
      <rect class="hit" x="${L}" y="0" width="${W - L - Rr}" height="${H}" fill="transparent"
        data-pts="${esc(JSON.stringify(pts.map((p) => [x(p.t), y(p.v), p.v, fmt(p.t)])))}"/>
    </svg>
    <div class="tip" hidden></div>
    <p class="muted small">${forecast(pts)}</p>
  </div>`;
}

function forecast(pts) {
  const target = COMFORT[0];
  const now = pts.at(-1);
  if (now.v >= target) return `You're past ${target}%: most novels should feel comfortable now.`;
  const recent = pts.filter((p) => p.t >= now.t - 28 * 864e5);
  if (recent.length < 2 || now.t - recent[0].t < 5 * 864e5) return `A forecast for reaching ${target}% appears after about a week of history.`;
  // Least-squares slope over the last four weeks, in points a day.
  const n = recent.length, mx = recent.reduce((s, p) => s + p.t, 0) / n, my = recent.reduce((s, p) => s + p.v, 0) / n;
  const slope = recent.reduce((s, p) => s + (p.t - mx) * (p.v - my), 0) / recent.reduce((s, p) => s + (p.t - mx) ** 2, 0) * 864e5;
  if (!(slope > 0.001)) return `Your coverage hasn't moved in the last few weeks. Reading new material is the quickest way to raise it.`;
  const days = (target - now.v) / slope;
  if (days > 3 * 365) return `At your recent pace (+${(slope * 7).toFixed(2)} points a week), ${target}% is more than three years away.`;
  const when = new Date(now.t + days * 864e5).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return `At your recent pace (+${(slope * 7).toFixed(2)} points a week) you'd reach ${target}% around <b>${when}</b>.`;
}

// Crosshair and tooltip that follow the pointer to the nearest day.
function initTrendHover(v) {
  const svg = $('.trend', v); if (!svg) return;
  const hit = $('.hit', svg), cross = $('.cross', svg), tip = $('.st-trend .tip', v);
  const pts = JSON.parse(hit.dataset.pts);
  const move = (e) => {
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * svg.viewBox.baseVal.width;
    const p = pts.reduce((a, b) => (Math.abs(b[0] - sx) < Math.abs(a[0] - sx) ? b : a));
    cross.setAttribute('x1', p[0]); cross.setAttribute('x2', p[0]); cross.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `${p[3]} · <b>${pct(p[2], 1)}</b>`;
    const card = tip.parentElement.getBoundingClientRect();
    const at = r.left - card.left + (p[0] / svg.viewBox.baseVal.width) * r.width;
    tip.style.left = `${Math.max(tip.offsetWidth / 2 + 4, Math.min(card.width - tip.offsetWidth / 2 - 4, at))}px`;
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; });
}

// A theme's words: the ones you don't know yet first (most common first), then the ones you do.
function themeSheet(theme, onDone) {
  const ws = themeWords(theme.words);
  const todo = ws.filter((w) => w.state < 2), done = ws.filter((w) => w.state >= 2);
  const row = (w) => `<button class="row" data-t="${esc(w.lemma)}"><div class="txt"><div class="w">${esc(w.lemma)}</div></div>
    <span class="muted rank">#${w.rank.toLocaleString()}</span>${w.state === 1 ? '<span class="pill s1">Learning</span>' : w.state === 2 ? '<span class="pill s5">Known</span>' : w.state === 3 ? '<span class="pill si">Ignored</span>' : ''}</button>`;
  const body = openSheet(`<h2>${theme.icon} ${esc(theme.name)}<button class="x">${icons.close}</button></h2>
    <p class="muted small">${done.length} of ${ws.length} known. Tap a word to look it up; # is how common it is in Italian fiction.</p>
    ${todo.length ? `<div class="section-title" style="font-size:17px">To learn <small>${todo.length}</small></div><div class="list">${todo.map(row).join('')}</div>` : ''}
    ${done.length ? `<div class="section-title" style="font-size:17px">Known <small>${done.length}</small></div><div class="list">${done.map(row).join('')}</div>` : ''}`,
  { onClose: onDone });
  body.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.x')) return closeSheet();
    if (b.dataset.t) openWordCard({ term: b.dataset.t, display: b.dataset.t, onClose: onDone });
  };
}
