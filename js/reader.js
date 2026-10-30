// Paginated reader: Apple Books look & gestures + LingQ word interaction.
import { db } from './db.js';
import { settings, FONTS, THEMES, TARGETS } from './settings.js';
import { paragraphHTML } from './text.js';
import { statusOf, phrases, onChange, setMany, entry, revertToNew } from './vocab.js';
import { openSheet, closeSheet, sheetOpen, sheetClosedAt, toast, esc, icons, $, $$ } from './ui.js';
import { openWordCard } from './wordcard.js';
import { translate, speak, stopSpeaking, voicesForLang, googleTranslateURL } from './services.js';
import { bump, startReadingClock, stopReadingClock } from './stats.js';
import { openBubble, closeBubble, bubbleOpen, bubbleClosedAt } from './bubble.js';
import { createCurl } from './curl.js';
import { haptic } from './haptics.js';
import { trackProgress, goalSheet, goalSummary } from './goals.js';
import { checkBadges } from './achievements.js';

const R = {
  el: null, area: null, content: null,
  book: null, ch: 0, chapter: null,
  page: 0, pages: 1, step: 0,
  spans: [], pageOf: null, seenPages: new Set(),
  anchor: null, phraseStart: null, selEnd: null, selSpans: [], onExit: null, speaking: false, busy: false,
};

const dark = () => settings.appearance === 'dark' || (settings.appearance === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);

export function initReader() {
  R.el = $('#reader');
  R.area = $('#page-area');
  R.content = $('#page-content');

  $('#r-close').addEventListener('click', closeReader);
  $('#r-menu').addEventListener('click', (e) => { e.stopPropagation(); closeBubble(); toggleMenu(); });
  $('#r-vocab').addEventListener('click', pageWordsSheet);
  $('#r-menu-pop').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    toggleMenu(false);
    ({ contents: contentsSheet, themes: themesSheet, goal: () => goalSheet(R.book), 'translate-page': translatePage, 'speak-page': speakPage, complete: completeChapter })[b.dataset.act]();
  });

  initGestures();
  // Text fills the page, so the strips above and below it toggle the controls (Books' tap-to-show chrome).
  R.el.addEventListener('click', (e) => {
    if (e.target.closest('button, #page-area, .popover, .wpop, .tips')) return;
    toggleMenu(false);
    R.el.classList.toggle('immersive');
  });
  addEventListener('keydown', (e) => {
    if (R.el.hidden || sheetOpen() || R.busy || R.area.querySelector('.curl') || e.target.matches('input, textarea, select')) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    if (e.key === 'Escape') closeReader();
  });
  let rz;
  addEventListener('resize', () => { if (R.el.hidden) return; clearTimeout(rz); rz = setTimeout(() => relayout(true), 150); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyAppearance);

  // Live status updates: recolour every occurrence of a changed word.
  onChange((terms, prev, next) => {
    if (R.el.hidden) return;
    if ((prev && prev.phrase) || (next && next.phrase)) { rerender(); return; }
    for (const t of terms) {
      const s = statusOf(t);
      const cls = s === 0 ? ' s0' : s >= 1 && s <= 4 ? ` s${s}` : '';
      for (const sp of R.content.querySelectorAll(`.w[data-w="${CSS.escape(t)}"]`)) {
        sp.className = 'w' + cls + (sp.dataset.ph ? ' ph' : '') + (sp.classList.contains('sel') ? ' sel' : '');
      }
    }
  });
}

export async function openReader(book, onExit) {
  R.book = book; R.onExit = onExit;
  book.lastOpened = Date.now();
  db.put('books', book);
  R.el.hidden = false;
  R.el.classList.add('immersive');
  applyAppearance();
  $('#r-title').textContent = book.title;
  await loadChapter(book.progress?.chapter || 0, { frac: book.progress?.frac || 0 });
  startReadingClock();
  showTipsOnce();
}

export function closeReader() {
  stopSpeaking(); R.speaking = false;
  closeSheet(); closeBubble(); toggleMenu(false); clearPhrase();
  $('.tips', R.el)?.remove();
  saveProgress();
  stopReadingClock();
  R.el.hidden = true;
  R.content.innerHTML = '';
  delete document.documentElement.dataset.appearance;
  R.onExit && R.onExit();
}

