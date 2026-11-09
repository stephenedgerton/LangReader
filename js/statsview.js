// The Stats tab, in two panes behind a Reading | Training switch (settings.statsTab). Reading: your vocabulary
// against the most common words in Italian fiction (js/freq.js), a reading level, coverage of a typical novel and
// its trend, frequency bands and themes. Training: a speaking level (the same scale, over the words in the
// sentences you can say), sentences you can say, the training streak, cards a day and
// each pack's progress. Both panes are rendered; the switch only shows one.
import { openSheet, closeSheet, esc, icons, $ } from './ui.js';
import { loadFreq, lemmaStates, wordStats, themeWords, recordSnapshot, bandLabel, freqSource, levelFor, lemmasIn, COMFORT, LEVELS } from './freq.js';
import { THEMES } from './themes.js';
import { getDays, todayKey } from './stats.js';
import { openWordCard } from './wordcard.js';
import { loadSentences, syncPacks, packSentences, packMeta, isTrained, readingPack, ownPacks, trainingStreak } from './training.js';
import { learned, mastered, isNew, genderize } from './sentences.js';
import { PACKS } from '../samples/packs/index.js';
import { settings } from './settings.js';

const TABS = { reading: 'Reading', training: 'Training' };

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
  const allDays = await getDays();
  const train = await trainingHTML(allDays);
  const days = allDays.filter((d) => d.cover != null);
  if (!days.length || days.at(-1).date !== todayKey()) days.push({ date: todayKey(), cover: s.coverage.known, lemmas: s.known });

  const tab = TABS[settings.statsTab] ? settings.statsTab : 'reading';
  v.innerHTML = `
    <div class="view-head"><h1 class="large-title">Stats</h1></div>
    <div class="seg st-tabs" role="tablist">${Object.entries(TABS).map(([k, name]) => `<button data-stab="${k}" role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}">${name}</button>`).join('')}</div>
    <div class="st-pane" data-pane="reading" role="tabpanel"${tab === 'reading' ? '' : ' hidden'}>
    ${levelHTML('reading', s, `You know <b>${s.known.toLocaleString()}</b> of the 20,000 most common words in Italian fiction${s.learning ? `, and you're learning ${s.learning.toLocaleString()} more` : ''}.`,
      'Estimated from how many common words you know')}

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
    <p class="muted small st-source">Word frequencies: ${esc(freqSource())}. Names are left out; Ignored words count as known in coverage.</p>
    </div>
    <div class="st-pane" data-pane="training" role="tabpanel"${tab === 'training' ? '' : ' hidden'}>${train}</div>`;

  v.onclick = (e) => {
    const t = e.target.closest('[data-stab]');
    if (t) {
      settings.statsTab = t.dataset.stab;
      v.querySelectorAll('[data-stab]').forEach((b) => { const on = b === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      v.querySelectorAll('.st-pane').forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.stab; });
      return;
    }
    const b = e.target.closest('[data-theme]');
    if (b) themeSheet(THEMES.find((t) => t.id === b.dataset.theme), () => renderStats(v));
  };
  initTrendHover(v);
  initBarHover(v);
}

// A level card: the level, a sentence about the words behind it, a meter to the next level and the scale.
// Reading and speaking use the same scale (js/freq.js LEVELS), over different words.
function levelHTML(kind, s, text, basis) {
  const next = s.next ? LEVELS.find(([, n]) => n === s.next.level)[0] : null;
  const prevAt = LEVELS.filter(([n]) => n <= s.known).at(-1)?.[0] || 0;
  return `<div class="card st-level st-${kind}">
      <div class="st-hero"><b>${s.level}</b><span>${kind} level</span></div>
      <p>${text}</p>
      ${next ? `<div class="meter"><i style="width:${Math.min(100, ((s.known - prevAt) / (next - prevAt)) * 100)}%"></i></div>
        <p class="muted small">${s.next.words.toLocaleString()} more to reach ${s.next.level}.</p>` : ''}
      <p class="muted small">${basis}: ${LEVELS.map(([n, l]) => `${l} ${n.toLocaleString()}`).join(', ')}.</p>
    </div>`;
}

// ---------- Training ----------
const CHART_DAYS = 14;
async function trainingHTML(days) {
  await loadSentences(); await syncPacks();
  const packs = [readingPack(), ...ownPacks(), ...PACKS.filter((p) => isTrained(p.id)).map((p) => packMeta(p.id))].filter(Boolean);
  const seen = new Set(), all = [];
  for (const p of packs) for (const x of packSentences(p.id)) if (!seen.has(x.id)) { seen.add(x.id); all.push(x); }
  const byDate = new Map(days.map((d) => [d.date, d]));
  const last = Array.from({ length: CHART_DAYS }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (CHART_DAYS - 1 - i)); return { date: todayKey(d), t: +d, n: byDate.get(todayKey(d))?.drills || 0 }; });
  // Speaking level: the common words (lemmas) in the sentences you can say; those only in sentences you've
  // started are "practising".
  const it = (x) => genderize(x.it, settings.trainMe || 'm', settings.trainPartner || 'm');
  const can = lemmasIn(all.filter(learned).map(it));
  const practising = [...lemmasIn(all.filter((x) => !isNew(x) && !learned(x)).map(it))].filter((i) => !can.has(i)).length;
  const sp = { known: can.size, ...levelFor(can.size) };
  const head = levelHTML('speaking', sp, `You can say <b>${sp.known.toLocaleString()}</b> of the 20,000 most common words in sentences you've learned${practising ? `, and you're practising ${practising.toLocaleString()} more` : ''}.`,
    'Estimated from the common words in the sentences you can say, on the same scale as reading');
  // Repetitions (once through hearing a sentence and saying it): today, the last 7 days and in all.
  const repsOn = (i) => { const d = new Date(); d.setDate(d.getDate() - i); return byDate.get(todayKey(d))?.reps || 0; };
  const reps = { today: repsOn(0), week: [0, 1, 2, 3, 4, 5, 6].reduce((n, i) => n + repsOn(i), 0), all: days.reduce((n, d) => n + (d.reps || 0), 0) };
  if (!all.some((x) => !isNew(x)) && !last.some((d) => d.n) && !reps.all) {
    return `${head}<div class="card st-train"><p class="muted small">Your training stats start after your first session on the Training tab.</p></div>`;
  }
  const canSay = all.filter(learned).length, done = all.filter(mastered).length, started = all.filter((x) => !isNew(x)).length;
  const month = new Set();
  for (let i = 0; i < 30; i++) { const d = new Date(); d.setDate(d.getDate() - i); if (byDate.get(todayKey(d))?.trained) month.add(i); }
  const streak = trainingStreak(days), week = last.slice(-7).reduce((n, d) => n + d.n, 0);
  return `${head}<div class="card st-train">
      <div class="st-hero"><b>${canSay.toLocaleString()}</b><span>sentence${canSay === 1 ? '' : 's'} you can say${done ? ` · ${done.toLocaleString()} mastered` : ''}</span></div>
      <p class="muted small">Of ${all.length.toLocaleString()} in your packs, you've started ${started.toLocaleString()}. A sentence counts once you've said it right after a week; mastered ones have left the drills.</p>
      <div class="st-cells">
        <div><b>${streak ? `🔥 ${streak}` : '0'}</b><span>day${streak === 1 ? '' : 's'} in a row</span></div>
        <div><b>${month.size}</b><span>of the last 30 days</span></div>
        <div><b>${week.toLocaleString()}</b><span>cards this week</span></div>
      </div>
      ${reps.all ? `<div class="st-cells st-reps">
        <div><b>${reps.today.toLocaleString()}</b><span>repetition${reps.today === 1 ? '' : 's'} today</span></div>
        <div><b>${reps.week.toLocaleString()}</b><span>this week</span></div>
        <div><b>${reps.all.toLocaleString()}</b><span>in all</span></div>
      </div>` : ''}
      ${barsHTML(last)}
    </div>
    <div class="card st-bands st-packs">${packs.map((p) => {
      const list = packSentences(p.id), n = list.length, l = list.filter(learned).length, st = list.filter((x) => !isNew(x) && !learned(x)).length;
      const lp = n ? (l / n) * 100 : 0, sp = n ? (st / n) * 100 : 0;
      return `<div class="band" title="${esc(p.name)}: ${l} learned, ${st} started, of ${n}"><span class="bl">${p.emoji} ${esc(p.name)}</span>${bar(lp, sp)}<span class="bv">${l}/${n}</span></div>`;
    }).join('')}
      <div class="legend"><span><i class="k"></i>Learned</span><span><i class="l"></i>Started</span></div>
    </div>`;
}

