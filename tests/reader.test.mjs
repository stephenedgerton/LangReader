// Reader: pagination, page curl / slide / none, chapter boundaries, auto-known with Undo, themes.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openApp, openBook, closeBrowser, pageNo, swipe, sleep } from './helpers.mjs';

describe('reader', () => {
  const t = {};
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await closeBrowser(t); srv.server.close(); });

  test('opens paginated, with the chapter title and page count', async () => {
    const { page, errors } = await openApp(t, srv.url);
    await openBook(page);
    assert.equal(await page.textContent('#r-running'), 'Capitolo 1 · L’arrivo');
    assert.match(await page.textContent('#r-pageno'), /^1 of \d+/);
    assert.ok((await page.$$('.w.s0')).length > 50, 'unknown words are blue');
    assert.deepEqual(errors, []);
  });

  test('curl: drag forward turns, small drag cancels, drag back returns', async () => {
    const { page, errors } = await openApp(t, srv.url);
    await openBook(page);
    // Mid-drag the curl layer is on screen.
    await page.mouse.move(360, 560); await page.mouse.down();
    for (let x = 360; x >= 170; x -= 20) await page.mouse.move(x, 540);
    assert.ok(await page.$('.curl'), 'curl layer during drag');
    await page.mouse.move(120, 540); await page.mouse.up(); await sleep(500);
    assert.equal(await pageNo(page), 2);
    assert.equal(await page.$('.curl'), null, 'curl layer removed');

    await page.mouse.move(360, 400); await page.mouse.down(); await page.mouse.move(335, 400, { steps: 4 });
    await sleep(400); await page.mouse.up(); await sleep(500);
    assert.equal(await pageNo(page), 2, 'small slow drag cancels');

    await swipe(page, 30, 260, 300);
    assert.equal(await pageNo(page), 1);
    assert.deepEqual(errors, []);
  });

  test('edge taps and arrow keys turn pages, and cross chapters both ways', async () => {
    const { page } = await openApp(t, srv.url);
    await openBook(page);
    await page.mouse.click(385, 120); await sleep(600);
    assert.equal(await pageNo(page), 2);
    const pages = +(await page.textContent('#r-pageno')).split(' ')[2];
    for (let i = 0; i < pages - 1; i++) { await page.keyboard.press('ArrowRight'); await sleep(550); }
    assert.equal(await page.textContent('#r-running'), 'Capitolo 2 · La libreria');
    assert.equal(await pageNo(page), 1);
    await page.keyboard.press('ArrowLeft'); await sleep(600);
    assert.equal(await page.textContent('#r-running'), 'Capitolo 1 · L’arrivo');
    assert.equal(await pageNo(page), pages, 'back lands on the last page of the previous chapter');
  });

  test('paging forward marks blue words known (not titles) and Undo restores them', async () => {
    const { page } = await openApp(t, srv.url);
    await openBook(page);
    await page.keyboard.press('ArrowRight'); await sleep(600);
    const msg = await page.textContent('#r-toast');
    const n = +msg.match(/\+(\d+) known/)[1];
    assert.ok(n > 50);
    await page.keyboard.press('ArrowLeft'); await sleep(600);
    assert.ok(await page.$('h1 .w.s0[data-w="capitolo"]'), 'chapter title words stay blue');
    assert.equal(await page.$('p .w.s0[data-w="treno"]'), null, 'body words became known');
    await page.click('#r-toast button'); await sleep(300);
    assert.equal(await page.textContent('#r-toast'), `${n} words back to new`);
    assert.ok(await page.$('p .w.s0[data-w="treno"]'), 'Undo made them blue again');
  });

  for (const style of ['slide', 'none']) {
    test(`page turn style "${style}" turns without a curl`, async () => {
      const { page, errors } = await openApp(t, srv.url, { settings: { pageTurn: style } });
      await openBook(page);
      await page.mouse.move(360, 400); await page.mouse.down(); await page.mouse.move(150, 400, { steps: 8 });
      assert.equal(await page.$('.curl'), null);
      await page.mouse.up(); await sleep(500);
      assert.equal(await pageNo(page), 2);
      assert.deepEqual(errors, []);
    });
  }

  test('themes sheet switches theme, dark mode and font size (relayouts)', async () => {
    const { page } = await openApp(t, srv.url);
    await openBook(page);
    await page.click('#r-menu'); await page.click('[data-act=themes]'); await sleep(300);
    const before = +(await page.textContent('#r-pageno')).split(' ')[2];
    await page.click('.theme[data-theme=calm]');
    await page.click('[data-tog=dark]');
    for (let i = 0; i < 3; i++) await page.click('[data-size="1"]');
    await sleep(400);
    assert.equal(await page.getAttribute('#reader', 'data-theme'), 'calm');
    assert.ok(await page.$eval('#reader', (e) => e.classList.contains('dark')));
    assert.ok(+(await page.textContent('#r-pageno')).split(' ')[2] > before, 'bigger text means more pages');
  });

  test('contents sheet jumps to a chapter', async () => {
    const { page } = await openApp(t, srv.url);
    await openBook(page);
    await page.click('#r-menu'); await page.click('[data-act=contents]'); await sleep(300);
    await page.click('.toc button[data-i="2"]'); await sleep(700);
    assert.equal(await page.textContent('#r-running'), 'Capitolo 3 · La lettera');
    assert.ok(await page.$eval('#sheet', (e) => e.hidden), 'no stray sheet opens afterwards');
  });
});