function applyAppearance() {
  const th = THEMES[settings.theme] || THEMES.original;
  R.el.dataset.theme = settings.theme;
  R.el.classList.toggle('dark', dark());
  // Sheets opened from the reader follow its appearance, like Books.
  if (!R.el.hidden) document.documentElement.dataset.appearance = dark() ? 'dark' : 'light';
  R.el.classList.toggle('no-hl', !settings.highlights);
  R.el.dataset.hl = settings.hlStyle;
  const font = FONTS[settings.font] || FONTS.original;
  const st = R.el.style;
  st.setProperty('--font', font.css);
  st.setProperty('--size', settings.size + 'px');
  st.setProperty('--lh', settings.lineHeight);
  st.setProperty('--margin', settings.margin + 'px');
  st.setProperty('--align', settings.justify ? 'justify' : 'left');
  st.setProperty('--para', settings.paraSpace);
  st.setProperty('--weight', th.weight || 400);
  document.querySelector('meta[name=theme-color]:not([media])')?.remove();
  const m = document.createElement('meta');
  m.name = 'theme-color'; m.content = dark() ? th.dbg : th.bg;
  document.head.appendChild(m);
}

// ---------- Rendering & pagination ----------
async function loadChapter(idx, { frac = 0, last = false, anchor = null } = {}) {
  idx = Math.max(0, Math.min(idx, R.book.chapterCount - 1));
  R.ch = idx;
  R.chapter = await db.get('chapters', `${R.book.id}:${idx}`);
  R.seenPages = new Set();
  render();
  await document.fonts?.ready;
  layout();
  if (anchor != null) R.page = pageOfIndex(anchor);
  else R.page = last ? R.pages - 1 : Math.round(frac * Math.max(0, R.pages - 1));
  goTo(R.page, false);
  saveProgress();
}

function render() {
  const ph = phrases();
  const blocks = R.chapter.blocks;
  let html = '', i = 0, first = true;
  // Only show the chapter title as a heading when the text doesn't begin with one already.
  if (blocks[0]?.t !== 'h') html += `<h1><span class="chap-kicker">${esc(R.book.title)}</span>${esc(R.chapter.title)}</h1>`;
  for (const b of blocks) {
    if (b.t === 'h') {
      html += `<${i === 0 ? 'h1' : 'h2'}>${paragraphHTML(b.x, statusOf, ph)}</${i === 0 ? 'h1' : 'h2'}>`;
      first = true;
    } else {
      html += `<p${first ? ' class="first"' : ''}>${paragraphHTML(b.x, statusOf, ph)}</p>`;
      first = false;
    }
    i++;
  }
  const nextTitle = R.book.chapterTitles[R.ch + 1];
  html += `<div class="chapter-end">${nextTitle ? `FINE DEL CAPITOLO<br>Next: ${esc(nextTitle)}` : 'FINE'}</div><span class="end"></span>`;
  R.content.innerHTML = html;
  R.spans = $$('.w', R.content);
  R.spans.forEach((s, k) => { s.dataset.i = k; });
  $('#r-running').textContent = R.chapter.title;
}

function layout() {
  const W = R.area.clientWidth - 2 * settings.margin;
  const H = R.area.clientHeight;
  const twoUp = R.area.clientWidth >= 900;
  const gap = 2 * settings.margin;
  R.content.style.height = H + 'px';
  R.content.style.columnGap = gap + 'px';
  // Wide screens (iPad landscape / desktop) show two columns per page, like Books.
  R.content.style.columnWidth = (twoUp ? (W - gap) / 2 : W) + 'px';
  R.step = W + gap;
  R.content.classList.remove('animate');
  R.content.style.transform = 'translateX(0)';
  const end = $('.end', R.content);
  const base = R.content.getBoundingClientRect().left;
  const x = end.getBoundingClientRect().left - base;
  R.pages = Math.max(1, Math.floor((x + 1) / R.step) + 1);
  R.pageOf = null; // computed lazily
  // What a "page" means for reading goals: the words that fit on one at this text size.
  if (R.pages >= 3) {
    const wpp = Math.round(R.spans.length / (R.pages - 0.5));
    if (Math.abs(wpp - (settings.wordsPerPage || 0)) > 3) settings.wordsPerPage = wpp;
  }
}

function computePageOf() {
  // Column position of every word, independent of the current translateX.
  const left0 = R.content.getBoundingClientRect().left - currentOffset();
  R.pageOf = new Int32Array(R.spans.length);
  for (let k = 0; k < R.spans.length; k++) {
    const x = R.spans[k].getBoundingClientRect().left - left0;
    R.pageOf[k] = Math.max(0, Math.floor((x + 2) / R.step));
  }
}
function currentOffset() {
  const m = /translateX\((-?[\d.]+)px\)/.exec(R.content.style.transform);
  return m ? +m[1] : 0;
}
function pageOfIndex(i) {
  if (!R.pageOf) computePageOf();
  return Math.min(R.pages - 1, R.pageOf[Math.min(i, R.pageOf.length - 1)] || 0);
}
function spansOnPage(p) {
  if (!R.pageOf) computePageOf();
  const out = [];
  for (let k = 0; k < R.spans.length; k++) if (R.pageOf[k] === p) out.push(R.spans[k]);
  return out;
}

