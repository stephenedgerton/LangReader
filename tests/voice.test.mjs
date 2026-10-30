// Riccardo, the bundled Piper voice: real synthesis in the browser, and which voice a tap uses.
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
async function ready(page) {
  for (let i = 0; i < 300; i++) {
    if (await page.evaluate(() => import('./js/piper.js').then((m) => m.piperReady()))) return;
    await sleep(200);
  }
  throw new Error('Riccardo never loaded');
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
      return { word: stats(await m.synth('treno')), two: stats(await m.synth('Il treno arrivò a Bologna. Che bella giornata!')), slow: stats(await m.synth('treno', 0.5)) };
    });
    assert.equal(out.word.sampleRate, 16000);
    assert.ok(out.word.secs > 0.25 && out.word.secs < 2, `one word lasts ${out.word.secs}s`);
    assert.ok(out.word.peak > 0.05, 'and is audible');
    assert.ok(out.two.secs > 2.5, `two sentences last ${out.two.secs}s`);
    assert.ok(out.slow.secs > out.word.secs * 1.4, 'a slower rate stretches it');
    assert.deepEqual(errors, []);
  });

  test('tapping the speaker uses Riccardo once he has loaded, the device voice before that', async () => {
    const { page, errors } = await openApp(t, srv.url, { voice: '' });
    await page.addInitScript(spy); await page.reload(); await page.waitForSelector('#view-library .book');
    await openBook(page);
    await tapWord(page, 'treno'); await page.click('.wpop [data-speak]'); await sleep(200);
    await ready(page);
    await page.mouse.click(10, 150); await sleep(600); // close the bubble
    await tapWord(page, 'valigia'); await page.click('.wpop [data-speak]');
    await page.waitForFunction(() => window.__played.some(([v]) => v === 'piper'), null, { timeout: 20000 });
    const played = await page.evaluate(() => window.__played);
    if (played[0][0] === 'system') assert.equal(played[0][1], 'treno');
    assert.equal(played.at(-1)[0], 'piper');
    assert.ok(played.at(-1)[1] > 0.25);
    assert.deepEqual(errors, []);
  });

  test('the device voice can be chosen instead', async () => {
    const { page, errors } = await openApp(t, srv.url);
    await page.addInitScript(spy); await page.reload(); await page.waitForSelector('#view-library .book');
    await openBook(page);
    await tapWord(page, 'treno'); await page.click('.wpop [data-speak]'); await sleep(300);
    assert.deepEqual(await page.evaluate(() => window.__played), [['system', 'treno']]);
    assert.equal(await page.evaluate(() => import('./js/piper.js').then((m) => m.piperReady())), false, 'Riccardo never loaded');
    assert.deepEqual(errors, []);
  });
});
