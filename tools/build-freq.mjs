// Builds data/freq-it-v1.json: the most common Italian dictionary forms (lemmas) in fiction, with the
// word forms that belong to each. Run once, offline; the app only ships the output.
//
//   node tools/build-freq.mjs <morph-it_048.txt> <dir of Project Gutenberg .txt novels> [out]
//
// Inputs:
// - Morph-it! (https://docs.sslmit.unibo.it/doku.php?id=resources:morph-it, CC BY-SA 2.0 / LGPL):
//   form -> lemma. Its gaps (perché, più, è …) are filled from the novels and from EXTRA below.
// - Italian novels from Project Gutenberg (tools/gutenberg-ids.txt lists the ones used). Only counts
//   derived from them are shipped.
//
// Each novel is tokenised with the app's own tokenize(), so forms match what a tap looks up.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tokenize, normalize } from '../js/text.js';

const [morphPath, corpusDir, out = 'data/freq-it-v1.json'] = process.argv.slice(2);
if (!morphPath || !corpusDir) { console.error('usage: node tools/build-freq.mjs <morph-it.txt> <corpus dir> [out]'); process.exit(1); }
const TOP = 20000;

// ---- Morph-it: form -> Map(lemma -> Set(word class)) ----
const SKIP_TAG = /^(NPR|PON|SENT|SYM|SMI|ABL)/;
// V verb (p: its past participle; v: a form fiction rarely uses, like the 2nd person or the subjunctive),
// N noun, A adjective, D determiner, P pronoun, O other.
const VERB = /^(VER|AUX|MOD|CAU|ASP):/;
const wordClass = (tag) => !VERB.test(tag) ? null : /:part\+past/.test(tag) ? 'p' : /:(ind\+pres\+2|sub\+pres|impr)/.test(tag) ? 'v' : 'V';
const otherClass = (tag) => tag.startsWith('NOUN') ? 'N' : tag.startsWith('ADJ') ? 'A' : tag.startsWith('NOUN') ? 'N' : tag.startsWith('ADJ') ? 'A'
  : /^(DET|ART)/.test(tag) ? 'D' : tag.startsWith('PRO') ? 'P' : 'O';