function relayout(keep) {
  const anchor = keep ? firstIndexOnPage() : null;
  render();
  layout();
  R.page = anchor != null ? pageOfIndex(anchor) : Math.min(R.page, R.pages - 1);
  goTo(R.page, false);
}
function rerender() { relayout(true); }
function firstIndexOnPage() {
  const s = spansOnPage(R.page)[0];
  return s ? +s.dataset.i : null;
}

function goTo(p, animate = true) {
  R.page = Math.max(0, Math.min(p, R.pages - 1));
  R.content.classList.toggle('animate', animate);
  R.content.style.transform = `translateX(${-R.page * R.step}px)`;
  updateFooter();
}

function updateFooter() {
  const left = R.pages - R.page - 1;
  $('#r-pageno').textContent = `${R.page + 1} of ${R.pages}` + (left > 0 ? `  ·  ${left} ${left === 1 ? 'page' : 'pages'} left in chapter` : '');
}

// ---------- Navigation ----------
const twoUp = () => R.area.clientWidth >= 900;
const canCurl = (dir) => settings.pageTurn === 'curl' && !twoUp() && (dir > 0 ? R.page < R.pages - 1 : R.page > 0);
const whileBusy = async (fn) => { R.busy = true; try { await fn(); } finally { R.busy = false; } };

async function next(session) {
  if (R.busy) return;
  closeSheet(); closeBubble(); clearPhrase();
  leavePage(R.page);
  if (R.page < R.pages - 1) { await whileBusy(() => turnWithin(1, session)); saveProgress(); return; }
  if (R.ch < R.book.chapterCount - 1) {
    markChapterDone(R.ch);
    await whileBusy(() => transition(() => loadChapter(R.ch + 1, { frac: 0 }), 1));
  } else {
    markChapterDone(R.ch);
    goTo(R.page);
    saveProgress(true);
    toast('You finished the book! 🎉');
  }
}
async function prev(session) {
  if (R.busy) return;
  closeSheet(); closeBubble(); clearPhrase();
  if (R.page > 0) { await whileBusy(() => turnWithin(-1, session)); saveProgress(); return; }
  if (R.ch > 0) await whileBusy(() => transition(() => loadChapter(R.ch - 1, { last: true }), -1));
  else goTo(0);
}

// One page forward (dir 1) or back (dir -1) inside the chapter, in the chosen page-turn style.
async function turnWithin(dir, session) {
  if (session) return endCurl(session, true);
  if (canCurl(dir)) return endCurl(beginCurl(dir), true, { ms: 420, lift: R.area.clientHeight * 0.08 });
  goTo(R.page + dir, settings.pageTurn !== 'none');
}

// Page curl: a copy of the turning page curls over the real content, which already shows the page beneath.
function beginCurl(dir, corner = 'bottom') {
  const turning = dir > 0 ? R.page : R.page - 1;
  const clone = R.content.cloneNode(true);
  clone.classList.remove('animate');
  clone.style.transform = `translateX(${-turning * R.step}px)`;
  clone.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel'));
  R.content.classList.remove('animate');
  R.content.style.transform = `translateX(${-(dir > 0 ? R.page + 1 : R.page) * R.step}px)`;
  const curl = createCurl(R.area, clone, corner);
  if (dir < 0) curl.set(-curl.W, curl.C.y); // the previous page starts fully turned away
  return { dir, curl };
}
async function endCurl({ dir, curl }, complete, { ms = 300, lift = 0 } = {}) {
  // Forward turns finish with the corner pulled all the way left; backward turns finish flat.
  const x = (dir > 0) === complete ? -curl.W : curl.W;
  await curl.animateTo(x, curl.C.y, ms, lift);
  curl.destroy();
  goTo(complete ? R.page + dir : R.page, false);
}
async function transition(fn, dir) {
  R.content.classList.add('animate');
  R.content.style.opacity = '0';
  R.content.style.transform = `translateX(${-R.page * R.step - dir * 40}px)`;
  await new Promise((r) => setTimeout(r, 160));
  await fn();
  R.content.style.opacity = '';
}

