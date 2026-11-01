import { db } from './db.js';
import { settings, TARGETS } from './settings.js';
import { loadVocab, counts, allEntries, entry, setWord, setMany, importVocab, onChange } from './vocab.js';
import { importText, importFile, saveBook } from './importer.js';
import { initReader, openReader } from './reader.js';
import { openWordCard, highlight } from './wordcard.js';
import { NAMES, NAMES_VERSION } from './names.js';
import { normalize } from './text.js';
import { getDays, streak, todayKey, bump } from './stats.js';
import { openSheet, closeSheet, initSheetGestures, esc, icons, coverHTML, $, $$ } from './ui.js';
import { SAMPLE } from '../samples/sample.js';
import { STORIES } from '../samples/stories.js';
import { haptic } from './haptics.js';
import { bookPct, goalSheet, goalSummary, goalCardHTML } from './goals.js';
import { fillDifficulty } from './difficulty.js';
import { checkBadges, achievementsCardHTML, achievementsSheet } from './achievements.js';
import { loadFreq, recordSnapshot } from './freq.js';
import { renderStats } from './statsview.js';
import { reviewSheet, todaysCount, reviewedToday } from './review.js';
import { requestPersistence, isPersisted, backupDue, backupAge, markBackedUp, snoozeBackup, saveFile } from './storage.js';

let tab = 'home';
let books = [];