// Cards a day (ratings and shadowed sentences) over the last two weeks, one bar a day.
function barsHTML(last) {
  const W = 340, H = 120, L = 26, R = 6, T = 14, B = 20, slot = (W - L - R) / last.length, bw = Math.max(4, slot - 2);
  const max = Math.max(4, ...last.map((d) => d.n)), top = Math.ceil(max / 4) * 4;
  const y = (n) => T + (1 - n / top) * (H - T - B);
  const fmt = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const total = last.reduce((n, d) => n + d.n, 0), active = last.filter((d) => d.n).length;
  const barPath = (x, n) => {
    const h = (H - B) - y(n), r = Math.min(4, h, bw / 2);
    if (h <= 0) return '';
    return `M${x},${H - B}V${y(n) + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${H - B}z`;
  };
  return `<div class="st-bars"><div class="tt-title">Cards a day</div>
    <svg viewBox="0 0 ${W} ${H}" class="bars" role="img" aria-label="Training cards a day over the last ${last.length} days: ${total} in all, on ${active} days">
      ${[0, top / 2, top].map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
      ${last.map((d, i) => `<path class="bar${d.n ? '' : ' zero'}" d="${barPath(L + i * slot + (slot - bw) / 2, d.n)}"/>`).join('')}
      <text class="ax" x="${L}" y="${H - 4}">${fmt(last[0].t)}</text><text class="ax" x="${W - R}" y="${H - 4}" text-anchor="end">Today</text>
      <rect class="hit" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"
        data-bars="${esc(JSON.stringify(last.map((d, i) => [L + i * slot + slot / 2, d.n, fmt(d.t)])))}"/>
    </svg>
    <div class="tip" hidden></div>
    <table class="sr-only"><tr><th>Day</th><th>Cards</th></tr>${last.map((d) => `<tr><td>${fmt(d.t)}</td><td>${d.n}</td></tr>`).join('')}</table>
  </div>`;
}

function initBarHover(v) {
  const svg = $('.bars', v); if (!svg) return;
  const hit = $('.hit', svg), tip = $('.st-bars .tip', v), bars = JSON.parse(hit.dataset.bars);
  const paths = [...svg.querySelectorAll('.bar')];
  const move = (e) => {
    const r = svg.getBoundingClientRect(), sx = ((e.clientX - r.left) / r.width) * svg.viewBox.baseVal.width;
    let i = 0; bars.forEach((b, k) => { if (Math.abs(b[0] - sx) < Math.abs(bars[i][0] - sx)) i = k; });
    paths.forEach((p, k) => p.classList.toggle('on', k === i));
    tip.hidden = false;
    tip.innerHTML = `${bars[i][2]} · <b>${bars[i][1]} card${bars[i][1] === 1 ? '' : 's'}</b>`;
    const box = tip.parentElement.getBoundingClientRect(), at = r.left - box.left + (bars[i][0] / svg.viewBox.baseVal.width) * r.width;
    tip.style.left = `${Math.max(tip.offsetWidth / 2 + 4, Math.min(box.width - tip.offsetWidth / 2 - 4, at))}px`;
  };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { paths.forEach((p) => p.classList.remove('on')); tip.hidden = true; });
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