// LingQ: when you page forward, the blue words you skipped become Known (with Undo).
function leavePage(p) {
  if (R.seenPages.has(p)) return;
  R.seenPages.add(p);
  // Chapter titles aren't reading, so they never count.
  const spans = spansOnPage(p).filter((s) => !s.closest('h1, h2'));
  bump('wordsRead', spans.length);
  if (!settings.autoKnown) return;
  const blue = [...new Set(spans.filter((s) => statusOf(s.dataset.w) === 0).map((s) => s.dataset.w))];
  if (!blue.length) return;
  setMany(blue, 5).then((n) => {
    if (!n) return;
    bump('known', n);
    toast(`+${n} known word${n === 1 ? '' : 's'}`, {
      action: 'Undo',
      onAction: async () => {
        haptic();
        const back = await revertToNew(blue);
        bump('known', -back);
        bump('wordsRead', -spans.length);
        R.seenPages.delete(p);
        toast(`${back} word${back === 1 ? '' : 's'} back to new`);
      },
    });
  });
}

function markChapterDone(idx) {
  const pr = R.book.progress;
  pr.done = pr.done || [];
  if (!pr.done.includes(idx)) pr.done.push(idx);
}

// frac says which page to reopen at; read is how much of the chapter is behind you (for goals).
function saveProgress(finished = false) {
  if (!R.book) return;
  const frac = R.pages > 1 ? R.page / (R.pages - 1) : 0;
  const read = finished ? 1 : R.page / R.pages;
  R.book.progress = { ...R.book.progress, chapter: R.ch, page: R.page, frac, read };
  const cheers = trackProgress(R.book);
  db.put('books', R.book);
  cheers.forEach(cheer);
  badgesSoon();
}

// Badges depend on words just marked known and on the day's stats, so check once things settle.
let badgeTimer;
function badgesSoon() {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(async () => {
    const { fresh } = await checkBadges();
    if (R.el.hidden) return;
    for (const b of fresh) cheer({ icon: b.icon, title: 'Achievement unlocked!', sub: esc(b.title) });
  }, 2000);
}

// Goal and milestone celebrations drop in from the top, one after another, clear of the toasts.
const cheerQueue = [];
function cheer(c) {
  cheerQueue.push(c);
  if (cheerQueue.length === 1) showCheer();
}
function showCheer() {
  const c = cheerQueue[0]; if (!c) return;
  const el = $('#r-cheer');
  el.innerHTML = `<i>${c.icon}</i><div><b>${c.title}</b><span>${c.sub}</span></div>`;
  el.hidden = false;
  el.classList.remove('out');
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => { el.hidden = true; cheerQueue.shift(); showCheer(); }, 2900);
}

// ---------- Gestures ----------
function initGestures() {
  let sx = 0, sy = 0, st = 0, dragging = false, pid = null, lp = null, longPressed = false, target = null, session = null;
  const area = R.area;

  area.addEventListener('pointerdown', (e) => {
    if ((e.button && e.button !== 0) || R.busy) return;
    toggleMenu(false);
    pid = e.pointerId; sx = e.clientX; sy = e.clientY; st = performance.now();
    dragging = false; longPressed = false;
    target = e.target.closest('.w');
    clearTimeout(lp);
    if (target) lp = setTimeout(() => { longPressed = true; startPhrase(target); }, 480);
  });
  area.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    // After a long press the finger selects words instead of turning the page.
    if (longPressed) { extendSelection(e.clientX, e.clientY); return; }
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      dragging = true; clearTimeout(lp);
      area.setPointerCapture?.(pid);
      R.content.classList.remove('animate');
      closeBubble();
      const dir = dx < 0 ? 1 : -1;
      if (canCurl(dir)) {
        const ar = area.getBoundingClientRect();
        session = beginCurl(dir, sy - ar.top < ar.height / 2 ? 'top' : 'bottom');
      }
    }
    if (Math.abs(dy) > 12 && !dragging) clearTimeout(lp);
    if (dragging && session) {
      // The page corner follows the finger; vertical movement tilts the fold.
      const { curl } = session;
      const x = session.dir > 0 ? curl.W + dx * 1.25 : -curl.W + dx * 2;
      curl.set(x, curl.C.y + dy * 0.6);
      return;
    }
    if (dragging) {
      let d = dx;
      const atStart = R.page === 0 && R.ch === 0, atEnd = R.page === R.pages - 1 && R.ch === R.book.chapterCount - 1;
      if ((d > 0 && atStart) || (d < 0 && atEnd)) d *= 0.3;
      R.content.style.transform = `translateX(${-R.page * R.step + d}px)`;
    }
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null; clearTimeout(lp);
    const dx = e.clientX - sx, dt = performance.now() - st;
    if (dragging) {
      const v = Math.abs(dx) / dt;
      // A flick needs real travel: a tap that wobbles a few pixels must not turn the page.
      const fwd = dx < -60 || (dx < -30 && v > 0.4), back = dx > 60 || (dx > 30 && v > 0.4);
      if (session) {
        const s = session; session = null;
        if (s.dir > 0 ? fwd : back) s.dir > 0 ? next(s) : prev(s);
        else whileBusy(() => endCurl(s, false));
        return;
      }
      if (fwd) next();
      else if (back) prev();
      else goTo(R.page);
      return;
    }
    if (longPressed) { if (e.type !== 'pointercancel') endSelection(); return; }
    if (e.type === 'pointercancel') return;
    onTap(e, target);
  };
  area.addEventListener('pointerup', end);
  area.addEventListener('pointercancel', end);
  area.addEventListener('contextmenu', (e) => e.preventDefault());
}

