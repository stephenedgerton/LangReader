// Paginated reader: Apple Books look & gestures + LingQ word interaction.
import { db } from './db.js';
import { settings, FONTS, THEMES, TARGETS } from './settings.js';
import { paragraphHTML } from './text.js';
import { statusOf, phrases, onChange, setMany, entry } from './vocab.js';
import { openSheet, closeSheet, sheetOpen, toast, esc, icons, $, $$ } from './ui.js';
import { openWordCard } from './wordcard.js';
import { translate, speak, stopSpeaking, voicesForLang } from './services.js';
import { bump, startReadingClock, stopReadingClock } from './stats.js';

const R = {
  el: null, area: null, content: null,
  book: null, ch: 0, chapter: null,
  page: 0, pages: 1, step: 0,
  spans: [], pageOf: null, seenPages: new Set(),
  anchor: null, phraseStart: null, onExit: null, speaking: false,
};

const dark = () => settings.appearance === 'dark' || (settings.appearance === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);

export function initReader() {
  R.el = $('#reader');
  R.area = $('#page-area');
  R.content = $('#page-content');

  $('#r-close').addEventListener('click', closeReader);
  $('#r-menu').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  $('#r-vocab').addEventListener('click', pageWordsSheet);
  $('#r-menu-pop').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    toggleMenu(false);
    ({ contents: contentsSheet, themes: themesSheet, 'translate-page': translatePage, 'speak-page': speakPage, complete: completeChapter })[b.dataset.act]();
  });

  initGestures();
  // Text fills the page, so the strips above and below it toggle the controls (Books' tap-to-show chrome).
  R.el.addEventListener('click', (e) => {
    if (e.target.closest('button, #page-area, .popover')) return;
    toggleMenu(false);
    R.el.classList.toggle('immersive');
  });
  addEventListener('keydown', (e) => {
    if (R.el.hidden || sheetOpen() || e.target.matches('input, textarea, select')) return;
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
}

export function closeReader() {
  stopSpeaking(); R.speaking = false;
  closeSheet(); toggleMenu(false);
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
async function next() {
  closeSheet();
  clearPhrase();
  leavePage(R.page);
  if (R.page < R.pages - 1) { goTo(R.page + 1); saveProgress(); return; }
  if (R.ch < R.book.chapterCount - 1) {
    markChapterDone(R.ch);
    await transition(() => loadChapter(R.ch + 1, { frac: 0 }), 1);
  } else {
    markChapterDone(R.ch);
    goTo(R.page);
    toast('You finished the book! 🎉');
  }
}
async function prev() {
  closeSheet();
  clearPhrase();
  if (R.page > 0) { goTo(R.page - 1); saveProgress(); return; }
  if (R.ch > 0) await transition(() => loadChapter(R.ch - 1, { last: true }), -1);
  else goTo(0);
}
async function transition(fn, dir) {
  R.content.classList.add('animate');
  R.content.style.opacity = '0';
  R.content.style.transform = `translateX(${-R.page * R.step - dir * 40}px)`;
  await new Promise((r) => setTimeout(r, 160));
  await fn();
  R.content.style.opacity = '';
}

// LingQ: when you page forward, the blue words you skipped become Known.
function leavePage(p) {
  if (R.seenPages.has(p)) return;
  R.seenPages.add(p);
  const spans = spansOnPage(p);
  bump('wordsRead', spans.length);
  if (!settings.autoKnown) return;
  const blue = new Set();
  for (const s of spans) if (statusOf(s.dataset.w) === 0) blue.add(s.dataset.w);
  if (!blue.size) return;
  setMany([...blue], 5).then((n) => {
    if (n) { bump('known', n); toast(`+${n} known word${n === 1 ? '' : 's'}`); }
  });
}

function markChapterDone(idx) {
  const pr = R.book.progress;
  pr.done = pr.done || [];
  if (!pr.done.includes(idx)) pr.done.push(idx);
}

function saveProgress() {
  if (!R.book) return;
  const frac = R.pages > 1 ? R.page / (R.pages - 1) : 0;
  R.book.progress = { ...R.book.progress, chapter: R.ch, page: R.page, frac };
  db.put('books', R.book);
}

// ---------- Gestures ----------
function initGestures() {
  let sx = 0, sy = 0, st = 0, dragging = false, pid = null, lp = null, longPressed = false, target = null;
  const area = R.area;

  area.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    toggleMenu(false);
    pid = e.pointerId; sx = e.clientX; sy = e.clientY; st = performance.now();
    dragging = false; longPressed = false;
    target = e.target.closest('.w');
    clearTimeout(lp);
    if (target) lp = setTimeout(() => { longPressed = true; startPhrase(target); }, 480);
  });
  area.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      dragging = true; clearTimeout(lp);
      area.setPointerCapture?.(pid);
      R.content.classList.remove('animate');
    }
    if (Math.abs(dy) > 12 && !dragging) clearTimeout(lp);
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
      if (dx < -60 || (dx < -15 && v > 0.4)) next();
      else if (dx > 60 || (dx > 15 && v > 0.4)) prev();
      else goTo(R.page);
      return;
    }
    if (longPressed || e.type === 'pointercancel') return;
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
  clearPhrase();
  const w = R.area.clientWidth, x = e.clientX;
  if (x < w * 0.22) prev();
  else if (x > w * 0.78) next();
  else R.el.classList.toggle('immersive');
}

