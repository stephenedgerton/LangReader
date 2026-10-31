// Spaced repetition for LingQs, scheduled with FSRS-5 (Free Spaced Repetition Scheduler, default weights).
// Pure functions only (no DOM, no storage), so tests/srs.test.mjs can run them in Node.
//
// A word entry's card lives in `entry.srs = {s, d, last, due, reps, lapses, tap}`:
//   s     stability in days (how long until recall drops to 90%)
//   d     difficulty, 1..10
//   last  when it was last reviewed (ms), due when it's next due (ms)
//   tap   the day (todayKey) it last lapsed because you looked it up while reading
// A LingQ (status 1..4) without `srs` is a new card: it waits for the daily new-card allowance, or for
// reading to introduce it.

export const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
  1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5, FACTOR = 19 / 81;
const DAY = 86400000;
export const AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4;
export const RETIRE_DAYS = 180;   // a card this stable becomes a Known word and leaves the reviews
const MAX_IVL = 36500;

export const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const endOfDay = (t) => { const d = new Date(t); d.setHours(23, 59, 59, 999); return +d; };

const clampD = (d) => Math.min(10, Math.max(1, d));
const initS = (g) => W[g - 1];
const initD = (g) => clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1);

// Probability of recalling a card `t` days after its last review.
export const retrievability = (t, s) => Math.pow(1 + FACTOR * t / s, DECAY);

// Days until recall drops to `retention`.
export function interval(s, retention) {
  const i = (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return Math.min(MAX_IVL, Math.max(1, Math.round(i)));
}

function nextD(d, g) {
  const dd = d + (-W[6] * (g - 3)) * (10 - d) / 9;
  return clampD(W[7] * initD(EASY) + (1 - W[7]) * dd);
}
function recallS(d, s, r, g) {
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1)
    * (g === HARD ? W[15] : 1) * (g === EASY ? W[16] : 1));
}
function forgetS(d, s, r) {
  const f = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
  return Math.min(f, s / Math.exp(W[17] * W[18]));
}
const shortTermS = (s, g) => s * Math.exp(W[17] * (g - 3 + W[18]));

// The card after rating it `g` at time `now`. `fuzz` (0..1, or null for none) spreads longer intervals by
// up to ±5%, so cards learned together don't stay bunched on the same day.
export function schedule(card, g, now, retention = 0.85, fuzz = null) {
  let s, d;
  if (!card) { s = initS(g); d = initD(g); }
  else {
    const t = Math.max(0, (now - card.last) / DAY);
    if (t < 1) { s = shortTermS(card.s, g); d = nextD(card.d, g); }
    else {
      const r = retrievability(t, card.s);
      d = nextD(card.d, g);
      s = g === AGAIN ? forgetS(card.d, card.s, r) : recallS(card.d, card.s, r, g);
    }
  }
  s = Math.max(0.01, s);
  let ivl = interval(s, retention);
  if (fuzz != null && ivl >= 3) ivl = Math.max(1, Math.round(ivl * (0.95 + 0.1 * fuzz)));
  return {
    ...(card || {}), s, d, last: now, due: now + ivl * DAY,
    reps: (card?.reps || 0) + 1, lapses: (card?.lapses || 0) + (g === AGAIN && card ? 1 : 0),
  };
}

// How long until the card would come back after each rating, for the review buttons ("1d", "3w").
export function preview(card, now, retention) {
  const out = {};
  for (const g of [AGAIN, HARD, GOOD, EASY]) out[g] = interval(schedule(card, g, now, retention).s, retention);
  return out;
}
export function ivlLabel(days) {
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(days < 3650 ? 1 : 0).replace(/\.0$/, '')}y`;
}

// The LingQ level a card's stability suggests (1 New … 4 Learned), or 5 once it has retired.
export const levelFor = (s) => s >= RETIRE_DAYS ? 5 : s < 2 ? 1 : s < 7 ? 2 : s < 30 ? 3 : 4;

// The patch for a word entry after rating it: the new card, plus its level. Remembering moves the level up
// to what the stability suggests but never down (a level you chose by hand stays); forgetting drops it one.
export function rate(entry, g, now, retention, fuzz = null) {
  const srs = schedule(entry.srs, g, now, retention, fuzz);
  const lv = levelFor(srs.s);
  const status = g === AGAIN ? Math.max(1, Math.min(4, entry.status) - 1)
    : lv === 5 ? 5 : Math.max(entry.status, lv);
  return { srs, status };
}

// Reading counts as review. When you turn past a page, each LingQ on it gets one credit a day:
// read past it without tapping → Good; looked it up (tapped) → Again, once a day.
// A new card (no srs) is introduced by reading it on a later day than you saved it. Returns a patch or null.
export function readingCredit(entry, tapped, now, retention, fuzz = null) {
  if (!entry || entry.status < 1 || entry.status > 4) return null;
  const today = dayKey(now);
  const card = entry.srs;
  if (!card && dayKey(entry.created || now) === today) return null; // just saved
  if (tapped) {
    if (card?.tap === today) return null;
    const p = rate(entry, AGAIN, now, retention, fuzz);
    p.srs.tap = today;
    return p;
  }
  if (card && dayKey(card.last) === today) return null;
  return rate(entry, GOOD, now, retention, fuzz);
}

export const isLingq = (w) => w.status >= 1 && w.status <= 4;
export const isDue = (w, now) => isLingq(w) && w.srs && w.srs.due <= endOfDay(now);

// Today's session: the most valuable due cards first, then new cards, within the daily limits.
//   weight(term) → how much knowing the word is worth (common words more); done = {reviews, fresh} today.
// Due cards are ordered by how far recall has fallen × the word's weight, so after a break the cards
// you're closest to losing (and the commonest) come back first and the rest wait their turn.
export function buildQueue(entries, { now, weight, maxReviews, maxNew, done = { reviews: 0, fresh: 0 } }) {
  const due = [], fresh = [];
  for (const w of entries) {
    if (!isLingq(w)) continue;
    if (!w.srs) fresh.push(w);
    else if (w.srs.due <= endOfDay(now)) due.push(w);
  }
  const score = (w) => (1 - retrievability(Math.max(0, (now - w.srs.last) / DAY), w.srs.s)) * weight(w);
  due.sort((a, b) => score(b) - score(a) || a.srs.due - b.srs.due);
  fresh.sort((a, b) => weight(b) - weight(a) || a.created - b.created);
  const r = Math.max(0, maxReviews - done.reviews), n = Math.max(0, maxNew - done.fresh);
  return { due: due.slice(0, r), fresh: fresh.slice(0, n), dueTotal: due.length, freshTotal: fresh.length };
}