function onTap(e, wordEl) {
  if (sheetOpen()) { closeSheet(); return; }
  if (wordEl && R.phraseStart) { finishPhrase(wordEl); return; }
  if (wordEl) { openWord(wordEl); return; }
  if (bubbleOpen()) { closeBubble(); return; }
  // A second tap right after the bubble or card closed (say, a double tap on ✓) is meant for them, not the page.
  if (performance.now() - Math.max(bubbleClosedAt(), sheetClosedAt()) < 450) return;
  clearPhrase();
  const w = R.area.clientWidth, x = e.clientX;
  if (x < w * 0.22) prev();
  else if (x > w * 0.78) next();
  else R.el.classList.toggle('immersive');
}

function sentenceOf(el) {
  return (el.closest('.sent')?.textContent || el.parentElement.textContent).trim();
}
// Every sentence a selection touches, so a phrase is saved with its full context.
function contextOf(spans) {
  return [...new Set(spans.map((s) => s.closest('.sent')))].map((s) => s.textContent.trim()).join(' ');
}
// The text exactly as printed between two words, punctuation included.
function textBetween(a, b) {
  const r = document.createRange();
  r.setStartBefore(a); r.setEndAfter(b);
  return r.toString().replace(/\s+/g, ' ').replace(/’/g, "'").trim();
}
const blockOf = (el) => el.closest('p, h1, h2');

// Tapping a word shows the quick bubble; its "⋯" (or the word itself) opens the full card.
function openWord(el) {
  el.classList.add('sel');
  openBubble({
    anchor: el, container: R.el, term: el.dataset.w,
    display: el.textContent.replace(/’/g, "'"), context: sentenceOf(el),
    onClose: () => el.classList.remove('sel'),
    onExpand: () => openWordFull(el),
  });
}

function openWordFull(el) {
  const term = el.dataset.w;
  el.classList.add('sel');
  const inPhrase = el.dataset.ph && el.dataset.ph !== term ? el.dataset.ph : null;
  openWordCard({
    term, display: el.textContent.replace(/’/g, "'"), context: sentenceOf(el), inPhrase,
    onClose: () => el.classList.remove('sel'),
    onOpenPhrase: () => {
      const spans = R.content.querySelectorAll(`.w[data-ph="${CSS.escape(inPhrase)}"]`);
      openPhraseCard(inPhrase, [...spans].filter((s) => blockOf(s) === blockOf(el)), sentenceOf(el));
    },
    onSaveSentence: () => openSentenceCard(el),
  });
}

// LingQ lets you save a whole sentence as one LingQ, with its translation as the meaning.
function openSentenceCard(el) {
  const spans = [...(el.closest('.sent') || blockOf(el)).querySelectorAll('.w')];
  if (spans.length < 2) return;
  openPhraseCard(spans.map((s) => s.dataset.w).join(' '), spans, sentenceOf(el));
}

