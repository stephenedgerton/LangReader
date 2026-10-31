// Vocabulary state (LingQ model):
//   no entry / 0 -> New (blue)       1..4 -> LingQ learning levels (yellow)
//   5 -> Known (no highlight)        -1 -> Ignored (no highlight, not counted)
import { db } from './db.js';
import { normalize } from './text.js';

const words = new Map();
const listeners = new Set();
let phraseIndex = null;

export const STATUS_LABELS = { 0: 'New', 1: 'New', 2: 'Recognized', 3: 'Familiar', 4: 'Learned', 5: 'Known', '-1': 'Ignored' };

export async function loadVocab() {
  for (const w of await db.all('words')) words.set(w.term, w);
}

export function entry(term) { return words.get(term); }
export function statusOf(term) { const e = words.get(term); return e ? e.status : 0; }
export function allEntries() { return [...words.values()]; }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function counts() {
  let known = 0, lingqs = 0, ignored = 0;
  for (const w of words.values()) {
    if (w.phrase) { if (w.status >= 1 && w.status <= 4) lingqs++; continue; }
    if (w.status === 5) known++;
    else if (w.status >= 1 && w.status <= 4) lingqs++;
    else if (w.status === -1) ignored++;
  }
  return { known, lingqs, ignored };
}

// Map firstWord -> [{term, parts}] for phrase highlighting (longest phrases first).
export function phrases() {
  if (phraseIndex) return phraseIndex;
  phraseIndex = new Map();
  for (const w of words.values()) {
    if (!w.phrase || w.status === 5 || w.status === -1) continue;
    const parts = w.term.split(' ');
    const list = phraseIndex.get(parts[0]) || [];
    list.push({ term: w.term, parts });
    phraseIndex.set(parts[0], list);
  }
  for (const list of phraseIndex.values()) list.sort((a, b) => b.parts.length - a.parts.length);
  return phraseIndex;
}

export async function setWord(term, patch, { silent = false } = {}) {
  term = normalize(term);
  const prev = words.get(term);
  const now = Date.now();
  const next = { term, status: 0, meaning: '', created: now, ...prev, ...patch, updated: now };
  if (next.status === 0 && !next.meaning && !next.notes) {
    words.delete(term);
    await db.del('words', term);
  } else {
    words.set(term, next);
    await db.put('words', next);
  }
  if (next.phrase) phraseIndex = null;
  if (!silent) for (const fn of listeners) fn([term], prev, next);
  return next;
}

// Bulk status change (e.g. "mark remaining blue words on this page as known").
export async function setMany(terms, status) {
  const now = Date.now();
  const changed = [];
  for (const term of terms) {
    if (words.has(term)) continue;
    const e = { term, status, meaning: '', created: now, updated: now };
    words.set(term, e);
    changed.push(e);
  }
  if (changed.length) {
    await db.putMany('words', changed);
    for (const fn of listeners) fn(changed.map((e) => e.term));
  }
  return changed.length;
}

// Merge patches ([{term, ...fields}]) into existing entries in one write, e.g. the review credits a
// page turn gives the LingQs on it. Terms without an entry are skipped.
export async function updateMany(patches) {
  const now = Date.now();
  const changed = [];
  let phraseGone = false;
  for (const { term, ...patch } of patches) {
    const prev = words.get(term);
    if (!prev) continue;
    const next = { ...prev, ...patch, updated: now };
    if (prev.phrase && next.status !== prev.status) { phraseIndex = null; phraseGone ||= next.status === 5; }
    words.set(term, next);
    changed.push(next);
  }
  if (!changed.length) return 0;
  await db.putMany('words', changed);
  // A phrase that became Known loses its underline, which only a re-render removes.
  for (const fn of listeners) phraseGone ? fn(changed.map((e) => e.term), { phrase: true }, null) : fn(changed.map((e) => e.term));
  return changed.length;
}

// Undo a bulk "mark as known": drop entries that are still plain Known words with nothing saved on them.
export async function revertToNew(terms) {
  const reverted = [];
  for (const term of terms) {
    const e = words.get(term);
    if (!e || e.status !== 5 || e.meaning || e.notes || e.phrase) continue;
    words.delete(term);
    await db.del('words', term);
    reverted.push(term);
  }
  if (reverted.length) for (const fn of listeners) fn(reverted);
  return reverted.length;
}

export async function deleteWord(term) {
  const prev = words.get(term);
  words.delete(term);
  await db.del('words', term);
  if (prev && prev.phrase) phraseIndex = null;
  for (const fn of listeners) fn([term], prev, null);
}

export async function importVocab(list) {
  for (const w of list) if (w && w.term) words.set(w.term, w);
  phraseIndex = null;
  await db.putMany('words', list.filter((w) => w && w.term));
  for (const fn of listeners) fn(list.map((w) => w.term));
}
