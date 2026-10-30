// Per-book reading goals: setting a goal, today's pages, celebrations and milestones.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openApp, openBook, closeReader, closeBrowser, sleep } from './helpers.mjs';

const BOOK = 'Un caffè a Bologna';
const bookRecord = (page, title = BOOK) => page.evaluate(async (title) => {
  const db = await new Promise((r) => { const q = indexedDB.open('langreader'); q.onsuccess = () => r(q.result); });
  const all = await new Promise((r) => { const q = db.transaction('books').objectStore('books').getAll(); q.onsuccess = () => r(q.result); });
  return all.find((b) => b.title === title);
}, title);

describe('reading goals', () => {
  const t = {};
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await closeBrowser(t); srv.server.close(); });

  test('set a pages-a-day goal from the Library and see the plan', async () => {
    const { page, errors } = await openApp(t, srv.url);
    await page.click(`#view-library .book:has-text("${BOOK}") [data-more]`);
    await page.click('[data-a=goal]'); await sleep(300);
    assert.ok(await page.isVisible('.gs-presets'), 'no goal yet: presets are offered');
    await page.click('.gs-presets [data-set="5"]'); await sleep(200);
    assert.match(await page.textContent('.gs-today h4'), /0 of 5 pages today/);
    assert.match(await page.textContent('.gs-proj'), /At 5 pages a day you’ll finish/);
    assert.equal(await page.$$eval('.gs-ms li', (e) => e.length), 4);
    await page.click('.stepper [data-step="1"]'); await sleep(200);
    assert.equal(await page.textContent('.stepper b'), '6');
    assert.equal((await bookRecord(page)).goal.pages, 6);
    await page.click('.sheet .x'); await sleep(300);
    assert.match(await page.textContent(`#view-library .book:has-text("${BOOK}") .newwords`), /0\/6 pages today/);
    assert.deepEqual(errors, []);
  });

  test('a finish date sets the pages a day', async () => {
    const { page } = await openApp(t, srv.url);
    await page.click(`#view-library .book:has-text("${BOOK}") [data-more]`);
    await page.click('[data-a=goal]'); await sleep(300);
    // Finishing today means reading the whole book today.
    const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    await page.fill('.gs-date input', today); await sleep(300);
    const g = (await bookRecord(page)).goal;
    const wpp = await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.settings') || '{}').wordsPerPage || 110);
    const b = await bookRecord(page);
    assert.equal(g.pages, Math.ceil(b.wordCount / wpp));
    assert.match(await page.textContent('.gs-proj'), /finish today/);
  });

  test('reading counts toward today, and meeting the goal is celebrated', async () => {
    const { page, errors } = await openApp(t, srv.url);
    await openBook(page);
    await page.mouse.click(195, 650); await sleep(250); // show the controls
    await page.click('#r-menu'); await page.click('[data-act=goal]'); await sleep(300);
    await page.click('.gs-presets [data-set="5"]'); await sleep(200);
    // Two pages isn't enough...
    await page.click('.sheet .x'); await sleep(500);
    await page.keyboard.press('ArrowRight'); await sleep(700);
    await page.keyboard.press('ArrowRight'); await sleep(700);
    const b = await bookRecord(page);
    assert.ok(b.goal.cheered == null, 'not met yet');
    await page.click('#r-menu');
    assert.match(await page.textContent('[data-act=goal] span'), /Reading Goal · \d\/5/);
    await page.click('#r-menu');
    // ...but a few more pages are.
    for (let i = 0; i < 8 && !(await bookRecord(page)).goal.cheered; i++) { await page.keyboard.press('ArrowRight'); await sleep(700); }
    assert.ok((await bookRecord(page)).goal.cheered, 'goal met');
    // Celebrations queue up (a milestone may be showing first).
    await page.waitForFunction(() => /Today’s goal done/.test(document.querySelector('#r-cheer').textContent), null, { timeout: 7000 });
    await sleep(3200);
    await closeReader(page);
    assert.match(await page.textContent(`#view-library .book:has-text("${BOOK}") .newwords`), /Goal met today/);
    await page.click('#tabbar button[data-tab=home]'); await sleep(300);
    assert.match(await page.textContent('.bgoal'), /Done/);
    assert.deepEqual(errors, []);
  });

  test('milestones are celebrated as you pass them, but not for pages read before', async () => {
    const { page } = await openApp(t, srv.url);
    // Put an existing reader halfway through, from before milestones were tracked.
    await page.evaluate(async (title) => {
      const db = await new Promise((r) => { const q = indexedDB.open('langreader'); q.onsuccess = () => r(q.result); });
      const all = await new Promise((r) => { const q = db.transaction('books').objectStore('books').getAll(); q.onsuccess = () => r(q.result); });
      const b = all.find((x) => x.title === title);
      b.progress = { chapter: 1, page: 0, frac: 0.6, done: [0] };
      await new Promise((r) => { const tx = db.transaction('books', 'readwrite'); tx.objectStore('books').put(b); tx.oncomplete = r; });
    }, BOOK);
    await page.reload(); await page.waitForSelector('#view-library .book');
    await openBook(page);
    await sleep(200);
    assert.ok(await page.$eval('#r-cheer', (e) => e.hidden), 'no fanfare on opening');
    const seeded = (await bookRecord(page)).milestones;
    assert.ok('0.25' in seeded && seeded['0.25'] === null, 'past milestones count, undated');

    const shown = new Set();
    for (let i = 0; i < 12 && !(await bookRecord(page)).milestones['0.75']; i++) {
      await page.keyboard.press('ArrowRight'); await sleep(700);
      shown.add(await page.textContent('#r-cheer'));
    }
    assert.ok([...shown].some((s) => /through!/.test(s)), 'a milestone was celebrated');
    assert.ok(![...shown].some((s) => /quarter of the way/i.test(s)), 'not the one passed before');
    const ms = (await bookRecord(page)).milestones;
    assert.match(ms['0.75'], /^\d{4}-\d\d-\d\d$/, 'dated when reached');
  });
});
