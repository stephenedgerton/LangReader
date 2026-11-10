// Builds a book of "Ritorno a Hogwarts" from [chapter title, ...paragraphs] lists, like samples/series/book.js.
import { SERIES, seriesBookId, seriesRev } from './index.js';

export const book = (n, title, coverColors, chapters) => ({
  id: seriesBookId(n), title, coverColors,
  author: `${SERIES.title} ${n} · B2`,
  series: { id: SERIES.id, n }, rev: seriesRev(n),
  chapters: chapters.map(([t, ...paras]) => ({ title: t, blocks: [{ t: 'h', x: t }, ...paras.map((x) => ({ t: 'p', x }))] })),
});
