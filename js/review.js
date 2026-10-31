// Daily LingQ reviews: FSRS scheduling (srs.js) with a cap so they never pile up.
// - Reading counts as review: each page turn credits the LingQs on it (creditReading).
// - Each day offers at most settings.reviewsPerDay due cards and settings.newPerDay new ones, the most
//   valuable first (common words, cards closest to being forgotten). Whatever doesn't fit waits, unseen:
//   the app never shows the size of the backlog.
// - Cards stable for ~6 months become Known and leave the reviews.
// Today's counts live in localStorage langreader.srsDay = {date, reviews, fresh}.
import { settings } from './settings.js';
import { allEntries, entry, setWord, updateMany } from './vocab.js';
import { buildQueue, rate, readingCredit, preview, ivlLabel, AGAIN, HARD, GOOD, EASY } from './srs.js';
import { lookupFreq, dotsFor, loadFreq } from './freq.js';
import { todayKey, bump } from './stats.js';
import { openSheet, closeSheet, esc, icons } from './ui.js';
import { highlight } from './wordcard.js';
import { haptic } from './haptics.js';
import { speak } from './services.js';

const DAY_KEY = 'langreader.srsDay';
export const RETENTION = { relaxed: 0.8, normal: 0.85, intense: 0.9 };
export const retention = () => RETENTION[settings.retention] || RETENTION.normal;

function doneToday() {
  try {
    const d = JSON.parse(localStorage.getItem(DAY_KEY) || '{}');
    if (d.date === todayKey()) return { reviews: d.reviews || 0, fresh: d.fresh || 0 };
  } catch {}
  return { reviews: 0, fresh: 0 };
}
function countDone(field) {
  const d = doneToday();
  d[field]++;
  try { localStorage.setItem(DAY_KEY, JSON.stringify({ date: todayKey(), ...d })); } catch {}
}

// What knowing a word is worth: the commonest words most, words beyond the top 20k least.
function weight(w) {
  if (w.phrase) return 3;
  const f = lookupFreq(w.term);
  return f ? dotsFor(f.rank) : 1;
}

export function todaysQueue(extra = 0) {
  const done = doneToday();
  return buildQueue(allEntries(), {
    now: Date.now(), weight, done,
    maxReviews: (+settings.reviewsPerDay || 0) + extra, maxNew: (+settings.newPerDay || 0) + (extra ? Math.ceil(extra / 2) : 0),
  });
}
// How many cards today's session holds (never the whole backlog).
export function todaysCount() { const q = todaysQueue(); return q.due.length + q.fresh.length; }
export const reviewedToday = () => { const d = doneToday(); return d.reviews + d.fresh; };

// Called on every forward page turn with the LingQ terms on the page and the terms tapped in this chapter.
export function creditReading(terms, tapped) {
  const now = Date.now(), ret = retention();
  const patches = [];
  let known = 0;
  for (const term of terms) {
    const e = entry(term);
    const p = readingCredit(e, tapped.has(term), now, ret, Math.random());
    if (!p) continue;
    if (p.status === 5 && !e.phrase) known++;
    patches.push({ term, ...p });
  }
  if (!patches.length) return Promise.resolve(0);
  if (known) bump('known', known);
  return updateMany(patches);
}

// New cards are spread through the due ones, one in every three, instead of coming in a block.
function interleave(due, fresh) {
  const out = [];
  let i = 0, j = 0;
  while (i < due.length || j < fresh.length) {
    if (j < fresh.length && (i >= due.length || out.length % 3 === 2)) out.push({ term: fresh[j++].term, fresh: true });
    else out.push({ term: due[i++].term, fresh: false });
  }
  return out;
}

