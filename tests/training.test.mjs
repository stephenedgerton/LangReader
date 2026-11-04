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
    assert.match(shelves[2], /Café & restaurant\s*Ready-made\s*30 sentences.*When I don’t understand\s*Ready-made\s*27 sentences/);
    assert.equal(await page.$$eval('.shelf:nth-of-type(3) .pack, .shelf', (s) => s.at(-1).querySelectorAll('.pack').length), 9, 'nine packs to add');
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
    // Training just this pack (in its ⋯) rates for real but leaves today's plan alone.
    await page.click('[data-act=packmenu]'); await sleep(300);
    await page.click('[data-a=train]'); await sleep(300);
    await page.click('[data-go]'); await sleep(200);
    await page.click('[data-flip]'); await page.click('[data-r="3"]'); await sleep(300);
    assert.ok(await tr(page, (m) => m.sentence('partner:1').cards.listen), 'rated');
    assert.equal(await tr(page, (m) => m.doneToday().listen), 0, 'today’s plan is untouched');
    await page.click('.x'); await sleep(300);
    // ▶ plays the pack right on the page, in the mode the switch is on (Shadowing: three times each).
    await page.evaluate(() => { window.__said = []; });
    await page.click('[data-act=play]'); await sleep(300);
    assert.deepEqual(await page.evaluate(() => window.__said), ['Buongiorno, amore.']);
    assert.ok(await page.$('.tr-row:nth-child(1).now'), 'the one playing is highlighted');
    await page.click('[data-act=play]'); await sleep(100);
    assert.equal(await page.$('.tr-row.now'), null, 'a second tap stops it');
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

  test('a pack’s page: the Shadowing | Recall switch, English a tap away on each row, stars, and Start Focus pinned', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: GENDER });
    await tr(page, async (m) => { await m.syncPacks(); await m.rateCard('survival:2', 'say', 3); });
    await page.click('[data-pack=survival]'); await sleep(300);
    assert.equal(await page.$('[data-act=train]'), null, 'Train has moved to the ⋯ menu');
    assert.equal(await page.$('[data-act=shadow]'), null, 'Shadow all has gone');
    assert.equal(await page.textContent('.fc-mode .on'), 'Shadowing');
    assert.equal(await page.textContent('[data-act=focus]'), 'Start Focus · 30');
    const pin = await page.$eval('.fc-start', (e) => getComputedStyle(e).position);
    assert.equal(pin, 'fixed', 'pinned above the tab bar');
    await page.click('[data-mode=recall]'); await sleep(200);
    assert.equal(await page.textContent('.fc-mode .on'), 'Recall');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.settings')).focusMode), 'recall');
    // Each row's English is a tap away.
    await page.click('.tr-row:nth-child(1) [data-reveal]');
    assert.equal(await page.textContent('.tr-row:nth-child(1) .en'), 'Good morning!');
    assert.equal(await page.$('.tr-row:nth-child(3) .en'), null, 'only that row');
    await page.click('.tr-row:nth-child(1) [data-reveal]');
    assert.equal(await page.$('.tr-row:nth-child(1) .en'), null, 'a second tap hides it');
    const lvl = await tr(page, async (m) => (await import('./js/sentences.js')).level(m.sentence('survival:2')));
    assert.equal(await page.$$eval('.tr-row:nth-child(2) .stars i.on', (s) => s.length), lvl, 'the level as stars');
    assert.equal(await page.$$eval('.tr-row:nth-child(2) .stars i', (s) => s.length), 4);
    // A paused sentence is left out of Focus.
    await page.click('.tr-row:nth-child(1) [data-sent]'); await sleep(300);
    await page.click('[data-a=pause]'); await sleep(300);
    assert.equal(await page.textContent('[data-act=focus]'), 'Start Focus · 29');
    assert.deepEqual(errors, []);
  });

  test('Focus, Shadowing: each sentence three times, then the next by itself; Pause, ‹‹ and ››; nothing rated or counted', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: GENDER });
    await page.evaluate(() => { window.__said = []; speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 10); }; });
    await page.click('[data-pack=survival]'); await sleep(300);
    await page.click('[data-act=focus]'); await sleep(200);
    assert.deepEqual(await page.evaluate(() => window.__said), ['Buongiorno!'], 'no intro: it plays in the tap');
    assert.match(await page.textContent('.fc-count'), /Shadowing\s*1 \/ 30/);
    assert.match(await page.textContent('.fc-togs'), /Translation.*Dual audio.*Repeat\s*3×.*Speed\s*1×/s);
    await page.waitForFunction(() => document.querySelector('.fc-count')?.textContent.includes('2 / 30'), null, { timeout: 12000 });
    await page.waitForFunction(() => window.__said.length >= 4);
    assert.deepEqual((await page.evaluate(() => window.__said)).slice(0, 4), ['Buongiorno!', 'Buongiorno!', 'Buongiorno!', 'Buonasera!']);
    await page.click('[data-toggle]'); await sleep(200);
    assert.match(await page.textContent('.fc-phase'), /Paused/);
    assert.equal(await page.getAttribute('[data-toggle]', 'aria-label'), 'Play');
    const said = (await page.evaluate(() => window.__said)).length;
    await sleep(2500);
    assert.equal((await page.evaluate(() => window.__said)).length, said, 'nothing plays while paused');
    await page.click('[data-next]'); await sleep(200);
    assert.match(await page.textContent('.fc-count'), /3 \/ 30/, '›› moves on');
    assert.equal((await page.evaluate(() => window.__said)).length, said, 'still paused');
    await page.click('[data-prev]'); await sleep(200);
    assert.match(await page.textContent('.fc-count'), /2 \/ 30/, '‹‹ goes back');
    await page.click('[data-toggle]'); await sleep(200);
    assert.equal((await page.evaluate(() => window.__said)).at(-1), 'Buonasera!', 'Play starts it again');
    await page.click('.x'); await sleep(300);
    const d = await tr(page, (m) => [m.doneToday(), m.sentence('survival:1').cards]);
    assert.deepEqual([d[0].listen, d[0].shadow, d[0].fresh], [0, 0, 0], 'today’s plan is untouched');
    assert.deepEqual(d[1], {}, 'nothing is rated');
    assert.deepEqual(errors, []);
  });

  test('Focus: rating is optional, doesn’t advance, and can be changed (one review, today’s counts untouched)', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: GENDER });
    await page.evaluate(() => { speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(), 10); });
    await page.click('[data-pack=survival]'); await sleep(300);
    await page.click('[data-act=focus]'); await sleep(200);
    await page.click('[data-toggle]'); await sleep(100);
    assert.match(await page.textContent('.fc-rate'), /Didn’t get it\s*Hard\s*Good\s*Knew it/);
    assert.doesNotMatch(await page.textContent('.fc-bottom'), /\dd|\dw/, 'no intervals under the grades');
    await page.click('[data-r="1"]'); await sleep(300);
    assert.match(await page.textContent('.fc-count'), /1 \/ 30/, 'rating doesn’t advance');
    let s = await tr(page, (m) => [m.sentence('survival:1').cards.listen, m.doneToday()]);
    assert.ok(s[0], 'Shadowing rates the listen card');
    assert.deepEqual(s[1].missed, ['survival:1']);
    await page.click('[data-r="3"]'); await sleep(300);
    assert.ok(await page.$('[data-r="3"].on'));
    assert.equal(await page.$('[data-r="1"].on'), null);
    s = await tr(page, (m) => [m.sentence('survival:1').cards, m.doneToday()]);
    assert.deepEqual([s[0].listen.reps, s[0].listen.lapses], [1, 0], 'one review, from where the card was');
    assert.equal(s[0].say, undefined);
    assert.ok(s[0].listen.s > 1, 'rated Good, not Again');
    assert.deepEqual([s[1].listen, s[1].fresh, s[1].missed], [0, 0, []], 'today’s plan is untouched');
    const drills = await page.evaluate(async () => (await (await import('./js/stats.js')).getDays()).at(-1)?.drills);
    assert.equal(drills, 1, 'counted once in the stats');
    assert.deepEqual(errors, []);
  });

  test('Focus settings are per mode: Repeats 1 plays each sentence once, Dual audio plays the English first; Recall says it after the English', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: GENDER });
    await page.evaluate(() => { window.__said = []; speechSynthesis.speak = (u) => { window.__said.push((u.lang.startsWith('en') ? 'en:' : '') + u.text); setTimeout(() => u.onend?.(), 10); }; });
    await page.click('[data-pack=survival]'); await sleep(300);
    await page.click('[data-act=fsettings]'); await sleep(300);
    assert.match(await page.textContent('#sheet h2'), /Shadowing Settings/);
    await page.selectOption('select[data-k=repeats]', '1');
    await page.click('label:has(input[data-k=enFirst])');
    assert.equal(await page.textContent('[data-start]'), 'Start Shadowing · 30', 'Start is pinned at the bottom');
    await page.click('[data-start]'); await sleep(200);
    await page.waitForFunction(() => window.__said.length >= 4, null, { timeout: 12000 });
    assert.deepEqual((await page.evaluate(() => window.__said)).slice(0, 4), ['en:Good morning!', 'Buongiorno!', 'en:Good evening!', 'Buonasera!']);
    assert.equal(await page.$$eval('.fc-reps i', (r) => r.length), 1);
    await page.click('.x'); await sleep(300);
    const f = await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.settings')).focus);
    assert.deepEqual(f, { shadow: { repeats: 1, enFirst: true } }, 'only Shadowing changed');
    // Recall: the English, a gap to say it (the Italian hidden), then the Italian.
    await page.click('[data-mode=recall]'); await sleep(200);
    await page.evaluate(() => { window.__said = []; });
    await page.click('[data-act=focus]'); await sleep(300);
    assert.deepEqual(await page.evaluate(() => window.__said), ['en:Good morning!']);
    assert.match(await page.textContent('.fc-text'), /Good morning!\s*Say it in Italian/);
    assert.match(await page.textContent('.fc-phase'), /Your turn/);
    await page.waitForFunction(() => window.__said.length >= 2, null, { timeout: 8000 });
    assert.equal((await page.evaluate(() => window.__said))[1], 'Buongiorno!');
    await sleep(100);
    assert.match(await page.textContent('.fc-text .dr-it'), /Buongiorno!/, 'shown once it plays');
    // The toggle row changes the same settings: Repeat goes round 1–5.
    await page.click('[data-tog=rep]'); await sleep(100);
    assert.match(await page.textContent('[data-tog=rep]'), /2×/);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.settings')).focus.recall.repeats), 2);
    // Settings from inside the session, in the same sheet; Done comes back to it.
    await page.click('[data-gear]'); await sleep(200);
    assert.match(await page.textContent('#sheet h2'), /Recall Settings/);
    await page.click('[data-close-set]'); await sleep(200);
    assert.ok(await page.$('.fc-ctrl'));
    await page.click('.x'); await sleep(300);
    assert.deepEqual(errors, []);
  });

  test('the Stats tab shows Training: sentences you can say, the streak, cards a day and each pack', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'stats' });
    assert.match(await page.textContent('.st-train'), /start after your first session/);
    await tr(page, async (m) => {
      await m.syncPacks();
      for (const id of ['survival:1', 'survival:2', 'survival:3']) await m.rateCard(id, 'say', 3);
      const s = m.sentence('survival:1');
      await m.putSentence({ ...s, cards: { ...s.cards, say: { ...s.cards.say, s: 20 } } });
      m.stepFinished();
    });
    await page.click('#tabbar [data-tab="training"]'); await sleep(300);
    await page.click('#tabbar [data-tab="stats"]'); await sleep(600);
    const card = (await page.textContent('.st-train')).replace(/\s+/g, ' ');
    assert.match(card, /1 ?sentence you can say/);
    assert.match(card, /Of 30 in your packs, you've started 3\./);
    assert.match(card, /🔥 1 ?day in a row 1 ?of the last 30 days 3 ?cards this week/);
    assert.equal(await page.$$eval('.bars .bar', (b) => b.length), 14);
    assert.equal(await page.$$eval('.bars .bar:not(.zero)', (b) => b.length), 1, 'only today has cards');
    assert.match(await page.getAttribute('.st-packs .band', 'title'), /^Survival: 1 learned, 2 started, of 30$/);
    await page.$eval('.bars', (e) => e.scrollIntoView({ block: 'center' })); await sleep(200);
    const box = await page.$eval('.bars .hit', (r) => { const b = r.getBoundingClientRect(); return { x: b.right - 4, y: b.top + b.height / 2 }; });
    await page.mouse.move(box.x, box.y); await sleep(100);
    assert.match(await page.textContent('.st-bars .tip'), /3 cards/);
    assert.deepEqual(errors, []);
  });

  test('tapping a word on a card opens the reader’s bubble, and its status colours the card', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: GENDER });
    await page.click('[data-act=start]'); await sleep(300);
    await page.click('[data-go]'); await sleep(200);
    await page.click('[data-flip]'); await sleep(200);
    await page.click('.face.back .cw[data-w="Buongiorno"]'); await sleep(400);
    assert.match(await page.textContent('#sheet .wpop .wp-term'), /Buongiorno/);
    assert.match(await page.textContent('#sheet .wpop .wp-mean'), /mock translation/);
    assert.equal(await page.$('#sheet .wpop .wp-more'), null, 'no ⋯: the full card would replace the session');
    await page.click('#sheet .wpop [data-s="3"]'); await sleep(300);
    assert.ok(await page.$('.face.back .cw.s3[data-w="Buongiorno"]'), 'recoloured while the bubble is open');
    const w = await page.evaluate(() => import('./js/vocab.js').then((v) => v.entry('buongiorno')));
    assert.deepEqual([w.status, w.meaning, w.example], [3, 'mock translation', 'Buongiorno!']);
    // A tap elsewhere closes the bubble and does nothing else.
    await page.click('[data-r="3"]'); await sleep(200);
    assert.equal(await page.$('#sheet .wpop'), null);
    assert.match(await page.textContent('.dr-step'), /1 of 4/, 'not rated');
    await page.click('[data-r="3"]'); await sleep(200);
    assert.match(await page.textContent('.dr-step'), /2 of 4/);
    assert.deepEqual(errors, []);
  });
});
