// Daily LingQ reviews: FSRS scheduling (srs.js) with a cap so they never pile up.
// - Reading counts as review: each page turn credits the LingQs on it (creditReading).
// - Each day offers at most settings.reviewsPerDay due cards and settings.newPerDay new ones, the most
//   valuable first (common words, cards closest to being forgotten). Whatever doesn't fit waits, unseen:
//   the app never shows the size of the backlog.
// - Cards stable for ~6 months become Known and leave the reviews.
// Today's counts live in localStorage langreader.srsDay = {date, reviews, fresh}.
import { settings } from './settings.js';
import { allEntries, entry, setWord, updateMany } from './vocab.js';
import { buildQueue, isLingq, rate, readingCredit, preview, ivlLabel, AGAIN, HARD, GOOD, EASY } from './srs.js';
import { lookupFreq, dotsFor, loadFreq } from './freq.js';
import { todayKey, bump } from './stats.js';
import { openSheet, closeSheet, esc, icons, $, $$ } from './ui.js';
import { dictHTML, dictionaryHints } from './wordcard.js';
import { tokenize, normalize } from './text.js';
import { lookup } from './dictionary.js';
import { haptic } from './haptics.js';
import { speak, translate, dictionaryLinks } from './services.js';

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
function countDone(field, n = 1) {
  const d = doneToday();
  d[field] = Math.max(0, d[field] + n);
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

const ICON = {
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M12 6.5C10.5 5 8 4.5 4 4.5v14c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-14c-4 0-6.5.5-8 2zm0 0v14"/></svg>',
};
const GRADES = [[AGAIN, 'Again', 'again'], [HARD, 'Hard', 'hard'], [GOOD, 'Good', 'good'], [EASY, 'Easy', 'easy']];
const PRAISE = ['Nice!', 'Correct!', 'Spot on!', 'Esatto!', 'Bravo!'];

const shuffle = (a) => {
  for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; }
  return a;
};
const fold = (s) => s.toLowerCase().replace(/’/g, "'");

// Where `display` stands in `context` as a whole word (ignoring case and curly apostrophes), or -1.
export function findWord(context, display) {
  const c = fold(context), d = fold(display), L = /[\p{L}\p{M}]/u;
  if (!d) return -1;
  for (let at = c.indexOf(d); at >= 0; at = c.indexOf(d, at + 1)) {
    if (!L.test(c[at - 1] || '') && (d.endsWith("'") || !L.test(c[at + d.length] || ''))) return at;
  }
  return -1;
}

// The card's sentence with every other word tappable and coloured by status (blue New, yellow LingQ), so
// words you don't know in the context can be looked up too. The card's own word is bold, or a gap.
function sentenceHTML(ex, at, len, gap = false) {
  let pos = 0, out = '', gapDone = false;
  for (const t of tokenize(ex)) {
    const s = pos, e = pos + t.text.length;
    pos = e;
    if (at >= 0 && s < at + len && e > at) {
      if (!gap) out += `<b>${esc(t.text)}</b>`;
      else if (!gapDone) { gapDone = true; out += '<span class="gap"></span>'; }
      continue;
    }
    if (t.type !== 'w') { out += esc(t.text); continue; }
    const st = entry(normalize(t.text))?.status ?? 0;
    out += `<span class="cw${st >= 0 && st <= 4 ? ' s' + st : ''}" data-w="${esc(t.text)}">${esc(t.text)}</span>`;
  }
  return out;
}

// Cards to practise once today's are done: LingQs not due yet, the ones due soonest first.
function aheadCards(n, skip) {
  const end = new Date(); end.setHours(23, 59, 59, 999);
  return allEntries().filter((w) => isLingq(w) && w.srs && w.srs.due > +end && todayKey(new Date(w.srs.last)) !== todayKey() && !skip.has(w.term))
    .sort((a, b) => a.srs.due - b.srs.due).slice(0, n);
}

// Multiple choice: the card's meaning among three others from your vocabulary (same kind first: words or phrases).
function meaningChoices(w, pool) {
  const others = pool.filter((e) => e.term !== w.term);
  const cands = [...shuffle(others.filter((e) => !!e.phrase === !!w.phrase)), ...shuffle(others.filter((e) => !!e.phrase !== !!w.phrase))];
  const seen = new Set([w.meaning.trim().toLowerCase()]), out = [];
  for (const e of cands) {
    const k = e.meaning.trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k); out.push(e.meaning.trim());
    if (out.length === 3) break;
  }
  if (out.length < 3) return null;
  const opts = shuffle([...out, w.meaning.trim()]);
  return { opts, answer: opts.indexOf(w.meaning.trim()) };
}

