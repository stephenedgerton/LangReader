// "Ritorno a Hogwarts": a five-book B2 series set at Hogwarts in 2003, five years after the battle,
// written to teach the words of "Harry Potter e la pietra filosofale" (Babbani, Smistamento, Pluffa…).
// Loaded like "La casa gialla" (samples/series/), one book per file, with its own collection.
export const SERIES = { id: 'ritorno-hogwarts', title: 'Ritorno a Hogwarts', books: 5 };
// Each book's text revision; raise it whenever a released book's text changes.
const REVS = [1, 1, 1, 1, 1];
export const seriesRev = (n) => REVS[n - 1] || 1;

const pad = (n) => String(n).padStart(2, '0');
export const seriesBookId = (n) => `${SERIES.id}-${pad(n)}`;
export const seriesFiles = () => Array.from({ length: SERIES.books }, (_, i) => `samples/hogwarts/${pad(i + 1)}.js`);
export const loadSeriesBook = (n) => import(`./${pad(n)}.js`).then((m) => m.default);
