// Word interaction: quick bubble, full card, Wiktionary lookups, phrases, Google Translate links.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openApp, openBook, closeReader, closeBrowser, pageNo, tapWord, holdWord, sleep } from './helpers.mjs';

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
    assert.match(await text(page, '.wp-mean'), /he\/she arrived, reached/, 'the base sense, put into the tapped form');
    const pop = await (await page.$('.wpop')).boundingBox();
    assert.ok(pop.x >= 0 && pop.x + pop.width <= 390, 'bubble stays on screen');

    await page.click('.wpop [data-s="2"]'); await sleep(300);
    assert.match(await page.getAttribute('.w[data-w="arrivò"]', 'class'), /\bs2\b/);
    assert.match(await text(page, '.wp-mean'), /he\/she arrived, reached\s*Saved/);

    await page.mouse.click(10, 150); await sleep(300); // a tap off the text closes it without turning
    assert.equal(await page.$$eval('.wpop', (e) => e.length), 0, 'bubble closed');
    assert.equal(await pageNo(page), 1);
    assert.deepEqual(errors, []);
  });

  test('full card: Wiktionary entry, base word, capitalised fallback, MT fallback', async () => {
    const { page, wikt } = await openApp(t, srv.url, { mt: 'arrived' });
    await openBook(page);
    await tapWord(page, 'arrivò'); await page.click('.wpop .wp-more'); await sleep(500);
    assert.match(await text(page, '.dict'), /third-person singular past historic of arrivare/);
    assert.deepEqual(await page.$$eval('.hint span:first-child', (e) => e.map((x) => x.firstChild.textContent.trim())),
      ['he/she arrived, reached', 'to arrive, to reach', 'to succeed', 'arrived']);
    assert.match(await text(page, '.hint'), /arrivare · 3rd sg\. past historic/);
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
    assert.equal(await text(page, '.wpop .wp-term'), 'valigia piccola e un quaderno nuovo');
    assert.equal(await pageNo(page), 1);
    // Painted like a tapped word, as one box per line: the phrase wraps onto a second line here.
    assert.equal((await page.$$('.w.sel')).length, 6);
    assert.equal((await page.$$('.w.sel.sel-l')).length, 2, 'one box per line');
    assert.equal((await page.$$('.w.sel.sel-r')).length, 2);
    assert.ok(await page.$eval('.w.sel[data-w="valigia"]', (e) => parseFloat(e.style.getPropertyValue('--gap')) > 0), 'space after a word is filled');
    await page.click('.wpop [data-s="2"]'); await sleep(400);
    await page.mouse.click(10, 450); await sleep(300); // tap off
    assert.equal(await page.$$eval('.wpop', (e) => e.length), 0, 'bubble closed');
    assert.equal((await page.$$('.w.sel')).length, 0, 'selection highlight cleared');
    assert.equal((await page.$$('.w.ph')).length, 6, 'saved phrase is marked');
    assert.equal(await page.getAttribute('.phr', 'class'), 'phr s2', 'shown as one block at its level');
    assert.equal(await text(page, '.phr'), 'valigia piccola e un quaderno nuovo');
  });

  test('hold, lift, then tap the last word also makes a phrase', async () => {
    const { page } = await openApp(t, srv.url);
    await openBook(page);
    await holdWord(page, 'treno'); await page.mouse.up(); await sleep(200);
    assert.equal(await page.textContent('#r-toast'), 'Drag to select a phrase, or tap its last word');
    await tapWord(page, 'bologna'); await sleep(300);
    assert.equal(await text(page, '.wpop .wp-term'), 'treno arrivò a Bologna');
  });

  test('closing a new phrase saves it as LingQ 1; a second tap on it drills into the word', async () => {
    const { page, errors } = await openApp(t, srv.url, { mt: 'a small suitcase' });
    await openBook(page);
    await holdWord(page, 'valigia');
    const b = await (await page.$('.w[data-w="nuovo"]')).boundingBox();
    await page.mouse.move(b.x + 4, b.y + 5, { steps: 6 });
    await page.mouse.up(); await sleep(500);
    await page.mouse.click(10, 450); await sleep(500); // tap off
    assert.equal(await page.getAttribute('.phr', 'class'), 'phr s1');
    assert.equal(await page.getAttribute('.phr', 'data-ph'), 'valigia piccola e un quaderno nuovo');

    await tapWord(page, 'quaderno');
    assert.equal(await text(page, '.wpop .wp-term'), 'valigia piccola e un quaderno nuovo', 'first tap: the phrase');
    assert.match(await text(page, '.wp-mean'), /a small suitcase\s*Saved/);
    await tapWord(page, 'quaderno');
    assert.equal(await text(page, '.wpop .wp-term'), 'quaderno', 'second tap: the word');
    assert.deepEqual(await page.$$eval('.w.sel', (e) => e.map((x) => x.dataset.w)), ['quaderno']);
    await page.mouse.click(10, 450); await sleep(300);
    await tapWord(page, 'quaderno');
    assert.equal(await text(page, '.wpop .wp-term'), 'valigia piccola e un quaderno nuovo', 'starts over with the phrase');
    assert.deepEqual(errors, []);
  });

  test('a phrase keeps its sentence and the sentence translation, shown in Vocabulary', async () => {
    const { page, errors } = await openApp(t, srv.url, { mt: 'a small suitcase' });
    await openBook(page);
    await holdWord(page, 'valigia');
    const b = await (await page.$('.w[data-w="nuovo"]')).boundingBox();
    await page.mouse.move(b.x + 4, b.y + 5, { steps: 6 });
    await page.mouse.up(); await sleep(500);
    await page.click('.wpop .wp-more'); await sleep(400);
    await page.click('.hint'); await sleep(300); // save the suggested meaning
    await page.click('.tr-btn'); await sleep(400);
    await page.click('.wcard .x'); await sleep(300);
    await closeReader(page);
    await page.click('#tabbar button[data-tab=vocab]');
    await page.click('[data-f=phrases]'); await sleep(300);
    const row = '.row[data-t="valigia piccola e un quaderno nuovo"]';
    assert.equal(await text(page, `${row} .w`), 'valigia piccola e un quaderno nuovo');
    assert.equal(await text(page, `${row} .ex`), 'Giulia scese con una valigia piccola e un quaderno nuovo.');
    assert.equal(await text(page, `${row} .ex b`), 'valigia piccola e un quaderno nuovo');
    await page.click(row); await sleep(400);
    assert.equal(await text(page, '.ctx .tr'), 'a small suitcase', 'saved sentence translation');
    assert.equal(await page.$('.tr-btn'), null);
    assert.deepEqual(errors, []);
  });

  test('"Save whole sentence" makes the sentence one LingQ', async () => {
    const { page, errors } = await openApp(t, srv.url, { mt: 'The train arrived in Bologna at eight in the morning' });
    await openBook(page);
    await tapWord(page, 'treno'); await page.click('.wpop .wp-more'); await sleep(400);
    await page.click('.sent-btn'); await sleep(400);
    assert.equal(await page.textContent('.wcard .term'), 'Il treno arrivò a Bologna alle otto di mattina');
    assert.equal(await page.$('.sent-btn'), null);
    assert.match(await text(page, '.hint'), /^The train arrived in Bologna at eight in the morning/);
    await page.click('.hint'); await sleep(400);
    await page.click('.wcard .x'); await sleep(300);
    assert.equal((await page.$$('.sent:first-of-type .w.ph')).length, 9, 'every word of the sentence is marked');
    assert.deepEqual(errors, []);
  });

  test('with the bubble open, a tap anywhere only closes it; a looked-up New word becomes LingQ 1', async () => {
    const { page, errors } = await openApp(t, srv.url);
    await openBook(page);
    await tapWord(page, 'treno'); await sleep(200);
    await tapWord(page, 'buongiorno'); // a tap on another word just closes the bubble
    assert.equal(await page.$$eval('.wpop', (e) => e.length), 0, 'bubble closed');
    assert.match(await page.getAttribute('.w[data-w="treno"]', 'class'), /\bs1\b/, 'treno became LingQ 1');
    assert.match(await page.getAttribute('.w[data-w="buongiorno"]', 'class'), /\bs0\b/, 'and the other word is untouched');
    await sleep(200);
    await page.mouse.click(385, 300); await sleep(600);
    assert.equal(await pageNo(page), 2, 'the next tap works as usual');
    await page.keyboard.press('ArrowLeft'); await sleep(600);

    // A known word stays known, and a held press with the bubble open doesn't start a phrase.
    await tapWord(page, 'valigia'); await page.click('.wpop [data-s="5"]'); await sleep(400);
    await tapWord(page, 'valigia'); await sleep(200);
    await holdWord(page, 'buongiorno'); await page.mouse.up(); await sleep(300);
    assert.equal(await page.$$eval('.wpop', (e) => e.length), 0, 'bubble closed');
    assert.equal(await page.$$eval('.w.sel', (e) => e.length), 0, 'no phrase selection');
    assert.match(await page.getAttribute('.w[data-w="valigia"]', 'class'), /^w( |$)/, 'still known');
    assert.deepEqual(errors, []);
  });

  test('a tap right after the bubble closes does not turn the page', async () => {
    const { page } = await openApp(t, srv.url);
    await openBook(page);
    await tapWord(page, 'treno');
    await page.click('.wpop [data-s="5"]'); await sleep(320); // ✓ closes the bubble after 260 ms
    await page.mouse.click(385, 300); await sleep(500); // the "second tap" lands on the right edge
    assert.equal(await pageNo(page), 1);
    await page.mouse.click(385, 300); await sleep(600);
    assert.equal(await pageNo(page), 2, 'a later edge tap still turns');
  });

  test('a tap that wobbles sideways opens the word instead of turning', async () => {
    const { page } = await openApp(t, srv.url);
    await openBook(page);
    const b = await (await page.$('.w[data-w="valigia"]')).boundingBox();
    await page.mouse.move(b.x + 30, b.y + 5); await page.mouse.down();
    await page.mouse.move(b.x + 8, b.y + 6, { steps: 2 }); await page.mouse.up(); await sleep(500);
    assert.equal(await pageNo(page), 1);
  });

  test('names start out ignored, and words use LingQ underlines', async () => {
    const { page } = await openApp(t, srv.url);
    await openBook(page);
    assert.equal(await page.getAttribute('.w[data-w="giulia"]', 'class'), 'w', 'Giulia is not blue');
    const style = await page.$eval('.w[data-w="treno"]', (e) => { const s = getComputedStyle(e); return [s.textDecorationLine, s.backgroundColor]; });
    assert.deepEqual(style, ['underline', 'rgba(0, 0, 0, 0)']);
    await closeReader(page);
    await page.click('#tabbar button[data-tab=vocab]');
    await page.click('[data-f=ignored]'); await sleep(300);
    assert.ok(await page.$('.row[data-t="giulia"]'));
    assert.ok(await page.$('.row[data-t="okafor"]'));
    assert.equal(await page.$('.row[data-t="rosa"]'), null, 'names that are also words stay out');
  });

  test('the background highlight style is still available', async () => {
    const { page } = await openApp(t, srv.url, { settings: { hlStyle: 'background' } });
    await openBook(page);
    const style = await page.$eval('.w[data-w="treno"]', (e) => getComputedStyle(e).backgroundColor);
    assert.notEqual(style, 'rgba(0, 0, 0, 0)');
  });
});