// Fill the gap: the word as it appears in its sentence, among three other single words of a similar length.
function clozeChoices(w, pool) {
  const shown = w.display || w.term, at = findWord(w.example || '', shown);
  if (w.phrase || at < 0) return null;
  const right = fold(w.example.slice(at, at + shown.length));
  const cands = shuffle(pool.filter((e) => !e.phrase && !e.term.includes(' ') && e.term !== w.term && e.term !== right && !e.term.endsWith("'") === !right.endsWith("'")))
    .sort((a, b) => Math.min(3, Math.abs(a.term.length - right.length)) - Math.min(3, Math.abs(b.term.length - right.length)));
  const out = [...new Set(cands.map((e) => e.term))].slice(0, 3);
  if (out.length < 3) return null;
  const opts = shuffle([...out, right]);
  return { opts, answer: opts.indexOf(right), at };
}

// Quizlet-style variety: new cards (and forgotten ones coming back) are plain flashcards, so you see the
// answer; known cards take turns between a flashcard, picking the meaning, and filling the gap in their sentence.
function cardMode(w, item, pool) {
  if (settings.reviewStyle === 'flip' || item.fresh || item.again || item.practice || !w.srs || !w.meaning) return { mode: 'flip' };
  const turn = (w.srs.reps || 0) % 3;
  if (turn === 1) { const c = clozeChoices(w, pool); if (c) return { mode: 'cloze', ...c }; }
  if (turn !== 0) { const c = meaningChoices(w, pool); if (c) return { mode: 'choice', ...c }; }
  return { mode: 'flip' };
}

