// Training's ready-made packs (samples/packs/): their words, markup and files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { analyse, problems } from '../tools/check-sentences.mjs';
import { PACKS, DEFAULT_PACKS, packFiles } from '../samples/packs/index.js';

const root = new URL('..', import.meta.url);

test('the packs have no unknown words, broken gender markup or repeated keys, and stay common enough', async () => {
  assert.deepEqual(problems(await analyse()), []);
});

test('every pack file is listed and cached by the service worker', () => {
  const onDisk = readdirSync(new URL('samples/packs/', root)).filter((f) => f !== 'index.js').map((f) => `samples/packs/${f}`);
  assert.deepEqual(onDisk.sort(), packFiles().sort());
  const sw = readFileSync(new URL('sw.js', root), 'utf8');
  for (const f of [...packFiles(), 'samples/packs/index.js']) assert.ok(sw.includes(`'${f}'`), `${f} missing from SHELL`);
  assert.equal(new Set(PACKS.map((p) => p.id)).size, PACKS.length, 'ids are unique');
  for (const id of DEFAULT_PACKS) assert.ok(PACKS.some((p) => p.id === id));
});
