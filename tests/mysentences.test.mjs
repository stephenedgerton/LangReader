// Training's own sentences: "Train this sentence" from the reader, a word's card and reviews; New Sentence
// with the suggested Italian; your own packs (make, edit, delete); a sentence's sheet (edit, packs, delete);
// adding to a ready-made pack; and the focus pack.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openApp, openBook, closeReader, closeBrowser, tapWord, sleep } from './helpers.mjs';

const tr = (page, fn, arg) => page.evaluate(async ({ fn, arg }) => {
  const m = await import('./js/training.js');
  await m.loadSentences();
  return new Function('m', 'arg', `return (${fn})(m, arg)`)(m, arg);
}, { fn: fn.toString(), arg });
const mine = (page) => tr(page, (m) => [...(m.trainingList())].filter((s) => !s.bundled));
const FIRST = 'Il treno arrivò a Bologna alle otto di mattina.';
const GENDER = { trainMe: 'm', trainPartner: 'f' };

// Makes a pack, with one sentence in it, straight in the store.
const seedPack = (page, name, sentences) => tr(page, async (m, { name, sentences }) => {
  const p = await m.savePack({ name, emoji: '✈️', colors: m.PACK_COLORS[2] });
  for (const [it, en] of sentences) await m.addSentence({ it, en, packs: [p.id] });
  return p.id;
}, { name, sentences });

