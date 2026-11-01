// The word plan for the graded series "La casa gialla" (samples/series/), read by tools/check-series.mjs
// and tests/series.test.mjs.
//
// The target is the 2,000 most common lemmas in data/freq-it-v1.json, minus SKIP. The list comes from
// 19th- and early 20th-century novels, so LATE holds the archaic and purely literary words: the series
// saves them for its last part (the 19th-century letters), from book LATE_FROM on.

export const TOP = 2000;
export const LATE_FROM = 16;

// Not words a learner needs: fragments, foreign words, misspellings and lemmatiser noise, and old
// spellings whose modern form is in the list anyway.
export const SKIP = new Set(`
  de el et l s n ii à que ghe je moi vous lu on est pas miss ecc eliso
  avea debbo han sse pe fe dis glie lor aperse dimmi prender star color cavalier fuor neppur pei pel
  chè co od par dell sclamò ripetè pierino spinello fausto sconoscere figgere rodere
`.split(/\s+/).filter(Boolean));

// Archaic or bookish words, which modern Italian says another way (egli → lui, uscio → porta,
// udire → sentire). Fine in old letters, wrong in a café in 2026.
export const LATE = new Set(`
  egli ella essa esso essi esse ei colui coloro costui codesto ove or
  giacchè allorchè quantunque innanzi dinanzi tosto alquanto guisa seco colà medesimo
  udire soggiungere recare pigliare ripigliare volgere seguitare annunziare pronunziare rammentare
  comperare avvedere messer uscio lagrima giovine giuoco danaro fanciulla fanciullo giovinetta
  figliuolo figliuola infermo voluttà
`.split(/\s+/).filter(Boolean));

// Words outside the 20,000 in the frequency list that the books may use: they aren't typos.
// Keep this short; each one is a word the reader meets without any frequency data behind it.
export const EXTRA = new Set(`
  ok bar cappuccino brioche focaccia pesto wifi email euro foto centouno
  fog telefonata radio
`.split(/\s+/).filter(Boolean));

// The plan per book: [words, target lemmas covered by the end of the book].
// Book 1 assumes nothing. About 100 new words a book, each met 3 times before it's familiar, makes the
// unfamiliar share roughly 300 / words: 15% in book 2, 5% by book 10, under 2% by book 20.
export const PLAN = [
  [1500, 220], [2000, 320], [2500, 420], [3000, 510], [3500, 600],
  [4000, 690], [4500, 780], [5000, 870], [5500, 960], [6000, 1050],
  [6500, 1140], [7000, 1230], [7500, 1320], [8000, 1410], [8500, 1500],
  [9000, 1590], [9500, 1680], [10000, 1770], [11000, 1850], [12000, 1930],
];

// A word counts as familiar once the reader has met it this many times (in this book or earlier).
export const FAMILIAR_AFTER = 3;
// A new target word should come up at least this often in the book that introduces it.
export const MIN_REPEATS = 4;
// The highest share of unfamiliar words per book (book 1 starts from nothing, so it's exempt).
export const MAX_UNFAMILIAR = (n) => (n === 1 ? 1 : n <= 3 ? 0.2 : n <= 5 ? 0.14 : n <= 8 ? 0.1 : n <= 12 ? 0.07 : 0.05);
