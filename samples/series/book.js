// Builds a series book from [chapter title, ...paragraphs] lists, like samples/stories.js.
import { SERIES, seriesBookId } from './index.js';

const LEVEL = (n) => (n <= 5 ? 'A1' : n <= 10 ? 'A2' : 'B1');

export const book = (n, title, coverColors, chapters) => ({
  id: seriesBookId(n), title, coverColors,
  author: `${SERIES.title} ${n} · ${LEVEL(n)}`,
  series: { id: SERIES.id, n },
  chapters: chapters.map(([t, ...paras]) => ({ title: t, blocks: [{ t: 'h', x: t }, ...paras.map((x) => ({ t: 'p', x }))] })),
});
