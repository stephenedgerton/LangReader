// Library organising: collections, filter chips, search and sort orders.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openApp, closeBrowser, sleep } from './helpers.mjs';

const titles = (page) => page.$$eval('#view-library .cover .ct', (e) => e.map((x) => x.textContent));
const library = async (page) => { await page.click('#tabbar button[data-tab=library]'); await sleep(300); };

describe('library organising', () => {
  const t = {};
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await closeBrowser(t); srv.server.close(); });

  test('make a collection, add books to it and filter by it', async () => {
    const { page, errors } = await openApp(t, srv.url);
    await library(page);
    page.once('dialog', (d) => d.accept('Estate'));
    await page.click('#view-library .book:has-text("Natale al porto") [data-more]');
    await page.click('[data-a=collections]'); await sleep(300);
    await page.click('.coll-pick [data-a=new]'); await sleep(400);
    assert.ok(await page.$('.coll-pick button.on:has-text("Estate")'), 'a new collection from the book menu includes the book');
    await page.click('#sheet .x'); await sleep(300);

    await page.click('#view-library .book:has-text("Il mare d’inverno") [data-more]');
    assert.equal(await page.textContent('[data-a=collections] small'), 'None');
    await page.click('[data-a=collections]'); await sleep(300);
    await page.click('.coll-pick button:has-text("Estate")'); await sleep(200);
    await page.click('#sheet .x'); await sleep(300);

    await page.click('.chips button:has-text("Estate")'); await sleep(300);
    assert.deepEqual((await titles(page)).sort(), ['Il mare d’inverno', 'Natale al porto']);
    assert.match(await page.textContent('.lib-sub'), /2 books/);

    // The filter is remembered.
    await page.reload(); await library(page);
    assert.equal((await titles(page)).length, 2);

    // Rename and delete from the sort sheet; the books stay.
    page.once('dialog', (d) => d.accept('Inverno'));
    await page.click('.lib-sub button'); await sleep(300);
    await page.click('.coll-row [data-a=rename]'); await sleep(300);
    assert.ok(await page.$('.coll-row:has-text("Inverno")'));
    page.once('dialog', (d) => d.accept());
    await page.click('.coll-row [data-a=delete]'); await sleep(400);
    assert.equal(await page.$('.coll-row'), null);
    await page.click('#sheet .x'); await sleep(300);
    assert.equal(await page.textContent('.chips .on'), 'All');
    assert.equal((await titles(page)).length, 15);
    const left = await page.evaluate(async () => {
      const db = await new Promise((r) => { const q = indexedDB.open('langreader'); q.onsuccess = () => r(q.result); });
      const all = await new Promise((r) => { const q = db.transaction('books').objectStore('books').getAll(); q.onsuccess = () => r(q.result); });
      return all.filter((b) => b.collections?.length).length;
    });
    assert.equal(left, 0, 'books no longer list the deleted collection');
    assert.deepEqual(errors, []);
  });

  test('filter by reading state, search, and sort', async () => {
    const { page, errors } = await openApp(t, srv.url);
    await library(page);
    await page.click('#view-library .book:has-text("Il gatto e la scatola") [data-more]');
    await page.click('[data-a=complete]'); await sleep(400);
    await page.click('.chips button:has-text("Finished")'); await sleep(300);
    assert.deepEqual(await titles(page), ['Il gatto e la scatola']);
    await page.click('.chips button:has-text("Not started")'); await sleep(300);
    assert.ok(!(await titles(page)).includes('Il gatto e la scatola'));
    await page.click('.chips button:has-text("All")'); await sleep(300);

    await page.fill('input[name=lq]', 'montemare'); await sleep(300);
    assert.deepEqual(await titles(page), ['Una casa a Montemare']);
    await page.fill('input[name=lq]', ''); await sleep(300);

    await page.click('.lib-sub button'); await sleep(300);
    await page.click('[data-sort=title]'); await sleep(100);
    await page.click('#sheet .x'); await sleep(400);
    const ts = await titles(page);
    assert.deepEqual(ts, ts.slice().sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' })));
    assert.match(await page.textContent('.lib-sub button'), /Title/);
    assert.deepEqual(errors, []);
  });
});
