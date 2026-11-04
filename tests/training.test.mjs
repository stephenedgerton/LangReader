// The Training tab: today's plan (Listen, Shadow, Say it), the session, hints, Undo, packs and their pages.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openApp, closeBrowser, sleep } from './helpers.mjs';

const tr = (page, fn, arg) => page.evaluate(async ({ fn, arg }) => {
  const m = await import('./js/training.js');
  await m.loadSentences();
  return new Function('m', 'arg', `return (${fn})(m, arg)`)(m, arg);
}, { fn: fn.toString(), arg });
const GENDER = { trainMe: 'm', trainPartner: 'f' };

describe('training', () => {
  const t = {};
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await closeBrowser(t); srv.server.close(); });

  test('a fresh install trains Survival: three steps today, and Home points to them', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training' });
    const card = await page.textContent('.tr-today');
    assert.match(card, /Listen\s*4/); assert.match(card, /Shadow\s*4/); assert.match(card, /Say it\s*5/, '5 new sentences a day, nothing due yet');
    assert.match(card, /About \d+ min/);
    const shelves = await page.$$eval('.shelf', (s) => s.map((x) => x.textContent.replace(/\s+/g, ' ')));
    assert.match(shelves[0], /^\s*New Pack\s*Your own sentences\s*$/, 'Your Packs: nothing yet but New Pack');
    assert.match(shelves[1], /Survival\s*Ready-made\s*0 of 30 learned/);
    assert.match(shelves[2], /Partner: everyday\s*Ready-made\s*30 sentences.*Partner: plans & errands\s*Ready-made\s*30 sentences/);
    assert.equal(await tr(page, (m) => m.trainingList().length), 30);
    await page.click('#tabbar button[data-tab=home]'); await sleep(300);
    assert.match(await page.textContent('.training-card'), /Today's Training\s*3 steps · about \d+ min/);
    assert.equal(await page.$('.review-card[data-act=review]'), null, 'the old review card has gone');
    await page.click('.training-card'); await sleep(300);
    assert.ok(await page.isVisible('#view-training'));
    assert.deepEqual(errors, []);
  });

  test('a session: Listen, Shadow, then Say it with hints, and the plan is done for today', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training' });
    await page.evaluate(() => { window.__said = []; speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 10); }; });
    await page.click('[data-act=start]'); await sleep(300);
    // Today's sentences don't change with who's speaking, so it doesn't ask.

    assert.match(await page.textContent('.dr-intro'), /Listen.*4 sentences · step 1 of 3/s);
    await page.click('[data-go]'); await sleep(250);
    assert.deepEqual(await page.evaluate(() => window.__said), ['Buongiorno!'], 'Listen plays the sentence straight away');
    assert.equal(await page.$eval('.flash', (e) => e.classList.contains('flipped')), false, 'the text is on the back until you reveal it');
    for (let i = 0; i < 4; i++) { await page.click('[data-flip]'); await sleep(100); await page.click('[data-r="3"]'); await sleep(150); }

    assert.match(await page.textContent('.dr-intro'), /Shadow/);
    await page.click('[data-go]'); await sleep(200);
    assert.match(await page.textContent('.dr-shadow'), /Buongiorno!\s*Good morning!/, 'new sentences are shadowed first');
    for (let i = 0; i < 4; i++) { await page.click('[data-next]'); await sleep(150); }

    assert.match(await page.textContent('.dr-intro'), /Say it/);
    await page.click('[data-go]'); await sleep(200);
    assert.equal(await page.textContent('.dr-prompt'), 'Good morning!');
    assert.equal(await page.$('.dr-hint-text'), null, 'no hint until you ask');
    await page.click('[data-hint]'); await sleep(100);
    assert.equal(await page.textContent('.dr-hint-text'), 'Buongiorno!', 'one word: the first word is the whole hint');
    await page.click('[data-flip]'); await sleep(200);
    assert.ok(await page.$eval('[data-r="3"]', (b) => b.disabled), 'Good is off after a hint');
    assert.ok(await page.$eval('[data-r="2"]', (b) => !b.disabled));
    await page.click('[data-r="2"]'); await sleep(200);
    // The second sentence: hints step by step, then the answer counts as Again.
    assert.equal(await page.textContent('.dr-prompt'), 'Good evening!');
    await page.click('[data-hint]'); await page.click('[data-hint]'); await sleep(100);
    assert.equal(await page.textContent('.dr-hint-text'), 'B________!');
    await page.click('[data-hint]'); await sleep(200);
    assert.match(await page.textContent('.rv-actions'), /counts as Again/);
    await page.click('[data-r="1"]'); await sleep(200);
    for (let i = 0; i < 3; i++) { await page.click('[data-flip]'); await sleep(100); await page.click('[data-r="3"]'); await sleep(150); }

    assert.match(await page.textContent('.rv-done'), /Done for today/);
    assert.match(await page.textContent('.rv-done'), /9 cards · 4 shadowed · 1 to go over/);
    assert.ok(await page.$('[data-missed]'), 'the miss can be gone over again');
    const s = await tr(page, (m) => [m.sentence('survival:1'), m.sentence('survival:2'), m.doneToday()]);
    assert.ok(s[0].cards.listen && s[0].cards.say, 'a sentence holds a listen and a say card');
    assert.equal(s[1].cards.say.lapses, 0); assert.ok(s[1].cards.say.s < 1, 'shown = Again');
    assert.deepEqual([s[2].listen, s[2].shadow, s[2].say, s[2].fresh, s[2].missed], [4, 4, 5, 5, ['survival:2']]);
    await page.click('[data-done]'); await sleep(400);
    assert.match(await page.textContent('.tr-today'), /Done for today/);
    assert.match(await page.textContent('.tr-today'), /1 day in a row/);
    assert.deepEqual(errors, []);
  });

  test('Undo puts a card back as it was, with today’s counts', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: GENDER });
    await page.click('[data-act=start]'); await sleep(300);
    await page.click('[data-go]'); await sleep(200);
    await page.click('[data-flip]'); await page.click('[data-r="4"]'); await sleep(300);
    assert.equal(await tr(page, (m) => m.doneToday().listen), 1);
    await page.click('.rv-undo'); await sleep(300);
    assert.match(await page.textContent('.dr-step'), /1 of 4/);
    const back = await tr(page, (m) => [m.sentence('survival:1').cards, m.doneToday()]);
    assert.deepEqual(back[0], {}, 'the sentence is new again');
    assert.deepEqual([back[1].listen, back[1].fresh], [0, 0]);
    assert.deepEqual(errors, []);
  });

  test('a pack’s page: Italian only, play, show English, add the pack, and train just that pack', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training' });
    await page.evaluate(() => { window.__said = []; speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 10); }; });
    await page.click('[data-pack=partner]'); await sleep(300);
    assert.match(await page.textContent('.tr-hero'), /Ready-made · 30 sentences\s*Partner: everyday\s*Not in your training yet/);
    const rows = await page.$$eval('.tr-row .txt', (r) => r.map((x) => x.textContent));
    assert.equal(rows[0], 'Buongiorno, amore.', 'Italian only');
    assert.equal(await page.$('.tr-row .en'), null);
    await page.click('.tr-row:nth-child(4) [data-play]');
    assert.deepEqual(await page.evaluate(() => window.__said), ['Com’è andata la giornata?']);
    await page.click('[data-act=en]'); await sleep(200);
    assert.equal(await page.textContent('.tr-row:nth-child(4) .en'), 'How was your day?');
    // Adding it asks who's speaking and to whom, then it's yours.
    await page.click('[data-act=add]'); await sleep(300);
    await page.click('[data-name=trainMe] [data-v=m]'); await page.click('[data-name=trainPartner] [data-v=f]');
    await page.click('[data-a=go]'); await sleep(400);
    assert.match(await page.textContent('.tr-row:nth-child(6) .txt'), /^Sei stanca\?/, 'your partner’s forms');
    assert.match(await page.textContent('.tr-hero'), /0 learned/);
    // Training just this pack rates for real but leaves today's plan alone.
    await page.click('[data-act=train]'); await sleep(300);
    await page.click('[data-go]'); await sleep(200);
    await page.click('[data-flip]'); await page.click('[data-r="3"]'); await sleep(300);
    assert.ok(await tr(page, (m) => m.sentence('partner:1').cards.listen), 'rated');
    assert.equal(await tr(page, (m) => m.doneToday().listen), 0, 'today’s plan is untouched');
    await page.click('.x'); await sleep(300);
    // Play all goes through the pack in order.
    await page.evaluate(() => { window.__said = []; });
    await page.click('[data-act=playall]'); await sleep(1500);
    assert.deepEqual((await page.evaluate(() => window.__said)).slice(0, 2), ['Buongiorno, amore.', 'Hai dormito bene?']);
    await page.click('[data-act=playall]');
    await page.click('[data-act=back]'); await sleep(300);
    assert.match(await page.$$eval('.shelf', (s) => s[1].textContent), /Partner: everyday/, 'now with the ready-made packs you train');
    assert.deepEqual(errors, []);
  });

  test('a paused sentence stays in its pack but leaves training; settings change today’s plan', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: GENDER });
    await page.click('[data-pack=survival]'); await sleep(300);
    await page.click('.tr-row:nth-child(1) [data-sent]'); await sleep(300);
    assert.equal(await page.isVisible('.tr-sheet-en'), false, 'the English waits until you ask');
    await page.click('[data-a=en]');
    assert.equal(await page.textContent('.tr-sheet-en'), 'Good morning!');
    await page.click('[data-a=pause]'); await sleep(300);
    assert.match(await page.textContent('.tr-row:nth-child(1)'), /Paused/);
    assert.equal(await tr(page, (m) => m.trainingList().some((s) => s.id === 'survival:1')), false);
    await page.click('[data-act=back]'); await sleep(300);
    await page.click('#view-training [data-act=settings]'); await sleep(300);
    await page.selectOption('select[name=trainShadow]', '0');
    await page.selectOption('select[name=trainSay]', '10');
    await page.selectOption('select[name=trainNew]', '8');
    await page.click('.sheet .x'); await sleep(400);
    const card = await page.textContent('.tr-today');
    assert.doesNotMatch(card, /Shadow/, 'a step set to 0 is left out');
    assert.match(card, /Say it\s*8/);
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.settings')));
    assert.deepEqual([s.trainShadow, s.trainSay, s.trainNew], [0, 10, 8]);
    assert.deepEqual(errors, []);
  });
});
