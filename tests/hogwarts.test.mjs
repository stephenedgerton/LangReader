// "Ritorno a Hogwarts" (samples/hogwarts/): its books, its files and its collection in the library.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { SERIES, seriesBookId, seriesFiles, loadSeriesBook } from '../samples/hogwarts/index.js';
import * as B1 from '../samples/hogwarts-b1/index.js';
import { loadFreqList } from '../tools/check-series.mjs';
import { analyse, MAX_RARE } from '../tools/check-hogwarts.mjs';
import { startServer, openApp, closeBrowser, sleep } from './helpers.mjs';

const root = new URL('..', import.meta.url);
const loadBooks = async () => { const b = []; for (let n = 1; n <= SERIES.books; n++) b.push(await loadSeriesBook(n)); return b; };

describe('Ritorno a Hogwarts', () => {
  test('each book carries its id, series number and chapters', async () => {
    const books = await loadBooks();
    books.forEach((b, i) => {
      assert.equal(b.id, seriesBookId(i + 1));
      assert.deepEqual(b.series, { id: SERIES.id, n: i + 1 });
      assert.ok(b.chapters.length > 0);
      for (const c of b.chapters) for (const x of c.blocks) assert.ok(x.x.trim(), `${b.title}: empty block`);
    });
    assert.equal(new Set(books.map((b) => b.title)).size, books.length, 'titles are unique');
  });

  test('every book file is counted and cached by the service worker', () => {
    const onDisk = readdirSync(new URL('samples/hogwarts/', root)).filter((f) => /^\d\d\.js$/.test(f)).map((f) => `samples/hogwarts/${f}`);
    assert.deepEqual(onDisk.sort(), seriesFiles());
    const sw = readFileSync(new URL('sw.js', root), 'utf8');
    for (const f of [...seriesFiles(), 'samples/hogwarts/index.js', 'samples/hogwarts/book.js']) assert.ok(sw.includes(`'${f}'`), `${f} missing from SHELL`);
  });

  describe('in the library', () => {
    const t = {};
    let srv;
    before(async () => { srv = await startServer(); });
    after(async () => { await closeBrowser(t); srv.server.close(); });

    test('comes with its own collection, in series order', async () => {
      const { page, errors } = await openApp(t, srv.url);
      await page.click('#tabbar button[data-tab=library]'); await sleep(300);
      await page.click(`.chips button:has-text("${SERIES.title}")`); await sleep(300);
      const titles = await page.$$eval('#view-library .cover .ct', (e) => e.map((x) => x.textContent));
      assert.deepEqual(titles, (await loadBooks()).map((b) => b.title));
      assert.deepEqual(errors, []);
    });
  });

  test('the B1 books are cached, uniquely titled and under the uncommon-word cap', async () => {
    const sw = readFileSync(new URL('sw.js', root), 'utf8');
    const onDisk = readdirSync(new URL('samples/hogwarts-b1/', root)).filter((f) => /^\d\d\.js$/.test(f)).map((f) => `samples/hogwarts-b1/${f}`);
    assert.deepEqual(onDisk.sort(), B1.seriesFiles());
    for (const f of [...B1.seriesFiles(), 'samples/hogwarts-b1/index.js', 'samples/hogwarts-b1/book.js']) assert.ok(sw.includes(`'${f}'`), `${f} missing from SHELL`);
    const b2 = new Set((await loadBooks()).map((b) => b.title));
    const freq = loadFreqList();
    for (let n = 1; n <= B1.SERIES.books; n++) {
      const b = await B1.loadSeriesBook(n);
      assert.equal(b.id, B1.seriesBookId(n));
      assert.ok(!b2.has(b.title), `${b.title}: same title as a B2 book, so the library would skip it`);
      const r = analyse(b, freq);
      assert.ok(r.share <= MAX_RARE, `${b.title}: ${(100 * r.share).toFixed(1)}% uncommon words`);
    }
  });
});