// Phrases: hold a word, then drag across the phrase (or lift and tap its last word).
function startPhrase(el) {
  clearPhrase();
  R.phraseStart = el;
  paintSelection(+el.dataset.i, +el.dataset.i);
  closeBubble();
  haptic();
  toast('Drag to select a phrase, or tap its last word');
}
function extendSelection(x, y) {
  if (!R.phraseStart) return;
  const el = document.elementFromPoint(x, y)?.closest?.('.w');
  if (!el || !R.content.contains(el) || el === R.selEnd || blockOf(el) !== blockOf(R.phraseStart)) return;
  const a = +R.phraseStart.dataset.i;
  let b = +el.dataset.i;
  if (Math.abs(b - a) > MAX_PHRASE - 1) b = a + Math.sign(b - a) * (MAX_PHRASE - 1);
  R.selEnd = R.spans[b];
  paintSelection(Math.min(a, b), Math.max(a, b));
}
function endSelection() {
  const end = R.selEnd;
  R.selEnd = null;
  // Lifted without dragging: stay in "tap the last word" mode.
  if (end && end !== R.phraseStart) finishPhrase(end);
}
function paintSelection(a, b) {
  for (const s of R.selSpans) s.classList.remove('sel');
  R.selSpans = R.spans.slice(a, b + 1);
  for (const s of R.selSpans) s.classList.add('sel');
}
// Long enough for a whole sentence or two; phrase underlines are matched within one paragraph.
const MAX_PHRASE = 60;
function finishPhrase(el) {
  let a = +R.phraseStart.dataset.i, b = +el.dataset.i;
  if (a > b) [a, b] = [b, a];
  if (blockOf(el) !== blockOf(R.phraseStart)) { toast('A phrase has to stay inside one paragraph'); clearPhrase(); return; }
  if (b - a > MAX_PHRASE - 1) { toast(`Phrases can be up to ${MAX_PHRASE} words`); clearPhrase(); return; }
  if (a === b) { const s = R.phraseStart; clearPhrase(); openWordFull(s); return; }
  const spans = R.spans.slice(a, b + 1);
  R.phraseStart = null;
  R.selSpans = []; // the phrase card owns the highlight from here
  const term = spans.map((s) => s.dataset.w).join(' ');
  openPhraseCard(term, spans, contextOf(spans));
}
function openPhraseCard(term, spans, context) {
  spans.forEach((s) => s.classList.add('sel'));
  const display = textBetween(spans[0], spans[spans.length - 1]);
  openWordCard({ term, display, phrase: true, context, onClose: () => spans.forEach((s) => s.classList.remove('sel')) });
}
function clearPhrase() {
  for (const s of R.selSpans) s.classList.remove('sel');
  R.selSpans = [];
  R.phraseStart = null;
  R.selEnd = null;
}

// First-run tips (Settings › "Show reading tips again" brings them back).
const TIPS_KEY = 'langreader.tipsSeen';
function showTipsOnce() {
  try { if (localStorage.getItem(TIPS_KEY)) return; } catch { return; }
  const el = document.createElement('div');
  el.className = 'tips';
  el.innerHTML = `
    <h3>Reading tips</h3>
    <ul>
      <li><b>Tap a word</b> to see its meaning. Tap 1–4 to save it as a LingQ.</li>
      <li><b>Hold a word and drag</b> to select a phrase or a whole sentence. It's saved with its sentence.</li>
      <li><b>Swipe or tap the edges</b> to turn the page. Blue words you skip become known, and you can undo.</li>
      <li><b>☰ Menu</b>, bottom right: themes, page translation and listening.</li>
    </ul>
    <button class="primary">Got it</button>`;
  el.querySelector('button').addEventListener('click', (e) => {
    e.stopPropagation();
    haptic();
    try { localStorage.setItem(TIPS_KEY, '1'); } catch {}
    el.remove();
  });
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  R.el.appendChild(el);
}

// ---------- Menu & sheets ----------
function toggleMenu(force) {
  const pop = $('#r-menu-pop');
  pop.hidden = force === undefined ? !pop.hidden : !force;
  if (!pop.hidden) {
    const s = R.book && goalSummary(R.book);
    $('[data-act=goal] span', pop).textContent = !s ? 'Reading Goal' : s.met ? 'Reading Goal · done ✓' : `Reading Goal · ${s.today}/${s.pages}`;
  }
}

function contentsSheet() {
  const done = new Set(R.book.progress.done || []);
  const body = openSheet(`
    <h2>${esc(R.book.title)}<button class="x">${icons.close}</button></h2>
    <div class="toc">${R.book.chapterTitles.map((t, i) => `
      <button data-i="${i}" class="${i === R.ch ? 'cur' : ''}"><span>${esc(t)}</span>
      <small>${done.has(i) ? '✓ ' : ''}${R.book.chapterWords?.[i] ?? ''} words</small></button>`).join('')}
    </div>`);
  body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.x')) return closeSheet();
    closeSheet();
    loadChapter(+b.dataset.i, { frac: 0 });
  });
}