export async function reviewSheet({ onClose } = {}) {
  await loadFreq(); // so common words come first
  const body = openSheet('', { onClose });
  let queue, i, revealed, stats, extra = 0;
  const start = () => {
    const q = todaysQueue(extra);
    queue = interleave(q.due, q.fresh);
    i = 0; revealed = false;
    stats = stats || { n: 0, right: 0, known: 0 };
  };
  const head = (t) => `<h2>${t}<button class="x">${icons.close}</button></h2>`;
  const card = () => {
    if (i >= queue.length) {
      const nx = todaysQueue(extra + 10), more = nx.due.length + nx.fresh.length;
      body.innerHTML = `${head(stats.n ? 'All done for today' : 'Nothing to review')}
        <div class="flash done"><div class="fw">${stats.n ? '✓' : '☕'}</div>
          <div class="fc">${stats.n ? `${stats.n} card${stats.n === 1 ? '' : 's'} reviewed · ${stats.right} remembered${stats.known ? ` · ${stats.known} now Known` : ''}`
            : 'Your reading keeps your LingQs fresh. Come back tomorrow.'}</div></div>
        <button class="primary" data-done>Done</button>
        ${more ? '<button class="secondary more-btn" data-extra>Review 10 more</button>' : ''}`;
      return;
    }
    const w = entry(queue[i].term);
    if (!w || w.status < 1 || w.status > 4) { i++; return card(); } // changed elsewhere meanwhile
    const shown = w.display || w.term;
    const ctx = w.example ? highlight(w.example, shown) : '';
    const iv = revealed ? preview(w.srs, Date.now(), retention()) : null;
    body.innerHTML = `${head(`Today's Review <span class="muted" style="font-size:15px;font-weight:500">${i + 1} of ${queue.length}</span>`)}
      <div class="progress-line"><i style="width:${(i / queue.length) * 100}%"></i></div>
      <div class="flash" data-flip>${queue[i].fresh ? '<span class="new-tag">New</span>' : ''}
        <div class="fw${shown.length > 40 ? ' long' : ''}">${esc(shown)}</div>${ctx ? `<div class="fc">${ctx}</div>` : ''}
        ${revealed ? `<div class="fm">${esc(w.meaning || '—')}</div>${w.exampleTr ? `<div class="ft">${esc(w.exampleTr)}</div>` : ''}` : '<div class="hint-tap">Tap to show the meaning</div>'}</div>
      ${revealed ? `<div class="review-btns four">
        ${[[AGAIN, 'Again', 'again'], [HARD, 'Hard', 'hard'], [GOOD, 'Good', 'good'], [EASY, 'Easy', 'easy']].map(([g, l, c]) =>
          `<button class="${c}" data-r="${g}"><span>${l}</span><small>${ivlLabel(iv[g])}</small></button>`).join('')}</div>`
        : '<button class="primary" data-flip>Show Meaning</button>'}`;
  };
  start(); card();
  body.onclick = async (e) => {
    const b = e.target.closest('button,[data-flip]'); if (!b) return;
    if (b.matches('.x') || b.dataset.done != null) return closeSheet();
    if (b.dataset.extra != null) { extra += 10; start(); return card(); }
    if (b.dataset.flip != null) {
      if (revealed) return;
      const w = entry(queue[i].term);
      // Hear it as you check it (synchronously, in the tap, for iOS).
      if (settings.speakOnTap && w) speak(w.display || w.term);
      revealed = true; return card();
    }
    if (b.dataset.r != null) {
      haptic();
      const g = +b.dataset.r, item = queue[i], w = entry(item.term);
      const p = rate(w, g, Date.now(), retention(), Math.random());
      if (!item.again) { countDone(item.fresh ? 'fresh' : 'reviews'); stats.n++; if (g > AGAIN) stats.right++; }
      if (p.status === 5) { stats.known++; if (!w.phrase) bump('known'); }
      await setWord(w.term, p);
      // Forgotten cards come back once more at the end of the session.
      if (g === AGAIN && !item.again) queue.push({ ...item, again: true });
      i++; revealed = false; card();
    }
  };
}