export async function reviewSheet({ onClose } = {}) {
  await loadFreq(); // so common words come first
  const onKey = (e) => keydown(e);
  const body = openSheet('', { onClose: () => { removeEventListener('keydown', onKey); onClose?.(); } });
  addEventListener('keydown', onKey);

  let queue, i, pool, stats, cur = null, revealed = false, extra = 0, streak = 0, busy = false, swipedAt = -1e9, glossSeq = 0;
  // session: 'today' (today's cards), 'ahead' (extra practice, not due yet) or 'missed' (today's misses again,
  // which doesn't touch their schedule).
  let session = 'today';
  const seen = new Set();
  const undo = [];
  const start = (items) => {
    if (items) queue = items;
    else { const q = todaysQueue(extra); queue = interleave(q.due, q.fresh); session = 'today'; }
    queue.forEach((it) => seen.add(it.term));
    i = 0;
    pool = allEntries().filter((e) => e.status >= 1 && e.status <= 5 && e.meaning && e.meaning.trim());
    stats = stats || { n: 0, right: 0, known: 0, best: 0, tricky: [] };
  };
  const shown = () => cur.w.display || cur.w.term;
  const say = (what) => `<button class="rv-say${what === 'sentence' ? ' sm' : ''}" data-say="${what}" aria-label="${what === 'word' ? 'Play the word' : 'Play the sentence'}">${icons.speaker}</button>`;

  const headHTML = (title) => `<h2><span>${title}</span><span class="rv-hbtns">${undo.length ? `<button class="rv-undo" aria-label="Undo">${ICON.undo}</button>` : ''}<button class="x" aria-label="Close">${icons.close}</button></span></h2>`;
  const tallyHTML = () => `<div class="progress-line"><i style="width:${(i / queue.length) * 100}%"></i></div>
    <div class="rv-tally"><span class="t-again"><b>${stats.n - stats.right}</b> Still learning</span>
      ${streak >= 3 ? `<span class="rv-streak">🔥 ${streak} in a row</span>` : ''}
      <span class="t-good">Know <b>${stats.right}</b></span></div>`;

  const cardHTML = () => {
    const w = cur.w, s = shown(), ex = w.example || '', long = s.length > 40 ? ' long' : '';
    const at = findWord(ex, s), sent = ex ? sentenceHTML(ex, at, s.length) : '';
    let front;
    if (cur.mode === 'cloze') {
      front = `<div class="q-label">Fill in the gap</div>
        <div class="fc cloze">${sentenceHTML(ex, cur.at, s.length, true)}</div>
        <div class="q-hint">${esc(w.meaning)}</div>`;
    } else {
      front = `${cur.mode === 'choice' ? '<div class="q-label">What does it mean?</div>' : cur.item.fresh ? '<span class="new-tag">New</span>' : ''}
        <div class="fw-row"><div class="fw${long}">${esc(s)}</div>${say('word')}</div>
        ${ex ? `<div class="fc">${sent}${say('sentence')}</div>` : ''}
        ${cur.mode === 'flip' ? `<div class="hint-tap">${ex ? 'Tap a word for its meaning, anywhere else to flip' : 'Tap to flip'}</div>` : ''}`;
    }
    const back = `<div class="fw-row"><div class="bw${long}">${esc(s)}</div>${say('word')}</div>
      <div class="fm">${esc(w.meaning || '—')}</div>
      ${ex ? `<div class="fc">${sent}${say('sentence')}</div>` : ''}
      ${w.exampleTr ? `<div class="ft">${esc(w.exampleTr)}</div>` : ''}
      <div class="rv-tools">${ex && !w.exampleTr ? `<button class="rv-tr">${ICON.globe}Translate sentence</button>` : ''}<button class="rv-edit">${ICON.edit}Edit meaning</button><button class="rv-dict-btn">${ICON.book}Dictionary</button></div>`;
    return `<div class="card3d"><div class="face front">${front}</div><div class="face back">${back}</div></div>
      <i class="stamp know">Know</i><i class="stamp again">Still learning</i>`;
  };

  const actionsHTML = () => {
    if (cur.mode !== 'flip') {
      const a = cur.answered;
      const opts = cur.opts.map((o, k) => `<button class="rv-opt${a == null ? '' : k === cur.answer ? ' right' : k === a ? ' wrong' : ' dim'}" data-opt="${k}"${a == null ? '' : ' disabled'}><kbd>${k + 1}</kbd><span>${esc(o)}</span></button>`).join('');
      const list = `<div class="rv-opts${cur.mode === 'cloze' ? ' it' : ''}">${opts}</div>`;
      if (a == null) return `${list}<button class="link-btn" data-skip>I don't know</button>`;
      const ok = a === cur.answer;
      return `${list}<div class="rv-verdict ${ok ? 'ok' : 'no'}">${ok ? PRAISE[Math.floor(Math.random() * PRAISE.length)] : 'Not quite. It will come back soon.'}</div>
        <button class="primary" data-r="${ok ? GOOD : AGAIN}">Continue</button>`;
    }
    if (revealed && cur.item.practice) return `<div class="review-btns"><button class="again" data-r="${AGAIN}">Still learning</button><button class="good" data-r="${GOOD}">Got it</button></div>`;
    if (!revealed) return `<button class="primary" data-flip>Show Meaning</button><div class="swipe-hint"><span>← Still learning</span><span>Know →</span></div>`;
    const iv = preview(cur.w.srs, Date.now(), retention());
    return `<div class="review-btns four">${GRADES.map(([g, l, c]) => `<button class="${c}" data-r="${g}"><span>${l}</span><small>${ivlLabel(iv[g])}</small></button>`).join('')}</div>`;
  };
  const paintActions = () => { $('.rv-actions', body).innerHTML = actionsHTML(); };

  const render = () => {
    if (i >= queue.length) return renderDone();
    const item = queue[i], w = entry(item.term);
    if (!w || w.status < 1 || w.status > 4) { i++; return render(); } // changed elsewhere meanwhile
    cur = { item, w, answered: null, ...cardMode(w, item, pool) };
    revealed = false;
    const title = { today: "Today's Review", ahead: 'Extra Practice', missed: 'Missed Words' }[session];
    body.innerHTML = `${headHTML(`${title} <span class="muted">${i + 1} of ${queue.length}</span>`)}${tallyHTML()}
      <div class="flash enter mode-${cur.mode}">${cardHTML()}</div>
      <div class="rv-actions">${actionsHTML()}</div><div class="rv-dict" hidden></div>`;
    $('#sheet').scrollTop = 0;
    bindSwipe($('.flash', body));
  };

  const renderDone = () => {
    cur = null;
    const nx = todaysQueue(extra + 10), more = nx.due.length + nx.fresh.length;
    $('#sheet').scrollTop = 0;
    const pct = stats.n ? Math.round((stats.right / stats.n) * 100) : 0;
    const tricky = stats.tricky.map((t) => entry(t)).filter((w) => w && isLingq(w));
    body.innerHTML = `${headHTML(stats.n ? 'All done for today' : 'Nothing to review')}
      <div class="rv-done">
        ${stats.n ? `<div class="rv-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" pathLength="100"/><circle class="fg" cx="60" cy="60" r="52" pathLength="100" style="--p:${pct}"/></svg><div><b>${pct}%</b><small>remembered</small></div></div>`
          : '<div class="rv-coffee">☕</div>'}
        <div class="rv-done-line">${stats.n ? `${stats.n} card${stats.n === 1 ? '' : 's'} reviewed · ${stats.right} remembered${stats.known ? ` · ${stats.known} now Known` : ''}`
          : 'Your reading keeps your LingQs fresh. Come back tomorrow.'}</div>
        ${stats.best >= 3 ? `<div class="rv-done-sub">Best streak: ${stats.best} in a row</div>` : ''}
      </div>
      ${tricky.length ? `<div class="section-title rv-tricky-title">Still learning</div><div class="list rv-tricky">${tricky.map((w) => `<div class="row"><div class="txt"><div class="w">${esc(w.display || w.term)}</div><div class="m">${esc(w.meaning || '—')}</div></div><button class="rv-say" data-term="${esc(w.display || w.term)}" aria-label="Play">${icons.speaker}</button></div>`).join('')}</div>` : ''}
      <button class="primary" data-done>Done</button>
      ${keepGoingHTML(more, tricky.length)}`;
  };
  // Optional extras, never pushed: today's remaining due cards first, else cards that aren't due yet,
  // and today's misses once more.
  const keepGoingHTML = (more, missed) => {
    const ahead = more ? 0 : aheadCards(10, new Set()).length;
    if (!more && !ahead && !missed) return '';
    return `<div class="rv-more"><div class="rv-more-title">Want to keep going? <span>Only if you feel like it.</span></div>
      ${more ? `<button class="secondary" data-extra>Review ${Math.min(10, more)} more</button>` : ''}
      ${ahead ? `<button class="secondary" data-ahead>Practise ${ahead} ahead of schedule</button>` : ''}
      ${missed ? `<button class="secondary" data-missed>Go over the ${missed === 1 ? 'one' : missed} I missed</button>` : ''}</div>`;
  };

  // Hear it as you check it (synchronously, in the tap, for iOS).
  const sayWord = () => { if (settings.speakOnTap) speak(shown()); };
  const flash = () => $('.flash', body);
  const reveal = () => {
    if (!revealed) { revealed = true; sayWord(); paintActions(); }
    flash().classList.add('flipped');
  };
  const flip = () => {
    if (cur.mode === 'flip' && !revealed) return reveal();
    if (revealed) flash().classList.toggle('flipped');
  };
  const answer = (k) => {
    if (cur.answered != null) return;
    haptic();
    cur.answered = k; revealed = true;
    sayWord();
    flash().classList.add('flipped', k === cur.answer ? 'is-right' : 'is-wrong');
    paintActions();
    $('.rv-actions .primary', body)?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  };

  // The rated card flies off (right if you knew it, left if not) while the next one comes in under it.
  const flyOut = (dir) => {
    const el = flash(), sheet = $('#sheet');
    if (!el) return;
    const r = el.getBoundingClientRect(), sr = sheet.getBoundingClientRect();
    const c = el.cloneNode(true);
    c.classList.remove('flash', 'enter', 'dragging');
    c.classList.add('rv-fly');
    c.style.setProperty('--from', el.style.transform || 'none');
    c.style.setProperty('--dir', dir);
    Object.assign(c.style, { top: `${r.top - sr.top + sheet.scrollTop}px`, left: `${r.left - sr.left}px`, width: `${r.width}px`, height: `${r.height}px` });
    sheet.appendChild(c);
    setTimeout(() => c.remove(), 450);
  };

  const grade = async (g, dir) => {
    if (busy || !cur) return;
    busy = true;
    const item = cur.item, w = entry(item.term) || cur.w;
    flyOut(dir ?? (g === AGAIN ? -1 : 1));
    const snap = { term: w.term, prev: { status: w.status, srs: w.srs }, i, queue, qlen: queue.length, session, stats: { ...stats, tricky: [...stats.tricky] }, streak, counted: null, known: false };
    if (g === AGAIN) streak = 0; else { streak++; stats.best = Math.max(stats.best, streak); }
    undo.push(snap);
    // Going over today's misses again is only practice: their schedule was already set today.
    if (item.practice) {
      snap.term = null; busy = false;
      if (g === AGAIN && !item.again) queue.push({ ...item, again: true });
      i++; return render();
    }
    const p = rate(w, g, Date.now(), retention(), Math.random());
    if (!item.again) {
      // Extra practice ahead of schedule doesn't use up tomorrow's share.
      if (!item.ahead) { snap.counted = item.fresh ? 'fresh' : 'reviews'; countDone(snap.counted); }
      stats.n++; if (g > AGAIN) stats.right++;
    }
    if (g === AGAIN && !stats.tricky.includes(w.term)) stats.tricky.push(w.term);
    if (p.status === 5) { stats.known++; if (!w.phrase) { bump('known'); snap.known = true; } }
    try { await setWord(w.term, p); } finally { busy = false; }
    // Forgotten cards come back once more at the end of the session.
    if (g === AGAIN && !item.again) queue.push({ ...item, again: true });
    i++; render();
  };

  // Undo puts the last card back exactly as it was, along with today's counts.
  const undoLast = async () => {
    if (busy || !undo.length) return;
    busy = true;
    const s = undo.pop();
    if (s.counted) countDone(s.counted, -1);
    if (s.known) bump('known', -1);
    try { if (s.term) await setWord(s.term, s.prev); } finally { busy = false; }
    queue = s.queue; queue.length = s.qlen; i = s.i; session = s.session; stats = s.stats; streak = s.streak;
    render();
  };

  // Fix a meaning that doesn't make sense, right on the card.
  const saveMeaning = async (m) => {
    m = m.trim();
    if (!m || !cur) return;
    cur.w = await setWord(cur.w.term, { meaning: m });
    const p = pool.find((e) => e.term === cur.w.term);
    if (p) p.meaning = m; else pool.push(cur.w);
    const box = $('.face.back .fm-edit', body) || $('.face.back .fm', body);
    if (box) { box.outerHTML = `<div class="fm saved">${esc(m)}</div>`; }
    paintHints();
  };
  const editMeaning = () => {
    const fm = $('.face.back .fm', body);
    if (!fm) return;
    fm.outerHTML = `<form class="fm-edit"><input name="m" value="${esc(cur.w.meaning || '')}" placeholder="Your meaning…" autocomplete="off" autocapitalize="off" enterkeyhint="done"><button>Save</button></form>`;
    const form = $('.fm-edit', body);
    form.onsubmit = (e) => { e.preventDefault(); haptic(); saveMeaning(form.m.value); };
    form.m.focus(); form.m.select();
  };

  // The dictionary under the card: Wiktionary's senses and translations you can tap to use as the meaning.
  let hints = { dict: [], mt: [], pending: 0 };
  function paintHints() {
    const box = $('.rv-dict .hints', body);
    if (!box || !cur) return;
    const list = [], seen = new Set();
    const add = (h) => { const k = h.text.toLowerCase(); if (!seen.has(k)) { seen.add(k); list.push(h); } };
    if (cur.w.meaning) add({ text: cur.w.meaning, on: true });
    hints.dict.slice(0, 4).forEach(add);
    hints.mt.slice(0, 3).forEach(add);
    box.innerHTML = list.map((h) => `<button class="hint${h.on ? ' on' : ''}" data-t="${esc(h.text)}"><span>${esc(h.text)}${h.note ? ` <small>${esc(h.note)}</small>` : ''}</span>${h.on ? '<small>Saved</small>' : '<span class="plus">Use</span>'}</button>`).join('')
      + (hints.pending ? '<div class="loading">Looking up…</div>' : list.length > 1 ? '' : '<div class="loading">No other suggestions. Edit the meaning on the card, or try a dictionary below.</div>');
  }
  const openDict = () => {
    const box = $('.rv-dict', body);
    if (!box.hidden) { box.hidden = true; return; }
    const w = cur.w, s = shown(), term = w.term;
    box.hidden = false;
    box.innerHTML = `<div class="section-title">Meanings <small>tap one to use it</small></div><div class="hints"></div><div class="dict" hidden></div>
      <div class="dicts">${dictionaryLinks(s).map((d) => `<a href="${d.url}" target="_blank" rel="noopener">${d.name}</a>`).join('')}</div>`;
    hints = { dict: [], mt: [], pending: 0 };
    const live = () => cur && cur.w.term === term && box.isConnected;
    const job = (p) => { hints.pending++; p.catch(() => {}).finally(() => { hints.pending--; if (live()) paintHints(); }); };
    if (!w.phrase && settings.target === 'en') {
      job(lookup(s).then((r) => {
        if (!r || !live()) return;
        hints.dict = dictionaryHints(r);
        const d = $('.dict', box); d.innerHTML = dictHTML(r, { lemmaButton: false }); d.hidden = false;
      }));
    }
    job(translate(s, { word: !w.phrase }).then((r) => { hints.mt = r.options || []; }));
    paintHints();
    box.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  };

  // Tap a word in the sentence: its meaning shows under the sentence (saved meaning, Wiktionary, then
  // machine translation), and a New word can be saved as a LingQ from there.
  const showGloss = async (span) => {
    const text = span.dataset.w, term = normalize(text), face = span.closest('.face');
    if (settings.speakOnTap) speak(text); // synchronously, in the tap, for iOS
    $$('.cw.on', body).forEach((x) => x.classList.remove('on'));
    span.classList.add('on');
    let bar = $('.cgloss', face);
    if (!bar) { bar = document.createElement('div'); bar.className = 'cgloss'; $('.fc', face).after(bar); }
    const paint = (m, loading = false) => {
      const st = entry(term)?.status ?? 0;
      bar.innerHTML = `<b>${esc(text)}</b><span class="cg-m">${loading ? 'Looking up…' : esc(m || 'No translation found')}</span>`
        + (!loading && m && st === 0 ? `<button class="cg-add" data-t="${esc(term)}" data-m="${esc(m)}">+ LingQ</button>` : st >= 1 && st <= 4 ? '<small>LingQ</small>' : '');
    };
    const saved = entry(term)?.meaning;
    if (saved) return paint(saved);
    paint('', true);
    const seq = ++glossSeq;
    let m = '';
    if (settings.target === 'en') { try { const r = await lookup(text); m = (r && dictionaryHints(r)[0]?.text) || ''; } catch {} }
    if (!m) { try { m = (await translate(text, { word: true })).main || ''; } catch {} }
    if (seq === glossSeq && bar.isConnected) paint(m);
  };
  const addLingq = async (b) => {
    haptic();
    const term = b.dataset.t, m = b.dataset.m;
    const w = await setWord(term, { status: 1, meaning: m, ...(cur?.w.example && { example: cur.w.example, ...(cur.w.exampleTr && { exampleTr: cur.w.exampleTr }) }) });
    bump('lingqs');
    pool.push(w);
    $$('.cw', body).forEach((x) => { if (normalize(x.dataset.w) === term) { x.classList.remove('s0'); x.classList.add('s1'); } });
    b.outerHTML = '<small>Saved as LingQ</small>';
  };
  const translateSentence = async (b) => {
    const w = cur.w, ex = w.example;
    b.disabled = true; b.lastChild.textContent = 'Translating…';
    let tr;
    try { tr = (await translate(ex)).main; } catch { b.lastChild.textContent = 'Translation unavailable (offline?)'; return; }
    if (!cur || cur.w.term !== w.term) return;
    cur.w = await setWord(w.term, { exampleTr: tr }, { silent: true });
    $('.face.back .fc', body)?.insertAdjacentHTML('afterend', `<div class="ft">${esc(tr)}</div>`);
    b.remove();
  };

  const sayBtn = (b, text) => {
    $$('.rv-say.playing', body).forEach((x) => x.classList.remove('playing'));
    b.classList.add('playing');
    const off = () => b.classList.remove('playing');
    speak(text, { onend: off });
    setTimeout(off, 6000);
  };

  // Swipe a flashcard: right if you knew it (Good), left if you're still learning it (Again).
  function bindSwipe(el) {
    if (cur.mode !== 'flip') return;
    let x0 = null, y0 = 0, dx = 0, drag = false, id = null;
    const set = (x) => {
      el.style.transform = x ? `translateX(${x}px) rotate(${x / 20}deg)` : '';
      el.style.setProperty('--know', Math.max(0, Math.min(1, x / 110)));
      el.style.setProperty('--again', Math.max(0, Math.min(1, -x / 110)));
    };
    el.addEventListener('pointerdown', (e) => {
      if (busy || e.button > 0 || e.target.closest('button, input, form, a')) return;
      x0 = e.clientX; y0 = e.clientY; dx = 0; drag = false; id = e.pointerId;
    });
    el.addEventListener('pointermove', (e) => {
      if (x0 == null || e.pointerId !== id) return;
      dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if (!drag) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { x0 = null; return; } // a scroll
        if (Math.abs(dx) < 10) return;
        drag = true; el.classList.add('dragging');
        try { el.setPointerCapture(id); } catch {}
      }
      set(dx);
    });
    el.addEventListener('touchmove', (e) => { if (drag) e.stopPropagation(); }, { passive: true }); // not the sheet's swipe-down
    const end = (cancel) => {
      if (x0 == null) return;
      x0 = null;
      if (!drag) return;
      drag = false; swipedAt = performance.now();
      el.classList.remove('dragging');
      if (!cancel && Math.abs(dx) > 100) { haptic(); grade(dx > 0 ? GOOD : AGAIN, Math.sign(dx)); }
      else set(0);
    };
    el.addEventListener('pointerup', () => end(false));
    el.addEventListener('pointercancel', () => end(true));
  }

  // On a keyboard: Space flips, 1–4 rate (or pick an answer), ← / → are the swipes, Z undoes.
  function keydown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select')) return;
    const k = e.key;
    if (k === 'z' || k === 'Z') { e.preventDefault(); return undoLast(); }
    if (!cur) return;
    if (cur.mode !== 'flip') {
      if (cur.answered == null) { if (/^[1-4]$/.test(k)) { e.preventDefault(); answer(+k - 1); } return; }
      if (k === ' ' || k === 'Enter') { e.preventDefault(); grade(cur.answered === cur.answer ? GOOD : AGAIN); }
      return;
    }
    if (k === ' ' || k === 'Enter') { e.preventDefault(); return flip(); }
    if (k === 'ArrowRight') { e.preventDefault(); return grade(GOOD, 1); }
    if (k === 'ArrowLeft') { e.preventDefault(); return grade(AGAIN, -1); }
    if (revealed && /^[1-4]$/.test(k)) { e.preventDefault(); return grade(+k); }
  }

  start(); render();
  body.onclick = (e) => {
    const b = e.target.closest('button');
    if (b) {
      if (b.matches('.x') || b.dataset.done != null) return closeSheet();
      if (b.matches('.rv-undo')) return undoLast();
      if (b.dataset.extra != null) { extra += 10; start(); return render(); }
      if (b.dataset.ahead != null) { session = 'ahead'; start(aheadCards(10, seen).map((w) => ({ term: w.term, ahead: true }))); return render(); }
      if (b.dataset.missed != null) {
        session = 'missed';
        start(shuffle(stats.tricky.filter((t) => isLingq(entry(t) || {}))).map((term) => ({ term, practice: true })));
        return render();
      }
      if (b.matches('.rv-tr')) return translateSentence(b);
      if (b.matches('.cg-add')) return addLingq(b);
      if (b.dataset.term) return sayBtn(b, b.dataset.term);
      if (b.dataset.say) return sayBtn(b, b.dataset.say === 'word' ? shown() : cur.w.example);
      if (b.matches('.rv-edit')) return editMeaning();
      if (b.matches('.rv-dict-btn')) return openDict();
      if (b.matches('.rv-dict .hint')) { if (!b.matches('.on')) { haptic(); saveMeaning(b.dataset.t); } return; }
      if (b.dataset.opt != null) return answer(+b.dataset.opt);
      if (b.dataset.skip != null) return answer(-1);
      if (b.dataset.flip != null) return reveal();
      if (b.dataset.r != null) { haptic(); return grade(+b.dataset.r); }
      return;
    }
    if (e.target.closest('input, form, a, .cgloss')) return;
    if (!cur || !e.target.closest('.flash') || performance.now() - swipedAt < 400) return;
    const cw = e.target.closest('.cw');
    if (cw) return showGloss(cw);
    flip();
  };
}