function themesSheet() {
  const fontOpts = Object.entries(FONTS).map(([k, f]) => `<option value="${k}" ${settings.font === k ? 'selected' : ''}>${f.name}</option>`).join('');
  const voices = voicesForLang();
  const body = openSheet(`
    <h2>Themes &amp; Settings<button class="x">${icons.close}</button></h2>
    <div class="ts-row">
      <div class="size-btns"><button class="small" data-size="-1">A</button><button class="large" data-size="1">A</button></div>
      <button class="icon-toggle ${settings.highlights ? 'on' : ''}" data-tog="highlights" aria-label="Word highlights">${icons.hl}</button>
      <button class="icon-toggle ${dark() ? 'on' : ''}" data-tog="dark" aria-label="Dark appearance">${icons.moon}</button>
    </div>
    <div class="themes">${Object.entries(THEMES).map(([k, t]) => `
      <button class="theme ${settings.theme === k ? 'on' : ''}" data-theme="${k}"
        style="--tb:${dark() ? t.dbg : t.bg};--tf:${dark() ? t.dfg : t.fg};--tfont:${(FONTS[t.font] || FONTS.original).css};--tw:${t.weight || 400}">
        <b>Aa</b><span>${t.name}</span></button>`).join('')}
    </div>
    <div class="ts-group">
      <label class="ts-item"><span class="lbl">Font</span><select data-set="font">${fontOpts}</select></label>
      <label class="ts-item"><span class="lbl">Line Spacing</span><input type="range" min="1.2" max="2.1" step="0.05" value="${settings.lineHeight}" data-set="lineHeight"></label>
      <label class="ts-item"><span class="lbl">Margins</span><input type="range" min="12" max="56" step="2" value="${settings.margin}" data-set="margin"></label>
      <label class="ts-item"><span class="lbl">Paragraph Spacing</span><input type="range" min="0" max="1.2" step="0.1" value="${settings.paraSpace}" data-set="paraSpace"></label>
      <label class="ts-item"><span class="lbl">Page Turn</span><select data-set="pageTurn">${[['curl', 'Curl'], ['slide', 'Slide'], ['none', 'None']].map(([k, n]) => `<option value="${k}" ${settings.pageTurn === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="ts-item"><span class="lbl">Word Highlights</span><select data-set="hlStyle">${[['underline', 'Underline'], ['background', 'Background']].map(([k, n]) => `<option value="${k}" ${settings.hlStyle === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="ts-item"><span class="lbl">Justify Text</span><span class="switch"><input type="checkbox" data-set="justify" ${settings.justify ? 'checked' : ''}><i></i></span></label>
    </div>
    <div class="ts-group">
      <label class="ts-item"><span class="lbl">Page turn marks blue words known<small>LingQ: words you skip past count as known</small></span><span class="switch"><input type="checkbox" data-set="autoKnown" ${settings.autoKnown ? 'checked' : ''}><i></i></span></label>
      <label class="ts-item"><span class="lbl">Haptics</span><span class="switch"><input type="checkbox" data-set="haptics" ${settings.haptics ? 'checked' : ''}><i></i></span></label>
      <label class="ts-item"><span class="lbl">Translate into</span><select data-set="target">${Object.entries(TARGETS).map(([k, n]) => `<option value="${k}" ${settings.target === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="ts-item"><span class="lbl">Speech Rate</span><input type="range" min="0.5" max="1.3" step="0.05" value="${settings.rate}" data-set="rate"></label>
      ${voices.length ? `<label class="ts-item"><span class="lbl">Voice</span><select data-set="voice"><option value="">Automatic</option>${voices.map((v) => `<option ${settings.voice === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>` : ''}
    </div>`, { transparent: true });

  body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.x')) return closeSheet();
    if (b.dataset.size) {
      settings.size = Math.max(14, Math.min(34, settings.size + 2 * +b.dataset.size));
      applyAppearance(); relayout(true);
    } else if (b.dataset.theme) {
      settings.theme = b.dataset.theme;
      const t = THEMES[b.dataset.theme];
      if (t.font) settings.font = t.font; else if (['palatino', 'charter'].includes(settings.font)) settings.font = 'original';
      $('select[data-set=font]', body).value = settings.font;
      $$('.theme', body).forEach((x) => x.classList.toggle('on', x === b));
      applyAppearance(); relayout(true);
    } else if (b.dataset.tog === 'highlights') {
      settings.highlights = !settings.highlights; b.classList.toggle('on', settings.highlights); applyAppearance();
    } else if (b.dataset.tog === 'dark') {
      settings.appearance = dark() ? 'light' : 'dark';
      b.classList.toggle('on', dark()); applyAppearance();
      $$('.theme', body).forEach((x) => { const t = THEMES[x.dataset.theme]; x.style.setProperty('--tb', dark() ? t.dbg : t.bg); x.style.setProperty('--tf', dark() ? t.dfg : t.fg); });
    }
  });
  body.addEventListener('input', (e) => {
    const k = e.target.dataset.set; if (!k) return;
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? +e.target.value : e.target.value;
    settings[k] = v;
    if (['font', 'lineHeight', 'margin', 'paraSpace', 'justify'].includes(k)) { applyAppearance(); relayoutSoon(); }
    if (k === 'hlStyle') applyAppearance();
  });
}
let rl;
function relayoutSoon() { clearTimeout(rl); rl = setTimeout(() => relayout(true), 120); }

function pageWordsSheet() {
  const spans = spansOnPage(R.page);
  const uniq = new Map();
  for (const s of spans) if (!uniq.has(s.dataset.w)) uniq.set(s.dataset.w, s);
  const rows = [...uniq.entries()].filter(([t]) => { const st = statusOf(t); return st >= 0 && st <= 4; });
  rows.sort((a, b) => (statusOf(a[0]) || 9) - (statusOf(b[0]) || 9));
  const pill = (t) => { const s = statusOf(t); return s === 0 ? '<span class="pill" style="background:rgba(80,150,255,.25);color:var(--blue)">New</span>' : `<span class="pill s${s}">${s}</span>`; };
  const blue = rows.filter(([t]) => statusOf(t) === 0).length;
  const body = openSheet(`
    <h2>On This Page<button class="x">${icons.close}</button></h2>
    ${blue ? `<button class="secondary" data-all style="margin-bottom:12px">Mark ${blue} new word${blue === 1 ? '' : 's'} as known</button>` : ''}
    <div class="page-words">${rows.length ? rows.map(([t, s]) => `
      <button class="row" data-i="${s.dataset.i}"><div class="txt"><div class="w">${esc(s.textContent)}</div>
      <div class="m">${esc(entry(t)?.meaning || '')}</div></div>${pill(t)}</button>`).join('') : '<p class="muted">Every word on this page is known. Bravo!</p>'}</div>`);
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.x')) return closeSheet();
    if (b.dataset.all != null) {
      const n = await setMany(rows.filter(([t]) => statusOf(t) === 0).map(([t]) => t), 5);
      bump('known', n); closeSheet(); toast(`+${n} known`);
      return;
    }
    if (b.dataset.i) { closeSheet(); setTimeout(() => openWord(R.spans[+b.dataset.i]), 200); }
  });
}

function sentencesOnPage() {
  const sents = [];
  for (const s of spansOnPage(R.page)) {
    const el = s.closest('.sent');
    if (el && !sents.includes(el)) sents.push(el);
  }
  return sents;
}

async function translatePage() {
  const sents = sentencesOnPage().map((s) => s.textContent.trim()).filter(Boolean);
  const body = openSheet(`<h2>Page Translation<button class="x">${icons.close}</button></h2>
    <a class="secondary gt-page" href="${googleTranslateURL(sents.join(' '))}" target="_blank" rel="noopener">Open in Google Translate ↗</a>
    <div class="trans-block">Translating…</div>`);
  $('.x', body).onclick = closeSheet;
  // MyMemory accepts up to ~500 characters per request: batch sentences.
  const chunks = [];
  let cur = '';
  for (const s of sents) { if ((cur + ' ' + s).length > 450 && cur) { chunks.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s; }
  if (cur) chunks.push(cur);
  const out = [];
  const box = $('.trans-block', body);
  for (const c of chunks) {
    try { out.push((await translate(c)).main); } catch (e) { out.push('[' + (e.message || 'offline') + ']'); }
    if (box.isConnected) box.textContent = out.join(' ');
  }
}

function speakPage() {
  if (R.speaking) { stopSpeaking(); R.speaking = false; $$('.speaking', R.content).forEach((s) => s.classList.remove('speaking')); return; }
  const sents = sentencesOnPage();
  if (!sents.length) return;
  R.speaking = true;
  let i = 0;
  const step = () => {
    $$('.speaking', R.content).forEach((s) => s.classList.remove('speaking'));
    if (!R.speaking || i >= sents.length) { R.speaking = false; return; }
    const el = sents[i++];
    el.classList.add('speaking');
    speak(el.textContent, { onend: step });
  };
  step();
  toast('Reading aloud — choose again to stop');
}

async function completeChapter() {
  const blue = new Set();
  for (const s of R.spans) if (statusOf(s.dataset.w) === 0) blue.add(s.dataset.w);
  const n = settings.autoKnown ? await setMany([...blue], 5) : 0;
  bump('known', n);
  let unread = 0;
  for (let p = 0; p < R.pages; p++) if (!R.seenPages.has(p)) { unread += spansOnPage(p).length; R.seenPages.add(p); }
  bump('wordsRead', unread);
  markChapterDone(R.ch);
  saveProgress(R.ch === R.book.chapterCount - 1);
  toast(n ? `Chapter complete · +${n} known` : 'Chapter complete');
  if (R.ch < R.book.chapterCount - 1) setTimeout(() => transition(() => loadChapter(R.ch + 1), 1), 700);
}
