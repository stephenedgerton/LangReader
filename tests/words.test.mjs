// Word interaction: quick bubble, full card, Wiktionary lookups, phrases, Google Translate links.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openApp, openBook, closeBrowser, pageNo, tapWord, holdWord, sleep } from './helpers.mjs';

const text = async (page, sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();

describe('words', () => {
  const t = {};
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await closeBrowser(t); srv.server.close(); });

  test('bubble shows base form and meaning; a level saves a LingQ with that meaning', async () => {
    const { page, errors } = await openApp(t, srv.url);
    await openBook(page);
    await tapWord(page, 'arrivò'); await sleep(300);
    assert.match(await text(page, '.wpop'), /arrivò → arrivare/);
    assert.match(await text(page, '.wp-mean'), /to arrive, to reach/);
    const pop = await (await page.$('.wpop')).boundingBox();
    assert.ok(pop.x >= 0 && pop.x + pop.width <= 390, 'bubble stays on screen');

    await page.click('.wpop [data-s="2"]'); await sleep(300);
    assert.match(await page.getAttribute('.w[data-w="arrivò"]', 'class'), /\bs2\b/);
    assert.match(await text(page, '.wp-mean'), /to arrive, to reach\s*Saved/);

    await page.mouse.click(10, 150); await sleep(300); // a tap off the text closes it without turning
    assert.equal(await page.$('.wpop'), null);
    assert.equal(await pageNo(page), 1);
    assert.deepEqual(errors, []);
  });

  test('full card: Wiktionary entry, base word, capitalised fallback, MT fallback', async () => {
    const { page, wikt } = await openApp(t, srv.url, { mt: 'arrived' });
    await openBook(page);
    await tapWord(page, 'arrivò'); await page.click('.wpop .wp-more'); await sleep(500);
    assert.match(await text(page, '.dict'), /third-person singular past historic of arrivare/);
    assert.deepEqual(await page.$$eval('.hint span:first-child', (e) => e.map((x) => x.firstChild.textContent.trim())),
      ['to arrive, to reach', 'to succeed', 'arrived']);
    await page.click('.lemma-btn'); await sleep(500);
    assert.equal(await page.textContent('.wcard .term'), 'arrivare');
    await page.click('.wcard .x'); await sleep(300);

    await tapWord(page, 'bologna'); await page.click('.wpop .wp-more'); await sleep(500);
    assert.match(await text(page, '.dict'), /Proper noun.*Emilia-Romagna/);
    await page.click('.wcard .x'); await sleep(300);

    await tapWord(page, 'treno'); await page.click('.wpop .wp-more'); await sleep(500);
    assert.ok(await page.$eval('.dict', (e) => e.hidden), 'no Wiktionary entry: no dictionary panel');
    assert.deepEqual(await page.$$eval('.hint span:first-child', (e) => e.map((x) => x.textContent.trim())), ['arrived']);
    assert.equal(wikt.filter((w) => w === 'arrivare').length, 1, 'base word fetched once per session');
  });

  test('Google Translate links carry the sentence and the page', async () => {
    const { page } = await openApp(t, srv.url);
    await openBook(page);
    await tapWord(page, 'treno'); await page.click('.wpop .wp-more'); await sleep(400);
    const url = new URL(await page.getAttribute('.gt-link', 'href'));
    assert.equal(url.searchParams.get('sl'), 'it');
    assert.equal(url.searchParams.get('text'), 'Il treno arrivò a Bologna alle otto di mattina.');
    await page.click('.wcard .x'); await sleep(300);
    await page.click('#r-menu'); await page.click('[data-act=translate-page]'); await sleep(400);
    const pageUrl = new URL(await page.getAttribute('.gt-page', 'href'));
    assert.match(pageUrl.searchParams.get('text'), /Capitolo 1 · L’arrivo.*Il treno arrivò a Bologna/);
  });

  test('hold and drag selects a phrase without turning the page', async () => {
    const { page } = await openApp(t, srv.url);
    await openBook(page);
    await holdWord(page, 'valigia');
    for (const w of ['piccola', 'nuovo']) {
      const b = await (await page.$(`.w[data-w="${w}"]`)).boundingBox();
      await page.mouse.move(b.x + 4, b.y + 5, { steps: 5 });
    }
    await page.mouse.up(); await sleep(500);
    assert.equal(await page.textContent('.wcard .term'), 'valigia piccola e un quaderno nuovo');
    assert.equal(await pageNo(page), 1);
    await page.click('.status-bar [data-s="2"]'); await sleep(400);
    await page.click('.wcard .x'); await sleep(300);
    assert.equal((await page.$$('.w.sel')).length, 0, 'selection highlight cleared');
    assert.equal((await page.$$('.w.ph')).length, 6, 'saved phrase is underlined');
  });

  test('hold, lift, then tap the last word also makes a phrase', async () => {
    const { page } = await openApp(t, srv.url);
    await openBook(page);
    await holdWord(page, 'treno'); await page.mouse.up(); await sleep(200);
    assert.equal(await page.textContent('#r-toast'), 'Drag to select a phrase, or tap its last word');
    await tapWord(page, 'bologna'); await sleep(300);
    assert.equal(await page.textContent('.wcard .term'), 'treno arrivò a Bologna');
  });
});
