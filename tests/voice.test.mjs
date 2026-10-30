// The bundled Piper voices: real synthesis in the browser, and which voice a tap uses.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openApp, openBook, closeBrowser, tapWord, sleep } from './helpers.mjs';

// Counts Web Audio playbacks and system-voice utterances.
const spy = () => {
  window.__played = [];
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { window.__played.push(['piper', this.buffer.duration]); return start.apply(this, a); };
  if (window.speechSynthesis) speechSynthesis.speak = (u) => window.__played.push(['system', u.text]);
};
async function ready(page, voice = 'riccardo') {
  for (let i = 0; i < 300; i++) {
    if (await page.evaluate((v) => import('./js/piper.js').then((m) => m.piperReady(v)), voice)) return;
    await sleep(200);
  }
  throw new Error(`${voice} never loaded`);
}

describe('voice', () => {
  const t = {};
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await closeBrowser(t); srv.server.close(); });

  test('Riccardo turns Italian text into speech on the device', async () => {
    const { page, errors } = await openApp(t, srv.url, { voice: '' });
    const out = await page.evaluate(async () => {
      const m = await import('./js/piper.js');
      const stats = ({ samples, sampleRate }) => ({ secs: samples.length / sampleRate, sampleRate, peak: samples.reduce((p, x) => Math.max(p, Math.abs(x)), 0) });
      return { word: stats(await m.synth('treno')), two: stats(await m.synth('Il treno arrivò a Bologna. Che bella giornata!')), slow: stats(await m.synth('Il treno arrivò a Bologna. Che bella giornata!', 0.5)) };
    });
    assert.equal(out.word.sampleRate, 16000);
    assert.ok(out.word.secs > 0.25 && out.word.secs < 2, `one word lasts ${out.word.secs}s`);
    assert.ok(out.word.peak > 0.05, 'and is audible');
    assert.ok(out.two.secs > 2.5, `two sentences last ${out.two.secs}s`);
    // Piper varies timing at random, so compare a whole passage, not one short word.
    assert.ok(out.slow.secs > out.two.secs * 1.4, `half speed stretches it: ${out.two.secs}s → ${out.slow.secs}s`);
    assert.deepEqual(errors, []);
  });

  test('Paola and Serena speak too, one voice in memory at a time', async () => {
    const { page, errors } = await openApp(t, srv.url, { voice: '' });
    const out = await page.evaluate(async () => {
      const m = await import('./js/piper.js');
      const secs = ({ samples, sampleRate }) => ({ secs: samples.length / sampleRate, sampleRate });
      const r = { paola: secs(await m.synth('treno', 1, 'paola')), serena: secs(await m.synth('treno', 1, 'serena')) };
      r.ricardoAgain = secs(await m.synth('valigia', 1, 'riccardo'));
      return r;
    });
    for (const v of ['paola', 'serena']) {
      assert.equal(out[v].sampleRate, 22050, v);
      assert.ok(out[v].secs > 0.25 && out[v].secs < 2, `${v}: ${out[v].secs}s`);
    }
    assert.equal(out.ricardoAgain.sampleRate, 16000, 'switching back reloads Riccardo');
    assert.deepEqual(errors, []);
  });

  test('tapping a word says it: Riccardo once he has loaded, the device voice before that', async () => {
    const { page, errors } = await openApp(t, srv.url, { voice: '' });
    await page.addInitScript(spy); await page.reload(); await page.waitForSelector('#view-library .book');
    await openBook(page);
    await tapWord(page, 'treno'); await sleep(200);
    await ready(page);
    await page.mouse.click(10, 150); await sleep(600); // close the bubble
    await tapWord(page, 'valigia');
    await page.waitForFunction(() => window.__played.some(([v]) => v === 'piper'), null, { timeout: 20000 });
    const played = await page.evaluate(() => window.__played);
    if (played[0][0] === 'system') assert.equal(played[0][1], 'treno');
    assert.equal(played.at(-1)[0], 'piper');
    assert.ok(played.at(-1)[1] > 0.25);
    assert.deepEqual(errors, []);
  });

  test('a picked voice is the one that speaks', async () => {
    const { page, errors } = await openApp(t, srv.url, { voice: 'piper:serena' });
    await openBook(page);
    await ready(page, 'serena');
    assert.equal(await page.evaluate(() => import('./js/piper.js').then((m) => m.piperReady('riccardo'))), false, 'Riccardo never loaded');
    await page.click('#r-menu'); await page.click('[data-act=themes]'); await sleep(400);
    const opts = await page.$$eval('select[data-set=voice] option', (os) => os.map((o) => [o.value, o.textContent, o.selected]));
    assert.deepEqual(opts.slice(0, 4).map(([v]) => v), ['', 'piper:paola', 'piper:serena', 'system']);
    assert.match(opts[0][1], /Riccardo \(natural, male/);
    assert.equal(opts.find((o) => o[2])[0], 'piper:serena');
    assert.equal(await page.isChecked('input[data-set=speakOnTap]'), true);
    assert.deepEqual(errors, []);
  });

  test('the device voice can be chosen instead, and speaking on tap turned off', async () => {
    const { page, errors } = await openApp(t, srv.url);
    await page.addInitScript(spy); await page.reload(); await page.waitForSelector('#view-library .book');
    await openBook(page);
    await tapWord(page, 'treno'); await sleep(300);
    assert.deepEqual(await page.evaluate(() => window.__played), [['system', 'treno']], 'the tap says the word');
    assert.equal(await page.evaluate(() => import('./js/piper.js').then((m) => m.piperReady('riccardo'))), false, 'Riccardo never loaded');
    await page.click('.wpop [data-speak]'); await sleep(300);
    assert.equal(await page.evaluate(() => window.__played.length), 2, 'and so does the speaker button');

    await page.mouse.click(10, 150); await sleep(600);
    await page.evaluate(() => import('./js/settings.js').then((m) => { m.settings.speakOnTap = false; }));
    await tapWord(page, 'valigia'); await sleep(300);
    assert.equal(await page.evaluate(() => window.__played.length), 2, 'with it off, a tap is silent');
    assert.deepEqual(errors, []);
  });
});
