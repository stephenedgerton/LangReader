// "Ritorno a Hogwarts" at B1: the same story as samples/hogwarts/, retold with far fewer uncommon words.
// The Harry Potter terms (Babbani, Smistamento, Pluffa…) stay; nearly everything else comes from the
// 2,000 most common lemmas. tools/check-hogwarts.mjs measures each book against that cap.
// Loaded like the B2 books, one book per file, with its own collection.
export const SERIES = { id: 'ritorno-hogwarts-b1', title: 'Ritorno a Hogwarts (B1)', books: 1 };
// Each book's text revision; raise it whenever a released book's text changes.
const REVS = [1];
export const seriesRev = (n) => REVS[n - 1] || 1;

const pad = (n) => String(n).padStart(2, '0');
export const seriesBookId = (n) => `${SERIES.id}-${pad(n)}`;
export const seriesFiles = () => Array.from({ length: SERIES.books }, (_, i) => `samples/hogwarts-b1/${pad(i + 1)}.js`);
export const loadSeriesBook = (n) => import(`./${pad(n)}.js`).then((m) => m.default);
