// "La casa gialla": a graded series that takes a reader from no Italian to the 2,000 most common words.
// One book per file, loaded only when it hasn't been added to the library yet (or has been revised). The plan is in PLAN.md,
// the word plan in tools/series-words.mjs; check changes with `node tools/check-series.mjs`.
export const SERIES = { id: 'casa-gialla', title: 'La casa gialla', books: 10 };
// Each book's text revision. Raise a book's number whenever its text changes after release: libraries
// that already have the book get the new text, and keep their place. (Books saved before revisions
// existed count as revision 1.)
const REVS = [2, 2, 1, 1, 1, 1, 1, 1, 1, 1];
export const seriesRev = (n) => REVS[n - 1] || 1;

const pad = (n) => String(n).padStart(2, '0');
export const seriesBookId = (n) => `${SERIES.id}-${pad(n)}`;
export const seriesFiles = () => Array.from({ length: SERIES.books }, (_, i) => `samples/series/${pad(i + 1)}.js`);
export const loadSeriesBook = (n) => import(`./${pad(n)}.js`).then((m) => m.default);