async function boot() {
  await loadVocab();
  await ignoreNames();
  await addBundledStories();
  await checkBadges(); // the first check quietly records what you'd already earned
  initReader();
  initSheetGestures();
  $$('#tabbar button').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  onChange(() => { if (tab === 'vocab' && $('#reader').hidden) renderVocab(); });
  show(location.hash.slice(1) || 'home');
  loadFreq().then((d) => { if (d) recordSnapshot(); }); // also lets the reader mark common words

  requestPersistence();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// Bundled stories are each added once: new installs get them all, existing libraries get new ones.
// A story you delete stays deleted.
async function addBundledStories() {
  const KEY = 'langreader.samplesAdded';
  let added = [];
  try { added = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
  if (localStorage.getItem('langreader.seeded') && !added.includes(SAMPLE.id)) added.push(SAMPLE.id); // seeded before ids existed
  books = await db.all('books');
  const titles = new Set(books.map((b) => b.title));
  for (const s of [SAMPLE, ...STORIES]) {
    if (added.includes(s.id)) continue;
    if (!titles.has(s.title)) await saveBook(s);
    added.push(s.id);
  }
  try { localStorage.setItem(KEY, JSON.stringify(added)); localStorage.setItem('langreader.seeded', '1'); } catch {}
  books = await db.all('books');
}

// Common Italian names and the bundled stories' characters start out Ignored. Words you've
// already given a status keep it, and a name you un-ignore isn't ignored again.
async function ignoreNames(force = false) {
  const KEY = 'langreader.namesIgnored';
  try { if (!force && +localStorage.getItem(KEY) >= NAMES_VERSION) return 0; } catch {}
  const n = await setMany([...NAME_TERMS], -1);
  try { localStorage.setItem(KEY, String(NAMES_VERSION)); } catch {}
  return n;
}

// Words you've saved yourself: the names ignored at install don't need a backup reminder.
const NAME_TERMS = new Set(NAMES.map(normalize));
const savedCount = () => allEntries().filter((w) => !(w.status === -1 && NAME_TERMS.has(w.term))).length;

function show(t) {
  if (!['home', 'library', 'vocab', 'stats'].includes(t)) t = 'home';
  tab = t;
  history.replaceState(null, '', '#' + t);
  $$('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  $$('.view').forEach((v) => { v.hidden = v.dataset.tab !== t; });
  ({ home: renderHome, library: renderLibrary, vocab: renderVocab, stats: () => renderStats($('#view-stats')) })[t]();
}

async function refreshBooks() { books = await db.all('books'); }

function open(book, from) {
  zoomCover(book, from);
  $('#tabbar').hidden = true;
  openReader(book, async () => {
    $('#tabbar').hidden = false;
    if (await loadFreq()) recordSnapshot();
    await refreshBooks();
    show(tab);
  });
}

// Like Books: the tapped cover grows to fill the screen, then fades to show the page. The reader opens
// underneath straight away (transparent until the cover has grown), so input goes to it as usual.
function zoomCover(book, from) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cover = from?.querySelector('.cover') || $(`.view:not([hidden]) [data-open="${CSS.escape(book.id)}"] .cover`);
  const r = cover?.getBoundingClientRect();
  if (!r?.width) return;
  const fly = cover.cloneNode(true);
  fly.classList.add('cover-fly');
  // The cover's padding is a percentage of its width, so pin it before the clone leaves its shelf.
  Object.assign(fly.style, { padding: getComputedStyle(cover).padding, left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  document.body.appendChild(fly);
  cover.style.visibility = 'hidden';
  const reader = $('#reader');
  reader.style.opacity = '0';
  const done = () => { fly.remove(); cover.style.visibility = ''; reader.style.opacity = ''; };
  // One scale for both axes, so the cover keeps its shape: big enough to cover the screen, centred,
  // with whatever spills past the sides cut off by the edges of the screen.
  const k = Math.max(innerWidth / r.width, innerHeight / r.height);
  const x = (innerWidth - r.width * k) / 2 - r.left, y = (innerHeight - r.height * k) / 2 - r.top;
  fly.animate([
    { transform: 'none', borderRadius: '3px 6px 6px 3px' },
    { transform: `translate(${x}px, ${y}px) scale(${k})`, borderRadius: '0' },
  ], { duration: 440, easing: 'cubic-bezier(.32, .72, .16, 1)', fill: 'forwards' }).finished
    .then(() => { reader.style.opacity = ''; return fly.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' }).finished; })
    .then(done, done);
}

// ---------------- Home ----------------
async function renderHome() {
  const v = $('#view-home');
  await refreshBooks();
  const recent = books.filter((b) => b.lastOpened).sort((a, b) => b.lastOpened - a.lastOpened);
  const current = recent[0] || books.sort((a, b) => b.added - a.added)[0];
  const days = await getDays();
  const today = days.find((d) => d.date === todayKey()) || { seconds: 0, wordsRead: 0, known: 0, lingqs: 0 };
  const goal = settings.goalMinutes * 60;
  const mins = Math.floor(today.seconds / 60);
  const c = counts();
  const R = 40, C = 2 * Math.PI * R;
  const frac = Math.min(1, today.seconds / goal);
  const st = streak(days, goal);
  const goalBooks = recent.concat(books.filter((b) => !b.lastOpened)).filter((b) => b.goal);
  const achievements = await achievementsCardHTML();

  v.innerHTML = `
    <div class="view-head"><h1 class="large-title">Home</h1>
      <button class="circle-btn" data-act="settings" aria-label="Settings">${icons.gear}</button></div>
    ${current ? `
      <div class="hero-book">
        <button class="book" data-open="${current.id}">${coverHTML(current)}</button>
        <div class="hero-meta">
          <div class="kicker">${current.lastOpened ? 'Continue' : 'Start reading'} · ${bookPct(current)}%</div>
          <h3>${esc(current.title)}</h3>
          <div class="author">${esc(current.author || '')}</div>
          <div class="diff" data-diff="${current.id}"></div>
          <button class="resume" data-open="${current.id}">${current.lastOpened ? 'Resume' : 'Read'}</button>
        </div>
      </div>` : ''}
    ${backupDue(savedCount()) ? `
      <div class="card backup-card">
        <h4>Back up your vocabulary</h4>
        <p>${savedCount().toLocaleString()} words are saved only on this phone. Last backup: ${backupAge()}.</p>
        <div class="row-btns"><button class="primary" data-act="backup">Back Up Now</button><button class="secondary" data-act="snooze">Later</button></div>
      </div>` : ''}
    <div class="section-title">Reading Goals</div>
    <button class="card goal" data-act="goal" style="width:100%;text-align:left">
      <div class="ring"><svg viewBox="0 0 96 96"><circle class="track" cx="48" cy="48" r="${R}"/>
        <circle class="prog" cx="48" cy="48" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg></div>
      <div><h4>Today's Reading</h4><div class="big">${mins}:${String(today.seconds % 60).padStart(2, '0')}</div>
        <p>of your ${settings.goalMinutes}-minute goal${st ? ` · 🔥 ${st}-day streak` : ''}</p></div>
    </button>
    ${reviewCardHTML(c)}
    ${goalBooks.map(goalCardHTML).join('')}
    ${!goalBooks.length && current ? `<button class="card bgoal-add" data-goal="${current.id}">🎯 <span>Set a pages-a-day goal for <b>${esc(current.title)}</b></span></button>` : ''}
    <div class="section-title">Bookmarks</div>
    ${achievements}
    <div class="section-title">Your Italian</div>
    <div class="stats-grid">
      <div class="stat known"><div class="n">${c.known.toLocaleString()}</div><div class="l">Known words</div></div>
      <div class="stat lingq"><div class="n">${c.lingqs.toLocaleString()}</div><div class="l">LingQs (learning)</div></div>
      <div class="stat"><div class="n">${(today.wordsRead || 0).toLocaleString()}</div><div class="l">Words read today</div></div>
      <div class="stat"><div class="n">+${(today.known || 0).toLocaleString()}</div><div class="l">New known today</div></div>
    </div>
    ${recent.length > 1 ? `<div class="section-title">Recent<small></small></div>
      <div class="shelf">${recent.slice(1, 12).map((b) => `<button class="book" data-open="${b.id}">${coverHTML(b)}
        <div class="book-info"><span class="pct">${bookPct(b)}%</span></div></button>`).join('')}</div>` : ''}
  `;
  fillDifficulty(v, books);
  v.onclick = (e) => {
    const b = e.target.closest('[data-open],[data-act],[data-goal]'); if (!b) return;
    if (b.dataset.open) return open(books.find((x) => x.id === b.dataset.open), b);
    if (b.dataset.goal) return goalSheet(books.find((x) => x.id === b.dataset.goal), { onChange: renderHome });
    if (b.dataset.act === 'goal') return minutesSheet();
    if (b.dataset.act === 'review') return reviewSheet({ onClose: renderHome });
    if (b.dataset.act === 'achievements') return achievementsSheet();
    if (b.dataset.act === 'settings') return settingsSheet();
    if (b.dataset.act === 'backup') return exportAll().then(renderHome);
    if (b.dataset.act === 'snooze') { snoozeBackup(); return renderHome(); }
  };
}

// Today's reviews: only today's share, never the backlog, and about 6 s a card.
function reviewCardHTML(c) {
  if (!c.lingqs) return '';
  const n = todaysCount(), done = reviewedToday();
  // Done for today, but still a button: the sheet offers extra practice for anyone who wants more.
  if (!n) return done ? `<button class="card review-card done" data-act="review"><div class="rv-ico">✓</div><div><h4>Reviews done for today</h4><p>${done} card${done === 1 ? '' : 's'} reviewed. Practise more if you like.</p></div><span class="chev">›</span></button>` : '';
  return `<button class="card review-card" data-act="review"><div class="rv-ico">${icons.cards}</div>
    <div><h4>Today's Review</h4><p>${n} card${n === 1 ? '' : 's'} · about ${Math.max(1, Math.round(n / 10))} min</p></div><span class="chev">›</span></button>`;
}

function minutesSheet() {
  const opts = [5, 10, 15, 20, 30, 45, 60];
  const body = openSheet(`<h2>Daily Reading Goal<button class="x">${icons.close}</button></h2>
    <div class="action-list">${opts.map((m) => `<button data-m="${m}"><span>${m} minutes</span>${settings.goalMinutes === m ? icons.check : ''}</button>`).join('')}</div>`);
  body.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.m) { settings.goalMinutes = +b.dataset.m; renderHome(); }
    closeSheet();
  };
}

function settingsSheet() {
  const body = openSheet(`<h2>Settings<button class="x">${icons.close}</button></h2>
    <label class="field"><span>Translate into</span><select name="target">${Object.entries(TARGETS).map(([k, n]) => `<option value="${k}" ${settings.target === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="field"><span>Email for MyMemory (optional, raises the free daily quota)</span><input name="email" type="email" value="${esc(settings.email)}" placeholder="you@example.com"></label>
    <div class="section-title" style="font-size:17px;margin-top:18px">Reviews</div>
    <label class="field"><span>Memory target</span><select name="retention">${[['relaxed', 'Relaxed · keep about 80%, fewest reviews'], ['normal', 'Normal · keep about 85%'], ['intense', 'Intense · keep about 90%, most reviews']].map(([k, n]) => `<option value="${k}" ${settings.retention === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="field"><span>Reviews a day (the rest wait, most useful first)</span><select name="reviewsPerDay" data-num>${[10, 20, 30, 50, 100].map((n) => `<option ${+settings.reviewsPerDay === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="field"><span>New cards a day</span><select name="newPerDay" data-num>${[0, 5, 10, 20].map((n) => `<option ${+settings.newPerDay === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="field"><span>Card style</span><select name="reviewStyle">${[['mixed', 'Mixed · flashcards, pick the meaning, fill the gap'], ['flip', 'Flashcards only']].map(([k, n]) => `<option value="${k}" ${settings.reviewStyle === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <p class="muted" style="font-size:13px;margin:-4px 0 0">Reading counts as review: LingQs you read past without tapping move forward, ones you look up come back sooner.</p>
    <div class="section-title" style="font-size:17px;margin-top:18px">Backup</div>
    <p class="muted storage-status" style="font-size:13px;margin:-4px 0 10px">Last backup: ${backupAge()}.</p>
    <div class="action-list">
      <button data-act="export"><span>Export everything (JSON)</span>${icons.download}</button>
      <button data-act="csv"><span>Export LingQs for Anki (CSV)</span>${icons.download}</button>
      <button data-act="import"><span>Restore from backup…</span>${icons.upload}</button>
    </div>
    <div class="action-list" style="margin-top:14px">
      <button data-act="tips"><span>Show reading tips again</span></button>
      <button data-act="names"><span>Ignore common Italian names</span></button>
    </div>
    <input type="file" accept=".json,application/json" hidden>
    <p class="muted" style="font-size:13px;margin-top:14px">Everything is stored privately on this device. Translations by MyMemory (translated.net). Word frequencies come from 199 Italian novels on Project Gutenberg, with word forms from Morph-it! by Marco Baroni and Eros Zanchetta (CC BY-SA 2.0). Speech uses Riccardo, a Piper neural voice that runs on this device (about 30 MB, downloaded the first time you open a book). Paola and Serena, or your device's Italian voice, are in the reader's Themes &amp; Settings.</p>`);
  body.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.x')) return closeSheet();
    if (b.dataset.act === 'export') return exportAll();
    if (b.dataset.act === 'csv') return exportCSV();
    if (b.dataset.act === 'import') $('input[type=file]', body).click();
    if (b.dataset.act === 'tips') {
      try { localStorage.removeItem('langreader.tipsSeen'); } catch {}
      b.querySelector('span').textContent = 'Tips will show when you next open a book';
    }
    if (b.dataset.act === 'names') {
      const n = await ignoreNames(true);
      b.querySelector('span').textContent = n ? `${n} names ignored` : 'All the names are already in your vocabulary';
    }
  };
  isPersisted().then((p) => {
    const el = $('.storage-status', body);
    if (!el || p === null) return;
    el.textContent = (p ? 'Storage is protected on this device. ' : 'Storage isn’t protected yet: iOS may clear it if the phone runs out of space. Open the app from your Home Screen, and back up regularly. ')
      + `Last backup: ${backupAge()}.`;
  });
  body.oninput = (e) => { if (e.target.name) settings[e.target.name] = e.target.dataset.num != null ? +e.target.value : e.target.value.trim(); };
  $('input[type=file]', body).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.words) await importVocab(data.words);
      for (const bk of data.books || []) await db.put('books', bk);
      if (data.chapters) await db.putMany('chapters', data.chapters);
      for (const d of data.days || []) await db.put('days', d);
      alert('Backup restored.');
      closeSheet(); await refreshBooks(); show(tab);
    } catch (err) { alert('Could not read backup: ' + err.message); }
  };
}

async function exportAll() {
  const data = { app: 'LangReader', version: 1, exported: new Date().toISOString(), words: allEntries(), books: await db.all('books'), chapters: await db.all('chapters'), days: await db.all('days') };
  if (await saveFile(`langreader-backup-${todayKey()}.json`, JSON.stringify(data), 'application/json')) markBackedUp();
}
function exportCSV() {
  const q = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
  const rows = allEntries().filter((w) => w.status >= 1 && w.status <= 4).map((w) => [w.display || w.term, w.meaning, w.example, w.status, w.exampleTr].map(q).join(','));
  saveFile(`lingqs-${todayKey()}.csv`, 'term,meaning,example,status,example_translation\n' + rows.join('\n'), 'text/csv');
}

// ---------------- Library ----------------
async function renderLibrary() {
  const v = $('#view-library');
  await refreshBooks();
  const sorted = books.slice().sort((a, b) => (b.lastOpened || b.added) - (a.lastOpened || a.added));
  v.innerHTML = `
    <div class="view-head"><h1 class="large-title">Library</h1>
      <button class="circle-btn" data-act="add" aria-label="Add book">${icons.plus}</button></div>
    ${sorted.length ? `<div class="lib-grid">${sorted.map((b) => `
      <div class="book">
        <button data-open="${b.id}" style="width:100%">${coverHTML(b)}</button>
        <div class="book-info">
          ${b.lastOpened ? `<span class="pct">${bookPct(b)}%</span>` : '<span class="pct new">NEW</span>'}
          <span class="diff" data-diff="${b.id}"></span>
          <button class="more" data-more="${b.id}" aria-label="More">${icons.more}</button>
        </div>
        <div class="newwords">${libLine(b)}</div>
      </div>`).join('')}</div>`
      : `<div class="empty"><h3>Your library is empty</h3><p>Tap + to paste Italian text or import a .txt or .epub book.</p></div>`}
  `;
  fillDifficulty(v, books);
  v.onclick = (e) => {
    const b = e.target.closest('[data-open],[data-more],[data-act]'); if (!b) return;
    if (b.dataset.open) return open(books.find((x) => x.id === b.dataset.open), b);
    if (b.dataset.more) return bookActions(books.find((x) => x.id === b.dataset.more));
    if (b.dataset.act === 'add') return addSheet();
  };
}

function libLine(b) {
  const g = goalSummary(b);
  if (g && !g.done) return `<span class="goal-line${g.met ? ' met' : ''}">🎯 ${g.met ? 'Goal met today' : `${g.today}/${g.pages} pages today`}</span>`;
  return `${b.chapterCount} ${b.chapterCount === 1 ? 'lesson' : 'lessons'} · ${b.wordCount.toLocaleString()} words`;
}

function bookActions(book) {
  const g = goalSummary(book);
  const body = openSheet(`<h2>${esc(book.title)}<button class="x">${icons.close}</button></h2>
    <p class="diff-line"><span data-diff="${book.id}" data-long></span></p>
    <div class="action-list">
      <button data-a="read"><span>${book.lastOpened ? 'Resume' : 'Read'}</span></button>
      <button data-a="goal"><span>Reading Goal</span><small class="muted">${g ? `${g.pages} pages a day` : 'Not set'}</small></button>
      <button data-a="restart"><span>Start from the beginning</span></button>
      <button data-a="rename"><span>Rename</span></button>
      <button data-a="delete" class="danger"><span>Remove from library</span>${icons.trash}</button>
    </div>`);
  fillDifficulty(body, [book]);
  body.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'goal') return goalSheet(book, { onChange: renderLibrary }); // replaces this sheet
    closeSheet();
    if (b.dataset.a === 'read') open(book);
    if (b.dataset.a === 'restart') { book.progress = { chapter: 0, page: 0, frac: 0, done: [] }; book.milestones = {}; await db.put('books', book); open(book); }
    if (b.dataset.a === 'rename') {
      const t = prompt('Title', book.title);
      if (t) { book.title = t.trim(); await db.put('books', book); renderLibrary(); }
    }
    if (b.dataset.a === 'delete' && confirm(`Remove “${book.title}”? Your vocabulary is kept.`)) {
      await db.deleteBook(book.id); renderLibrary();
    }
  };
}

function addSheet() {
  const body = openSheet(`<h2>Add to Library<button class="x">${icons.close}</button></h2>
    <label class="file-pick">${icons.upload} Import .epub or .txt file<input type="file" accept=".epub,.txt,text/plain,application/epub+zip"></label>
    <p class="or">or paste Italian text</p>
    <form>
      <label class="field"><span>Title</span><input name="title" required placeholder="Es. Il mio articolo"></label>
      <label class="field"><span>Author / source (optional)</span><input name="author"></label>
      <label class="field"><span>Text</span><textarea name="text" required placeholder="Incolla qui il testo… Use blank lines between paragraphs, and lines like “Capitolo 2” to split chapters."></textarea></label>
      <button class="primary">Add Lesson</button>
    </form>`);
  $('.x', body).onclick = closeSheet;
  $('input[type=file]', body).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const label = $('.file-pick', body);
    label.textContent = 'Importing…';
    try { const book = await importFile(f); closeSheet(); await renderLibrary(); open(book); }
    catch (err) { label.textContent = 'Import failed: ' + err.message; }
  };
  $('form', body).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try { const book = await importText(f.title.value.trim(), f.text.value, f.author.value.trim()); closeSheet(); await renderLibrary(); open(book); }
    catch (err) { alert(err.message); }
  };
}

// ---------------- Vocabulary ----------------
let vFilter = 'lingqs', vQuery = '';

function renderVocab() {
  const v = $('#view-vocab');
  const all = allEntries();
  const filters = {
    lingqs: (w) => !w.phrase && w.status >= 1 && w.status <= 4,
    phrases: (w) => w.phrase && w.status !== -1,
    known: (w) => !w.phrase && w.status === 5,
    ignored: (w) => w.status === -1,
  };
  const q = vQuery.toLowerCase();
  const list = all.filter(filters[vFilter]).filter((w) => !q || w.term.includes(q) || (w.meaning || '').toLowerCase().includes(q) || (w.example || '').toLowerCase().includes(q))
    .sort((a, b) => b.updated - a.updated);
  const n = (k) => all.filter(filters[k]).length;
  const due = todaysCount();
  const pill = (s) => s === 5 ? '<span class="pill s5">Known</span>' : s === -1 ? '<span class="pill si">Ignored</span>' : `<span class="pill s${s}">${s}</span>`;
  const shown = list.slice(0, 300);

  const focused = document.activeElement?.name === 'q';
  v.innerHTML = `
    <div class="view-head"><h1 class="large-title">Vocabulary</h1></div>
    <div class="vocab-actions">
      <button data-act="review" ${due ? '' : 'disabled style="opacity:.5"'}>${icons.cards} Review ${due ? `(${due})` : ''}</button>
      <button data-act="csv">${icons.download} Export</button>
    </div>
    <label class="search">${icons.search}<input name="q" type="search" placeholder="Search" value="${esc(vQuery)}" autocomplete="off"></label>
    <div class="seg">
      ${[['lingqs', 'LingQs'], ['phrases', 'Phrases'], ['known', 'Known'], ['ignored', 'Ignored']].map(([k, l]) => `<button data-f="${k}" class="${vFilter === k ? 'on' : ''}">${l} ${n(k)}</button>`).join('')}
    </div>
    ${shown.length ? `<div class="list">${shown.map((w) => `
      <button class="row" data-t="${esc(w.term)}"><div class="txt"><div class="w">${esc(w.display || w.term)}</div>
        ${w.meaning ? `<div class="m">${esc(w.meaning)}</div>` : ''}
        ${w.example && vFilter !== 'ignored' && vFilter !== 'known' ? `<div class="ex">${highlight(w.example, w.display || w.term)}</div>` : ''}</div>${pill(w.status)}</button>`).join('')}</div>
      ${list.length > shown.length ? `<p class="muted" style="text-align:center;font-size:13px">Showing 300 of ${list.length.toLocaleString()} — search to narrow down.</p>` : ''}`
      : `<div class="empty"><h3>Nothing here yet</h3><p>${vFilter === 'lingqs' ? 'Tap a blue word while reading and choose a meaning to create a LingQ.' : vFilter === 'phrases' ? 'Long-press a word, then tap the last word of a phrase.' : 'Words appear here as you read.'}</p></div>`}
  `;
  if (focused) { const i = $('input[name=q]', v); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  v.onclick = (e) => {
    const b = e.target.closest('[data-f],[data-t],[data-act]'); if (!b) return;
    if (b.dataset.f) { vFilter = b.dataset.f; return renderVocab(); }
    if (b.dataset.t) {
      const w = entry(b.dataset.t);
      return openWordCard({ term: w.term, display: w.display, phrase: !!w.phrase, context: w.example || '', onClose: () => renderVocab() });
    }
    if (b.dataset.act === 'review') return reviewSheet({ onClose: () => renderVocab() });
    if (b.dataset.act === 'csv') return exportCSV();
  };
  $('input[name=q]', v).oninput = (e) => { vQuery = e.target.value; renderVocab(); };
}

boot();
