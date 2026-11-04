// Training's data: the sentences store, which packs you train, today's counts, and rating a card.
// The plan itself and the other pure parts are in sentences.js.
//
// Bundled sentences go into the store the first time their pack is on (id `${pack}:${key}`), and new ones
// join when a pack's `rev` goes up. One already in the store is never overwritten, so your edits, pauses and
// progress stay. Today's counts live in localStorage langreader.trainDay = {date, listen, shadow, say, fresh,
// missed: [ids rated Again]}; which pack revisions are in the store, in langreader.packRevs.
import { db } from './db.js';
import { settings } from './settings.js';
import { todayKey, bump, record } from './stats.js';
import { schedule, AGAIN } from './srs.js';
import { buildPlan, isNew, genderize } from './sentences.js';
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

export async function loadSentences() {
  if (!cache) cache = new Map((await db.all('sentences')).map((s) => [s.id, s]));
  return cache;
}
export const sentence = (id) => cache?.get(id);
export async function putSentence(s) { cache.set(s.id, s); await db.put('sentences', s); return s; }
// After a backup is restored.
export function forgetSentences() { cache = null; }

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
// The sentences you're training: in a pack that's on, not paused or hidden. New ones come in this order.
export function trainingList(only = null) {
  const on = new Set(only ? [only] : enabledPacks());
  return [...(cache?.values() || [])].filter((s) => !s.hidden && !s.paused && s.packs.some((p) => on.has(p))).sort(byOrder);
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

// Rates one card. Returns what Undo needs to put it back.
export async function rateCard(id, dir, g, { count = true } = {}) {
  const s = cache.get(id), wasNew = isNew(s);
  const card = schedule(s.cards?.[dir], g, Date.now(), retention(), Math.random());
  await putSentence({ ...s, cards: { ...s.cards, [dir]: card } });
  const snap = { prev: s, counted: [], missed: false };
  if (count) {
    countDone(dir); snap.counted.push(dir);
    if (wasNew) { countDone('fresh'); snap.counted.push('fresh'); }
  }
  if (g === AGAIN) {
    const d = doneToday();
    if (!d.missed.includes(id)) { d.missed.push(id); saveDay(d); snap.missed = true; }
  }
  bump('drills');
  return snap;
}
export async function undoRate(snap) {
  await putSentence(snap.prev);
  for (const f of snap.counted) countDone(f, -1);
  if (snap.missed) { const d = doneToday(); d.missed = d.missed.filter((x) => x !== snap.prev.id); saveDay(d); }
  bump('drills', -1);
}
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