const classOf = (tag) => wordClass(tag) || otherClass(tag);
// Articles and articulated prepositions become their base word, the way dictionaries list them.
const ARTPRE = [[/^(del|dell|dello|della|dei|degli|delle)'?$/, 'di'], [/^(al|all|allo|alla|ai|agli|alle)'?$/, 'a'],
  [/^(dal|dall|dallo|dalla|dai|dagli|dalle)'?$/, 'da'], [/^(nel|nell|nello|nella|nei|negli|nelle)'?$/, 'in'],
  [/^(sul|sull|sullo|sulla|sui|sugli|sulle)'?$/, 'su'], [/^(col|coi|collo|colla|cogli|colle)'?$/, 'con'], [/^(pel|pei|pella|pegli)'?$/, 'per']];
// Lemmas Morph-it spells unlike a dictionary.
const RENAME = { alcun: 'alcuno', nessun: 'nessuno', qualcun: 'qualcuno', ciascun: 'ciascuno', buon: 'buono', gran: 'grande', san: 'santo', bel: 'bello', quel: 'quello', tal: 'tale', qual: 'quale' };
const morph = new Map();
const addForm = (form, lemma, cls) => {
  lemma = RENAME[lemma] || lemma;
  let m = morph.get(form); if (!m) morph.set(form, m = new Map());
  let c = m.get(lemma); if (!c) m.set(lemma, c = new Set());
  c.add(cls);
};
const npr = new Set();
for (const line of new TextDecoder('latin1').decode(readFileSync(morphPath)).split('\n')) {
  const [rawForm, rawLemma, tag] = line.split('\t');
  if (!tag) continue;
  const form = normalize(rawForm);
  if (tag.startsWith('NPR')) { npr.add(form); continue; }
  if (SKIP_TAG.test(tag) || !/^[\p{L}']+$/u.test(form)) continue;
  let lemma = normalize(rawLemma);
  if (tag.startsWith('ART-')) lemma = /^(un|uno|una|un')$/.test(form) ? 'uno' : 'il';
  if (tag.startsWith('ARTPRE') || (tag.startsWith('ART-') && /^d/.test(form))) lemma = ARTPRE.find(([re]) => re.test(form))?.[1] || lemma;
  const cls = tag.startsWith('ARTPRE') ? 'O' : classOf(tag);
  addForm(form, lemma, cls);
  // Morph-it often writes a final accent as an apostrophe (citta' for città). Add the accented spelling too.
  const m = form.match(/^(.*?)([aeiou])'$/);
  if (m && (/[àèéìòù]$/.test(lemma) || lemma === form)) addForm(m[1] + ({ a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù' })[m[2]], lemma.replace(/'$/, ''), cls);
}

// Common words Morph-it lacks or files under the wrong lemma.
const EXTRA = [...Object.entries({
  essere: ['è', 'e\''], potere: ['può'], avere: ['ho', 'hai', 'ha', 'hanno'], dare: ['dà', 'diè'], fare: ['fa', 'fé'],
  andare: ['va'], stare: ['sta'], ci: ['c\''], anche: ['anch\''], quello: ['quell\'', 'que\''], questo: ['quest\''],
  niente: ['nient\''], tutto: ['tutt\''], dove: ['dov\''], come: ['com\''], mi: ['m\''], ti: ['ti', 't\''], si: ['s\''], vi: ['v\''],
  ne: ['n\''], gli: ['gl\''], di: ['d\''], uno: ['un\''], bello: ['bell\''], santo: ['sant\''], grande: ['grand\''],
  buono: ['buon'], poco: ['po\''], cosa: ['cos\''], senza: ['senz\''], ciò: ['ciò'], perché: ['perchè'], poiché: ['poichè'],
  benché: ['benchè'], finché: ['finchè'], affinché: ['affinchè'], né: ['nè'], sé: ['sè'], così: ['così'], più: ['più'], già: ['già'],
  però: ['però'], cioè: ['cioè'], giù: ['giù'], là: ['là'], lì: ['lì'], qua: ['qua'], laggiù: ['laggiù'], lassù: ['lassù'],
  // Ambiguous forms where the usual rule (below) picks the rarer reading, checked by hand.
  essere: ['era', 'erano', 'stato', 'stata', 'stati', 'state', 'fosse', 'fossero', 'sia', 'siano', 'sei', 'sono', 'fui', 'fu'],
  fare: ['fatto', 'fece', 'faccio', 'fatti'], dire: ['detto', 'detta', 'disse'], dare: ['dato', 'diede'], chiedere: ['chiese'],
  prendere: ['prese'], volere: ['voluto'], vedere: ['visto', 'visti'], porre: ['posto'], volta: ['volta', 'volte'],
  santo: ['san'], nulla: ['nulla'], stesso: ['stesse', 'stessi'], parente: ['parenti'], albero: ['alberi'], arma: ['armi'],
  sogno: ['sogni'], bacio: ['baci'], discorso: ['discorsi'], ricordo: ['ricordi'], verso: ['versi'], pari: ['pari'],
  porta: ['porta'], musica: ['musica'], destra: ['destra'], sinistra: ['sinistra'], patria: ['patria'], occhiata: ['occhiata'],
  novella: ['novella'], sorpresa: ['sorpresa'], calma: ['calma'], punta: ['punta'], messa: ['messa'], nota: ['nota'], corsa: ['corsa'],
  rosa: ['rosa'], data: ['data'], politica: ['politica'], fanciulla: ['fanciulla', 'fanciulle'], amante: ['amanti'],
  pianta: ['pianta', 'piante'], campana: ['campana', 'campane'], marina: ['marina'], ala: ['ali'], ramo: ['rami'], raggio: ['raggi'], operaio: ['operai'],
  sposa: ['sposa', 'spose'], fidanzata: ['fidanzata'], vedova: ['vedova'], ferita: ['ferita', 'ferite'], nuvola: ['nuvola', 'nuvole'],
  serva: ['serva', 'serve'], maestra: ['maestra'], amica: ['amica', 'amiche'], promessa: ['promessa', 'promesse'], bugia: ['bugia'],
  grammatica: ['grammatica'], matematica: ['matematica'], rivista: ['rivista'], vetrina: ['vetrina'], torta: ['torta'], zuppa: ['zuppa'],
  paga: ['paga'], coperta: ['coperta', 'coperte'], letto: ['letto'], di: ['dei'], in: ['nei'], da: ['dai'], con: ['colla', 'colle'], sapere: ['so', 'sa'], stare: ['stette'],
})];
for (const [lemma, forms] of EXTRA) for (const f of forms) morph.set(f, new Map([[lemma, new Set(['O'])]]));

// Picks the reading of an ambiguous form:
// - a determiner or adjective over the pronoun entry Morph-it also files it under (quella: quello);
// - a past participle goes to its verb, not to the adjective spelled like it (visto: vedere);
// - a feminine adjective goes to its masculine form, not to a rarer noun or verb spelled like it (bella: bello);
// - otherwise the reading spelled like the form itself (parte: the noun, not partire; tenere: the verb);
// - otherwise the more common lemma, leaving out verb readings fiction rarely uses (rami: ramo, not ramare).
function pick(form, cand, lemmaCount) {
  let list = [...cand.keys()];
  const has = (l, c) => cand.get(l).has(c);
  const byCount = (a, b) => (lemmaCount.get(b) || 0) - (lemmaCount.get(a) || 0);
  if (list.some((l) => has(l, 'D') || has(l, 'A'))) list = list.filter((l) => !(cand.get(l).size === 1 && has(l, 'P')));
  const participle = list.filter((l) => has(l, 'p')).sort(byCount)[0];
  const adj = form.endsWith('a') && list.find((l) => l === form.slice(0, -1) + 'o' && has(l, 'A'));
  if (list.includes(form) && list.length > 1) {
    const own = cand.get(form);
    if (own.size === 1 && own.has('A') && participle) return participle;
    if (own.has('N') && !own.has('A') && adj && (lemmaCount.get(adj) || 0) > 2 * (lemmaCount.get(form) || 0)) return adj;
    return form;
  }
  if (adj && !participle) return adj;
  const weight = (l) => (lemmaCount.get(l) || 0) * ([...cand.get(l)].every((c) => c === 'v') ? 0.02 : 1);
  return list.sort((a, b) => weight(b) - weight(a))[0];
}

// ---- Count the corpus ----
const STRIP_START = /\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i;
const STRIP_END = /\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG/i;
const BOILER = /gutenberg|liber ?liber|e-?book|e-?text|manuzio|www\.|https?:|isbn|licen[sz]/i;
const counts = new Map(); // form -> {n, cap, mid}
let books = 0;
for (const file of readdirSync(corpusDir).filter((f) => f.endsWith('.txt')).sort()) {
  let text = readFileSync(join(corpusDir, file), 'utf8');
  const s = text.search(STRIP_START); if (s >= 0) text = text.slice(s).replace(STRIP_START, '');
  const e = text.search(STRIP_END); if (e >= 0) text = text.slice(0, e);
  books++;
  for (const para of text.split(/\n\s*\n/)) {
    if (BOILER.test(para)) continue;
    let sentStart = true;
    for (const t of tokenize(para.replace(/\s+/g, ' '))) {
      if (t.type !== 'w') { if (/[.!?…:«»"“”—]/.test(t.text)) sentStart = true; continue; }
      if (/\p{N}/u.test(t.text)) continue;
      const n = normalize(t.text);
      let c = counts.get(n); if (!c) counts.set(n, c = { n: 0, cap: 0, mid: 0 });
      c.n++;
      if (!sentStart) { c.mid++; if (t.text[0] !== t.text[0].toLowerCase()) c.cap++; }
      sentStart = false;
    }
  }
}

// ---- Forms -> lemmas ----
// Names: capitalised in mid-sentence nearly every time, and not an ordinary word Morph-it knows.
const isName = (f, c) => (c.mid ? c.cap / c.mid >= 0.85 : true) && (!morph.has(f) || npr.has(f) && c.cap / Math.max(1, c.mid) > 0.97);
const lemmaCount = new Map();
const assigned = new Map(); // form -> lemma
let total = 0, names = 0;
const ambiguous = [];
for (const [f, c] of counts) {
  if (isName(f, c)) { names += c.n; continue; }
  total += c.n;
  const cand = morph.get(f);
  if (!cand) { if (c.n >= 3 && /^[\p{L}]+'?$/u.test(f)) assigned.set(f, f); continue; }
  if (cand.size === 1) assigned.set(f, [...cand.keys()][0]);
  else ambiguous.push(f);
}
for (const [f, l] of assigned) lemmaCount.set(l, (lemmaCount.get(l) || 0) + counts.get(f).n);
// Ambiguous forms (era: the noun, or essere) go through pick(). Twice: the second pass counts what the first assigned (libri: libro, now that libro has its own count).
for (let pass = 0; pass < 2; pass++) {
  for (const f of ambiguous) assigned.set(f, pick(f, morph.get(f), lemmaCount));
  lemmaCount.clear();
  for (const [f, l] of assigned) lemmaCount.set(l, (lemmaCount.get(l) || 0) + counts.get(f).n);
}
// DUMP_AMBIGUOUS=<min count> prints how the frequent ambiguous forms were read, for checking by hand.
if (process.env.DUMP_AMBIGUOUS) console.log(ambiguous.filter((f) => counts.get(f).n >= +process.env.DUMP_AMBIGUOUS).sort((a, b) => counts.get(b).n - counts.get(a).n).map((f) => `${f}:${assigned.get(f)}<${[...morph.get(f).keys()].join('/')}`).join('  '));
// A leftover elided lemma (quell') folds into its full word when that is a lemma too.
for (const [f, l] of assigned) {
  if (!l.endsWith("'")) continue;
  const base = l.slice(0, -1);
  const full = [base, base + 'o', base + 'a', base + 'e', base + 'i'].filter((x) => lemmaCount.has(x)).sort((a, b) => lemmaCount.get(b) - lemmaCount.get(a))[0];
  if (full) { assigned.set(f, full); lemmaCount.set(full, lemmaCount.get(full) + counts.get(f).n); lemmaCount.delete(l); }
}

const ranked = [...lemmaCount].filter(([l]) => !l.endsWith("'")).sort((a, b) => b[1] - a[1]).slice(0, TOP);
const rank = new Map(ranked.map(([l], i) => [l, i]));
const formsOf = ranked.map(() => []);
for (const [f, l] of assigned) if (rank.has(l)) formsOf[rank.get(l)].push(f);
// Forms of the most common lemmas that the novels never used (arrivassimo) still look up.
const MORPH_FORMS_FOR = 5000;
for (const [f, cand] of morph) {
  if (assigned.has(f) || /'.+/.test(f)) continue;
  const l = [...cand.keys()].filter((x) => rank.has(x)).sort((a, b) => rank.get(a) - rank.get(b))[0];
  if (l !== undefined && rank.get(l) < MORPH_FORMS_FOR) { formsOf[rank.get(l)].push(f); assigned.set(f, l); }
}

const data = {
  v: 1,
  source: `${books} Italian novels from Project Gutenberg (authors born 1830 or later); word forms from Morph-it! (Baroni & Zanchetta, CC BY-SA 2.0)`,
  total,
  // [lemma, count in the corpus, other forms joined by "|"]
  lemmas: ranked.map(([l, n], i) => [l, n, formsOf[i].filter((f) => f !== l).sort().join('|')]),
};
writeFileSync(out, JSON.stringify(data));
const top = (k) => ranked.slice(0, k).reduce((s, [, n]) => s + n, 0) / total;
console.log(`${books} books, ${total.toLocaleString()} tokens (${names.toLocaleString()} name tokens dropped), ${ranked.length} lemmas, ${assigned.size.toLocaleString()} forms`);
console.log(`coverage: top 1k ${(top(1000) * 100).toFixed(1)}%, 2k ${(top(2000) * 100).toFixed(1)}%, 5k ${(top(5000) * 100).toFixed(1)}%, 20k ${(top(20000) * 100).toFixed(1)}%`);
console.log('top 60:', ranked.slice(0, 60).map(([l]) => l).join(' '));
console.log('unmapped frequent forms:', [...counts].filter(([f, c]) => !assigned.has(f) && !isName(f, c)).sort((a, b) => b[1].n - a[1].n).slice(0, 40).map(([f, c]) => `${f}:${c.n}`).join(' '));
