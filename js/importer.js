// Importing books: pasted text, .txt files and .epub files.
import { db } from './db.js';
import { textToChapters, countWords } from './text.js';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function saveBook({ title, author = '', chapters, cover = null }) {
  const id = uid();
  const split = splitLong(chapters);
  const book = {
    id, title: title || 'Senza titolo', author, lang: 'it', cover,
    chapterCount: split.length,
    chapterTitles: split.map((c) => c.title),
    chapterWords: split.map((c) => c.blocks.reduce((n, b) => n + countWords(b.x), 0)),
    progress: { chapter: 0, page: 0, frac: 0, done: [] },
    added: Date.now(), lastOpened: 0,
  };
  book.wordCount = book.chapterWords.reduce((a, b) => a + b, 0);
  await db.putMany('chapters', split.map((c, idx) => ({ key: `${id}:${idx}`, bookId: id, idx, title: c.title, blocks: c.blocks })));
  await db.put('books', book);
  return book;
}

// Break very long chapters into lesson-sized parts at paragraph boundaries.
function splitLong(chapters, max = 4000) {
  const out = [];
  for (const c of chapters) {
    let part = { title: c.title, blocks: [] }, words = 0, n = 1;
    for (const b of c.blocks) {
      const w = countWords(b.x);
      if (words > max && b.t === 'p') {
        out.push(part);
        n++;
        part = { title: `${c.title} (${n})`, blocks: [] };
        words = 0;
      }
      part.blocks.push(b);
      words += w;
    }
    if (part.blocks.length) out.push(part);
  }
  return out;
}

export async function importText(title, text, author = '') {
  const chapters = textToChapters(text, title || 'Testo');
  if (!chapters.length) throw new Error('No text found.');
  return saveBook({ title, author, chapters });
}

export async function importFile(file) {
  const name = file.name.replace(/\.[^.]+$/, '');
  if (/\.epub$/i.test(file.name) || file.type === 'application/epub+zip') {
    return saveBook(await parseEpub(await file.arrayBuffer()));
  }
  const text = await file.text();
  return importText(name.replace(/[_-]+/g, ' '), text);
}

// ---------------- Minimal ZIP reader ----------------
async function unzip(buf) {
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid EPUB (zip) file.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nlen));
    entries.set(name, { method, csize, local });
    p += 46 + nlen + elen + clen;
  }
  return {
    has: (n) => entries.has(n),
    async bytes(n) {
      const e = entries.get(n);
      if (!e) return null;
      const lnlen = dv.getUint16(e.local + 26, true), lelen = dv.getUint16(e.local + 28, true);
      const data = new Uint8Array(buf, e.local + 30 + lnlen + lelen, e.csize);
      if (e.method === 0) return data;
      if (e.method !== 8) throw new Error('Unsupported compression in EPUB.');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    },
    async text(n) { const b = await this.bytes(n); return b ? dec.decode(b) : null; },
  };
}

// ---------------- EPUB ----------------
const parseXML = (s, type = 'application/xml') => {
  let doc = new DOMParser().parseFromString(s, type);
  if (doc.getElementsByTagName('parsererror').length) doc = new DOMParser().parseFromString(s, 'text/html');
  return doc;
};
const byTag = (doc, tag) => [...doc.getElementsByTagNameNS('*', tag)];
const resolve = (base, href) => {
  const parts = (base + decodeURIComponent(href.split('#')[0])).split('/');
  const out = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.') out.push(p); }
  return out.join('/');
};

export async function parseEpub(buf) {
  const zip = await unzip(buf);
  const container = parseXML(await zip.text('META-INF/container.xml'));
  const opfPath = byTag(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!opfPath) throw new Error('EPUB is missing its package file.');
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opf = parseXML(await zip.text(opfPath));

  const title = byTag(opf, 'title')[0]?.textContent.trim() || 'Senza titolo';
  const author = byTag(opf, 'creator')[0]?.textContent.trim() || '';
  const manifest = new Map();
  for (const it of byTag(opf, 'item')) {
    manifest.set(it.getAttribute('id'), {
      href: resolve(base, it.getAttribute('href')),
      type: it.getAttribute('media-type') || '',
      props: it.getAttribute('properties') || '',
    });
  }
  const spine = byTag(opf, 'itemref').map((r) => manifest.get(r.getAttribute('idref'))).filter(Boolean);

  // Table of contents titles: EPUB3 nav or EPUB2 NCX.
  const tocTitles = new Map();
  const nav = [...manifest.values()].find((m) => m.props.includes('nav'));
  const ncxId = byTag(opf, 'spine')[0]?.getAttribute('toc');
  const ncx = ncxId ? manifest.get(ncxId) : [...manifest.values()].find((m) => m.type.includes('ncx'));
  try {
    if (nav) {
      const d = parseXML(await zip.text(nav.href), 'application/xhtml+xml');
      const navBase = nav.href.slice(0, nav.href.lastIndexOf('/') + 1);
      for (const a of byTag(d, 'a')) {
        const href = a.getAttribute('href');
        if (href) { const k = resolve(navBase, href); if (!tocTitles.has(k)) tocTitles.set(k, a.textContent.replace(/\s+/g, ' ').trim()); }
      }
    } else if (ncx) {
      const d = parseXML(await zip.text(ncx.href));
      const ncxBase = ncx.href.slice(0, ncx.href.lastIndexOf('/') + 1);
      for (const np of byTag(d, 'navPoint')) {
        const label = byTag(np, 'text')[0]?.textContent.trim();
        const src = byTag(np, 'content')[0]?.getAttribute('src');
        if (label && src) { const k = resolve(ncxBase, src); if (!tocTitles.has(k)) tocTitles.set(k, label); }
      }
    }
  } catch { /* titles are optional */ }

  const BLOCKS = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,dd,dt,div';
  const chapters = [];
  for (const item of spine) {
    if (!/x?html/i.test(item.type) && !/\.x?html?$/i.test(item.href)) continue;
    const src = await zip.text(item.href);
    if (!src) continue;
    const doc = parseXML(src, 'application/xhtml+xml');
    const body = byTag(doc, 'body')[0] || doc.documentElement;
    const blocks = [];
    for (const el of body.querySelectorAll(BLOCKS)) {
      if (el.querySelector(BLOCKS)) continue; // only leaf blocks
      const x = el.textContent.replace(/\s+/g, ' ').trim();
      if (!x) continue;
      const tag = el.localName.toLowerCase();
      blocks.push({ t: /^h[1-6]$/.test(tag) ? 'h' : 'p', x });
    }
    if (!blocks.some((b) => b.t === 'p' && countWords(b.x) > 3)) continue;
    const heading = blocks.find((b) => b.t === 'h')?.x;
    chapters.push({ title: tocTitles.get(item.href) || heading || `Capitolo ${chapters.length + 1}`, blocks });
  }
  if (!chapters.length) throw new Error('No readable chapters found in this EPUB.');

  // Cover image (downscaled to keep storage small).
  let cover = null;
  try {
    const coverMeta = byTag(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
    const ci = [...manifest.values()].find((m) => m.props.includes('cover-image')) || (coverMeta && manifest.get(coverMeta));
    if (ci) {
      const bytes = await zip.bytes(ci.href);
      if (bytes) cover = await downscale(new Blob([bytes], { type: ci.type || 'image/jpeg' }));
    }
  } catch { cover = null; }

  return { title, author, chapters, cover };
}

async function downscale(blob, w = 360) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, w / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}