describe('your own sentences', () => {
  const t = {};
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await closeBrowser(t); srv.server.close(); });

  test('Train this sentence in the bubble puts the sentence in From reading, translated', async () => {
    const { page, errors } = await openApp(t, srv.url, { mt: 'The train arrived in Bologna at eight in the morning' });
    await openBook(page);
    await tapWord(page, 'treno');
    assert.match(await page.textContent('.wpop .wp-train'), /Train this sentence/);
    await page.click('.wpop .wp-train'); await sleep(400);
    assert.match(await page.textContent('.wpop .wp-train'), /Added to From reading/);
    const [s] = await mine(page);
    assert.deepEqual([s.it, s.en, s.packs, s.from], [FIRST, 'The train arrived in Bologna at eight in the morning', ['reading'], 'Un caffè a Bologna']);
    assert.deepEqual(s.cards, {}, 'a new sentence');
    // Another word in the same sentence: already in training, in the bubble and the card.
    await tapWord(page, 'arrivò'); await sleep(200); // the first tap closes the open bubble
    await tapWord(page, 'arrivò');
    assert.match(await page.textContent('.wpop .wp-train'), /In training/);
    assert.ok(await page.$eval('.wpop .wp-train', (b) => b.disabled));
    await page.click('.wpop .wp-more'); await sleep(400);
    assert.match(await page.textContent('.wcard .ctx-train'), /In training/);
    await page.click('.wcard .x'); await sleep(300);
    await closeReader(page);
    // From reading comes first in the Training tab.
    await page.click('#tabbar button[data-tab=training]'); await sleep(400);
    const shelves = await page.$$eval('.shelf', (x) => x.map((e) => e.textContent.replace(/\s+/g, ' ')));
    assert.match(shelves[0], /^\s*📖\s*From reading\s*Your reading\s*0 of 1 learned\s*New Pack/);
    await page.click('[data-pack=reading]'); await sleep(300);
    assert.match(await page.textContent('.tr-hero'), /From your reading · 1 sentence\b/);
    assert.equal(await page.textContent('.tr-row .txt'), FIRST);
    await page.click('.tr-row [data-sent]'); await sleep(300);
    assert.match(await page.textContent('.tr-sheet-from'), /From Un caffè a Bologna/);
    assert.deepEqual(errors, []);
  });

  test('a word’s card in Vocabulary uses the sentence’s saved translation; offline, nothing is added', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'vocab', mt: null });
    await page.evaluate(async (ex) => {
      const v = await import('./js/vocab.js');
      await v.setWord('treno', { status: 1, meaning: 'train', example: ex, exampleTr: 'The train got to Bologna at eight.' });
      await v.setWord('quaderno', { status: 1, meaning: 'notebook', example: 'Giulia scese con una valigia piccola e un quaderno nuovo.' });
    }, FIRST);
    await page.click('#tabbar button[data-tab=library]'); await page.click('#tabbar button[data-tab=vocab]'); await sleep(300);
    await page.click('.row[data-t="treno"]'); await sleep(400);
    await page.click('.wcard .ctx-train'); await sleep(400);
    assert.match(await page.textContent('.wcard .ctx-train'), /Added to From reading/);
    assert.equal((await mine(page))[0].en, 'The train got to Bologna at eight.', 'the saved translation, not MyMemory');
    await page.click('.wcard .x'); await sleep(300);
    // No translation yet and MyMemory is down: it says so and adds nothing.
    await page.click('.row[data-t="quaderno"]'); await sleep(400);
    await page.click('.wcard .ctx-train'); await sleep(400);
    assert.match(await page.textContent('.wcard .ctx-train'), /Translation unavailable/);
    assert.equal((await mine(page)).length, 1);
    assert.deepEqual(errors.filter((e) => !/503/.test(e)), []);
  });

  test('the review card can add its example sentence, translating it and keeping the translation', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: { reviewStyle: 'flip' }, mt: 'He arrived at eight.' });
    await page.evaluate(async () => {
      const v = await import('./js/vocab.js');
      await v.setWord('arrivare', { status: 1, meaning: 'to arrive', example: 'Arrivò alle otto.', created: Date.now() - 3 * 86400000 });
    });
    await page.click('#tabbar button[data-tab=library]'); await page.click('#tabbar button[data-tab=training]'); await sleep(300);
    await page.click('.tr-words'); await sleep(400);
    await page.click('[data-flip]'); await sleep(300);
    await page.click('.face.back .rv-train'); await sleep(400);
    assert.match(await page.textContent('.face.back .rv-train'), /Added to From reading/);
    assert.equal(await page.textContent('.face.back .ft'), 'He arrived at eight.', 'the translation shows on the card');
    assert.equal(await page.$('.rv-tr'), null);
    const w = await page.evaluate(() => import('./js/vocab.js').then((m) => m.entry('arrivare')));
    assert.equal(w.exampleTr, 'He arrived at eight.', 'and is kept on the word');
    assert.deepEqual((await mine(page)).map((s) => [s.it, s.en]), [['Arrivò alle otto.', 'He arrived at eight.']]);
    assert.deepEqual(errors, []);
  });

  test('New Sentence: type English, check the suggested Italian, make a pack for it, then add it', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', mt: 'Dove la stazione' });
    await page.click('#view-training [data-act=new]'); await sleep(300);
    assert.equal(await page.isVisible('.ns-suggest'), false, 'nothing to suggest yet');
    await page.fill('[name=en]', 'Where is the station?');
    assert.equal(await page.textContent('.ns-suggest'), 'Suggest the Italian');
    assert.ok(await page.$eval('[data-a=add]', (b) => b.disabled));
    await page.click('.ns-suggest'); await sleep(300);
    assert.equal(await page.inputValue('[name=it]'), 'Dove la stazione');
    assert.match(await page.textContent('.ns-note'), /Suggested by MyMemory/);
    assert.equal((await mine(page)).length, 0, 'nothing is saved until you add it');
    await page.fill('[name=it]', 'Dov’è la stazione?');
    assert.deepEqual(await page.$$eval('.ns-packs [data-p]', (b) => b.map((x) => [x.textContent.trim(), x.classList.contains('on')])), [['🧭 Survival', true]]);
    // A new pack, keeping what you typed.
    await page.click('.ns-packs [data-a=newpack]'); await sleep(300);
    assert.ok(await page.$eval('[data-a=save]', (b) => b.disabled), 'a pack needs a name');
    await page.fill('[name=name]', 'Viaggi');
    await page.click('[data-e="🚆"]'); await page.click('[data-c="3"]');
    assert.match(await page.textContent('.pk-preview'), /🚆\s*Viaggi/);
    await page.click('[data-a=save]'); await sleep(400);
    assert.equal(await page.inputValue('[name=it]'), 'Dov’è la stazione?');
    assert.equal(await page.inputValue('[name=en]'), 'Where is the station?');
    assert.match(await page.textContent('.ns-packs .on'), /Viaggi/, 'the new pack is chosen');
    await page.fill('[name=ctx]', 'in town');
    await page.click('[data-a=add]'); await sleep(400);
    assert.match(await page.textContent('#app-toast'), /Added to Viaggi/);
    const [s] = await mine(page);
    const pack = await tr(page, (m) => m.ownPacks()[0]);
    assert.deepEqual([s.it, s.en, s.ctx, s.packs], ['Dov’è la stazione?', 'Where is the station?', 'in town', [pack.id]]);
    assert.deepEqual([pack.name, pack.emoji, pack.kind], ['Viaggi', '🚆', 'own']);
    assert.match(await page.$$eval('.shelf', (x) => x[0].textContent.replace(/\s+/g, ' ')), /🚆\s*Viaggi\s*Your pack\s*0 of 1 learned/);
    // Typing the same sentence again only adds it to the pack you chose.
    await page.click('#view-training [data-act=new]'); await sleep(300);
    await page.fill('[name=it]', 'Dov’è la stazione'); await page.fill('[name=en]', 'x');
    await page.click('.ns-packs [data-p=survival]'); await page.click('[data-a=add]'); await sleep(400);
    assert.match(await page.textContent('#app-toast'), /already had it/);
    assert.deepEqual((await mine(page)).map((x) => x.packs), [[pack.id, 'survival']]);
    assert.deepEqual(errors, []);
  });

  test('your sentences come first among the new ones; Italian typed in is translated to English', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', mt: 'I like the sea.' });
    await page.click('[data-pack=survival]'); await sleep(300);
    await page.click('[data-act=addsent]'); await sleep(300);
    assert.match(await page.textContent('.ns-packs .on'), /Survival/, 'the pack you were looking at');
    await page.fill('[name=it]', 'Mi piace molto il mare.');
    assert.equal(await page.textContent('.ns-suggest'), 'Translate to English');
    await page.click('.ns-suggest'); await sleep(300);
    assert.equal(await page.inputValue('[name=en]'), 'I like the sea.');
    await page.click('[data-a=add]'); await sleep(400);
    const rows = await page.$$eval('.tr-row .txt', (r) => r.map((x) => x.textContent));
    assert.equal(rows.length, 31); assert.equal(rows[30], 'Mi piace molto il mare.', 'added at the end of the ready-made pack');
    assert.equal(await tr(page, (m) => m.todaysPlan().say[0]), (await mine(page))[0].id, 'but it’s the first new one you train');
    assert.deepEqual(errors, []);
  });

  test('a sentence’s sheet: edit a ready-made one (kept through updates), its packs, and delete', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: GENDER });
    page.on('dialog', (d) => d.accept());
    const pid = await seedPack(page, 'Viaggi', [['Un biglietto, per favore.', 'A ticket, please.']]);
    await page.click('#tabbar button[data-tab=library]'); await page.click('#tabbar button[data-tab=training]'); await sleep(300);
    await page.click('[data-pack=survival]'); await sleep(300);
    await page.click('.tr-row:nth-child(1) [data-sent]'); await sleep(300);
    assert.match(await page.textContent('[data-a=packs]'), /Packs…\s*Survival/);
    await page.click('[data-a=edit]'); await sleep(300);
    assert.equal(await page.inputValue('[name=it]'), 'Buongiorno!');
    await page.fill('[name=it]', 'Buongiorno a tutti!'); await page.fill('[name=en]', 'Good morning, everyone!');
    await page.click('[data-a=save]'); await sleep(400);
    assert.equal(await page.textContent('.tr-row:nth-child(1) .txt'), 'Buongiorno a tutti!');
    // A pack update never puts the old text back.
    const after = await tr(page, async (m) => { localStorage.removeItem('langreader.packRevs'); await m.syncPacks(); return m.sentence('survival:1'); });
    assert.deepEqual([after.it, after.en, after.edited], ['Buongiorno a tutti!', 'Good morning, everyone!', true]);
    // Packs…: tick another, and the last one can't be unticked.
    await page.click('.tr-row:nth-child(1) [data-sent]'); await sleep(300);
    await page.click('[data-a=packs]'); await sleep(300);
    await page.click(`[data-p="${pid}"]`); await sleep(200);
    await page.click('[data-p=survival]'); await sleep(200);
    assert.deepEqual(await tr(page, (m) => m.sentence('survival:1').packs), [pid]);
    await page.click(`[data-p="${pid}"]`); await sleep(200);
    assert.ok(await page.isVisible('[data-note]'), 'one pack at least');
    assert.deepEqual(await tr(page, (m) => m.sentence('survival:1').packs), [pid]);
    await page.click('.sheet .x'); await sleep(400);
    assert.notEqual(await page.textContent('.tr-row:nth-child(1) .txt'), 'Buongiorno a tutti!', 'it left Survival');
    // Deleting a ready-made sentence hides it; deleting yours removes it.
    await page.click('[data-act=back]'); await sleep(300);
    await page.click(`[data-pack="${pid}"]`); await sleep(300);
    assert.deepEqual(await page.$$eval('.tr-row .txt', (r) => r.map((x) => x.textContent)), ['Buongiorno a tutti!', 'Un biglietto, per favore.']);
    await page.click('.tr-row:nth-child(1) [data-sent]'); await sleep(300);
    await page.click('[data-a=delete]'); await sleep(400);
    await page.click('.tr-row:nth-child(1) [data-sent]'); await sleep(300);
    await page.click('[data-a=delete]'); await sleep(400);
    assert.equal(await page.$('.tr-row'), null);
    const gone = await tr(page, (m) => [m.sentence('survival:1')?.hidden, m.trainingList().filter((s) => !s.bundled).length]);
    assert.deepEqual(gone, [true, 0]);
    assert.deepEqual(errors, []);
  });

  test('your own packs: edit, focus (★ and a line on Today), and delete, keeping sentences in other packs', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'training', settings: GENDER });
    page.on('dialog', (d) => d.accept());
    const pid = await seedPack(page, 'Viaggi', [['Un biglietto, per favore.', 'A ticket, please.'], ['A che ora parte il treno?', 'What time does the train leave?']]);
    await tr(page, (m, pid) => m.setSentencePacks(m.trainingList().find((s) => s.it.startsWith('A che')).id, [pid, 'survival']), pid);
    await page.click('#tabbar button[data-tab=library]'); await page.click('#tabbar button[data-tab=training]'); await sleep(300);
    await page.click(`[data-pack="${pid}"]`); await sleep(300);
    assert.match(await page.textContent('.tr-hero'), /Your pack · 2 sentences\s*Viaggi/);
    await page.click('[data-act=packmenu]'); await sleep(300);
    await page.click('[data-a=edit]'); await sleep(300);
    await page.fill('[name=name]', 'In viaggio'); await page.click('[data-a=save]'); await sleep(400);
    assert.match(await page.textContent('.tr-hero h3'), /In viaggio/);
    // Focus: one pack at a time; its new sentences come first.
    await page.click('[data-act=packmenu]'); await sleep(300);
    await page.click('[data-a=focus]'); await sleep(400);
    assert.match(await page.textContent('.tr-hero'), /★ Focus/);
    assert.deepEqual(await tr(page, (m) => m.todaysPlan().say.slice(0, 2).map((id) => m.sentence(id).it)), ['Un biglietto, per favore.', 'A che ora parte il treno?']);
    await page.click('[data-act=back]'); await sleep(300);
    assert.match(await page.textContent('.tr-focus'), /New sentences come from In viaggio first/);
    assert.ok(await page.$(`[data-pack="${pid}"] .pk-star`), '★ on its cover');
    assert.equal(await page.$('[data-pack=survival] .pk-star'), null);
    await page.click('[data-pack=survival]'); await sleep(300);
    await page.click('[data-act=packmenu]'); await page.click('[data-a=focus]'); await sleep(400);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('langreader.settings')).trainFocus), 'survival', 'focus moved');
    await page.click('[data-act=back]'); await sleep(300);
    assert.equal(await page.$(`[data-pack="${pid}"] .pk-star`), null);
    // Deleting the pack deletes its sentence, but the one also in Survival stays there.
    await page.click(`[data-pack="${pid}"]`); await sleep(300);
    await page.click('[data-act=packmenu]'); await page.click('[data-a=delete]'); await sleep(500);
    assert.equal(await page.$(`[data-pack="${pid}"]`), null);
    const left = await tr(page, (m) => [m.ownPacks().length, m.trainingList().filter((s) => !s.bundled).map((s) => [s.it, s.packs])]);
    assert.deepEqual(left, [0, [['A che ora parte il treno?', ['survival']]]]);
    assert.match(await page.textContent('.tr-focus'), /Survival/, 'focus on another pack is untouched');
    assert.deepEqual(errors, []);
  });
});
