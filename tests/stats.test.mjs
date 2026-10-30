// Word frequency: the bubble's frequency tag, the Stats tab (level, coverage, bands, themes, trend
// snapshot) and the stronger mark on common new words in the reader.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startServer, openApp, openBook, closeReader, closeBrowser, tapWord, sleep } from './helpers.mjs';

const text = async (page, sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();

// Ranks straight from the shipped list, so a rebuilt list doesn't break the tests.
const data = JSON.parse(readFileSync(join(ROOT, 'data/freq-it-v1.json'), 'utf8'));
const rankOf = (lemma) => data.lemmas.findIndex(([l]) => l === lemma) + 1;
const bandKnown = async (page, label) => +(await page.getAttribute(`.band[title^="${label}:"]`, 'title')).match(/: (\d+) known/)[1];

describe('stats', () => {
  const t = {};
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await closeBrowser(t); srv.server.close(); });

  test('the bubble shows how common a word is, by its dictionary form', async () => {
    const { page, errors } = await openApp(t, srv.url);
    await openBook(page);
    await tapWord(page, 'arrivò');
    const r = rankOf('arrivare');
    assert.ok(r > 100 && r <= 500, 'arrivare is in the top 500');
    assert.equal(await text(page, '.wp-freq'), `arrivare · #${r} · Top 500 ●●●●●`);
    assert.equal(await page.getAttribute('.fq-dots', 'aria-label'), '5 of 5');
    await page.mouse.click(10, 150); await sleep(300);

    await tapWord(page, 'treno');
    assert.equal(await text(page, '.wp-freq'), `#${rankOf('treno')} · Top 1k ●●●●●`, 'no lemma shown when it is the word itself');
    assert.equal(await page.getAttribute('.fq-dots', 'aria-label'), '4 of 5');
    await page.mouse.click(10, 150); await sleep(300);
    await tapWord(page, 'bologna');
    assert.ok(await page.$eval('.wp-freq', (e) => e.hidden), 'an ignored name gets no tag');
    await page.mouse.click(10, 150); await sleep(300);

    await tapWord(page, 'treno');
    await page.click('.wpop .wp-more'); await sleep(400);
    assert.match(await text(page, '.freq-line'), new RegExp(`The ${rankOf('treno')}th most common word in Italian fiction \\(top 1k\\): about 1 in every [\\d,]+ words\\.`));
    assert.deepEqual(errors, []);
  });

  test('Stats tab: level, fiction coverage, bands and themes follow your vocabulary', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'stats' });
    assert.match(await text(page, '.st-level'), /^Pre-A1\s*rough level You know \d+ of the 20,000 most common words.* 500 more to reach A1\./);
    assert.match(await text(page, '.st-cover'), /^\d+\.\d%\s*of the words in a typical novel/);
    assert.equal(await page.$$eval('.band', (e) => e.length), 7);
    assert.equal(await page.$$eval('.theme-row', (e) => e.length), 26);
    const before = await bandKnown(page, 'Top 1k');

    // Knowing a form counts its dictionary form: "arrivò" makes "arrivare" known.
    await page.click('#tabbar [data-tab="library"]');
    await openBook(page);
    await tapWord(page, 'arrivò'); await page.click('.wpop [data-s="5"]'); await sleep(400);
    await tapWord(page, 'treno'); await page.click('.wpop [data-s="2"]'); await sleep(400);
    await page.mouse.click(10, 150); await sleep(300);
    await closeReader(page);
    await page.click('#tabbar [data-tab="stats"]'); await sleep(400);
    assert.equal(await bandKnown(page, 'Top 1k'), before + 1, 'arrivare counted as known');
    assert.match(await page.getAttribute('.band[title^="Top 1k:"]', 'title'), /, 1 learning,/, 'treno counted as learning');

    // Themes list the words you don't know first; tapping one opens its card.
    await page.click('[data-theme="travel"]'); await sleep(300);
    const rows = await page.$$eval('#sheet-body .row', (e) => e.map((r) => r.dataset.t));
    assert.ok(rows.indexOf('treno') < rows.indexOf('arrivare'), 'learning words come before known ones');
    assert.match(await text(page, '#sheet-body .row[data-t="arrivare"]'), /Known/);
    await page.click('#sheet-body .row[data-t="viaggio"]'); await sleep(400);
    assert.equal(await page.textContent('.wcard .term'), 'viaggio');
    assert.deepEqual(errors, []);
  });

  test('a daily snapshot is kept for the trend', async () => {
    const { page, errors } = await openApp(t, srv.url, { hash: 'stats' });
    await sleep(1800); // the snapshot is written with the day's other stats
    const day = await page.evaluate(() => new Promise((res) => {
      const req = indexedDB.open('langreader');
      req.onsuccess = () => {
        const all = req.result.transaction('days').objectStore('days').getAll();
        all.onsuccess = () => res(all.result.at(-1));
      };
    }));
    assert.equal(typeof day.cover, 'number');
    assert.equal(typeof day.lemmas, 'number');
    assert.match(await text(page, '.st-trend'), /Your trend starts today/);
    assert.deepEqual(errors, []);
  });

  test('common new words get a stronger mark, with a switch to turn it off', async () => {
    const { page, errors } = await openApp(t, srv.url);
    await openBook(page);
    assert.ok(rankOf('treno') <= 2000 && rankOf('valigia') > 2000);
    assert.match(await page.getAttribute('.w[data-w="treno"]', 'class'), /\bc\b/);
    assert.doesNotMatch(await page.getAttribute('.w[data-w="valigia"]', 'class'), /\bc\b/);
    assert.ok(await page.$eval('#reader', (e) => e.classList.contains('common-hl')));
    const thick = await page.$eval('.w[data-w="treno"]', (e) => getComputedStyle(e).textDecorationThickness);
    assert.equal(thick, '3.5px');

    // The mark survives a status change and back.
    await tapWord(page, 'treno'); await page.click('.wpop [data-s="2"]'); await sleep(300);
    assert.match(await page.getAttribute('.w[data-w="treno"]', 'class'), /\bs2\b.*\bc\b|\bc\b.*\bs2\b/);
    await page.mouse.click(10, 150); await sleep(300);

    const { page: p2 } = await openApp(t, srv.url, { settings: { commonHL: false } });
    await openBook(p2);
    assert.ok(!(await p2.$eval('#reader', (e) => e.classList.contains('common-hl'))));
    assert.deepEqual(errors, []);
  });
});
