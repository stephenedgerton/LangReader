import { db } from './db.js';
import { settings, TARGETS } from './settings.js';
import { loadVocab, counts, allEntries, entry, setWord, importVocab, onChange } from './vocab.js';
import { importText, importFile, saveBook } from './importer.js';
import { initReader, openReader } from './reader.js';
import { openWordCard } from './wordcard.js';
import { getDays, streak, todayKey, bump } from './stats.js';
import { openSheet, closeSheet, initSheetGestures, esc, icons, coverHTML, $, $$ } from './ui.js';
import { SAMPLE } from '../samples/sample.js';
import { haptic } from './haptics.js';
import { requestPersistence, isPersisted, backupDue, backupAge, markBackedUp, snoozeBackup, saveFile } from './storage.js';

let tab = 'home';
let books = [];

async function boot() {
  await loadVocab();
  books = await db.all('books');
  if (!books.length && !localStorage.getItem('langreader.seeded')) {
    localStorage.setItem('langreader.seeded', '1');
    await saveBook(SAMPLE);
    books = await db.all('books');
  }
  initReader();
  initSheetGestures();
  $$('#tabbar button').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  onChange(() => { if (tab === 'vocab' && $('#reader').hidden) renderVocab(); });
  show(location.hash.slice(1) || 'home');

  requestPersistence();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function show(t) {
  if (!['home', 'library', 'vocab'].includes(t)) t = 'home';
  tab = t;
  history.replaceState(null, '', '#' + t);
  $$('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  $$('.view').forEach((v) => { v.hidden = v.dataset.tab !== t; });
  ({ home: renderHome, library: renderLibrary, vocab: renderVocab })[t]();
}

async function refreshBooks() { books = await db.all('books'); }

function bookPct(b) {
  if (!b.wordCount) return 0;
  const cw = b.chapterWords || [];
  let read = 0;
  for (let i = 0; i < (b.progress?.chapter || 0); i++) read += cw[i] || 0;
  read += (cw[b.progress?.chapter || 0] || 0) * (b.progress?.frac || 0);
  return Math.min(100, Math.round((read / b.wordCount) * 100));
}

function open(book) {
  $('#tabbar').hidden = true;
  openReader(book, async () => {
    $('#tabbar').hidden = false;
    await refreshBooks();
    show(tab);
  });
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
          <button class="resume" data-open="${current.id}">${current.lastOpened ? 'Resume' : 'Read'}</button>
        </div>
      </div>` : ''}
    ${backupDue(allEntries().length) ? `
      <div class="card backup-card">
        <h4>Back up your vocabulary</h4>
        <p>${allEntries().length.toLocaleString()} words are saved only on this phone. Last backup: ${backupAge()}.</p>
        <div class="row-btns"><button class="primary" data-act="backup">Back Up Now</button><button class="secondary" data-act="snooze">Later</button></div>
      </div>` : ''}
    <div class="section-title">Reading Goals</div>
    <button class="card goal" data-act="goal" style="width:100%;text-align:left">
      <div class="ring"><svg viewBox="0 0 96 96"><circle class="track" cx="48" cy="48" r="${R}"/>
        <circle class="prog" cx="48" cy="48" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg></div>
      <div><h4>Today's Reading</h4><div class="big">${mins}:${String(today.seconds % 60).padStart(2, '0')}</div>
        <p>of your ${settings.goalMinutes}-minute goal${st ? ` · 🔥 ${st}-day streak` : ''}</p></div>
    </button>
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
  v.onclick = (e) => {
    const b = e.target.closest('[data-open],[data-act]'); if (!b) return;
    if (b.dataset.open) return open(books.find((x) => x.id === b.dataset.open));
    if (b.dataset.act === 'goal') return goalSheet();
    if (b.dataset.act === 'settings') return settingsSheet();
    if (b.dataset.act === 'backup') return exportAll().then(renderHome);
    if (b.dataset.act === 'snooze') { snoozeBackup(); return renderHome(); }
  };
}

function goalSheet() {
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
    <div class="section-title" style="font-size:17px;margin-top:18px">Backup</div>
    <p class="muted storage-status" style="font-size:13px;margin:-4px 0 10px">Last backup: ${backupAge()}.</p>
    <div class="action-list">
      <button data-act="export"><span>Export everything (JSON)</span>${icons.download}</button>
      <button data-act="csv"><span>Export LingQs for Anki (CSV)</span>${icons.download}</button>
      <button data-act="import"><span>Restore from backup…</span>${icons.upload}</button>
    </div>
    <input type="file" accept=".json,application/json" hidden>
    <p class="muted" style="font-size:13px;margin-top:14px">Everything is stored privately on this device. Translations by MyMemory (translated.net). Speech uses your device's Italian voice — on iPhone, download an enhanced voice in Settings › Accessibility › Spoken Content › Voices › Italian.</p>`);
  body.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.x')) return closeSheet();
    if (b.dataset.act === 'export') return exportAll();
    if (b.dataset.act === 'csv') return exportCSV();
    if (b.dataset.act === 'import') $('input[type=file]', body).click();
  };
  isPersisted().then((p) => {
    const el = $('.storage-status', body);
    if (!el || p === null) return;
    el.textContent = (p ? 'Storage is protected on this device. ' : 'Storage isn’t protected yet: iOS may clear it if the phone runs out of space. Open the app from your Home Screen, and back up regularly. ')
      + `Last backup: ${backupAge()}.`;
  });
  body.oninput = (e) => { if (e.target.name) settings[e.target.name] = e.target.value.trim(); };
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
  const rows = allEntries().filter((w) => w.status >= 1 && w.status <= 4).map((w) => [w.term, w.meaning, w.example, w.status].map(q).join(','));
  saveFile(`lingqs-${todayKey()}.csv`, 'term,meaning,example,status\n' + rows.join('\n'), 'text/csv');
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
          <button class="more" data-more="${b.id}" aria-label="More">${icons.more}</button>
        </div>
        <div class="newwords">${b.chapterCount} ${b.chapterCount === 1 ? 'lesson' : 'lessons'} · ${b.wordCount.toLocaleString()} words</div>
      </div>`).join('')}</div>`
      : `<div class="empty"><h3>Your library is empty</h3><p>Tap + to paste Italian text or import a .txt or .epub book.</p></div>`}
  `;
  v.onclick = (e) => {
    const b = e.target.closest('[data-open],[data-more],[data-act]'); if (!b) return;
    if (b.dataset.open) return open(books.find((x) => x.id === b.dataset.open));
    if (b.dataset.more) return bookActions(books.find((x) => x.id === b.dataset.more));
    if (b.dataset.act === 'add') return addSheet();
  };
}

function bookActions(book) {
  const body = openSheet(`<h2>${esc(book.title)}<button class="x">${icons.close}</button></h2>
    <div class="action-list">
      <button data-a="read"><span>${book.lastOpened ? 'Resume' : 'Read'}</span></button>
      <button data-a="restart"><span>Start from the beginning</span></button>
      <button data-a="rename"><span>Rename</span></button>
      <button data-a="delete" class="danger"><span>Remove from library</span>${icons.trash}</button>
    </div>`);
  body.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    closeSheet();
    if (b.dataset.a === 'read') open(book);
    if (b.dataset.a === 'restart') { book.progress = { chapter: 0, page: 0, frac: 0, done: [] }; await db.put('books', book); open(book); }
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
  const list = all.filter(filters[vFilter]).filter((w) => !q || w.term.includes(q) || (w.meaning || '').toLowerCase().includes(q))
    .sort((a, b) => b.updated - a.updated);
  const n = (k) => all.filter(filters[k]).length;
  const due = all.filter((w) => w.status >= 1 && w.status <= 4).length;
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
      <button class="row" data-t="${esc(w.term)}"><div class="txt"><div class="w">${esc(w.term)}</div>
        ${w.meaning ? `<div class="m">${esc(w.meaning)}</div>` : ''}</div>${pill(w.status)}</button>`).join('')}</div>
      ${list.length > shown.length ? `<p class="muted" style="text-align:center;font-size:13px">Showing 300 of ${list.length.toLocaleString()} — search to narrow down.</p>` : ''}`
      : `<div class="empty"><h3>Nothing here yet</h3><p>${vFilter === 'lingqs' ? 'Tap a blue word while reading and choose a meaning to create a LingQ.' : vFilter === 'phrases' ? 'Long-press a word, then tap the last word of a phrase.' : 'Words appear here as you read.'}</p></div>`}
  `;
  if (focused) { const i = $('input[name=q]', v); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  v.onclick = (e) => {
    const b = e.target.closest('[data-f],[data-t],[data-act]'); if (!b) return;
    if (b.dataset.f) { vFilter = b.dataset.f; return renderVocab(); }
    if (b.dataset.t) {
      const w = entry(b.dataset.t);
      return openWordCard({ term: w.term, phrase: !!w.phrase, context: w.example || '', onClose: () => renderVocab() });
    }
    if (b.dataset.act === 'review') return review();
    if (b.dataset.act === 'csv') return exportCSV();
  };
  $('input[name=q]', v).oninput = (e) => { vQuery = e.target.value; renderVocab(); };
}

