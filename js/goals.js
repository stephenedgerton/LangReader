// Per-book reading goals: pages a day, a projected finish date, streaks and milestones.
// Progress is your position in the book, so jumping ahead (or "Mark Chapter Complete") counts
// and going back to re-read doesn't count twice. A "page" is however many words fit on one
// page at your current text size, which the reader measures (settings.wordsPerPage).
import { db } from './db.js';
import { settings } from './settings.js';
import { todayKey } from './stats.js';
import { openSheet, closeSheet, esc, icons } from './ui.js';

export const MILESTONES = [0.25, 0.5, 0.75, 1];
const MILESTONE_NAMES = { 0.25: 'A quarter of the way', 0.5: 'Halfway', 0.75: 'Three quarters', 1: 'Finished' };
const DEFAULT_WPP = 110; // about one iPhone page at the default text size, until the reader measures it

export const wordsPerPage = () => settings.wordsPerPage || DEFAULT_WPP;
const toPages = (words) => words / wordsPerPage();

const totalWords = (b) => (b.chapterWords || []).reduce((a, n) => a + n, 0) || b.wordCount || 0;

// How many words into the book the reading position is.
export function wordsAt(b) {
  const cw = b.chapterWords || [];
  const ch = b.progress?.chapter || 0;
  let read = 0;
  for (let i = 0; i < ch; i++) read += cw[i] || 0;
  return read + (cw[ch] || 0) * (b.progress?.read ?? b.progress?.frac ?? 0);
}

export function bookPct(b) {
  const t = totalWords(b);
  return t ? Math.min(100, Math.round((wordsAt(b) / t) * 100)) : 0;
}

