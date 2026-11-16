// Checks the B1 rewrite of "Ritorno a Hogwarts" (samples/hogwarts-b1/) against its vocabulary cap.
//
//   node tools/check-hogwarts.mjs          one row per book: share of words outside the 2,000 commonest lemmas
//   node tools/check-hogwarts.mjs 1        details for book 1: those words with counts, and unknown words
//   node tools/check-hogwarts.mjs 1 --b2   the same for the original B2 book (samples/hogwarts/)
//
// Names (js/names.js) and the Harry Potter terms in HP_WORDS don't count: they're what the series teaches.
// Everything else outside the 2,000 commonest lemmas counts against MAX_RARE.
import { tokenize, normalize } from '../js/text.js';
import { NAMES } from '../js/names.js';
import { loadFreqList } from './check-series.mjs';

export const TOP = 2000;
export const MAX_RARE = 0.04;
// The translation's own vocabulary, which the books introduce on purpose and repeat.
export const HP_WORDS = new Set(`babbano babbana babbani babbane mago maghi maga strega streghe stregoneria bacchetta bacchette
  incantesimo incantesimi pozione pozioni gufo gufi civetta pergamena calderone calderoni mantello mantelli
  smistamento cappello parlante casa case preside erbologia trasfigurazione astronomia boccino pluffa bolide bolidi
  cercatore portiere battitore cacciatore scopa scope galeone galeoni falce falci zellino zellini folletto folletti
  fantasma fantasmi gelatine tuttigusti cioccorana cioccorane binario guardiacaccia sala comune dormitorio
  specchio brame pietra filosofale centauro centauri drago draghi unicorno unicorni troll mantellina invisibilità
  dissennatore dissennatori elfo elfi spettro magia magico magica magiche magici rospo fenice paiolo
  cioccolato carrello`.split(/\s+/));
// Everyday modern words a B1 reader knows that the 19th-century corpus behind the lemma list ranks low
// (months, numbers, shops, cognates). Lemmas, matched like the list's.
export const EVERYDAY = new Set(`ristorante negozio normale banca scatola panino uovo interessante importante
  professoressa plastico gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre
  dicembre undici dodici tredici quattordici quindici sedici diciassette diciotto diciannove venti ventinove
  buongiorno benvenuto cliente bicicletta ospedale aereo giacca blu marrone scherzo moneta lista locale
  squadra esame regola mezzogiorno nonno maestra sporco cucinare ministero espresso`.split(/\s+/));

export async function loadBooks(b2 = false) {
  const m = await import(b2 ? '../samples/hogwarts/index.js' : '../samples/hogwarts-b1/index.js');
  const out = [];
  for (let n = 1; n <= m.SERIES.books; n++) out.push(await m.loadSeriesBook(n));
  return out;
}

export function analyse(book, freq = loadFreqList()) {
  const names = new Set(NAMES.map(normalize));
  const r = { words: 0, rare: 0, rareWords: new Map(), unknown: new Map() };
  for (const ch of book.chapters) for (const b of ch.blocks) for (const t of tokenize(b.x)) {
    if (t.type !== 'w') continue;
    const term = normalize(t.text);
    if (/^\p{N}/u.test(term) || names.has(term)) continue;
    r.words++;
    if (HP_WORDS.has(term)) continue;
    const i = freq.forms.get(term) ?? freq.forms.get(term.replace(/'$/, ''));
    if (i === undefined) { r.rare++; r.unknown.set(term, (r.unknown.get(term) || 0) + 1); continue; }
    if (i >= TOP && !EVERYDAY.has(freq.lemmas[i])) { r.rare++; const k = freq.lemmas[i]; r.rareWords.set(k, (r.rareWords.get(k) || 0) + 1); }
  }
  r.share = r.words ? r.rare / r.words : 0;
  return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const b2 = process.argv.includes('--b2');
  const n = +process.argv.find((a) => /^\d+$/.test(a)) || 0;
  const books = await loadBooks(b2);
  const freq = loadFreqList();
  books.forEach((b, i) => {
    if (n && n !== i + 1) return;
    const r = analyse(b, freq);
    console.log(`${i + 1}. ${b.title}: ${r.words} words, ${(100 * r.share).toFixed(1)}% outside the ${TOP} commonest${r.share > MAX_RARE ? '  ✗ over the cap' : ''}`);
    if (n) {
      console.log('  rare:', [...r.rareWords].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k}×${c}`).join(' '));
      console.log('  unknown:', [...r.unknown].map(([k, c]) => `${k}×${c}`).join(' '));
    }
  });
}
