// Achievements, shown as bookmarks (silk ribbons, one colour per kind): for known words, words
// read, reading streaks and finished books. Internally they're still "badges".
// They're all worked out from your data, so a restored backup earns them back; only the date
// each one was earned is kept, in localStorage langreader.badges ({id: date, or null when it was
// already earned the first time we looked}).
import { db } from './db.js';
import { settings } from './settings.js';
import { counts } from './vocab.js';
import { getDays, todayKey } from './stats.js';
import { bookPct } from './goals.js';
import { openSheet, closeSheet, esc, icons, coverHTML } from './ui.js';

const KEY = 'langreader.badges';
const n = (x) => x.toLocaleString();

const GROUPS = [
  { kind: 'known', name: 'Known words', icon: '🧠', steps: [100, 500, 1000, 2500, 5000, 10000, 20000], title: (s) => `${n(s)} known words` },
  { kind: 'read', name: 'Words read', icon: '📖', steps: [5000, 25000, 100000, 250000, 500000, 1000000], title: (s) => `${n(s)} words read` },
  { kind: 'streak', name: 'Reading streaks', icon: '🔥', steps: [3, 7, 30, 100, 365], title: (s) => `${s}-day streak` },
  { kind: 'books', name: 'Books finished', icon: '🏆', steps: [1, 3, 10, 25], title: (s) => (s === 1 ? 'First book finished' : `${s} books finished`) },
];
export const BADGES = GROUPS.flatMap((g) => g.steps.map((s) => ({ id: `${g.kind}-${s}`, kind: g.kind, step: s, icon: g.icon, title: g.title(s) })));

// Longest run of days that met the daily minutes goal.
function bestStreak(days) {
  const goal = settings.goalMinutes * 60;
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    if ((d.seconds || 0) < goal) { run = 0; prev = null; continue; }
    const next = prev && new Date(prev + 'T12:00');
    if (next) next.setDate(next.getDate() + 1);
    run = next && todayKey(next) === d.date ? run + 1 : 1;
    prev = d.date;
    best = Math.max(best, run);
  }
  return best;
}

const isFinished = (b) => (b.milestones && '1' in b.milestones) || bookPct(b) >= 100;

async function measure() {
  const [days, books] = await Promise.all([getDays(), db.all('books')]);
  const finished = books.filter(isFinished).sort((a, b) => (a.milestones?.[1] || '').localeCompare(b.milestones?.[1] || ''));
  return {
    values: { known: counts().known, read: days.reduce((a, d) => a + (d.wordsRead || 0), 0), streak: bestStreak(days), books: finished.length },
    finished,
  };
}

function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
function save(earned) { try { localStorage.setItem(KEY, JSON.stringify(earned)); } catch {} }

// Records newly earned badges and returns them. The very first check only records what you'd
// already earned, without celebrating.
export async function checkBadges() {
  const { values, finished } = await measure();
  const stored = load();
  const earned = stored || {};
  const fresh = [];
  for (const b of BADGES) {
    if (b.id in earned || values[b.kind] < b.step) continue;
    earned[b.id] = stored ? todayKey() : null;
    if (stored) fresh.push(b);
  }
  save(earned);
  return { fresh, earned, values, finished };
}

// What to aim for next: the unearned badge you're proportionally closest to.
function nextUp(values, earned) {
  let best = null;
  for (const g of GROUPS) {
    const s = g.steps.find((x) => !(`${g.kind}-${x}` in earned));
    if (s == null) continue;
    const frac = Math.min(1, values[g.kind] / s);
    if (!best || frac > best.frac) best = { badge: BADGES.find((b) => b.id === `${g.kind}-${s}`), frac, have: values[g.kind] };
  }
  return best;
}

// A bookmark ribbon. `earned` omitted means draw it as earned (for the reader's celebration).
export const bookmarkHTML = (b, earned) => {
  const got = !earned || b.id in earned;
  const fresh = earned && earned[b.id] === todayKey();
  return `<span class="bookmark k-${b.kind}${got ? '' : ' locked'}${fresh ? ' new' : ''}" title="${esc(b.title)}"><i>${b.icon}</i></span>`;
};

// Home's "Achievements" card.
export async function achievementsCardHTML() {
  const { earned, values } = await checkBadges();
  const got = BADGES.filter((b) => b.id in earned);
  // Most recent first; ones from before tracking (no date) after those, biggest first.
  const recent = got.slice().sort((a, b) => (earned[b.id] || '').localeCompare(earned[a.id] || '') || b.step - a.step).slice(0, 5);
  const nx = nextUp(values, earned);
  return `<button class="card ach" data-act="achievements">
    <div class="ach-top"><b>${got.length} of ${BADGES.length} collected</b><span class="muted">See all ›</span></div>
    ${recent.length ? `<div class="ach-row">${recent.map((b) => bookmarkHTML(b, earned)).join('')}</div>` : ''}
    ${nx ? `<div class="ach-next"><span>Next: ${nx.badge.icon} ${esc(nx.badge.title)}</span><small>${n(Math.floor(nx.have))} / ${n(nx.badge.step)}</small></div>
      <div class="progress-line"><i style="width:${nx.frac * 100}%"></i></div>` : ''}
  </button>`;
}

export async function achievementsSheet() {
  const { earned, values, finished } = await checkBadges();
  const when = (d) => (d ? new Date(d + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Collected');
  const body = openSheet(`<h2>Bookmarks<button class="x">${icons.close}</button></h2>
    ${GROUPS.map((g) => `
      <div class="section-title ach-title">${g.name}<small>${n(Math.floor(values[g.kind]))}${g.kind === 'streak' ? ' days best' : ''}</small></div>
      <div class="ach-grid">${BADGES.filter((b) => b.kind === g.kind).map((b) => `
        <div class="ach-item">${bookmarkHTML(b, earned)}<b>${esc(b.title)}</b>
          <small>${b.id in earned ? when(earned[b.id]) : `${Math.floor(Math.min(1, values[g.kind] / b.step) * 100)}%`}</small></div>`).join('')}
      </div>`).join('')}
    ${finished.length ? `<div class="section-title ach-title">Finished</div>
      <div class="shelf">${finished.map((b) => `<div class="book">${coverHTML(b)}</div>`).join('')}</div>` : ''}
    <p class="muted" style="font-size:13px;margin-top:16px">Streaks count days that meet your ${settings.goalMinutes}-minute reading goal.</p>`);
  body.addEventListener('click', (e) => { if (e.target.closest('.x')) closeSheet(); });
}
