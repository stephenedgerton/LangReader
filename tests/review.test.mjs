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
    const { page, errors } = await openApp(t, srv.url, { hash: 'home', settings: { reviewsPerDay: 10, newPerDay: 0, reviewStyle: 'flip' } });
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
    assert.match(await page.textContent('.rv-done'), /10 cards reviewed · 10 remembered/);
    await page.click('[data-extra]'); await sleep(200);
    assert.match(await page.textContent('.sheet h2'), /1 of 2/);
    await page.click('.x'); await sleep(400);
    assert.match(await page.textContent('#view-home'), /Reviews done for today|Today's Review/);
    const c = await card(page, 'casa');
    assert.ok(c.srs.due > Date.now() + DAY, 'rescheduled');
    assert.deepEqual(errors, []);
  });

  test('Again brings a card back once at the end of the session', async () => {
    const { page } = await openApp(t, srv.url, { hash: 'vocab', settings: { reviewStyle: 'flip' } });
    await seed(page, [{ term: 'casa', status: 3, srs: { s: 5, d: 5, reps: 2, lapses: 0, ago: 8 } }]);
    await page.click('#tabbar button[data-tab=home]'); await page.click('#tabbar button[data-tab=vocab]'); await sleep(200);
    assert.match(await page.textContent('#view-vocab [data-act=review]'), /Review \(1\)/);
    await page.click('#view-vocab [data-act=review]'); await sleep(400);
    await page.click('.flash'); await page.click('[data-r="1"]'); await sleep(200);
    assert.match(await page.textContent('.sheet h2'), /2 of 2/);
    assert.equal(await page.textContent('.flash .fw'), 'casa');
    await page.click('.flash'); await page.click('[data-r="3"]'); await sleep(200);
    assert.match(await page.textContent('.rv-done'), /1 card reviewed · 0 remembered/);
    const c = await card(page, 'casa');
    assert.equal(c.status, 2, 'forgetting dropped it a level');
    assert.equal(c.srs.lapses, 1);
  });

  // Opens today's review from the Vocabulary tab once the seeded cards are in.
  const openReview = async (page) => {
    await page.click('#tabbar button[data-tab=home]'); await page.click('#tabbar button[data-tab=vocab]'); await sleep(200);
    await page.click('#view-vocab [data-act=review]'); await sleep(400);
  };
  const due = (reps) => ({ s: 5, d: 5, reps, lapses: 0, ago: 8 });
  const others = ['casa', 'tempo', 'giorno', 'notte'].map((term) => ({ term, status: 5 }));

  test('the word and its sentence can be played, and the card flips back and forth', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'vocab' });
    await page.evaluate(() => { window.__said = []; speechSynthesis.speak = (u) => window.__said.push(u.text); });
    await seed(page, [{ term: 'treno', srs: due(0) }]);
    await page.evaluate(() => import('./js/vocab.js').then((v) => v.setWord('treno', { example: 'Il treno arrivò alla stazione.' })));
    await openReview(page);
    await page.click('.face.front [data-say=word]');
    await page.click('.face.front [data-say=sentence]');
    assert.deepEqual(await page.evaluate(() => window.__said), ['treno', 'Il treno arrivò alla stazione.']);
    assert.equal(await page.$eval('.flash', (e) => e.classList.contains('flipped')), false, 'playing audio does not flip');
    await page.click('.flash .face.front .fw'); await sleep(100);
    assert.ok(await page.$eval('.flash', (e) => e.classList.contains('flipped')));
    assert.equal(await page.$$eval('.review-btns.four button', (b) => b.length), 4);
    await page.click('.flash .face.back .fm'); await sleep(100);
    assert.equal(await page.$eval('.flash', (e) => e.classList.contains('flipped')), false, 'tapping again flips it back');
    assert.deepEqual(errors, []);
  });

  test('a meaning can be fixed on the card, by hand or from the dictionary', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'vocab', settings: { reviewStyle: 'flip' } });
    await seed(page, [{ term: 'arrivò', srs: due(2) }]);
    await openReview(page);
    await page.click('[data-flip]'); await sleep(100);
    await page.click('.rv-edit');
    await page.fill('.fm-edit input', 'arrived');
    await page.press('.fm-edit input', 'Enter'); await sleep(200);
    assert.equal(await page.textContent('.face.back .fm'), 'arrived');
    assert.equal((await card(page, 'arrivò')).meaning, 'arrived');
    await page.click('.rv-dict-btn'); await sleep(600);
    assert.match(await page.textContent('.rv-dict .dict'), /to arrive, to reach/);
    await page.click('.rv-dict .hint[data-t="mock translation"]'); await sleep(200);
    assert.equal((await card(page, 'arrivò')).meaning, 'mock translation');
    assert.equal(await page.textContent('.face.back .fm'), 'mock translation');
    assert.ok(await page.$('.rv-dict .hint.on[data-t="mock translation"]'));
    assert.deepEqual(errors, []);
  });

  test('known cards take turns: pick the meaning, and fill the gap', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'vocab' });
    await seed(page, [...others, { term: 'treno', status: 2, srs: due(2) }]);
    await openReview(page);
    assert.match(await page.textContent('.face.front .q-label'), /What does it mean/);
    assert.equal(await page.$$eval('.rv-opt', (b) => b.length), 4);
    const right = await page.$$eval('.rv-opt', (b) => b.findIndex((x) => x.textContent.includes('treno (meaning)')));
    await page.click(`.rv-opt[data-opt="${(right + 1) % 4}"]`); await sleep(100);
    assert.ok(await page.$('.rv-opt.wrong'));
    assert.ok(await page.$(`.rv-opt.right[data-opt="${right}"]`));
    assert.ok(await page.$eval('.flash', (e) => e.classList.contains('flipped')), 'the answer is shown');
    await page.click('[data-r]'); await sleep(200);
    const c = await card(page, 'treno');
    assert.equal(c.srs.lapses, 1, 'a wrong pick counts as Again');

    // Fill the gap: a card on its second review, with its sentence.
    const p2 = (await openApp(t, srv.url, { hash: 'vocab' })).page;
    await seed(p2, [...others, { term: 'treno', status: 2, srs: due(1) }]);
    await p2.evaluate(() => import('./js/vocab.js').then((v) => v.setWord('treno', { example: 'Il Treno arrivò alla stazione.' })));
    await openReview(p2);
    assert.match(await p2.textContent('.face.front'), /Fill in the gap/);
    assert.doesNotMatch(await p2.textContent('.face.front .cloze'), /treno/i, 'the word is hidden');
    await p2.click('.rv-opt:has-text("treno")'); await sleep(100);
    assert.match(await p2.textContent('.rv-verdict'), /\S/);
    assert.ok(await p2.$('.rv-verdict.ok'));
    await p2.click('[data-r="3"]'); await sleep(200);
    assert.ok((await card(p2, 'treno')).srs.due > Date.now() + DAY);
    assert.deepEqual(errors, []);
  });

  test('swipe right for Know, left for Still learning, and Undo puts the card back', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'vocab', settings: { reviewStyle: 'flip' } });
    await seed(page, [{ term: 'casa', status: 3, srs: due(2) }, { term: 'tempo', status: 3, srs: due(2) }]);
    await openReview(page);
    const swipe = async (dx) => {
      const r = await page.$eval('.flash', (e) => { const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
      await page.mouse.move(r.x, r.y); await page.mouse.down();
      for (let k = 1; k <= 6; k++) await page.mouse.move(r.x + (dx * k) / 6, r.y + 2);
      await page.mouse.up(); await sleep(250);
    };
    const first = await page.textContent('.flash .fw');
    await swipe(160);
    assert.match(await page.textContent('.rv-tally .t-good'), /1/);
    assert.ok((await card(page, first)).srs.due > Date.now() + DAY, 'swiped right counts as Good');
    assert.match(await page.textContent('.sheet h2'), /2 of 2/);
    await page.click('.rv-undo'); await sleep(250);
    assert.match(await page.textContent('.sheet h2'), /1 of 2/);
    assert.equal(await page.textContent('.flash .fw'), first);
    const back = await card(page, first);
    assert.equal(back.srs.reps, 2, 'the card is as it was');
    assert.ok(back.srs.due < Date.now());
    await swipe(-160);
    assert.equal((await card(page, first)).srs.lapses, 1, 'swiped left counts as Again');
    assert.match(await page.textContent('.rv-tally .t-again'), /1/);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.srsDay')).reviews), 1);
    assert.deepEqual(errors, []);
  });

  test('words in the sentence can be looked up, saved as LingQs, and the sentence translated', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'vocab', settings: { reviewStyle: 'flip' } });
    await seed(page, [{ term: 'treno', srs: due(2) }]);
    await page.evaluate(() => import('./js/vocab.js').then((v) => v.setWord('treno', { example: 'Il treno arrivò alla stazione.' })));
    await openReview(page);
    assert.equal(await page.$$eval('.face.front .fc b', (b) => b.map((x) => x.textContent).join()), 'treno', 'the card\'s word is bold');
    assert.ok(await page.$('.face.front .cw.s0[data-w="arrivò"]'), 'other words are tappable and coloured New');
    await page.click('.face.front .cw[data-w="arrivò"]'); await sleep(500);
    assert.equal(await page.$eval('.flash', (e) => e.classList.contains('flipped')), false, 'looking up a word does not flip');
    assert.match(await page.textContent('.face.front .cgloss'), /arrivò\s*he\/she arrived, reached/);
    await page.click('.face.front .cg-add'); await sleep(200);
    const a = await card(page, 'arrivò');
    assert.equal(a.status, 1);
    assert.equal(a.meaning, 'he/she arrived, reached');
    assert.equal(a.example, 'Il treno arrivò alla stazione.');
    assert.ok(await page.$('.face.front .cw.s1[data-w="arrivò"]'), 'recoloured as a LingQ');
    await page.click('[data-flip]'); await sleep(100);
    await page.click('.rv-tr'); await sleep(300);
    assert.equal(await page.textContent('.face.back .ft'), 'mock translation');
    assert.equal((await card(page, 'treno')).exampleTr, 'mock translation');
    assert.deepEqual(errors, []);
  });

  test('when today is done you can keep going, but only if you want to', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'vocab', settings: { reviewStyle: 'flip' } });
    await seed(page, [{ term: 'casa', status: 3, srs: due(2) }]);
    // A card that isn't due for a week.
    await page.evaluate(() => import('./js/vocab.js').then((v) => v.setWord('tempo', { status: 3, meaning: 'time', created: Date.now() - 9e8,
      srs: { s: 20, d: 5, reps: 3, lapses: 0, last: Date.now() - 5 * 864e5, due: Date.now() + 7 * 864e5 } })));
    await openReview(page);
    await page.click('[data-flip]'); await page.click('[data-r="1"]'); await sleep(200); // forgot it
    await page.click('[data-flip]'); await page.click('[data-r="3"]'); await sleep(200); // it comes back once
    assert.match(await page.textContent('.rv-more'), /Want to keep going\?/);
    assert.ok(await page.$('[data-done].primary'), 'Done stays the main button');
    // Today's misses again: practice only, the schedule stays as it was.
    const before = await card(page, 'casa');
    await page.click('[data-missed]'); await sleep(200);
    assert.match(await page.textContent('.sheet h2'), /Missed Words\s*1 of 1/);
    await page.click('[data-flip]');
    assert.equal(await page.$$eval('.review-btns button', (b) => b.length), 2);
    await page.click('[data-r="3"]'); await sleep(200);
    assert.deepEqual((await card(page, 'casa')).srs, before.srs);
    // Ahead of schedule: rated for real, but not counted against tomorrow.
    await page.click('[data-ahead]'); await sleep(200);
    assert.match(await page.textContent('.sheet h2'), /Extra Practice\s*1 of 1/);
    assert.equal(await page.textContent('.flash .fw'), 'tempo');
    await page.click('[data-flip]'); await page.click('[data-r="3"]'); await sleep(200);
    assert.equal((await card(page, 'tempo')).srs.reps, 4);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.srsDay')).reviews), 1);
    await page.click('[data-done]'); await sleep(300);
    await page.click('#tabbar button[data-tab=home]'); await sleep(300);
    assert.ok(await page.$('button.review-card.done[data-act=review]'), 'the finished card on Home still opens the review');
    assert.deepEqual(errors, []);
  });

  test('review settings are saved as numbers', async () => {
    const { page } = await openApp(t, srv.url, { hash: 'home' });
    await page.click('[data-act=settings]'); await sleep(300);
    await page.selectOption('select[name=reviewsPerDay]', '50');
    await page.selectOption('select[name=retention]', 'relaxed');
    await page.selectOption('select[name=reviewStyle]', 'flip');
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.settings')));
    assert.equal(s.reviewsPerDay, 50);
    assert.equal(s.retention, 'relaxed');
    assert.equal(s.reviewStyle, 'flip');
  });
});