const dayAfter = (key, n) => { const d = new Date(key + 'T12:00'); d.setDate(d.getDate() + n); return todayKey(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);

// Words read on a day: from where you started that day to the furthest point you reached.
const dayWords = (b, key) => { const d = b.log?.[key]; return d ? Math.max(0, d.to - d.from) : 0; };
export const pagesToday = (b) => toPages(dayWords(b, todayKey()));

// Called on every progress save. Updates the reading log and milestones on the book (the caller
// saves it) and returns the celebrations earned since the last call.
export function trackProgress(b) {
  const pos = Math.round(wordsAt(b));
  const today = todayKey();
  const reads = b.reads || (b.reads = pastReads(b)); // before today's log entry, which isn't history
  const wasFinished = !!b.milestones && 1 in b.milestones;
  const log = b.log || (b.log = {});
  const d = log[today] || (log[today] = { from: pos, to: pos });
  d.to = Math.max(d.to, pos);

  const cheers = [];
  const total = totalWords(b);
  const reached = MILESTONES.filter((m) => total && pos >= Math.floor(total * m));
  if (!b.milestones) {
    // First time we see this book: what you'd already read counts, without a fanfare.
    b.milestones = Object.fromEntries(reached.map((m) => [m, null]));
  } else {
    const fresh = reached.filter((m) => !(m in b.milestones));
    for (const m of fresh) b.milestones[m] = today;
    const top = fresh[fresh.length - 1];
    if (top === 1) cheers.push({ icon: '🏆', title: 'You finished the book!', sub: esc(b.title) });
    else if (top) cheers.push({ icon: '🎉', title: `${MILESTONE_NAMES[top]} through!`, sub: `${top * 100}% of ${esc(b.title)}` });
  }

  // Each time through the book is a read. It starts the day you first get past the opening (just
  // opening a book doesn't count) and finishes the day you reach the end. "Start from the
  // beginning" clears the milestones, so the next page you read starts a new read.
  let cur = reads[reads.length - 1];
  if (pos > 0 && (!cur || 'finished' in cur) && !wasFinished) reads.push(cur = { started: today });
  if (cur && !('finished' in cur) && 1 in b.milestones) cur.finished = b.milestones[1];

  const g = b.goal;
  if (g && g.cheered !== today && toPages(dayWords(b, today)) >= g.pages) {
    g.cheered = today;
    const st = goalStreak(b);
    cheers.push({ icon: '🎯', title: 'Today’s goal done!', sub: `${g.pages} ${g.pages === 1 ? 'page' : 'pages'}${st > 1 ? ` · 🔥 ${st}-day streak` : ''}` });
  }
  return cheers;
}

// "Mark as complete": move the position to the end of the book, which finishes the current read
// (starting one today if there isn't one). Words aren't marked Known; the caller saves the book.
export function markBookComplete(b) {
  if (!b.milestones) trackProgress(b); // so the milestones it passes now are dated today
  const n = b.chapterCount || 1;
  b.progress = { ...b.progress, chapter: n - 1, page: 0, frac: 1, read: 1, done: [...Array(n).keys()] };
  trackProgress(b);
}

// The reads of a book from before reads were recorded, pieced together from the reading log:
// started on the first day you read some of it, or null if you'd begun before the log did.
// (trackProgress adds the finish from the milestones.)
function pastReads(b) {
  const days = Object.keys(b.log || {}).sort().filter((k) => b.log[k].to > 0);
  if (!days.length && !wordsAt(b)) return [];
  return [{ started: days.length && b.log[days[0]].from === 0 ? days[0] : null }];
}

// When the book was last finished (a date key; null if before that was recorded), or undefined.
export function finishedOn(b) {
  const r = (b.reads || []).filter((x) => 'finished' in x).pop();
  return r ? r.finished : b.milestones?.[1];
}

// Days in a row the goal was met, counting today only once it's met.
export function goalStreak(b) {
  if (!b.goal) return 0;
  const met = (k) => toPages(dayWords(b, k)) >= b.goal.pages;
  let k = todayKey(), n = 0;
  if (!met(k)) k = dayAfter(k, -1);
  while (met(k)) { n++; k = dayAfter(k, -1); }
  return n;
}

// The day you reach `words` into the book reading `ppd` pages a day, today's reading included.
function dayReaching(b, words, ppd) {
  const left = toPages(Math.max(0, words - wordsAt(b)));
  if (left <= 0.01) return todayKey();
  const todayLeft = Math.max(0, ppd - pagesToday(b));
  if (left <= todayLeft) return todayKey();
  return dayAfter(todayKey(), Math.ceil((left - todayLeft) / ppd));
}

// Pages a day needed to finish by `date` (today counts as one of the days).
function pagesFor(b, date) {
  const days = daysBetween(todayKey(), date) + 1;
  if (days < 1) return null;
  return Math.max(1, Math.ceil((toPages(totalWords(b) - wordsAt(b)) + pagesToday(b)) / days));
}

// Average over the days you actually read this past week, for an honest "at this pace" date.
function recentPace(b) {
  const days = [];
  for (let i = 0; i < 7; i++) days.push(toPages(dayWords(b, dayAfter(todayKey(), -i))));
  const read = days.filter((p) => p >= 0.5);
  return read.length ? read.reduce((a, p) => a + p, 0) / 7 : 0;
}

export function goalSummary(b) {
  const g = b.goal;
  if (!g) return null;
  const today = pagesToday(b);
  const done = wordsAt(b) >= totalWords(b) - 1;
  return {
    pages: g.pages, today: Math.floor(today), frac: Math.min(1, today / g.pages), met: today >= g.pages,
    streak: goalStreak(b), finish: done ? null : dayReaching(b, totalWords(b), g.pages), done,
  };
}

export function fmtDay(key) {
  const n = daysBetween(todayKey(), key);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  const d = new Date(key + 'T12:00');
  return d.toLocaleDateString(undefined, { weekday: n < 7 ? 'long' : 'short', month: 'short', day: 'numeric', ...(n > 300 ? { year: 'numeric' } : {}) });
}

function fmtPast(key) {
  const n = daysBetween(key, todayKey());
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  return new Date(key + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------- The goal sheet (Library ⋯, the reader's menu, Home) ----------
const PRESETS = [5, 10, 15, 20, 30];
const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function goalSheet(book, { onChange } = {}) {
  const body = openSheet('', { onClose: onChange });
  const save = () => db.put('books', book);
  const draw = () => {
    const total = totalWords(book), pos = wordsAt(book);
    const left = Math.ceil(toPages(total - pos));
    const head = `<h2>Reading Goal<button class="x">${icons.close}</button></h2>
      <div class="gs-book"><b>${esc(book.title)}</b><span>${bookPct(book)}% read · ${left ? `${pl(left, 'page')} to go` : 'finished'}</span></div>`;
    if (!book.goal) {
      body.innerHTML = `${head}
        <p class="muted gs-intro">How many pages do you want to read of this book each day? You'll see when you'll finish, keep a streak going, and celebrate milestones along the way.</p>
        <div class="gs-presets">${PRESETS.map((p) => `<button data-set="${p}"><b>${p}</b><span>pages a day</span><small>${left ? `done ${fmtDay(dayReaching(book, total, p))}` : ''}</small></button>`).join('')}</div>
        <label class="field gs-date"><span>Or choose when to finish</span><input type="date" name="by" min="${todayKey()}"></label>`;
      return;
    }
    const s = goalSummary(book);
    const R = 34, C = 2 * Math.PI * R;
    const pace = recentPace(book);
    const week = [];
    for (let i = 6; i >= 0; i--) { const k = dayAfter(todayKey(), -i); week.push({ k, p: toPages(dayWords(book, k)) }); }
    const top = Math.max(s.pages, ...week.map((w) => w.p)) || 1;
    const ms = MILESTONES.map((m) => {
      const got = book.milestones && m in book.milestones;
      const when = got ? (book.milestones[m] ? `Reached ${fmtPast(book.milestones[m])}` : 'Reached')
        : `Expected ${fmtDay(dayReaching(book, Math.floor(total * m), s.pages))}`;
      return `<li class="${got ? 'got' : ''}"><i>${got ? icons.check : ''}</i><span>${m === 1 ? 'The end' : `${m * 100}%`}<small>${MILESTONE_NAMES[m]}</small></span><em>${when}</em></li>`;
    }).join('');
    // The chapter you're in, as a closer target.
    const cw = book.chapterWords || [];
    const ch = book.progress?.chapter || 0;
    const chEnd = cw.slice(0, ch + 1).reduce((a, n) => a + n, 0);
    const chLeft = Math.ceil(toPages(chEnd - pos));

    body.innerHTML = `${head}
      <div class="gs-today">
        <div class="ring sm"><svg viewBox="0 0 80 80"><circle class="track" cx="40" cy="40" r="${R}"/>
          <circle class="prog${s.met ? ' met' : ''}" cx="40" cy="40" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - s.frac)}"/></svg>
          <div class="ring-n">${s.met ? icons.check : s.today}</div></div>
        <div><h4>${s.met ? 'Goal done for today!' : `${s.today} of ${pl(s.pages, 'page')} today`}</h4>
          <p>${s.met ? `${s.today} pages read today` : `${pl(s.pages - s.today, 'page')} to go`}${s.streak ? ` · 🔥 ${s.streak}-day streak` : ''}</p></div>
      </div>
      <div class="gs-week" style="--goal:${s.pages / top}">${week.map((w) => `<div class="${w.p >= s.pages ? 'met' : ''}${w.k === todayKey() ? ' today' : ''}"><em><i style="height:${Math.round((Math.min(w.p, top) / top) * 100)}%"></i></em>
        <span>${new Date(w.k + 'T12:00').toLocaleDateString(undefined, { weekday: 'narrow' })}</span></div>`).join('')}</div>
      <div class="ts-group gs-plan">
        <div class="ts-item"><span class="lbl">Pages a day</span>
          <span class="stepper"><button data-step="-1" aria-label="Fewer pages">−</button><b>${s.pages}</b><button data-step="1" aria-label="More pages">+</button></span></div>
        <label class="ts-item"><span class="lbl">Finish by</span><input type="date" name="by" min="${todayKey()}" value="${s.finish || ''}" ${s.done ? 'disabled' : ''}></label>
      </div>
      <p class="gs-proj">${s.done ? 'You’ve finished this book. 🏆'
        : `At ${pl(s.pages, 'page')} a day you’ll finish <b>${fmtDay(s.finish)}</b>${daysBetween(todayKey(), s.finish) > 1 ? ` (${daysBetween(todayKey(), s.finish) + 1} days)` : ''}.`
          + (chLeft > 0 && chEnd < total ? ` This chapter ends in ${pl(chLeft, 'page')}.` : '')
          + (pace >= 0.5 && Math.abs(pace - s.pages) >= 1 ? ` At your pace this week (${Math.round(pace)} a day), ${fmtDay(dayReaching(book, total, pace))}.` : '')}</p>
      <div class="section-title gs-title">Milestones</div>
      <ul class="gs-ms">${ms}</ul>
      <button class="secondary danger gs-remove" data-remove>Remove Goal</button>`;
  };
  draw();

  const setPages = (p) => {
    book.goal = { ...(book.goal || { since: todayKey() }), pages: Math.max(1, Math.min(500, p)) };
    // Raising the bar above today's reading earns a fresh cheer when you reach it.
    if (book.goal.cheered === todayKey() && pagesToday(book) < book.goal.pages) delete book.goal.cheered;
    save(); draw();
  };
  body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.x')) return closeSheet();
    if (b.dataset.set) setPages(+b.dataset.set);
    if (b.dataset.step) setPages((book.goal?.pages || 10) + +b.dataset.step);
    if (b.dataset.remove != null) { delete book.goal; save(); draw(); }
  });
  body.addEventListener('change', (e) => {
    if (e.target.name !== 'by' || !e.target.value) return;
    const p = pagesFor(book, e.target.value);
    if (p) setPages(p);
  });
  return body;
}

// Small "Reading Goal" card used on Home.
export function goalCardHTML(b) {
  const s = goalSummary(b);
  return `<button class="card bgoal" data-goal="${b.id}">
    <div class="bg-top"><b>${esc(b.title)}</b><span>${s.met ? `${icons.check} Done` : `${s.today}/${s.pages}`}</span></div>
    <div class="progress-line"><i style="width:${s.frac * 100}%"></i></div>
    <p>${s.done ? 'Finished 🏆' : `${s.met ? 'Goal met today' : `${pl(s.pages - s.today, 'page')} to go today`} · finish ${fmtDay(s.finish)}`}${s.streak ? ` · 🔥 ${s.streak}` : ''}</p>
  </button>`;
}
