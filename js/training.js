// Training's data: the sentences store, which packs you train, today's counts, and rating a card.
// The plan itself and the other pure parts are in sentences.js.
//
// Bundled sentences go into the store the first time their pack is on (id `${pack}:${key}`), and new ones
// join when a pack's `rev` goes up. One already in the store is never overwritten, so your edits, pauses and
// progress stay. Today's counts live in localStorage langreader.trainDay = {date, listen, shadow, say, fresh,
// missed: [ids rated Again]}; which pack revisions are in the store, in langreader.packRevs.
//
// Packs come in three kinds: ready-made (samples/packs/, on when you add them), your own (IndexedDB `packs`)
// and From reading (id `reading`, made by "Train this sentence"; it has no record and exists while it has
// sentences). Your own packs and From reading are always trained. A sentence is in every pack listed in
// `packs`; one you made yourself has no `bundled`. Deleting a ready-made sentence hides it, so an app update
// can't bring it back, and editing one sets `edited` (pack updates never overwrite a sentence that's there).
import { db } from './db.js';
import { settings } from './settings.js';
import { todayKey, bump, record } from './stats.js';
import { schedule, AGAIN } from './srs.js';
import { buildPlan, isNew, genderize, newOrder, sameText } from './sentences.js';
import { retention } from './review.js';
import { PACKS, DEFAULT_PACKS, loadPack, packInfo } from '../samples/packs/index.js';

const DAY_KEY = 'langreader.trainDay', REVS_KEY = 'langreader.packRevs';
export const STEPS = [
  { k: 'listen', name: 'Listen', what: 'sentences', how: 'Hear each sentence, then reveal it. It warms up your ear.' },
  { k: 'shadow', name: 'Shadow', what: 'sentences, 3 times each', how: 'Listen, then say it aloud straight after. Three times each.' },
  { k: 'say', name: 'Say it', what: 'sentences', how: 'See the English, say the Italian out loud, then check.' },
];
// Seconds a card takes, roughly, for the time estimate.
const SECONDS = { listen: 20, shadow: 40, say: 30 };

let cache = null;   // id -> sentence
let mine = null;    // id -> your own pack

export async function loadSentences() {
  if (!cache) {
    const [ss, ps] = await Promise.all([db.all('sentences'), db.all('packs')]);
    cache = new Map(ss.map((s) => [s.id, s]));
    mine = new Map(ps.map((p) => [p.id, p]));
  }
  return cache;
}
export const sentence = (id) => cache?.get(id);
export async function putSentence(s) { cache.set(s.id, s); await db.put('sentences', s); return s; }
// After a backup is restored.
export function forgetSentences() { cache = null; mine = null; }

// ---------- packs ----------
export const READING = 'reading';
const READING_PACK = { id: READING, name: 'From reading', emoji: '📖', colors: ['#14505a', '#2f8f8a'], kind: 'reading',
  blurb: 'Sentences you picked out while reading. Add one with “Train this sentence” on a word.' };
// Colours and emoji for your own packs.
export const PACK_COLORS = [['#0e5a43', '#2bb487'], ['#14505a', '#2f8f8a'], ['#1f3b57', '#3a6b8c'], ['#4b2e5c', '#9a6ab0'],
  ['#6b1f3a', '#c2577e'], ['#7a2e2e', '#b5523b'], ['#8a5a14', '#d19a3a'], ['#203040', '#506070']];
export const PACK_EMOJI = ['⭐', '💬', '❤️', '🏠', '🍝', '☕', '🛒', '✈️', '🚆', '💼', '🎉', '📚', '🎵', '⚽', '🌿', '🐶', '👶', '🗣️', '💡', '🍷', '🏖️', '📞', '🩺', '🧭'];

// Any pack by id, as {id, name, emoji, colors, blurb, kind: 'bundled' | 'own' | 'reading'}.
export function packMeta(id) {
  if (id === READING) return READING_PACK;
  const p = mine?.get(id);
  if (p) return { blurb: '', ...p, kind: 'own' };
  const b = packInfo(id);
  return b && { ...b, kind: 'bundled' };
}
export const ownPacks = () => [...(mine?.values() || [])].sort((a, b) => a.created - b.created).map((p) => packMeta(p.id));
export const readingPack = () => (packSentences(READING).length ? READING_PACK : null);
// The packs you can put a sentence in: From reading (once it exists), your own, and the ready-made ones you train.
export const pickablePacks = () => [readingPack(), ...ownPacks(), ...PACKS.filter((p) => packOn(p.id)).map((p) => packMeta(p.id))].filter(Boolean);
// Whether a pack is trained: yours always are, ready-made ones once you add them.
export const isTrained = (id) => id === READING || !!mine?.get(id) || packOn(id);

