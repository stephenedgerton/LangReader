// The Training tab: today's plan (Listen, Shadow, Say it), the session, hints, Undo, packs and their pages.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openApp, closeBrowser, sleep } from './helpers.mjs';
import { PACKS, loadPack } from '../samples/packs/index.js';

const tr = (page, fn, arg) => page.evaluate(async ({ fn, arg }) => {
  const m = await import('./js/training.js');
  await m.loadSentences();
  return new Function('m', 'arg', `return (${fn})(m, arg)`)(m, arg);
}, { fn: fn.toString(), arg });
// Most tests click through a whole session, so they keep the plan small (the default is 50 a step).
const SMALL = { trainListen: 4, trainShadow: 4, trainSay: 8, trainSizesV: 2 };
const GENDER = { trainMe: 'm', trainPartner: 'f', ...SMALL };
// How many sentences each ready-made pack has, so the packs can grow without breaking the tests.
const SIZE = Object.fromEntries(await Promise.all(PACKS.map(async (p) => [p.id, (await loadPack(p.id)).length])));
const N = SIZE.survival;

describe('training', () => {
  const t = {};
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await closeBrowser(t); srv.server.close(); });

  test('tapping "Your turn" goes straight on, in the session’s Shadow and in Focus mode', async () => {
    // A long gap, so only the tap can end it quickly.
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: { ...GENDER, focus: { shadow: { repeats: 2, turn: 2 }, recall: { turn: 2 } } } });
    await page.evaluate(() => { window.__said = []; speechSynthesis.speak = (u) => { window.__said.push((u.lang.startsWith('en') ? 'en:' : '') + u.text); setTimeout(() => u.onend?.(), 10); }; });
    await page.click('[data-act=start]'); await sleep(300);
    await page.click('[data-skip-step]'); await sleep(250);
    await page.click('[data-go]');
    await page.waitForSelector('.dr-ring.turn');
    assert.match(await page.textContent('.dr-ring'), /Your turn\s*Tap when done/);
    assert.equal(await page.$eval('.dr-ring', (e) => e.getAttribute('role')), 'button');
    assert.equal((await page.evaluate(() => window.__said)).length, 1);
    await page.click('.dr-ring'); await sleep(250);
    assert.deepEqual(await page.evaluate(() => window.__said), ['Buongiorno!', 'Buongiorno!'], 'the second repeat starts at once');
    assert.equal(await page.$eval('.dr-reps i', (e) => e.classList.contains('on')), true, 'the first repeat counted');
    await page.waitForSelector('.dr-ring.turn');
    await page.click('.dr-ring');
    await page.waitForSelector('[data-next]', { timeout: 2000 });
    await page.click('.dr-ring'); await sleep(150); // not your turn: nothing happens
    assert.equal((await page.evaluate(() => window.__said)).length, 2);
    await page.click('.x'); await sleep(300);

    // Focus mode's Recall: tapping "Your turn" plays the Italian now.
    await page.click('[data-pack=survival]'); await sleep(300);
    await page.click('[data-mode=recall]'); await sleep(200);
    await page.evaluate(() => { window.__said = []; });
    await page.click('[data-act=focus]');
    await page.waitForSelector('.dr-ring.turn');
    assert.deepEqual(await page.evaluate(() => window.__said), ['en:Good morning!']);
    await page.click('.dr-ring'); await sleep(250);
    assert.deepEqual(await page.evaluate(() => window.__said), ['en:Good morning!', 'Buongiorno!']);
    await page.click('.x'); await sleep(200);
    assert.deepEqual(errors, []);
  });

  test('a fresh install trains Survival: three steps today, and Home points to them', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training' });
    const card = await page.textContent('.tr-today');
    assert.match(card, /Listen\s*50/); assert.match(card, /Shadow\s*50/); assert.match(card, /Say it\s*50/, 'each step is full: 5 new a day, then more new ones while nothing’s due');
    assert.match(card, /About \d+ min/);
    const shelves = await page.$$eval('.shelf', (s) => s.map((x) => x.textContent.replace(/\s+/g, ' ')));
    assert.match(shelves[0], /^\s*New Pack\s*Your own sentences\s*$/, 'Your Packs: nothing yet but New Pack');
    assert.match(shelves[1], new RegExp(`Survival\\s*Ready-made\\s*0 of ${N} learned`));
    assert.match(shelves[2], new RegExp(`Partner: everyday\\s*Ready-made\\s*${SIZE.partner} sentences.*Partner: plans & errands\\s*Ready-made\\s*${SIZE['partner-plans']} sentences`));
    assert.match(shelves[2], new RegExp(`Café & restaurant\\s*Ready-made\\s*${SIZE.cafe} sentences.*When I don’t understand\\s*Ready-made\\s*${SIZE['not-understand']} sentences`));
    assert.equal(await page.$$eval('.shelf:nth-of-type(3) .pack, .shelf', (s) => s.at(-1).querySelectorAll('.pack').length), 9, 'nine packs to add');
    assert.equal(await tr(page, (m) => m.trainingList().length), N);
    await page.click('#tabbar button[data-tab=home]'); await sleep(300);
    assert.match(await page.textContent('.training-card'), /Today's Training\s*3 steps · about \d+ min/);
    assert.equal(await page.$('.review-card[data-act=review]'), null, 'the old review card has gone');
    await page.click('.training-card'); await sleep(300);
    assert.ok(await page.isVisible('#view-training'));
    assert.deepEqual(errors, []);
  });

  test('leaving the session and coming back carries on; Shadow’s Auto next goes on by itself', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: { ...SMALL, focus: { shadow: { repeats: 1, turn: 0.5 } } } });
    await page.evaluate(() => { window.__said = []; speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 10); }; });
    await page.click('[data-act=start]'); await sleep(300);
    await page.click('[data-go]'); await sleep(250);
    for (let i = 0; i < 4; i++) { await page.click('[data-flip]'); await sleep(100); await page.click('[data-r="3"]'); await sleep(150); }
    await page.click('[data-go]'); await sleep(200);
    await page.waitForSelector('[data-next]', { timeout: 5000 });
    await page.click('[data-next]'); await sleep(200);
    assert.match(await page.textContent('.dr-shadow'), /Buonasera!/);
    await page.click('.x'); await sleep(400);

    // Back in: Listen is done, and Shadow carries on with the second of today’s new sentences, not the first.
    await page.click('[data-act=start]'); await sleep(300);
    assert.match(await page.textContent('.dr-step'), /Shadow.*1 of 3/s);
    assert.match(await page.textContent('.dr-shadow'), /Buonasera!/);
    assert.match(await page.textContent('.fc-togs'), /Auto next/);

    // Auto next: once the repeats are done, the next sentence starts by itself, to the end of the step.
    await page.click('[data-tog=auto]'); await sleep(100);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.settings')).trainShadowAuto), true);
    await page.waitForSelector('.dr-intro', { timeout: 15000 });
    assert.match(await page.textContent('.dr-intro'), /Say it/);
    const d = await tr(page, (m) => m.doneToday());
    assert.equal(d.shadow, 4);
    assert.equal(new Set(d.shadowed).size, 4, 'four different sentences shadowed');

    // A skipped step stays skipped when you come back.
    await page.click('[data-skip-step]'); await sleep(300);
    await page.click('[data-done]').catch(() => page.click('.x')); await sleep(400);
    assert.deepEqual((await tr(page, (m) => m.doneToday())).skipped, ['say']);
    assert.match(await page.textContent('.tr-today'), /Done for today/);
    assert.deepEqual(errors, []);
  });

  test('a session: Listen, Shadow, then Say it with hints, and the plan is done for today', async () => {
    // One repeat a sentence keeps Shadow short; the daily session shares Focus's Shadowing settings.
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: { ...SMALL, focus: { shadow: { repeats: 1 } } } });
    await page.evaluate(() => { window.__said = []; speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 10); }; });
    await page.click('[data-act=start]'); await sleep(300);
    // Today's sentences don't change with who's speaking, so it doesn't ask.

    assert.match(await page.textContent('.dr-intro'), /Listen.*4 sentences · step 1 of 3/s);
    await page.click('[data-go]'); await sleep(250);
    assert.deepEqual(await page.evaluate(() => window.__said), ['Buongiorno!'], 'Listen plays the sentence straight away');
    assert.equal(await page.$eval('.flash', (e) => e.classList.contains('flipped')), false, 'the text is on the back until you reveal it');
    assert.match(await page.textContent('.fc-togs'), /^\s*Translation\s*Speed\s*1×\s*$/, 'Listen’s toggles');
    await page.click('[data-flip]'); await sleep(100);
    assert.match(await page.textContent('.dr-bottom'), /Didn’t get it\s*Mostly\s*Got it\s*$/, 'three grades, no intervals');
    await page.click('[data-r="3"]'); await sleep(150);
    for (let i = 0; i < 3; i++) { await page.click('[data-flip]'); await sleep(100); await page.click('[data-r="3"]'); await sleep(150); }

    assert.match(await page.textContent('.dr-intro'), /Shadow/);
    await page.click('[data-go]'); await sleep(200);
    assert.match(await page.textContent('.dr-shadow'), /Buongiorno!\s*Good morning!/, 'new sentences are shadowed first');
    assert.equal(await page.$('[data-next]'), null, 'Next waits for the repeats');
    assert.match(await page.textContent('.dr-bottom'), /Pause/);
    assert.equal(await page.$eval('.dr-ring .mid svg', (e) => getComputedStyle(e).transform), 'none', 'the icon in the ring is upright');
    // ⚙︎ has Shadowing's settings (the gap for your turn among them); Done starts the sentence again.
    await page.click('[data-gear]'); await sleep(200);
    assert.match(await page.textContent('#sheet h2'), /Shadow Settings/);
    await page.selectOption('.fc-settings [data-k=turn]', '1');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.settings')).focus.shadow.turn), 1);
    await page.click('[data-close-set]'); await sleep(200);
    assert.match(await page.textContent('.dr-step'), /Shadow.*1 of/s);
    assert.match(await page.textContent('.dr-bottom'), /Pause/, 'playing again');
    for (let i = 0; i < 4; i++) { await page.waitForSelector('[data-next]', { timeout: 8000 }); await page.click('[data-next]'); await sleep(150); }

    assert.match(await page.textContent('.dr-intro'), /Say it/);
    await page.click('[data-go]'); await sleep(200);
    assert.equal(await page.textContent('.dr-prompt'), 'Good morning!');
    assert.equal(await page.$('.dr-hint-text'), null, 'no hint until you ask');
    await page.click('[data-hint]'); await sleep(100);
    assert.equal(await page.textContent('.dr-hint-text'), 'B_________!', 'one word: straight to the first letter, not the whole answer');
    assert.match(await page.textContent('[data-hint]'), /Show it/);
    await page.click('[data-flip]'); await sleep(200);
    assert.match(await page.textContent('.dr-bottom'), /Didn’t get it\s*Hard\s*Good\s*Knew it/);
    assert.ok(await page.$eval('[data-r="3"]', (b) => b.disabled), 'Good is off after a hint');
    assert.ok(await page.$eval('[data-r="2"]', (b) => !b.disabled));
    await page.click('[data-r="2"]'); await sleep(200);
    // The second sentence: the next hint after the first letter shows the answer, which counts as Again.
    assert.equal(await page.textContent('.dr-prompt'), 'Good evening!');
    await page.click('[data-hint]'); await sleep(100);
    assert.equal(await page.textContent('.dr-hint-text'), 'B________!');
    await page.click('[data-hint]'); await sleep(200);
    assert.match(await page.textContent('.dr-bottom'), /counts as Again/);
    await page.click('[data-r="1"]'); await sleep(200);
    // Say it is full (8): the 5 new a day, then 3 more new ones, since nothing else is left to fill it.
    for (let i = 0; i < 6; i++) { await page.click('[data-flip]'); await sleep(100); await page.click('[data-r="3"]'); await sleep(150); }

    assert.match(await page.textContent('.rv-done'), /Done for today/);
    assert.match(await page.textContent('.rv-done'), /12 cards · 4 shadowed · 1 to go over/);
    assert.ok(await page.$('[data-missed]'), 'the miss can be gone over again');
    assert.match(await page.textContent('.dr-missed'), /^\s*Buonasera!\s*Good evening!\s*$/, 'the end screen lists it');
    await page.evaluate(() => { window.__said = []; });
    await page.click('.dr-mplay');
    assert.deepEqual(await page.evaluate(() => window.__said), ['Buonasera!'], 'with ▶');
    const s = await tr(page, (m) => [m.sentence('survival:1'), m.sentence('survival:2'), m.doneToday()]);
    assert.ok(s[0].cards.listen && s[0].cards.say, 'a sentence holds a listen and a say card');
    assert.equal(s[1].cards.say.lapses, 0); assert.ok(s[1].cards.say.s < 1, 'shown = Again');
    assert.deepEqual([s[2].listen, s[2].shadow, s[2].say, s[2].fresh, s[2].missed], [4, 4, 8, 8, ['survival:2']]);
    await page.click('[data-done]'); await sleep(400);
    assert.match(await page.textContent('.tr-today'), /Done for today/);
    assert.match(await page.textContent('.tr-today'), /1 day in a row/);
    assert.deepEqual(errors, []);
  });

  test('Undo puts a card back as it was, with today’s counts', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: GENDER });
    await page.click('[data-act=start]'); await sleep(300);
    await page.click('[data-go]'); await sleep(200);
    await page.click('[data-flip]'); await page.click('[data-r="3"]'); await sleep(300);
    assert.equal(await tr(page, (m) => m.doneToday().listen), 1);
    await page.click('.rv-undo'); await sleep(300);
    assert.match(await page.textContent('.dr-step'), /1 of 4/);
    const back = await tr(page, (m) => [m.sentence('survival:1').cards, m.doneToday()]);
    assert.deepEqual(back[0], {}, 'the sentence is new again');
    assert.deepEqual([back[1].listen, back[1].fresh], [0, 0]);
    assert.deepEqual(errors, []);
  });

  test('step intros show the first time only; ⓘ shows one again, Skip step skips it, and the toggles are Focus’s', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: GENDER });
    await page.evaluate(() => { window.__said = []; speechSynthesis.speak = (u) => { window.__said.push((u.lang.startsWith('en') ? 'en:' : '') + u.text); setTimeout(() => u.onend?.(), 10); }; });
    await page.click('[data-act=start]'); await sleep(300);
    assert.ok(await page.$('.dr-intro'), 'the first time, Listen has its intro');
    await page.click('[data-go]'); await sleep(200);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.trainIntros'))), ['listen']);
    // Listen's English is shown on the back by default, whatever Shadowing has.
    await page.click('[data-flip]'); await sleep(200);
    assert.equal(await page.textContent('.face.back .dr-en'), 'Good morning!');
    // Its Translation toggle is its own: off, the English is a tap away; Shadowing's is untouched.
    await page.click('[data-tog=en]'); await sleep(100);
    const set = await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.settings')));
    assert.equal(set.trainListenEn, 'tap');
    assert.equal(set.focus?.shadow?.en, undefined);
    assert.equal(await page.$('.face.back .dr-en'), null);
    await page.click('.face.back [data-reveal=en]');
    assert.equal(await page.textContent('.face.back .dr-en'), 'Good morning!');
    // ⚙︎ opens the step's settings in the same sheet: Listen's English, then Shadowing's; Done comes back to
    // the card as it was.
    await page.click('[data-gear]'); await sleep(200);
    assert.match(await page.textContent('#sheet h2'), /Listen Settings/);
    await page.selectOption('[data-train=trainListenEn]', 'shown');
    await page.selectOption('.fc-settings [data-k=turn]', '2');
    const set2 = await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.settings')));
    assert.deepEqual([set2.trainListenEn, set2.focus.shadow.turn], ['shown', 2]);
    await page.click('[data-close-set]'); await sleep(200);
    assert.ok(await page.$('.flash.flipped'), 'the card is still turned over');
    assert.equal(await page.textContent('.face.back .dr-en'), 'Good morning!');
    assert.match(await page.textContent('[data-tog=en]'), /Translation/);
    assert.ok(await page.$('[data-tog=en].on'));
    await page.click('.x'); await sleep(300);
    // Again: no intro, the card plays straight away.
    await page.evaluate(() => { window.__said = []; });
    await page.click('[data-act=start]'); await sleep(300);
    assert.equal(await page.$('.dr-intro'), null, 'no intro the second time');
    assert.match(await page.textContent('.dr-step'), /Listen.*1 of \d.*Skip step/s);
    const said = await page.evaluate(() => window.__said);
    assert.equal(said.length, 1); assert.doesNotMatch(said[0], /^en:/, 'the Italian plays in the tap');
    await page.click('[data-info]'); await sleep(200);
    assert.match(await page.textContent('.dr-intro'), /Listen/);
    await page.click('[data-go]'); await sleep(200);
    assert.match(await page.textContent('.dr-step'), /Listen.*1 of/s, 'Carry on comes back to the card');
    await page.click('[data-skip-step]'); await sleep(200);
    assert.match(await page.textContent('.dr-intro'), /Shadow/, 'Shadow is new, so it has its intro');
    await page.click('[data-skip-step]'); await sleep(200);
    assert.match(await page.textContent('.dr-intro'), /Say it/);
    // Say it uses Recall's settings: with Dual audio on (Recall's default) the English prompt is spoken.
    await page.evaluate(() => { window.__said = []; });
    await page.click('[data-go]'); await sleep(200);
    assert.match(await page.textContent('.fc-togs'), /^\s*Dual audio\s*Speed\s*1×\s*$/);
    assert.deepEqual(await page.evaluate(() => window.__said), ['en:Good morning!']);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.trainIntros'))), ['listen', 'shadow', 'say']);
    assert.deepEqual(errors, []);
  });

  test('a pack’s page: Italian only, play, show English, add the pack, and train just that pack', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training' });
    await page.evaluate(() => { window.__said = []; speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 10); }; });
    await page.click('[data-pack=partner]'); await sleep(300);
    assert.match(await page.textContent('.tr-hero'), new RegExp(`Ready-made · ${SIZE.partner} sentences\\s*Partner: everyday\\s*Not in your training yet`));
    const rows = await page.$$eval('.tr-row .it', (r) => r.map((x) => x.textContent));
    assert.equal(rows[0], 'Buongiorno, amore.', 'Italian only');
    assert.equal(await page.$('.tr-row .tr-rev'), null);
    await page.click('.tr-row:nth-child(4) [data-play]');
    assert.deepEqual(await page.evaluate(() => window.__said), ['Com’è andata la giornata?']);
    await page.click('[data-act=en]'); await sleep(200);
    assert.equal(await page.textContent('.tr-row:nth-child(4) .tr-rev'), 'How was your day?');
    // Adding it asks who's speaking and to whom, then it's yours.
    await page.click('[data-act=add]'); await sleep(300);
    await page.click('[data-name=trainMe] [data-v=m]'); await page.click('[data-name=trainPartner] [data-v=f]');
    await page.click('[data-a=go]'); await sleep(400);
    assert.match(await page.textContent('.tr-row:nth-child(6) .it'), /^Sei stanca\?/, 'your partner’s forms');
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
    for (const n of ['trainListen', 'trainShadow', 'trainSay', 'trainNew']) assert.ok(await page.$(`select[name=${n}] option[value="50"]`), `${n} goes up to 50`);
    await page.selectOption('select[name=trainNew]', '8');
    await page.click('.sheet .x'); await sleep(400);
    const card = await page.textContent('.tr-today');
    assert.doesNotMatch(card, /Shadow/, 'a step set to 0 is left out');
    assert.match(card, /Say it\s*10/, 'a step fills to its size past the new allowance');
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
    assert.equal(await page.textContent('[data-act=focus]'), `Start Focus · ${N}`);
    const pin = await page.$eval('.fc-start', (e) => getComputedStyle(e).position);
    assert.equal(pin, 'fixed', 'pinned above the tab bar');
    await page.click('[data-mode=recall]'); await sleep(200);
    assert.equal(await page.textContent('.fc-mode .on'), 'Recall');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.settings')).focusMode), 'recall');
    // Recall lists the English, so the Italian isn't given away; each row's Italian is a tap away.
    assert.equal(await page.textContent('.tr-row:nth-child(1) .it'), 'Good morning!');
    assert.equal(await page.textContent('.tr-row:nth-child(1) .tr-tap'), 'Tap to show the Italian');
    assert.equal(await page.textContent('[data-act=en]'), 'Show Italian');
    await page.click('.tr-row:nth-child(1) [data-reveal]');
    assert.equal(await page.textContent('.tr-row:nth-child(1) .tr-rev'), 'Buongiorno!');
    assert.equal(await page.$('.tr-row:nth-child(3) .tr-rev'), null, 'only that row');
    await page.click('.tr-row:nth-child(1) [data-reveal]');
    assert.equal(await page.$('.tr-row:nth-child(1) .tr-rev'), null, 'a second tap hides it');
    assert.ok(await page.$('.tr-row:nth-child(1) .tr-tap'));
    await page.click('[data-mode=shadow]'); await sleep(200);
    assert.equal(await page.textContent('.tr-row:nth-child(1) .it'), 'Buongiorno!', 'Shadowing lists the Italian');
    assert.equal(await page.textContent('.tr-row:nth-child(1) .tr-tap'), 'Tap to show the English');
    await page.click('.tr-row:nth-child(1) [data-reveal]');
    assert.equal(await page.textContent('.tr-row:nth-child(1) .tr-rev'), 'Good morning!');
    // Each mode has its own stars: survival:2 was rated only in Recall (say), so it's New under Shadowing.
    assert.equal(await page.$('.tr-row:nth-child(2) .stars'), null, 'no stars in Shadowing');
    assert.equal(await page.textContent('.tr-row:nth-child(2) .tr-tag'), 'New');
    await page.click('[data-mode=recall]'); await sleep(200);
    const lvl = await tr(page, async (m) => (await import('./js/sentences.js')).level(m.sentence('survival:2'), 'say'));
    assert.ok(lvl > 0);
    assert.equal(await page.$$eval('.tr-row:nth-child(2) .stars i.on', (s) => s.length), lvl, 'the say card’s level as stars in Recall');
    assert.equal(await page.$$eval('.tr-row:nth-child(2) .stars i', (s) => s.length), 4);
    await page.click('[data-mode=shadow]'); await sleep(200);
    // A paused sentence is left out of Focus.
    await page.click('.tr-row:nth-child(1) [data-sent]'); await sleep(300);
    await page.click('[data-a=pause]'); await sleep(300);
    assert.equal(await page.textContent('[data-act=focus]'), `Start Focus · ${N - 1}`);
    assert.deepEqual(errors, []);
  });

  test('Focus, Shadowing: each sentence three times, then the next by itself; Pause, ‹‹ and ››; a sentence played through unrated is rated Hard', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: GENDER });
    await page.evaluate(() => { window.__said = []; speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 10); }; });
    await page.click('[data-pack=survival]'); await sleep(300);
    await page.click('[data-act=focus]'); await sleep(200);
    assert.deepEqual(await page.evaluate(() => window.__said), ['Buongiorno!'], 'no intro: it plays in the tap');
    assert.match(await page.textContent('.fc-count'), new RegExp(`Shadowing\\s*1 / ${N}`));
    assert.match(await page.textContent('.fc-togs'), /Translation.*Dual audio.*Repeat\s*3×.*Speed\s*1×/s);
    await page.waitForFunction((n) => document.querySelector('.fc-count')?.textContent.includes(`2 / ${n}`), N, { timeout: 12000 });
    await page.waitForFunction(() => window.__said.length >= 4);
    assert.deepEqual((await page.evaluate(() => window.__said)).slice(0, 4), ['Buongiorno!', 'Buongiorno!', 'Buongiorno!', 'Buonasera!']);
    await page.click('[data-toggle]'); await sleep(200);
    assert.match(await page.textContent('.dr-ring'), /Paused/);
    assert.equal(await page.getAttribute('[data-toggle]', 'aria-label'), 'Play');
    const said = (await page.evaluate(() => window.__said)).length;
    await sleep(2500);
    assert.equal((await page.evaluate(() => window.__said)).length, said, 'nothing plays while paused');
    await page.click('[data-next]'); await sleep(200);
    assert.match(await page.textContent('.fc-count'), new RegExp(`3 / ${N}`), '›› moves on');
    assert.equal((await page.evaluate(() => window.__said)).length, said, 'still paused');
    await page.click('[data-prev]'); await sleep(200);
    assert.match(await page.textContent('.fc-count'), new RegExp(`2 / ${N}`), '‹‹ goes back');
    await page.click('[data-toggle]'); await sleep(200);
    assert.equal((await page.evaluate(() => window.__said)).at(-1), 'Buonasera!', 'Play starts it again');
    await page.click('.x'); await sleep(300);
    const d = await tr(page, (m) => [m.doneToday(), m.sentence('survival:1').cards]);
    assert.deepEqual([d[0].listen, d[0].shadow, d[0].fresh], [0, 0, 0], 'today’s plan is untouched');
    assert.equal(d[1].say, undefined);
    assert.equal(d[1].listen?.reps, 1, 'played through unrated: rated once, for Shadowing');
    assert.ok(d[1].listen.s < 2, 'as Hard: 1 star');
    assert.deepEqual(await tr(page, (m) => m.sentence('survival:3').cards), {}, 'skipped past: still new');
    assert.deepEqual(errors, []);
  });

  test('Focus from a chosen sentence, and Continue from where it stopped', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: GENDER });
    await page.evaluate(() => { window.__said = []; speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 10); }; });
    await page.click('[data-pack=survival]'); await sleep(300);
    const third = await page.textContent('.tr-row:nth-child(3) .it');
    await page.click('.tr-row:nth-child(3) [data-sent]'); await sleep(300);
    await page.click('[data-a=focus]'); await sleep(200);
    assert.match(await page.textContent('.fc-count'), new RegExp(`3 / ${N}`), 'starts at that sentence');
    assert.equal((await page.evaluate(() => window.__said))[0], third);
    await page.click('[data-next]'); await sleep(100);
    await page.click('.x'); await sleep(400);
    assert.equal(await page.textContent('[data-act=focus]'), `Continue · 4 / ${N}`);
    assert.equal(await page.textContent('[data-act=focus0]'), 'From the start');
    assert.ok(await page.$('.tr-row:nth-child(4).here .tr-here'), 'the row it continues from is marked');
    await page.click('[data-mode=recall]'); await sleep(200);
    assert.equal(await page.textContent('[data-act=focus]'), `Start Focus · ${N}`, 'each mode keeps its own place');
    await page.click('[data-mode=shadow]'); await sleep(200);
    await page.click('[data-act=focus]'); await sleep(200);
    assert.match(await page.textContent('.fc-count'), new RegExp(`4 / ${N}`), 'Continue picks up there');
    await page.click('.x'); await sleep(400);
    await page.click('[data-act=focus0]'); await sleep(200);
    assert.match(await page.textContent('.fc-count'), new RegExp(`1 / ${N}`));
    await page.click('.x'); await sleep(400);
    assert.equal(await page.textContent('[data-act=focus]'), `Start Focus · ${N}`, 'stopping on the first sentence forgets the place');
    assert.equal(await page.$('.tr-row.here'), null);
    assert.deepEqual(errors, []);
  });

  test('repetitions are counted per sentence and per day, and shown on the Training tab and the pack page', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: { ...GENDER, focus: { shadow: { repeats: 2, loop: false } } } });
    await page.evaluate(() => { speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(), 10); });
    assert.equal(await page.$('.tr-reps'), null, 'nothing to show before any training');
    await page.click('[data-pack=survival]'); await sleep(300);
    await page.click('[data-act=focus]');
    for (let i = 0; i < 80 && (await tr(page, (m) => m.sentence('survival:1').reps || 0)) < 2; i++) await sleep(100);
    await page.click('[data-toggle]'); // pause, before the second sentence's first repeat ends
    await page.click('.x'); await sleep(400);
    const n = await tr(page, (m) => m.sentence('survival:1').reps);
    assert.equal(n, 2, 'both repeats of the first sentence');
    assert.match(await page.textContent('.tr-hero-reps'), /^\d+ repetitions?$/);
    await page.click('.tr-row:nth-child(1) [data-sent]'); await sleep(300);
    assert.match(await page.textContent('#sheet'), /Repeated 2 times/);
    await page.click('#sheet .x'); await sleep(300);
    await page.click('[data-act=back]'); await sleep(300);
    assert.match(await page.textContent('.tr-reps'), /\d+ repetitions? today\s*\d+ in all/);
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
    assert.match(await page.textContent('.fc-count'), new RegExp(`1 / ${N}`), 'rating doesn’t advance');
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

  test('Focus: the automatic Hard isn’t shown as your grade, a grade picked after it is still one review, and a rated card is left alone', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: { ...GENDER, focus: { shadow: { repeats: 1, loop: false } } } });
    await page.evaluate(() => { speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(), 10); });
    await page.click('[data-pack=survival]'); await sleep(300);
    await page.click('[data-act=focus]');
    for (let i = 0; i < 80 && !(await tr(page, (m) => m.sentence('survival:1').cards.listen)); i++) await sleep(100);
    await page.click('[data-toggle]'); await page.click('[data-prev]'); await sleep(200);
    assert.match(await page.textContent('.fc-count'), new RegExp(`1 / ${N}`));
    assert.equal(await page.$('.fc-rate .on'), null, 'not shown as a grade you picked');
    await page.click('[data-r="3"]'); await sleep(300);
    const c = await tr(page, (m) => m.sentence('survival:1').cards.listen);
    assert.deepEqual([c.reps, c.s > 2], [1, true], 'Good replaces the automatic Hard: one review');
    // Played through again in a new session: a card it already has isn't rated again.
    await page.click('.x'); await sleep(300);
    await page.click('[data-act=focus]');
    for (let i = 0; i < 80 && !(await tr(page, (m) => m.sentence('survival:2').cards.listen)); i++) await sleep(100);
    await page.click('[data-toggle]'); await page.click('.x'); await sleep(300);
    assert.equal((await tr(page, (m) => m.sentence('survival:1').cards.listen)).reps, 1);
    assert.deepEqual(errors, []);
  });

  test('Focus settings are per mode: Repeats 1 plays each sentence once, Dual audio plays the English first; Recall says it after the English', async () => {
    // Recall ignores English "Tap to reveal": the English is the prompt.
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: { ...GENDER, focus: { recall: { en: 'tap', it: 'hidden' } } } });
    await page.evaluate(() => { window.__said = []; speechSynthesis.speak = (u) => { window.__said.push((u.lang.startsWith('en') ? 'en:' : '') + u.text); setTimeout(() => u.onend?.(), 10); }; });
    await page.click('[data-pack=survival]'); await sleep(300);
    await page.click('[data-act=fsettings]'); await sleep(300);
    assert.match(await page.textContent('#sheet h2'), /Shadowing Settings/);
    await page.selectOption('select[data-k=repeats]', '1');
    await page.click('label:has(input[data-k=enFirst])');
    assert.equal(await page.textContent('[data-start]'), `Start Shadowing · ${N}`, 'Start is pinned at the bottom');
    await page.click('[data-start]'); await sleep(200);
    await page.waitForFunction(() => window.__said.length >= 4, null, { timeout: 12000 });
    assert.deepEqual((await page.evaluate(() => window.__said)).slice(0, 4), ['en:Good morning!', 'Buongiorno!', 'en:Good evening!', 'Buonasera!']);
    assert.equal(await page.$$eval('.dr-reps i', (r) => r.length), 1);
    await page.click('.x'); await sleep(300);
    const f = await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.settings')).focus);
    assert.deepEqual(f.shadow, { repeats: 1, enFirst: true }, 'only Shadowing changed');
    assert.deepEqual(f.recall, { en: 'tap', it: 'hidden' });
    // Recall: the English, a gap to say it (the Italian hidden), then the Italian.
    await page.click('[data-mode=recall]'); await sleep(200);
    await page.evaluate(() => { window.__said = []; });
    await page.click('[data-act=focus]'); await sleep(300);
    assert.deepEqual(await page.evaluate(() => window.__said), ['en:Good morning!']);
    assert.match(await page.textContent('.fc-text'), /Good morning!\s*Say it in Italian/, 'the English always shows');
    assert.equal(await page.$('[data-tog=en]'), null, 'Recall has no Translation toggle');
    assert.match(await page.textContent('.dr-ring'), /Your turn/);
    await page.waitForFunction(() => window.__said.length >= 2, null, { timeout: 8000 });
    assert.equal((await page.evaluate(() => window.__said))[1], 'Buongiorno!');
    await sleep(100);
    assert.match(await page.textContent('.fc-text .dr-it'), /Buongiorno!/, 'the answer pops up as it plays');
    assert.match(await page.textContent('.dr-ring'), /Answer/);
    await page.waitForSelector('.dr-ring .mid:has-text("Nice")', { timeout: 4000 });
    assert.match(await page.textContent('.fc-text .dr-it'), /Buongiorno!/, 'and stays up after, to check it');
    assert.match(await page.textContent('.fc-text'), /Good morning!/);
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

  test('the Stats tab shows Training: sentences you can say, the streak, repetitions, cards a day and each pack', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'stats' });
    assert.ok(await page.isHidden('.st-train'), 'Reading is the first pane');
    await page.click('[data-stab="training"]'); await sleep(200);
    assert.ok(await page.isHidden('.st-reading'));
    assert.match((await page.textContent('.st-speaking')).replace(/\s+/g, ' '), /^ ?Pre-A1 ?speaking level You can say 0 of the 20,000 most common words/);
    assert.match(await page.textContent('.st-train'), /start after your first session/);
    await tr(page, async (m) => {
      await m.syncPacks();
      for (const id of ['survival:1', 'survival:2', 'survival:3']) await m.rateCard(id, 'say', 3);
      const s = m.sentence('survival:1');
      await m.putSentence({ ...s, cards: { ...s.cards, say: { ...s.cards.say, s: 20 } } });
      m.stepFinished();
      for (let i = 0; i < 4; i++) m.countRep('survival:1');
    });
    await page.click('#tabbar [data-tab="training"]'); await sleep(300);
    await page.click('#tabbar [data-tab="stats"]'); await sleep(600);
    assert.ok(await page.isVisible('.st-train'), 'the pane you picked stays picked');
    const card = (await page.textContent('.st-train')).replace(/\s+/g, ' ');
    assert.match(card, /1 ?sentence you can say/);
    assert.match(card, new RegExp(`Of ${N} in your packs, you've started 3\\.`));
    assert.match(card, /🔥 1 ?day in a row 1 ?of the last 30 days 3 ?cards this week/);
    assert.match(card, /4 ?repetitions today 4 ?this week 4 ?in all/);
    // survival:1 is learned: its words count toward speaking; the two started ones are practising.
    const speak = (await page.textContent('.st-speaking')).replace(/\s+/g, ' ');
    const [, n] = speak.match(/You can say (\d+) of/);
    assert.ok(+n > 0, speak);
    assert.match(speak, /you're practising \d+ more/);
    assert.equal(await page.$$eval('.bars .bar', (b) => b.length), 14);
    assert.equal(await page.$$eval('.bars .bar:not(.zero)', (b) => b.length), 1, 'only today has cards');
    assert.match(await page.getAttribute('.st-packs .band', 'title'), new RegExp(`^Survival: 1 learned, 2 started, of ${N}$`));
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
