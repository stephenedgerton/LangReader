// How hard a book is for you right now: the share of its distinct words that are still new
// (blue), the way LingQ rates lessons. Ignored words (names) don't count. Each book's word list
// is built once per session from its chapters; your vocabulary does the rest, so the number
// drops as you learn.
import { db } from './db.js';
import { uniqueWords } from './text.js';
import { statusOf } from './vocab.js';

const lists = new Map(); // bookId -> Promise<string[]>

function bookTerms(book) {
  if (!lists.has(book.id)) {
    lists.set(book.id, db.byIndex('chapters', 'bookId', book.id).then((chs) => {
      const set = new Set();
      for (const c of chs) for (const b of c.blocks) uniqueWords(b.x, set);
      return [...set];
    }));
  }
  return lists.get(book.id);
}

export const LEVELS = [
  { max: 5, name: 'Easy', cls: 'easy' },
  { max: 15, name: 'Comfortable', cls: 'ok' },
  { max: 30, name: 'Challenging', cls: 'hard' },
  { max: 100, name: 'Hard', cls: 'vhard' },
];

export async function difficulty(book) {
  const terms = await bookTerms(book);
  let unique = 0, fresh = 0;
  for (const t of terms) {
    const s = statusOf(t);
    if (s === -1) continue;
    unique++;
    if (s === 0) fresh++;
  }
  const pct = unique ? Math.round((fresh / unique) * 100) : 0;
  return { unique, fresh, pct, level: LEVELS.find((l) => pct <= l.max) };
}

// Fills every `[data-diff="<bookId>"]` placeholder under `root` once the numbers are ready.
export async function fillDifficulty(root, books) {
  for (const el of root.querySelectorAll('[data-diff]')) {
    const book = books.find((b) => b.id === el.dataset.diff);
    if (!book) continue;
    const d = await difficulty(book);
    if (!el.isConnected) return;
    el.className = `diff ${d.level.cls}`;
    el.textContent = el.dataset.long != null
      ? `${d.level.name} · ${d.pct}% new words (${d.fresh.toLocaleString()} of ${d.unique.toLocaleString()})`
      : `${d.pct}% new`;
    el.title = `${d.level.name}: ${d.fresh.toLocaleString()} of ${d.unique.toLocaleString()} distinct words are new to you`;
  }
}