const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export async function savePack(p) {
  await loadSentences();
  const pack = { id: p.id || newId('p'), name: p.name, emoji: p.emoji, colors: p.colors, created: p.created || Date.now() };
  mine.set(pack.id, pack);
  await db.put('packs', pack);
  return packMeta(pack.id);
}
// Deletes one of your packs (or From reading). Its sentences go too, except those that are also in another pack.
export async function deletePack(id) {
  await loadSentences();
  for (const s of [...cache.values()]) {
    if (!s.packs.includes(id)) continue;
    const rest = s.packs.filter((x) => x !== id);
    if (rest.length) await putSentence({ ...s, packs: rest });
    else await deleteSentence(s.id);
  }
  if (mine.has(id)) { mine.delete(id); await db.del('packs', id); }
  if (settings.trainFocus === id) settings.trainFocus = '';
}

// The pack new sentences come from first, if it's one you train.
export const focusPack = () => (settings.trainFocus && isTrained(settings.trainFocus) && packMeta(settings.trainFocus) ? settings.trainFocus : '');
export const setFocus = (id) => { settings.trainFocus = id || ''; };

// ---------- your own sentences ----------
// The sentence with these words, if you have it (not one you deleted).
export const findSentence = (it) => [...(cache?.values() || [])].find((s) => !s.hidden && sameText(textOf(s), it)) || null;

export async function addSentence({ it, en, ctx = '', packs, from = '' }) {
  await loadSentences();
  const s = { id: newId('s'), it: it.trim(), en: en.trim(), ctx: ctx.trim(), packs, created: Date.now(), cards: {}, ...(from && { from }) };
  return putSentence(s);
}
// Adds a sentence you're already training to another pack.
export async function addToPack(id, pack) {
  const s = cache.get(id);
  return s.packs.includes(pack) ? s : putSentence({ ...s, packs: [...s.packs, pack] });
}
export async function editSentence(id, patch) {
  const s = cache.get(id), next = { ...s, ...patch };
  if (['it', 'en', 'ctx'].some((k) => (next[k] || '') !== (s[k] || ''))) next.edited = true;
  return putSentence(next);
}
export const setSentencePacks = (id, packs) => putSentence({ ...cache.get(id), packs });
// Yours are deleted; a ready-made one is hidden, so the pack never brings it back.
export async function deleteSentence(id) {
  const s = cache.get(id);
  if (!s) return;
  if (s.bundled) return putSentence({ ...s, hidden: true });
  cache.delete(id);
  await db.del('sentences', id);
}

// The sentence as you'd say it, with the gendered forms chosen by your settings.
export const textOf = (s) => genderize(s.it, settings.trainMe || 'm', settings.trainPartner || 'm');

export const enabledPacks = () => (Array.isArray(settings.trainPacks) ? settings.trainPacks : DEFAULT_PACKS);
export const packOn = (id) => enabledPacks().includes(id);
export async function setPackOn(id, on) {
  const rest = enabledPacks().filter((x) => x !== id);
  settings.trainPacks = on ? [...rest, id] : rest;
  if (on) await syncPacks();
}

// Puts the sentences of the packs you train into the store (see the top of this file).
export async function syncPacks() {
  await loadSentences();
  let revs = {};
  try { revs = JSON.parse(localStorage.getItem(REVS_KEY) || '{}'); } catch {}
  const now = Date.now(), add = [];
  for (const id of enabledPacks()) {
    const info = packInfo(id);
    if (!info || (revs[id] || 0) >= info.rev) continue;
    const at = PACKS.indexOf(info);
    (await loadPack(id)).forEach((x, i) => {
      const sid = `${id}:${x.k}`;
      if (!cache.has(sid)) add.push({ id: sid, it: x.it, en: x.en, ctx: x.ctx, packs: [id], bundled: id, order: at * 10000 + i, created: now, cards: {} });
    });
    revs[id] = info.rev;
  }
  if (add.length) { for (const s of add) cache.set(s.id, s); await db.putMany('sentences', add); }
  try { localStorage.setItem(REVS_KEY, JSON.stringify(revs)); } catch {}
}

