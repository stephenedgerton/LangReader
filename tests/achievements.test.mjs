// Book difficulty (share of new words) and achievements.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openApp, openBook, closeReader, closeBrowser, sleep } from './helpers.mjs';

const BOOK = 'Un caffè a Bologna';
const badges = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('langreader.badges')));
const diffOf = async (page) => {
  await page.waitForSelector(`#view-library .book:has-text("${BOOK}") .diff:not(:empty)`);
  return page.textContent(`#view-library .book:has-text("${BOOK}") .diff`);
};

describe('difficulty and achievements', () => {
  const t = {};
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await closeBrowser(t); srv.server.close(); });

  test('each book shows its share of new words, which drops as you read', async () => {
    const { page, errors } = await openApp(t, srv.url);
    assert.equal(await diffOf(page), '100% new', 'every word is new at first (names are ignored)');
    await openBook(page);
    await page.keyboard.press('ArrowRight'); await sleep(700);
    await closeReader(page);
    const pct = +(await diffOf(page)).match(/(\d+)% new/)[1];
    assert.ok(pct < 100, `paging forward made words known (${pct}%)`);
    await page.click(`#view-library .book:has-text("${BOOK}") [data-more]`);
    await page.waitForSelector('.diff-line .diff:not(:empty)');
    assert.match(await page.textContent('.diff-line'), new RegExp(`${pct}% new words \\(\\d+ of \\d+\\)`));
    assert.deepEqual(errors, []);
  });

  test('earning a badge while reading is celebrated and shows on Home', async () => {
    const { page, errors } = await openApp(t, srv.url);
    assert.deepEqual(await badges(page), {}, 'a new user starts with none');
    await openBook(page);
    for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await sleep(700); }
    await page.waitForFunction(() => /New bookmark!.*100 known words/.test(document.querySelector('#r-cheer').textContent), null, { timeout: 8000 });
    assert.match((await badges(page))['known-100'], /^\d{4}-\d\d-\d\d$/);
    await sleep(3200);
    await closeReader(page);
    await page.click('#tabbar button[data-tab=home]');
    await page.waitForSelector('.ach');
    assert.match(await page.textContent('.ach-top'), /^1 of \d+ collected/);
    assert.match(await page.textContent('.ach-next'), /Next: 🧠 500 known words/);
    assert.ok(await page.$('.ach .bookmark.new'), 'earned today: marked new');
    await page.click('.ach'); await sleep(300);
    assert.match(await page.textContent('.ach-item:has-text("100 known words") small'), /\d{4}/, 'shows the date earned');
    assert.equal(await page.$$eval('.ach-item .bookmark:not(.locked)', (e) => e.length), 1);
    assert.deepEqual(errors, []);
  });

  test('badges you already had are recorded quietly the first time', async () => {
    const { page } = await openApp(t, srv.url);
    await page.evaluate(async () => {
      const db = await new Promise((r) => { const q = indexedDB.open('langreader'); q.onsuccess = () => r(q.result); });
      const tx = db.transaction('words', 'readwrite');
      for (let i = 0; i < 600; i++) tx.objectStore('words').put({ term: `parola${i}`, status: 5, created: 1, updated: 1 });
      await new Promise((r) => { tx.oncomplete = r; });
      localStorage.removeItem('langreader.badges');
    });
    await page.reload(); await page.waitForSelector('#view-library .book');
    const b = await badges(page);
    assert.equal(b['known-100'], null);
    assert.equal(b['known-500'], null);
    assert.ok(!('known-1000' in b));
  });
});
