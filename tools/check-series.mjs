// Checks the graded series in samples/series/ against its word plan (tools/series-words.mjs).
//
//   node tools/check-series.mjs            summary table, one row per book, plus warnings
//   node tools/check-series.mjs 2          details for book 2: new words, words outside the list, unknowns
//   node tools/check-series.mjs --next 80  the 80 most common target words the series hasn't used yet
//                                          (add --late to include the archaic ones)
//
// It reads the books with the app's own tokenizer and the app's form → lemma list, so a word counts the
// way the reader and the Stats tab count it. A word that isn't in the 20,000-lemma list, isn't a name
// and isn't in EXTRA is reported as unknown: usually a typo or a wrong form.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tokenize, normalize } from '../js/text.js';
import { NAMES } from '../js/names.js';
import { SERIES, loadSeriesBook } from '../samples/series/index.js';
import { TOP, SKIP, LATE, LATE_FROM, EXTRA, PLAN, FAMILIAR_AFTER, MIN_REPEATS, MAX_UNFAMILIAR } from './series-words.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

export function loadFreqList() {
  const j = JSON.parse(readFileSync(`${root}data/freq-it-v1.json`, 'utf8'));
  const forms = new Map();
  j.lemmas.forEach(([, , f], i) => { if (f) for (const x of f.split('|')) forms.set(x, i); });
  j.lemmas.forEach(([l], i) => { if (!forms.has(l)) forms.set(l, i); });
  return { lemmas: j.lemmas.map((x) => x[0]), forms };
}

export async function loadBooks() {
  const books = [];
  for (let n = 1; n <= SERIES.books; n++) books.push(await loadSeriesBook(n));
  return books;
}

// Every word of a book in reading order, with the sentence it's in (for reports).
function* words(book) {
  for (const ch of book.chapters) {
    for (const b of ch.blocks) {
      for (const t of tokenize(b.x)) if (t.type === 'w') yield { term: normalize(t.text), text: b.x };
    }
  }
}

export function analyse(books, freq = loadFreqList()) {
  const names = new Set(NAMES.map(normalize));
  const isTarget = (i) => i < TOP && !SKIP.has(freq.lemmas[i]);
  const seen = new Map();          // lemma key -> times met so far in the series
  const firstBook = new Map();     // lemma key -> book number that introduced it
  const rows = [];
  let covered = 0;
  books.forEach((book, bi) => {
    const n = bi + 1;
    const r = { n, title: book.title, words: 0, names: 0, unfamiliar: 0, newTarget: [], newOther: new Map(), unknown: new Map(), late: new Map(), here: new Map() };
    for (const { term, text } of words(book)) {
      if (/^\p{N}/u.test(term)) continue;
      r.words++;
      if (names.has(term)) { r.names++; continue; }
      const i = freq.forms.get(term);
      let key;
      if (i !== undefined) key = freq.lemmas[i];
      else if (EXTRA.has(term)) key = `+${term}`;
      else { key = `?${term}`; if (!r.unknown.has(term)) r.unknown.set(term, text); }
      const before = seen.get(key) || 0;
      if (before < FAMILIAR_AFTER) r.unfamiliar++;
      if (!before) {
        firstBook.set(key, n);
        if (i !== undefined && isTarget(i)) { r.newTarget.push(key); covered++; }
        else if (i !== undefined) r.newOther.set(key, i + 1);
      }
      if (i !== undefined && n < LATE_FROM && LATE.has(key)) r.late.set(term, text);
      seen.set(key, before + 1);
      r.here.set(key, (r.here.get(key) || 0) + 1);
    }
    r.covered = covered;
    r.unfamiliarShare = r.words ? r.unfamiliar / (r.words - r.names) : 0;
    r.thin = r.newTarget.filter((k) => r.here.get(k) < MIN_REPEATS).map((k) => `${k}×${r.here.get(k)}`);
    // Words from earlier books that still haven't come up MIN_REPEATS times in all, by the end of this one.
    r.unreinforced = rows.flatMap((p) => p.newTarget).filter((k) => seen.get(k) < MIN_REPEATS).map((k) => `${k}×${seen.get(k)}`);
    r.plan = PLAN[bi];
    rows.push(r);
  });
  const targets = freq.lemmas.slice(0, TOP).filter((l) => !SKIP.has(l));
  const unused = targets.filter((l) => !seen.has(l));
  return { rows, seen, unused, targets };
}

// Problems that should fail the test suite.
export function problems({ rows }) {
  const out = [];
  for (const r of rows) {
    if (r.unknown.size) out.push(`book ${r.n}: unknown words ${[...r.unknown.keys()].join(', ')}`);
    if (r.late.size) out.push(`book ${r.n}: late words before book ${LATE_FROM}: ${[...r.late.keys()].join(', ')}`);
    if (r.unfamiliarShare > MAX_UNFAMILIAR(r.n)) out.push(`book ${r.n}: ${pct(r.unfamiliarShare)} unfamiliar words (max ${pct(MAX_UNFAMILIAR(r.n))})`);
  }
  return out;
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

async function main(args) {
  const freq = loadFreqList();
  const books = await loadBooks();
  const a = analyse(books, freq);
  if (args[0] === '--next') {
    const k = +args[1] || 60;
    console.log(a.unused.filter((l) => args.includes('--late') || !LATE.has(l)).slice(0, k).map((l) => `${l}#${freq.forms.get(l) + 1}`).join(' '));
    return;
  }
  if (args[0]) {
    const r = a.rows[+args[0] - 1];
    if (!r) return console.log('No such book.');
    console.log(`Book ${r.n} · ${r.title}`);
    console.log(`\nNew target words (${r.newTarget.length}):\n${r.newTarget.map((k) => `${k}×${r.here.get(k)}`).join(' ')}`);
    console.log(`\nNew words outside the top ${TOP} (${r.newOther.size}):\n${[...r.newOther].map(([k, rank]) => `${k}#${rank}×${r.here.get(k)}`).join(' ')}`);
    if (r.thin.length) console.log(`\nNew target words used fewer than ${MIN_REPEATS} times:\n${r.thin.join(' ')}`);
    if (r.unreinforced.length) console.log(`\nWords from earlier books still under ${MIN_REPEATS} uses in all:\n${r.unreinforced.join(' ')}`);
    for (const [w, t] of r.unknown) console.log(`\nUnknown: ${w}\n  ${t}`);
    for (const [w, t] of r.late) console.log(`\nLate word: ${w}\n  ${t}`);
    return;
  }
  console.log('book  words (plan)   new tgt  covered (plan)  unfamiliar  thin  unreinf  other  unknown');
  for (const r of a.rows) {
    const [pw, pc] = r.plan || [];
    console.log(`${String(r.n).padStart(4)}  ${String(r.words).padStart(5)} (${String(pw).padStart(5)})  ${String(r.newTarget.length).padStart(7)}  ${String(r.covered).padStart(7)} (${String(pc).padStart(4)})  ${pct(r.unfamiliarShare).padStart(10)}  ${String(r.thin.length).padStart(4)}  ${String(r.unreinforced.length).padStart(7)}  ${String(r.newOther.size).padStart(5)}  ${String(r.unknown.size).padStart(7)}`);
  }
  console.log(`\n${a.targets.length - a.unused.length} of ${a.targets.length} target words used.`);
  const p = problems(a);
  if (p.length) { console.log(`\nProblems:\n${p.join('\n')}`); process.exitCode = 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
