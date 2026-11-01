// Library and app shell: bundled stories, imports, backup reminder, review, tips, settings.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { startServer, openApp, openBook, closeReader, closeBrowser, FIXTURES, sleep } from './helpers.mjs';

const bookTitles = (page) => page.$$eval('#view-library .cover .ct', (e) => e.map((x) => x.textContent));

describe('library', () => {
  const t = {};
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await closeBrowser(t); srv.server.close(); });

  test('a fresh install gets all bundled stories', async () => {
    const { page, errors } = await openApp(t, srv.url);
    assert.deepEqual((await bookTitles(page)).sort(), [
      'Il gatto e la scatola', 'Il ladro di mezzanotte', 'Il segnale sotto il ghiaccio', 'La bottega delle chiavi', 'La stanza numero sette',
      'Un caffè a Bologna', 'Una casa a Montemare',
    ]);
    await openBook(page, 'Il segnale sotto il ghiaccio');
    assert.equal(await page.textContent('#r-running'), 'Capitolo 1 · Le tre e diciassette');
    assert.deepEqual(errors, []);
  });

  test('an old install gets the new stories once; deleted ones stay deleted', async () => {
    const { page } = await openApp(t, srv.url);
    // Recreate the state from before story ids: only the original sample, seeded flag set.
    await page.evaluate(async () => {
      const db = await new Promise((r) => { const q = indexedDB.open('langreader'); q.onsuccess = () => r(q.result); });
      const books = await new Promise((r) => { const q = db.transaction('books').objectStore('books').getAll(); q.onsuccess = () => r(q.result); });
      const tx = db.transaction('books', 'readwrite');
      for (const b of books) if (b.title !== 'Un caffè a Bologna') tx.objectStore('books').delete(b.id);
      await new Promise((r) => { tx.oncomplete = r; });
      localStorage.removeItem('langreader.samplesAdded');
      localStorage.setItem('langreader.seeded', '1');
    });
    await page.reload(); await page.waitForSelector('#view-library .book');
    const titles = await bookTitles(page);
    assert.equal(titles.length, 7);
    assert.equal(new Set(titles).size, 7, 'no duplicates');

    page.once('dialog', (d) => d.accept());
    await page.click('#view-library .book:has-text("La stanza numero sette") [data-more]');
    await page.click('[data-a=delete]'); await sleep(400);
    await page.reload(); await page.waitForSelector('#view-library .book');
    assert.ok(!(await bookTitles(page)).includes('La stanza numero sette'));
  });

  test('imports EPUB (with its table of contents) and TXT (split on Capitolo)', async () => {
    const { page, errors } = await openApp(t, srv.url);
    await page.click('[data-act=add]');
    await page.setInputFiles('.file-pick input', join(FIXTURES, 'test.epub'));
    await page.waitForSelector('#page-content .w');
    assert.equal(await page.textContent('#r-running'), 'Primo');
    await page.click('#r-menu'); await page.click('[data-act=contents]'); await sleep(300);
    assert.deepEqual(await page.$$eval('.toc button span', (e) => e.map((x) => x.textContent)), ['Primo', 'Secondo']);
    await page.click('.sheet .x'); await sleep(300);
    await closeReader(page);

    await page.click('[data-act=add]');
    await page.setInputFiles('.file-pick input', join(FIXTURES, 'lezione.txt'));
    await page.waitForSelector('#page-content .w');
    assert.equal(await page.textContent('#r-running'), 'Capitolo 1');
    assert.deepEqual(errors, []);
  });

  test('pasted text becomes a lesson', async () => {
    const { page } = await openApp(t, srv.url);
    await page.click('[data-act=add]');
    await page.fill('input[name=title]', 'Notizie');
    await page.fill('textarea[name=text]', 'Oggi a Milano piove.\n\nDomani tornerà il sole.');
    await page.click('form .primary');
    await page.waitForSelector('#page-content .w');
    assert.ok(await page.$('.w[data-w="milano"]'));
  });

  test('backup reminder appears after reading, and a backup downloads and clears it', async () => {
    const { page } = await openApp(t, srv.url, { hash: 'home' });
    assert.equal(await page.$('.backup-card'), null, 'no reminder for a new user');
    await page.click('#tabbar button[data-tab=library]');
    await openBook(page);
    await page.keyboard.press('ArrowRight'); await sleep(600);
    await closeReader(page);
    await page.click('#tabbar button[data-tab=home]'); await sleep(300);
    assert.match(await page.textContent('.backup-card p'), /\d+ words are saved only on this phone\. Last backup: never/);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=backup]')]);
    assert.match(dl.suggestedFilename(), /^langreader-backup-\d{4}-\d{2}-\d{2}\.json$/);
    await sleep(300);
    assert.equal(await page.$('.backup-card'), null);
    await page.click('[data-act=settings]'); await sleep(400);
    assert.match(await page.textContent('.storage-status'), /Last backup: today/);
  });

  test('review: Good on a new LingQ moves it up a level', async () => {
    const { page } = await openApp(t, srv.url);
    await openBook(page);
    const b = await (await page.$('.w[data-w="treno"]')).boundingBox();
    await page.mouse.click(b.x + 4, b.y + 5); await sleep(300);
    await page.click('.wpop [data-s="1"]'); await sleep(300);
    await closeReader(page);
    await page.click('#tabbar button[data-tab=vocab]'); await sleep(300);
    await page.click('[data-act=review]'); await sleep(300);
    assert.equal(await page.textContent('.flash .fw'), 'treno');
    await page.click('[data-flip]'); await page.click('[data-r="3"]'); await sleep(300);
    assert.match(await page.textContent('.rv-done'), /1 card reviewed · 1 remembered/);
    await page.click('[data-done]'); await sleep(300);
    assert.match(await page.textContent('.row[data-t="treno"] .pill'), /^2$/);
  });

  test('reading tips show once, and Settings can bring them back', async () => {
    const { page } = await openApp(t, srv.url, { tipsSeen: false });
    await openBook(page);
    assert.ok(await page.$('.tips'));
    await page.click('.tips .primary');
    await closeReader(page);
    await openBook(page);
    assert.equal(await page.$('.tips'), null);
    await closeReader(page);
    await page.click('#tabbar button[data-tab=home]');
    await page.click('[data-act=settings]'); await sleep(300);
    await page.click('[data-act=tips]');
    await page.click('.sheet .x'); await sleep(300);
    await page.click('#tabbar button[data-tab=library]');
    await openBook(page);
    assert.ok(await page.$('.tips'));
  });
});
