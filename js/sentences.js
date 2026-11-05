// Training's pure parts (no DOM, no storage), so tests/sentences-core.test.mjs can run them in Node:
// gendered forms, Say it's hints, a sentence's level, and today's plan.
//
// A sentence holds two FSRS cards, `cards: {listen, say}` (see srs.js): recognising a sentence by ear and
// producing it are learned at different speeds. A sentence with neither card is new.
import { tokenize, normalize } from './text.js';
import { retrievability, endOfDay, levelFor, RETIRE_DAYS } from './srs.js';

const DAY = 86400000;
export const DIRS = ['listen', 'say'];

// `{o|a}` is about you and `{p:o|a}` about your partner; the first form is masculine, the second feminine.
// "Sei stanc{p:o|a}?" → "Sei stanca?" when your partner is a woman.
const GENDER = /\{(p:)?([^|{}]*)\|([^|{}]*)\}/g;
export function genderize(text, me = 'm', partner = 'm') {
  return String(text).replace(GENDER, (_, p, m, f) => ((p ? partner : me) === 'f' ? f : m));
}
// Problems with a sentence's gender markup (for the content checker): unbalanced braces, empty halves.
export function genderProblems(text) {
  const rest = String(text).replace(GENDER, (all, p, m, f) => (m && f ? '' : '\u0000'));
  const out = [];
  if (rest.includes('\u0000')) out.push('a gendered form with an empty half');
  if (/[{}|]/.test(rest)) out.push('unbalanced gender markup');
  return out;
}

// Say it's hint, one step at a time. 1: the first word, then a blank for each other word.
// 2: the first letter of each word, then a blank for each letter after it. (Step 3 shows the answer.)
export function hint(text, level) {
  let first = true;
  return tokenize(text).map((t) => {
    if (t.type !== 'w') return t.text;
    const keep = first; first = false;
    const apos = /['’]$/.test(t.text) ? t.text.slice(-1) : '';
    const letters = apos ? t.text.slice(0, -1) : t.text;
    if (level <= 1) return keep ? t.text : '___' + apos;
    return letters[0] + '_'.repeat(letters.length - 1) + apos;
  }).join('');
}

export const isNew = (s) => !s.cards?.listen && !s.cards?.say;
export const mastered = (s) => DIRS.every((d) => (s.cards?.[d]?.s || 0) >= RETIRE_DAYS);
// 0 new, 1–4 learning (from the say card, the harder one), 5 mastered.
// With a direction ('listen' for Shadowing, 'say' for Recall) it's that card's own level: each mode has its
// own stars, and a sentence learned in one mode starts at 0 in the other until it's rated there.
export function level(s, dir) {
  if (dir) {
    const c = s.cards?.[dir];
    if (!c) return 0;
    return c.s >= RETIRE_DAYS ? 5 : Math.min(4, levelFor(c.s));
  }
  if (mastered(s)) return 5;
  const c = s.cards?.say || s.cards?.listen;
  return c ? Math.min(4, levelFor(c.s)) : 0;
}
// "Learned" for a pack's progress: the say card has held for a week.
export const learned = (s) => (s.cards?.say?.s || 0) >= 7;

// Today's plan. `list` is the sentences you're training (enabled packs, not paused), with the new ones in
// the order they should come in. Each step takes what's due first, the cards you're closest to forgetting
// first, then fills up with new sentences while today's new allowance lasts. The plan is the same size every
// day however long you've been away; whatever doesn't fit waits, unseen.
//   sizes = {listen, shadow, say}: the day's share of each step; done = what's been done today
//   (listen, shadow, say, fresh); missed = ids rated Again today (shadowed again after the new ones).
export function buildPlan(list, { now, sizes, maxNew, done = {}, missed = [], rand = Math.random }) {
  const active = list.filter((s) => !mastered(s));
  const room = (k) => Math.max(0, (+sizes[k] || 0) - (done[k] || 0));
  const fresh = active.filter(isNew).slice(0, Math.max(0, (+maxNew || 0) - (done.fresh || 0)));
  const end = endOfDay(now);
  const due = (dir) => {
    const score = (s) => { const c = s.cards[dir]; return 1 - retrievability(Math.max(0, (now - c.last) / DAY), c.s); };
    const ready = active.filter((s) => s.cards?.[dir] && s.cards[dir].due <= end).sort((a, b) => score(b) - score(a) || a.cards[dir].due - b.cards[dir].due);
    // Started in the other direction only: its first card in this one is due now.
    const half = active.filter((s) => !isNew(s) && !s.cards?.[dir]);
    return [...half, ...ready];
  };
  const step = (dir) => {
    const r = room(dir);
    const out = due(dir).slice(0, r);
    for (const s of fresh) if (out.length < r && !out.includes(s)) out.push(s);
    return out.map((s) => s.id);
  };
  const listen = step('listen'), say = step('say');
  // Shadowing isn't scheduled: today's new sentences first, so they go hear → repeat → say, then today's
  // misses, then others you've started.
  const r = room('shadow'), shadow = [];
  const add = (id) => { if (shadow.length < r && !shadow.includes(id)) shadow.push(id); };
  fresh.forEach((s) => add(s.id));
  const ids = new Set(active.map((s) => s.id));
  missed.filter((id) => ids.has(id)).forEach(add);
  const others = active.filter((s) => !isNew(s)).map((s) => s.id);
  for (let k = others.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [others[k], others[j]] = [others[j], others[k]]; }
  others.forEach(add);
  return { listen, shadow, say, fresh: fresh.map((s) => s.id) };
}

// The order new sentences come in: the focus pack's first, then the ones you added yourself (oldest first),
// then the ready-made ones in pack order. Started sentences are scheduled, so their order doesn't matter.
export function newOrder(list, focus = '') {
  const rank = (s) => (focus && s.packs?.includes(focus) ? 0 : 2) + (s.bundled ? 1 : 0);
  return list.slice().sort((a, b) => rank(a) - rank(b) || (a.order ?? Infinity) - (b.order ?? Infinity) || a.created - b.created);
}

// Two sentences are the same if their words are (case, punctuation and spacing aside).
export const sameText = (a, b) => wordsOf(a) === wordsOf(b);
const wordsOf = (t) => tokenize(String(t)).filter((x) => x.type === 'w').map((x) => normalize(x.text)).join(' ');
