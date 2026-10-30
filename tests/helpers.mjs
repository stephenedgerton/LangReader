// Shared test harness: a static server for the repo, an iPhone-sized Chromium page,
// and mocks for the two network services (Wiktionary, MyMemory).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Playwright is resolved like CommonJS so a globally installed copy (NODE_PATH) works too.
const { chromium, devices } = createRequire(import.meta.url)('playwright');

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURES = join(ROOT, 'tests', 'fixtures');

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
};

export function startServer() {
  const server = createServer(async (req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path.endsWith('/')) path += 'index.html';
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

// Wiktionary REST responses keyed by page title; anything else is a 404 ("no entry").
export const WIKTIONARY = {
  'arrivò': { it: [{ partOfSpeech: 'Verb', definitions: [{ definition: '<span class="form-of-definition">third-person singular <a href="/wiki/Appendix:Italian_past_historic" title="Appendix:Italian past historic">past historic</a> of <span class="form-of-definition-link"><a href="/wiki/arrivare#Italian" title="arrivare">arrivare</a></span></span>' }] }] },
  'arrivare': {
    it: [{ partOfSpeech: 'Verb', definitions: [{ definition: '(<i>intransitive</i>) to <a href="/wiki/arrive">arrive</a>, to reach' }, { definition: '(<i>intransitive</i>) to succeed; to manage' }, { definition: '' }] }],
    en: [{ partOfSpeech: 'Noun', definitions: [{ definition: 'should be ignored' }] }],
  },
  'Bologna': { it: [{ partOfSpeech: 'Proper noun', definitions: [{ definition: 'Bologna (a city in Emilia-Romagna)' }] }] },
};

const json = (status, body) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

// opts.wiktionary: map of title -> response (default WIKTIONARY); opts.mt: translation text, or null to fail.
// opts.voice: settings.voice; the device voice by default, so tests don't load Riccardo (pass '' for him).
export async function openApp(t, base, { hash = 'library', tipsSeen = true, settings = null, wiktionary = WIKTIONARY, mt = 'mock translation', voice = 'system', context = {} } = {}) {
  const browser = t.browser || (t.browser = await chromium.launch());
  const ctx = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true, ...context });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // 404s are how Wiktionary says "no entry", so they're expected.
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(({ tipsSeen, settings, voice }) => {
    if (tipsSeen) localStorage.setItem('langreader.tipsSeen', '1');
    if (settings) localStorage.setItem('langreader.settings', JSON.stringify({ voice, ...settings }));
    else if (!localStorage.getItem('langreader.settings')) localStorage.setItem('langreader.settings', JSON.stringify({ voice }));
  }, { tipsSeen, settings, voice });
  const wikt = [];
  await page.route('https://en.wiktionary.org/**', (r) => {
    const title = decodeURIComponent(new URL(r.request().url()).pathname.split('/').pop());
    wikt.push(title);
    const body = wiktionary[title];
    r.fulfill(body ? json(200, body) : json(404, {}));
  });
  await page.route('https://api.mymemory.translated.net/**', (r) => r.fulfill(mt == null ? json(503, {})
    : json(200, { responseStatus: 200, responseData: { translatedText: mt }, matches: [] })));
  await page.goto(base + '#' + hash);
  await page.waitForSelector('#view-' + hash + ' > *');
  return { page, ctx, errors, wikt };
}

export async function closeBrowser(t) { if (t.browser) await t.browser.close(); }

export async function openBook(page, title = 'Un caffè a Bologna') {
  await page.click(`#view-library .book:has-text("${title}") [data-open]`);
  await page.waitForSelector('#page-content .w');
  await page.waitForTimeout(300);
}

export async function closeReader(page) {
  if (await page.$eval('#reader', (e) => e.classList.contains('immersive'))) {
    await page.mouse.click(60, 650); // the strip under the page toggles the controls
    await page.waitForTimeout(250);
  }
  await page.click('#r-close');
  await page.waitForTimeout(300);
}

export const pageNo = async (page) => +(await page.textContent('#r-pageno')).split(' ')[0];

export async function tapWord(page, term) {
  const b = await (await page.$(`.w[data-w="${term}"]`)).boundingBox();
  await page.mouse.click(b.x + 4, b.y + 5);
  await page.waitForTimeout(350);
}

export async function holdWord(page, term, ms = 600) {
  const b = await (await page.$(`.w[data-w="${term}"]`)).boundingBox();
  await page.mouse.move(b.x + 4, b.y + 5);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  return b;
}

export async function swipe(page, fromX, toX, y = 400) {
  await page.mouse.move(fromX, y);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i++) await page.mouse.move(fromX + ((toX - fromX) * i) / steps, y);
  await page.mouse.up();
  await page.waitForTimeout(550);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
