// Word lookups in English Wiktionary (free, CORS-enabled, no key):
// parts of speech, definitions, and the base form of inflected words ("arrivò" -> "arrivare").
import { db } from './db.js';

const API = 'https://en.wiktionary.org/api/rest_v1/page/definition/';
const LANG = 'it';

// Returns {entries: [{pos, defs: [{text, lemma}]}], lemma, lemmaEntries} or null when Wiktionary has no Italian entry.
export async function lookup(word) {
  const key = `wikt|${word}`;
  const cached = await db.get('tcache', key).catch(() => null);
  if (cached) return cached.value;

  // Lowercase first; fall back to the capitalised form for names and sentence-initial words.
  let entries = await fetchEntries(word.toLowerCase());
  if (!entries) {
    const cap = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    if (cap !== word.toLowerCase()) entries = await fetchEntries(cap);
  }
  let value = null;
  if (entries) {
    const lemma = entries.flatMap((e) => e.defs).find((d) => d.lemma && d.lemma.toLowerCase() !== word.toLowerCase())?.lemma || null;
    const lemmaEntries = lemma ? (await fetchEntries(lemma)) || [] : [];
    value = { entries, lemma, lemmaEntries };
  }
  db.put('tcache', { key, value }).catch(() => {});
  return value;
}

const seen = new Map(); // per-session cache of raw lookups (a base word is often fetched twice)
function fetchEntries(title) {
  if (!seen.has(title)) seen.set(title, fetchEntriesUncached(title).catch((e) => { seen.delete(title); throw e; }));
  return seen.get(title);
}

async function fetchEntriesUncached(title) {
  const res = await fetch(API + encodeURIComponent(title.replace(/ /g, '_')) + '?redirect=true');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Dictionary unavailable (${res.status})`);
  const data = await res.json();
  const sections = data[LANG] || [];
  const entries = [];
  for (const s of sections) {
    const defs = (s.definitions || []).map((d) => parseDefinition(d.definition)).filter((d) => d.text);
    if (defs.length) entries.push({ pos: s.partOfSpeech || '', defs });
  }
  return entries.length ? entries : null;
}

// Definitions arrive as HTML. Keep plain text, and detect "… of <a>lemma</a>" form-of links.
function parseDefinition(html) {
  const div = document.createElement('div');
  div.innerHTML = String(html || '');
  div.querySelectorAll('style, script, sup, .reference').forEach((n) => n.remove());
  let lemma = null;
  let before = '';
  const walk = document.createTreeWalker(div, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) { before += n.textContent; continue; }
    if (n.localName === 'a' && !lemma && (/\bof\s*$/i.test(before) || n.closest('.form-of-definition-link'))) {
      lemma = linkTitle(n);
    }
  }
  return { text: div.textContent.replace(/\s+/g, ' ').trim(), lemma };
}

function linkTitle(a) {
  const href = a.getAttribute('href') || '';
  const fromHref = href.startsWith('/wiki/') ? decodeURIComponent(href.slice(6).split('#')[0]).replace(/_/g, ' ') : '';
  const t = (a.getAttribute('title') || fromHref || a.textContent || '').trim();
  return t && !t.includes(':') ? t : null; // skip namespace links like "Appendix:…"
}

// A short meaning suitable for a LingQ: drop leading labels like "(transitive)", keep the first sense.
export function gloss(text) {
  let t = text.replace(/^(\([^)]*\)\s*)+/, '').split(/[;:]/)[0].trim();
  t = t.replace(/\.$/, '');
  return t.length > 70 ? t.slice(0, 67).trimEnd() + '…' : t;
}
