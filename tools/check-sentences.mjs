// Checks Training's ready-made packs (samples/packs/) with the app's tokenizer and form → lemma list.
//
//   node tools/check-sentences.mjs           one row per pack, then any problems
//   node tools/check-sentences.mjs survival  the pack's uncommon and unknown words, with their sentences
//
// Problems (tests/sentences.test.mjs fails on them): words that aren't in the 20,000-lemma list or the
// names (usually a typo), broken gender markup, empty or repeated sentences, repeated keys, a pack outside
// MIN–MAX sentences, and a `common` pack with more than MAX_UNCOMMON words outside the 2,000 commonest lemmas.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tokenize, normalize } from '../js/text.js';
import { NAMES } from '../js/names.js';
import { genderize, genderProblems } from '../js/sentences.js';
import { PACKS, loadPack } from '../samples/packs/index.js';
import { loadFreqList } from './check-series.mjs';

export const MIN = 20, MAX = 40, COMMON = 2000, MAX_UNCOMMON = 12;
// Words the lemma list doesn't have but that are fine (checked by hand). The list comes from 19th- and
// early 20th-century novels, so everyday modern words can be missing.
export const EXTRA = new Set(['ok', 'cucino', 'prenoto', 'prenotato', 'supermercato', 'bolletta', 'vegetariano', 'vegetariana',
  'allergico', 'allergica', 'mappa', 'autobus', 'incartare', 'euro', 'etto', 'salutami', 'password', 'wifi', 'taxi', 'aeroporto', 'foto']);

export async function analyse(freq = loadFreqList()) {
  const names = new Set(NAMES.map(normalize));
  const out = [];
  for (const p of PACKS) {
    const list = await loadPack(p.id);
    const r = { id: p.id, n: list.length, uncommon: new Map(), unknown: new Map(), problems: [] };
    const keys = new Set(), texts = new Set();
    for (const s of list) {
      if (keys.has(s.k)) r.problems.push(`${p.id}: key ${s.k} is used twice`);
      keys.add(s.k);
      if (!s.it.trim() || !s.en.trim()) r.problems.push(`${p.id} ${s.k}: empty sentence or translation`);
      if (texts.has(s.it)) r.problems.push(`${p.id} ${s.k}: “${s.it}” is in the pack twice`);
      texts.add(s.it);
      for (const g of genderProblems(s.it)) r.problems.push(`${p.id} ${s.k}: ${g} in “${s.it}”`);
      const words = new Set([...tokenize(genderize(s.it, 'm', 'm')), ...tokenize(genderize(s.it, 'f', 'f'))].filter((t) => t.type === 'w').map((t) => normalize(t.text)));
      for (const w of words) {
        if (/^\p{N}/u.test(w) || names.has(w) || EXTRA.has(w)) continue;
        const i = freq.forms.get(w);
        const at = r[i === undefined ? 'unknown' : i >= COMMON ? 'uncommon' : null];
        if (at) { if (!at.has(w)) at.set(w, []); at.get(w).push(genderize(s.it, 'm', 'f')); }
      }
    }
    if (r.n < MIN || r.n > MAX) r.problems.push(`${p.id}: ${r.n} sentences (a pack has ${MIN}–${MAX})`);
    for (const [w, ss] of r.unknown) r.problems.push(`${p.id}: unknown word “${w}” in “${ss[0]}”`);
    if (p.common && r.uncommon.size > MAX_UNCOMMON) r.problems.push(`${p.id}: ${r.uncommon.size} words outside the ${COMMON} commonest (at most ${MAX_UNCOMMON})`);
    out.push(r);
  }
  return out;
}
export const problems = (a) => a.flatMap((r) => r.problems);

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = await analyse();
  const which = process.argv[2];
  if (which) {
    const r = a.find((x) => x.id === which);
    if (!r) { console.error(`No pack “${which}”. Packs: ${a.map((x) => x.id).join(', ')}`); process.exit(1); }
    for (const [label, m] of [['Outside the commonest', r.uncommon], ['Unknown', r.unknown]]) {
      console.log(`\n${label} (${m.size}):`);
      for (const [w, ss] of m) console.log(`  ${w.padEnd(16)} ${ss[0]}`);
    }
  } else {
    console.log('pack'.padEnd(16), 'sentences', 'uncommon', 'unknown');
    for (const r of a) console.log(r.id.padEnd(16), String(r.n).padStart(9), String(r.uncommon.size).padStart(8), String(r.unknown.size).padStart(7));
  }
  const p = problems(a);
  if (p.length) { console.log('\nProblems:'); p.forEach((x) => console.log('  ' + x)); process.exitCode = 1; }
}