const byOrder = (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.created - b.created;
export const packSentences = (id) => [...(cache?.values() || [])].filter((s) => s.packs.includes(id) && !s.hidden).sort(byOrder);
// The sentences you're training: in a pack that's on, not paused or hidden, in the order new ones come in.
export function trainingList(only = null) {
  const on = only ? new Set([only]) : null;
  const list = [...(cache?.values() || [])].filter((s) => !s.hidden && !s.paused && s.packs.some((p) => (on ? on.has(p) : isTrained(p))));
  return newOrder(list, only ? '' : focusPack());
}

// ---------- today ----------
export function doneToday() {
  const blank = { date: todayKey(), listen: 0, shadow: 0, say: 0, fresh: 0, missed: [] };
  try {
    const d = JSON.parse(localStorage.getItem(DAY_KEY) || '{}');
    if (d.date === blank.date) return { ...blank, ...d };
  } catch {}
  return blank;
}
function saveDay(d) { try { localStorage.setItem(DAY_KEY, JSON.stringify(d)); } catch {} }
export function countDone(field, n = 1) { const d = doneToday(); d[field] = Math.max(0, (d[field] || 0) + n); saveDay(d); }

export const sizes = () => ({ listen: +settings.trainListen || 0, shadow: +settings.trainShadow || 0, say: +settings.trainSay || 0 });

// Today's plan: {listen, shadow, say, fresh} as lists of sentence ids. `extra` raises today's share of
// Listen and Say for the session ("Train 10 more"); `only` makes it a session for one pack, which doesn't use
// up today's plan.
export function todaysPlan({ extra = 0, only = null } = {}) {
  const d = only ? {} : doneToday(), sz = sizes();
  if (extra) { sz.listen += Math.ceil(extra / 2); sz.say += Math.floor(extra / 2); sz.shadow = 0; }
  if (only) sz.shadow = 0;
  return buildPlan(trainingList(only), { now: Date.now(), sizes: sz, maxNew: (+settings.trainNew || 0) + (extra ? 3 : 0), done: d, missed: d.missed || [] });
}
export const minutes = (plan) => Math.max(1, Math.round(STEPS.reduce((n, s) => n + plan[s.k].length * SECONDS[s.k], 0) / 60));

// Rates one card. Returns what Undo needs to put it back. `drill: false` leaves days[].drills alone (Focus mode
// has already counted the sentence when it played it through).
export async function rateCard(id, dir, g, { count = true, drill = true } = {}) {
  const s = cache.get(id), wasNew = isNew(s);
  const card = schedule(s.cards?.[dir], g, Date.now(), retention(), Math.random());
  await putSentence({ ...s, cards: { ...s.cards, [dir]: card } });
  const snap = { prev: s, dir, counted: [], missed: false, drill };
  if (count) {
    countDone(dir); snap.counted.push(dir);
    if (wasNew) { countDone('fresh'); snap.counted.push('fresh'); }
  }
  if (g === AGAIN) {
    const d = doneToday();
    if (!d.missed.includes(id)) { d.missed.push(id); saveDay(d); snap.missed = true; }
  }
  if (drill) bump('drills');
  return snap;
}
// Changes a rating (Focus mode, while the sentence is on screen): the card is scheduled again from where it was
// before the first rating, so it's one review, not two. Today's counts and drills stay as the first rating left
// them. Returns the snapshot to change it again.
export async function rerateCard(snap, g) {
  const { prev, dir } = snap, s = cache.get(prev.id);
  if (!s) return snap;
  const card = schedule(prev.cards?.[dir], g, Date.now(), retention(), Math.random());
  await putSentence({ ...s, cards: { ...s.cards, [dir]: card } });
  const d = doneToday(), next = { ...snap };
  if (g === AGAIN && !d.missed.includes(prev.id)) { d.missed.push(prev.id); next.missed = true; }
  if (g !== AGAIN && snap.missed) { d.missed = d.missed.filter((x) => x !== prev.id); next.missed = false; }
  saveDay(d);
  return next;
}
export async function undoRate(snap) {
  await putSentence({ ...snap.prev, reps: cache.get(snap.prev.id)?.reps || snap.prev.reps });
  for (const f of snap.counted) countDone(f, -1);
  if (snap.missed) { const d = doneToday(); d.missed = d.missed.filter((x) => x !== snap.prev.id); saveDay(d); }
  if (snap.drill !== false) bump('drills', -1);
}
// One repetition of a sentence: once through hearing it and saying it (each repeat in Shadowing, Recall or the
// daily Shadow, a rated or practised card in Listen and Say). Kept on the sentence as `reps` (all time) and in
// days[].reps (the day's count). Undoing a rating doesn't take it back: you still said it.
export function countRep(id) {
  const s = cache?.get(id);
  if (!s) return; // a pack you haven't added yet, played from its page
  bump('reps');
  putSentence({ ...s, reps: (s.reps || 0) + 1 }).catch(() => {});
}
export const repsOf = (list) => list.reduce((n, s) => n + (s.reps || 0), 0);

// A finished step (not skipped) makes today a training day, for the streak.
export const stepFinished = () => record({ trained: 1 });

// Days in a row you trained; today counts once you have, otherwise it runs to yesterday.
export function trainingStreak(days) {
  const on = new Set(days.filter((d) => d.trained).map((d) => d.date));
  const d = new Date();
  if (!on.has(todayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (on.has(todayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export async function setPaused(id, paused) { const s = cache.get(id); if (s) await putSentence({ ...s, paused }); }
