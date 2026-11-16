// Builds a book of "Ritorno a Hogwarts (B1)" from [chapter title, ...paragraphs] lists, like samples/hogwarts/book.js.
// Titles end in "· B1" because the library skips a bundled book whose title it already has.
import { SERIES, seriesBookId, seriesRev } from './index.js';

export const book = (n, title, coverColors, chapters) => ({
  id: seriesBookId(n), title: `${title} · B1`, coverColors,
  author: `Ritorno a Hogwarts ${n} · B1`,
  series: { id: SERIES.id, n }, rev: seriesRev(n),
  chapters: chapters.map(([t, ...paras]) => ({ title: t, blocks: [{ t: 'h', x: t }, ...paras.map((x) => ({ t: 'p', x }))] })),
});
