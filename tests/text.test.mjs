// Unit tests for the tokenizer, paragraph rendering and chapter splitting (no browser needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, normalize, paragraphHTML, textToChapters, countWords } from '../js/text.js';

const words = (s) => tokenize(s).filter((t) => t.type === 'w').map((t) => t.text);

test('elisions split like LingQ, truncations keep their apostrophe', () => {
  assert.deepEqual(words("Dell'anno scorso, l'acqua era fredda. Un po' di più?"),
    ["Dell'", 'anno', 'scorso', "l'", 'acqua', 'era', 'fredda', 'Un', "po'", 'di', 'più']);
  assert.deepEqual(words('C’era una volta'), ['C’', 'era', 'una', 'volta']);
});

test('quotes and numbers are not words', () => {
  assert.deepEqual(words("«Ciao», disse 'Marco'. 3,5 euro!"), ['Ciao', 'disse', 'Marco', 'euro']);
  assert.equal(countWords('Il treno arrivò alle 8.'), 4);
});

test('normalize lowercases and unifies apostrophes', () => {
  assert.equal(normalize('L’Arrivo'), "l'arrivo");
});

test('paragraphHTML wraps sentences and marks statuses', () => {
  const status = { era: 5, bello: 2 };
  const html = paragraphHTML('Era bello. Sì! Poi', (w) => status[w] || 0, new Map());
  assert.equal((html.match(/class="sent"/g) || []).length, 3);
  assert.match(html, /<span class="w" data-w="era">Era<\/span>/); // known: no highlight
  assert.match(html, /class="w s2" data-w="bello"/);
  assert.match(html, /class="w s0" data-w="sì"/);
});

test('paragraphHTML marks saved phrases as one block', () => {
  const phrases = new Map([['cuore', [{ term: 'cuore le batteva', parts: ['cuore', 'le', 'batteva'] }]]]);
  const html = paragraphHTML('e il cuore le batteva forte.', (w) => (w === 'cuore le batteva' ? 1 : 0), phrases);
  assert.equal((html.match(/ ph[ "]/g) || []).length, 3);
  assert.match(html, /class="w s0 ph ph0" data-w="cuore"/);
  assert.match(html, /<span class="phr s1" data-ph="cuore le batteva"><span [^>]*>cuore<\/span> <span [^>]*>le<\/span> <span [^>]*>batteva<\/span><\/span> /);
  assert.doesNotMatch(html, /data-w="forte" data-ph/);
});

test('a phrase across a sentence break is split into two blocks that nest', () => {
  const phrases = new Map([['va', [{ term: 'va bene ciao', parts: ['va', 'bene', 'ciao'] }]]]);
  const html = paragraphHTML('Va bene. Ciao a tutti.', () => 0, phrases);
  assert.equal((html.match(/class="phr"/g) || []).length, 2);
  assert.match(html, /bene<\/span>\. <\/span><\/span><span class="sent"><span class="phr" data-ph="va bene ciao">/);
  const doc = html.replace(/<span[^>]*>/g, '(').replace(/<\/span>/g, ')').replace(/[^()]/g, '');
  let depth = 0;
  for (const c of doc) { depth += c === '(' ? 1 : -1; assert.ok(depth >= 0); }
  assert.equal(depth, 0);
});

test('textToChapters splits on Capitolo headings and blank-line paragraphs', () => {
  const chapters = textToChapters('Capitolo 1\n\nOggi piove a Roma.\nIl cielo è grigio.\n\nCapitolo 2\n\nDomani farà bel tempo.\n', 'Lezione');
  assert.deepEqual(chapters.map((c) => c.title), ['Capitolo 1', 'Capitolo 2']);
  assert.deepEqual(chapters[0].blocks, [{ t: 'h', x: 'Capitolo 1' }, { t: 'p', x: 'Oggi piove a Roma. Il cielo è grigio.' }]);
});

test('textToChapters without headings uses the fallback title', () => {
  const chapters = textToChapters('Una riga.\nUn’altra riga.', 'Appunti');
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0].title, 'Appunti');
  assert.equal(chapters[0].blocks.length, 2); // no blank lines: each line is a paragraph
});
