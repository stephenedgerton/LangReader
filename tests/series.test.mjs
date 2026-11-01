// The graded series "La casa gialla" (samples/series/): its word plan, its files, and how it lands in the library.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { analyse, problems, loadBooks } from '../tools/check-series.mjs';
import { SERIES, seriesBookId, seriesFiles } from '../samples/series/index.js';
import { startServer, openApp, openBook, closeBrowser } from './helpers.mjs';

const root = new URL('..', import.meta.url);

describe('series word plan', () => {
  let books, a;
  before(async () => { books = await loadBooks(); a = analyse(books); });

  test('has no unknown words, no archaic words too early and stays under the unfamiliar caps', () => {
    assert.deepEqual(problems(a), []);
  });

  test('each book carries its id, series number and chapters', () => {
    books.forEach((b, i) => {
      assert.equal(b.id, seriesBookId(i + 1));
      assert.deepEqual(b.series, { id: SERIES.id, n: i + 1 });
      assert.ok(b.chapters.length > 0);
      for (const c of b.chapters) for (const x of c.blocks) assert.ok(x.x.trim(), `${b.title}: empty block`);
    });
    assert.equal(new Set(books.map((b) => b.title)).size, books.length, 'titles are unique');
  });

  test('every book file is counted and cached by the service worker', () => {
    const onDisk = readdirSync(new URL('samples/series/', root)).filter((f) => /^\d\d\.js$/.test(f)).map((f) => `samples/series/${f}`);
    assert.deepEqual(onDisk.sort(), seriesFiles());
    const sw = readFileSync(new URL('sw.js', root), 'utf8');
    for (const f of [...seriesFiles(), 'samples/series/index.js', 'samples/series/book.js']) assert.ok(sw.includes(`'${f}'`), `${f} missing from SHELL`);
  });
});

describe('series in the library', () => {
  const t = {};
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await closeBrowser(t); srv.server.close(); });

  test('a fresh install lists the series first, in order, and starts Home on book 1', async () => {
    const { page, errors } = await openApp(t, srv.url);
    const titles = await page.$$eval('#view-library .cover .ct', (e) => e.map((x) => x.textContent));
    assert.deepEqual(titles.slice(0, SERIES.books), (await loadBooks()).map((b) => b.title));
    await page.click('#tabbar [data-tab=home]');
    assert.equal(await page.textContent('#view-home .hero-meta h3'), 'Una casa a Montemare');
    await page.click('#tabbar [data-tab=library]');
    await openBook(page, 'Una casa a Montemare');
    assert.equal(await page.textContent('#r-running'), 'Capitolo 1 · Il treno');
    assert.deepEqual(errors, []);
  });

  test('a revised book replaces the old text in a library that has it, and keeps the reader\'s place', async () => {
    const { page, errors } = await openApp(t, srv.url);
    // Recreate a library saved before revisions: book 1 with no rev, different text, read up to chapter 4.
    const id = await page.evaluate(async () => {
      const db = await new Promise((r) => { const q = indexedDB.open('langreader'); q.onsuccess = () => r(q.result); });
      const all = await new Promise((r) => { const q = db.transaction('books').objectStore('books').getAll(); q.onsuccess = () => r(q.result); });
      const b = all.find((x) => x.series?.n === 1);
      delete b.rev; b.progress = { ...b.progress, chapter: 3 };
      const tx = db.transaction(['books', 'chapters'], 'readwrite');
      tx.objectStore('books').put(b);
      tx.objectStore('chapters').put({ key: `${b.id}:0`, bookId: b.id, idx: 0, title: 'Vecchio', blocks: [{ t: 'p', x: 'Testo vecchio.' }] });
      await new Promise((r) => { tx.oncomplete = r; });
      return b.id;
    });
    await page.reload(); await page.waitForSelector('#view-library .book');
    const after = await page.evaluate(async (id) => {
      const db = await new Promise((r) => { const q = indexedDB.open('langreader'); q.onsuccess = () => r(q.result); });
      const get = (s, k) => new Promise((r) => { const q = db.transaction(s).objectStore(s).get(k); q.onsuccess = () => r(q.result); });
      const b = await get('books', id), c = await get('chapters', `${id}:0`);
      return { rev: b.rev, chapter: b.progress.chapter, title: c.title };
    }, id);
    assert.deepEqual(after, { rev: 2, chapter: 3, title: 'Capitolo 1 · Il treno' });
    assert.equal((await page.$$eval('#view-library .cover .ct', (e) => e.map((x) => x.textContent))).filter((x) => x === 'Una casa a Montemare').length, 1);
    assert.deepEqual(errors, []);
  });
});