function sentenceOf(el) {
  return (el.closest('.sent')?.textContent || el.parentElement.textContent).trim();
}

function openWord(el) {
  const term = el.dataset.w;
  el.classList.add('sel');
  const inPhrase = el.dataset.ph && el.dataset.ph !== term ? el.dataset.ph : null;
  openWordCard({
    term, display: el.textContent.replace(/’/g, "'"), context: sentenceOf(el), inPhrase,
    onClose: () => el.classList.remove('sel'),
    onOpenPhrase: () => {
      const spans = R.content.querySelectorAll(`.w[data-ph="${CSS.escape(inPhrase)}"]`);
      openPhraseCard(inPhrase, [...spans].filter((s) => s.closest('.sent') === el.closest('.sent')), sentenceOf(el));
    },
  });
}

// Long-press a word, then tap the last word: creates a phrase LingQ (LingQ's multi-word selection).
function startPhrase(el) {
  clearPhrase();
  R.phraseStart = el;
  el.classList.add('sel');
  navigator.vibrate?.(10);
  toast('Tap the last word of the phrase');
}
function finishPhrase(el) {
  let a = +R.phraseStart.dataset.i, b = +el.dataset.i;
  if (a > b) [a, b] = [b, a];
  if (b - a > 11) { toast('Phrases can be up to 12 words'); clearPhrase(); return; }
  if (a === b) { const s = R.phraseStart; clearPhrase(); openWord(s); return; }
  const spans = R.spans.slice(a, b + 1);
  R.phraseStart = null;
  const term = spans.map((s) => s.dataset.w).join(' ');
  openPhraseCard(term, spans, sentenceOf(spans[0]));
}
function openPhraseCard(term, spans, context) {
  spans.forEach((s) => s.classList.add('sel'));
  let display = '';
  spans.forEach((s, k) => {
    const t = s.textContent.replace(/’/g, "'");
    display += (k && !/'$/.test(display) ? ' ' : '') + t;
  });
  openWordCard({ term, display, phrase: true, context, onClose: () => spans.forEach((s) => s.classList.remove('sel')) });
}
function clearPhrase() {
  if (R.phraseStart) R.phraseStart.classList.remove('sel');
  R.phraseStart = null;
}

// ---------- Menu & sheets ----------
function toggleMenu(force) {
  const pop = $('#r-menu-pop');
  pop.hidden = force === undefined ? !pop.hidden : !force;
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
      <label class="ts-item"><span class="lbl">Justify Text</span><span class="switch"><input type="checkbox" data-set="justify" ${settings.justify ? 'checked' : ''}><i></i></span></label>
    </div>
    <div class="ts-group">
      <label class="ts-item"><span class="lbl">Page turn marks blue words known<small>LingQ: words you skip past count as known</small></span><span class="switch"><input type="checkbox" data-set="autoKnown" ${settings.autoKnown ? 'checked' : ''}><i></i></span></label>
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
  const body = openSheet(`<h2>Page Translation<button class="x">${icons.close}</button></h2><div class="trans-block">Translating…</div>`);
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
  saveProgress();
  toast(n ? `Chapter complete · +${n} known` : 'Chapter complete');
  if (R.ch < R.book.chapterCount - 1) setTimeout(() => transition(() => loadChapter(R.ch + 1), 1), 700);
}
