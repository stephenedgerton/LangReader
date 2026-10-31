// Daily reviews: FSRS cards, the daily cap, reading as review, the Home card and settings.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openApp, openBook, closeReader, closeBrowser, tapWord, sleep } from './helpers.mjs';

const DAY = 86400000;

// Saves LingQs straight into the vocabulary, as if made `daysAgo` days ago (optionally with a due card).
const seed = (page, list) => page.evaluate(async (list) => {
  const v = await import('./js/vocab.js');
  for (const { term, daysAgo = 2, srs, status = 1 } of list) {
    const created = Date.now() - daysAgo * 86400000;
    await v.setWord(term, { status, meaning: term + ' (meaning)', created, ...(srs ? { srs: { ...srs, last: Date.now() - srs.ago * 86400000, due: Date.now() - 1000 } } : {}) });
  }
}, list);
const card = (page, term) => page.evaluate((t) => import('./js/vocab.js').then((m) => m.entry(t)), term);

describe('reviews', () => {
  const t = {};
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await closeBrowser(t); srv.server.close(); });

  test('turning a page credits the LingQs on it: read past moves forward, looked up comes back sooner', async () => {
    const { page, errors } = await openApp(t, srv.url);
    await seed(page, [{ term: 'treno' }, { term: 'valigia' }]);
    await openBook(page);
    await tapWord(page, 'valigia');
    await page.mouse.click(195, 300); await sleep(300); // close the bubble
    await page.keyboard.press('ArrowRight'); await sleep(800);
    const tr = await card(page, 'treno'), va = await card(page, 'valigia');
    assert.ok(tr.srs, 'treno was introduced by reading');
    assert.ok(tr.srs.s > 3, 'read past counts as Good');
    assert.equal(tr.status, 2, 'and moves it up a level');
    assert.ok(va.srs.s < 1, 'a lookup counts as Again');
    assert.equal(va.status, 1);
    assert.deepEqual(errors, []);
  });

  test('a LingQ saved today is left alone on the page turn', async () => {
    const { page } = await openApp(t, srv.url);
    await seed(page, [{ term: 'treno', daysAgo: 0 }]);
    await openBook(page);
    await page.keyboard.press('ArrowRight'); await sleep(800);
    assert.equal((await card(page, 'treno')).srs, undefined);
  });

  test('the day is capped, the most common words come first, and you can review more', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'home', settings: { reviewsPerDay: 10, newPerDay: 0 } });
    // 12 due cards: common words and a rare one.
    const terms = ['sbadigliare', 'casa', 'tempo', 'giorno', 'uomo', 'vita', 'mano', 'occhi', 'notte', 'porta', 'strada', 'acqua'];
    await seed(page, terms.map((term) => ({ term, srs: { s: 5, d: 5, reps: 2, lapses: 0, ago: 8 } })));
    await page.click('#tabbar button[data-tab=library]');
    await page.click('#tabbar button[data-tab=home]'); await sleep(300);
    assert.match(await page.textContent('.review-card'), /Today's Review\s*10 cards · about 1 min/);
    await page.click('.review-card'); await sleep(400);
    assert.match(await page.textContent('.sheet h2'), /1 of 10/);
    const seen = [];
    for (let i = 0; i < 10; i++) {
      seen.push(await page.textContent('.flash .fw'));
      await page.click('.flash');
      assert.equal(await page.$$eval('.review-btns.four button', (b) => b.length), 4);
      await page.click('[data-r="3"]'); await sleep(150);
    }
    assert.ok(!seen.includes('sbadigliare'), 'the rare word waits');
    assert.match(await page.textContent('.flash'), /10 cards reviewed · 10 remembered/);
    await page.click('[data-extra]'); await sleep(200);
    assert.match(await page.textContent('.sheet h2'), /1 of 2/);
    await page.click('.x'); await sleep(400);
    assert.match(await page.textContent('#view-home'), /Reviews done for today|Today's Review/);
    const c = await card(page, 'casa');
    assert.ok(c.srs.due > Date.now() + DAY, 'rescheduled');
    assert.deepEqual(errors, []);
  });

  test('Again brings a card back once at the end of the session', async () => {
    const { page } = await openApp(t, srv.url, { hash: 'vocab' });
    await seed(page, [{ term: 'casa', status: 3, srs: { s: 5, d: 5, reps: 2, lapses: 0, ago: 8 } }]);
    await page.click('#tabbar button[data-tab=home]'); await page.click('#tabbar button[data-tab=vocab]'); await sleep(200);
    assert.match(await page.textContent('#view-vocab [data-act=review]'), /Review \(1\)/);
    await page.click('#view-vocab [data-act=review]'); await sleep(400);
    await page.click('.flash'); await page.click('[data-r="1"]'); await sleep(200);
    assert.match(await page.textContent('.sheet h2'), /2 of 2/);
    assert.equal(await page.textContent('.flash .fw'), 'casa');
    await page.click('.flash'); await page.click('[data-r="3"]'); await sleep(200);
    assert.match(await page.textContent('.flash'), /1 card reviewed · 0 remembered/);
    const c = await card(page, 'casa');
    assert.equal(c.status, 2, 'forgetting dropped it a level');
    assert.equal(c.srs.lapses, 1);
  });

  test('review settings are saved as numbers', async () => {
    const { page } = await openApp(t, srv.url, { hash: 'home' });
    await page.click('[data-act=settings]'); await sleep(300);
    await page.selectOption('select[name=reviewsPerDay]', '50');
    await page.selectOption('select[name=retention]', 'relaxed');
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.settings')));
    assert.equal(s.reviewsPerDay, 50);
    assert.equal(s.retention, 'relaxed');
  });
});