// Flashcard review of LingQs: lower levels and older cards first.
function review() {
  const queue = allEntries().filter((w) => w.status >= 1 && w.status <= 4)
    .sort((a, b) => a.status - b.status || a.updated - b.updated).slice(0, 20);
  let i = 0, revealed = false, right = 0;
  const body = openSheet('', { onClose: () => renderVocab() });
  const card = () => {
    if (i >= queue.length) {
      body.innerHTML = `<h2>Review complete<button class="x">${icons.close}</button></h2>
        <div class="flash"><div class="fw">${right} / ${queue.length}</div><div class="fc">words moved up a level</div></div>
        <button class="primary" data-done>Done</button>`;
      return;
    }
    const w = queue[i];
    const ctx = w.example ? esc(w.example).replace(new RegExp(`(${w.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i'), '<b>$1</b>') : '';
    body.innerHTML = `<h2>Review <span class="muted" style="font-size:15px;font-weight:500">${i + 1} of ${queue.length}</span><button class="x">${icons.close}</button></h2>
      <div class="progress-line"><i style="width:${(i / queue.length) * 100}%"></i></div>
      <div class="flash" data-flip><div class="fw">${esc(w.term)}</div>${ctx ? `<div class="fc">${ctx}</div>` : ''}
        ${revealed ? `<div class="fm">${esc(w.meaning || '—')}</div>` : '<div class="hint-tap">Tap to show meaning</div>'}</div>
      <div class="review-btns"><button class="no" data-r="0">Still learning</button><button class="yes" data-r="1">Got it</button></div>`;
  };
  card();
  body.onclick = async (e) => {
    const b = e.target.closest('button,[data-flip]'); if (!b) return;
    if (b.matches('.x') || b.dataset.done != null) return closeSheet();
    if (b.dataset.flip != null) { revealed = true; return card(); }
    if (b.dataset.r != null) {
      haptic();
      const w = queue[i];
      if (b.dataset.r === '1') {
        right++;
        const s = Math.min(5, w.status + 1);
        await setWord(w.term, { status: s });
        if (s === 5 && !w.phrase) bump('known');
      } else {
        await setWord(w.term, { status: Math.max(1, w.status - (w.status > 2 ? 1 : 0)) });
      }
      i++; revealed = false; card();
    }
  };
}

boot();
