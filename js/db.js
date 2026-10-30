// Tiny promise wrapper around IndexedDB.
// Stores:
//   books     {id, title, author, lang, cover, chapterCount, chapterTitles, wordCount, progress, added, lastOpened}
//   chapters  {key: `${bookId}:${idx}`, bookId, idx, title, blocks: [{t:'h'|'p', x}]}
//   words     {term, status, meaning, phrase, example, created, updated}
//   tcache    {key, value}   translation cache
//   days      {date, seconds, wordsRead, known, lingqs}

const DB_NAME = 'langreader';
const DB_VERSION = 1;
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chapters')) {
        const s = db.createObjectStore('chapters', { keyPath: 'key' });
        s.createIndex('bookId', 'bookId');
      }
      if (!db.objectStoreNames.contains('words')) db.createObjectStore('words', { keyPath: 'term' });
      if (!db.objectStoreNames.contains('tcache')) db.createObjectStore('tcache', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'date' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export const db = {
  async get(name, key) { return wrap((await store(name)).get(key)); },
  async all(name) { return wrap((await store(name)).getAll()); },
  async byIndex(name, index, key) { return wrap((await store(name)).index(index).getAll(key)); },
  async put(name, value) { return wrap((await store(name, 'readwrite')).put(value)); },
  async del(name, key) { return wrap((await store(name, 'readwrite')).delete(key)); },
  async clear(name) { return wrap((await store(name, 'readwrite')).clear()); },
  async putMany(name, values) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(name, 'readwrite');
      const s = tx.objectStore(name);
      for (const v of values) s.put(v);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async deleteBook(bookId) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(['books', 'chapters'], 'readwrite');
      tx.objectStore('books').delete(bookId);
      const idx = tx.objectStore('chapters').index('bookId');
      const req = idx.openKeyCursor(IDBKeyRange.only(bookId));
      req.onsuccess = () => {
        const c = req.result;
        if (c) { tx.objectStore('chapters').delete(c.primaryKey); c.continue(); }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
