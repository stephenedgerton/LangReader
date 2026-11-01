// Library organising: your own book collections, the filter chips and the sort orders.
// A collection is {id, name, created} in the `collections` store (a bundled series' own collection also
// has `series`, and is shown in series order); a book lists the collections it's
// in as `book.collections: [id]`, so removing a book needs no clean-up.
import { db } from './db.js';
import { settings } from './settings.js';
import { bookPct } from './goals.js';
import { difficulty } from './difficulty.js';
import { openSheet, closeSheet, esc, icons } from './ui.js';

export async function allCollections() {
  return (await db.all('collections')).sort((a, b) => a.created - b.created);
}

export async function newCollection() {
  const name = prompt('New collection name')?.trim();
  if (!name) return null;
  const c = { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, created: Date.now() };
  await db.put('collections', c);
  return c;
}

// Built-in filters, by reading state, ahead of your own collections.
export const STATES = [
  ['all', 'All'],
  ['reading', 'Reading'],
  ['unread', 'Not started'],
  ['finished', 'Finished'],
];
const stateOf = (b) => (bookPct(b) >= 100 ? 'finished' : b.lastOpened || bookPct(b) > 0 ? 'reading' : 'unread');

export function filterBooks(books, filter) {
  if (filter.startsWith('c:')) { const id = filter.slice(2); return books.filter((b) => b.collections?.includes(id)); }
  return filter === 'all' ? books : books.filter((b) => stateOf(b) === filter);
}

export const SORTS = [
  ['recent', 'Recent'],
  ['title', 'Title'],
  ['author', 'Author'],
  ['progress', 'Progress'],
  ['added', 'Date added'],
  ['easiest', 'Easiest first'],
];
const byTitle = (a, b) => a.title.localeCompare(b.title, 'it', { sensitivity: 'base' });

export async function sortBooks(books, sort) {
  const list = books.slice();
  const recent = (b) => b.lastOpened || b.added || 0;
  if (sort === 'title') return list.sort(byTitle);
  if (sort === 'author') return list.sort((a, b) => (a.author || '￿').localeCompare(b.author || '￿', 'it', { sensitivity: 'base' }) || byTitle(a, b));
  if (sort === 'progress') return list.sort((a, b) => bookPct(b) - bookPct(a) || recent(b) - recent(a));
  if (sort === 'added') return list.sort((a, b) => (b.added || 0) - (a.added || 0));
  if (sort === 'easiest') {
    const pct = new Map(await Promise.all(list.map(async (b) => [b.id, (await difficulty(b)).pct])));
    return list.sort((a, b) => pct.get(a.id) - pct.get(b.id) || byTitle(a, b));
  }
  return list.sort((a, b) => recent(b) - recent(a));
}

// A series' own collection lists its books from the first to the last, whatever the sort order;
// any other book you add to it comes after them, by title.
export function seriesOrder(books) {
  return books.slice().sort((a, b) => (a.series?.n ?? Infinity) - (b.series?.n ?? Infinity) || byTitle(a, b));
}

// The book's ⋯ menu → Collections: tick the ones it belongs in.
export async function bookCollectionsSheet(book, { onChange } = {}) {
  const cols = await allCollections();
  const inIt = new Set(book.collections || []);
  const body = openSheet(`<h2>Collections<button class="x">${icons.close}</button></h2>
    <p class="muted coll-for">${esc(book.title)}</p>
    <div class="action-list coll-pick">
      ${cols.map((c) => `<button data-c="${c.id}" class="${inIt.has(c.id) ? 'on' : ''}"><span>${esc(c.name)}</span><i class="tick">${icons.check}</i></button>`).join('')}
      <button data-a="new" class="btn-new">${icons.plus}<span>New Collection…</span></button>
    </div>`, { onClose: onChange });
  body.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('x')) return closeSheet();
    let id = b.dataset.c;
    if (b.dataset.a === 'new') { const c = await newCollection(); if (!c) return; id = c.id; inIt.delete(id); }
    if (!id) return;
    if (inIt.has(id)) inIt.delete(id); else inIt.add(id);
    book.collections = [...inIt];
    await db.put('books', book);
    if (b.dataset.a === 'new') return bookCollectionsSheet(book, { onChange }); // replaces this sheet
    b.classList.toggle('on', inIt.has(id));
  };
}

// The Library's sort button: sort order, plus making, renaming and deleting collections.
export async function organiseSheet({ onChange } = {}) {
  const cols = await allCollections();
  const body = openSheet(`<h2>Sort &amp; Collections<button class="x">${icons.close}</button></h2>
    <div class="section-title sm">Sort by</div>
    <div class="action-list coll-pick">
      ${SORTS.map(([k, l]) => `<button data-sort="${k}" class="${settings.librarySort === k ? 'on' : ''}"><span>${l}</span><i class="tick">${icons.check}</i></button>`).join('')}
    </div>
    <div class="section-title sm">Collections</div>
    <div class="action-list">
      ${cols.map((c) => `<div class="coll-row" data-c="${c.id}"><span>${esc(c.name)}</span>
        <button data-a="rename">Rename</button><button data-a="delete" class="danger" aria-label="Delete ${esc(c.name)}">${icons.trash}</button></div>`).join('')}
      <button data-a="new" class="btn-new">${icons.plus}<span>New Collection…</span></button>
    </div>
    <p class="muted coll-help">Add a book to a collection from its ⋯ menu.</p>`, { onClose: onChange });
  body.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('x')) return closeSheet();
    if (b.dataset.sort) {
      settings.librarySort = b.dataset.sort;
      body.querySelectorAll('[data-sort]').forEach((x) => x.classList.toggle('on', x === b));
      return;
    }
    const c = cols.find((x) => x.id === b.closest('[data-c]')?.dataset.c);
    if (b.dataset.a === 'new') { if (await newCollection()) organiseSheet({ onChange }); return; }
    if (b.dataset.a === 'rename' && c) {
      const name = prompt('Collection name', c.name)?.trim();
      if (name) { c.name = name; await db.put('collections', c); organiseSheet({ onChange }); }
    }
    if (b.dataset.a === 'delete' && c && confirm(`Delete the collection “${c.name}”? Its books stay in your library.`)) {
      for (const bk of await db.all('books')) {
        if (bk.collections?.includes(c.id)) { bk.collections = bk.collections.filter((x) => x !== c.id); await db.put('books', bk); }
      }
      await db.del('collections', c.id);
      if (settings.libraryFilter === 'c:' + c.id) settings.libraryFilter = 'all';
      organiseSheet({ onChange });
    }
  };
}
