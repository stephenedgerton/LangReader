// Unit tests for the FSRS scheduler and the daily review queue (no browser needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, interval, retrievability, rate, readingCredit, buildQueue, levelFor, ivlLabel, preview, AGAIN, HARD, GOOD, EASY, W } from '../js/srs.js';

const DAY = 86400000;
const T0 = new Date(2026, 9, 1, 12).getTime();

test('a new card starts from the FSRS-5 initial stabilities', () => {
  for (const g of [AGAIN, HARD, GOOD, EASY]) assert.equal(schedule(null, g, T0).s, W[g - 1]);
  const c = schedule(null, GOOD, T0);
  assert.ok(c.d >= 1 && c.d <= 10);
  assert.equal(c.reps, 1);
  assert.equal(c.last, T0);
});

test('recall is 90% after one stability, and intervals follow the memory target', () => {
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-9);
  assert.equal(interval(10, 0.9), 10);
  assert.ok(interval(10, 0.8) > interval(10, 0.85));
  assert.ok(interval(10, 0.85) > interval(10, 0.9));
});

test('remembering grows stability, forgetting shrinks it', () => {
  const c = schedule(null, GOOD, T0);
  const later = T0 + 4 * DAY;
  const good = schedule(c, GOOD, later), again = schedule(c, AGAIN, later);
  assert.ok(good.s > c.s * 2);
  assert.ok(again.s < c.s);
  assert.equal(again.lapses, 1);
  assert.ok(schedule(c, EASY, later).s > good.s);
  assert.ok(schedule(c, HARD, later).s < good.s);
  // Answer buttons are ordered.
  const p = preview(c, later, 0.85);
  assert.ok(p[AGAIN] <= p[HARD] && p[HARD] <= p[GOOD] && p[GOOD] <= p[EASY]);
});

test('an overdue card that is still remembered earns a longer interval', () => {
  const c = schedule(null, GOOD, T0);
  const onTime = schedule(c, GOOD, c.due), late = schedule(c, GOOD, c.due + 20 * DAY);
  assert.ok(late.s > onTime.s);
});

test('fuzz spreads long intervals by at most 5%', () => {
  const c = { s: 50, d: 5, last: T0 - 50 * DAY, due: T0, reps: 3, lapses: 0 };
  const lo = schedule(c, GOOD, T0, 0.85, 0), hi = schedule(c, GOOD, T0, 0.85, 1), none = schedule(c, GOOD, T0, 0.85);
  const days = (x) => Math.round((x.due - T0) / DAY);
  assert.ok(days(lo) < days(none) && days(none) < days(hi));
  assert.ok(days(hi) <= Math.round(days(none) * 1.05) + 1);
});

test('levels follow stability up but never down, and very stable cards become Known', () => {
  assert.deepEqual([0.5, 3, 10, 60, 200].map(levelFor), [1, 2, 3, 4, 5]);
  const e = { term: 'treno', status: 3, created: T0 };
  assert.equal(rate(e, GOOD, T0).status, 3);           // the level you set stays
  assert.equal(rate(e, AGAIN, T0).status, 2);          // forgetting drops one level
  assert.equal(rate({ ...e, status: 1 }, AGAIN, T0).status, 1);
  const stable = { ...e, status: 4, srs: { s: 120, d: 3, last: T0 - 120 * DAY, due: T0, reps: 8, lapses: 0 } };
  assert.equal(rate(stable, GOOD, T0).status, 5);
});

test('reading credits a LingQ once a day: read past is Good, looked up is Again', () => {
  const e = { term: 'treno', status: 1, created: T0 };
  assert.equal(readingCredit(e, false, T0 + 3600e3, 0.85), null, 'not on the day it was saved');
  assert.equal(readingCredit({ ...e, status: 5 }, false, T0 + DAY, 0.85), null, 'only LingQs');
  const p = readingCredit(e, false, T0 + DAY, 0.85);
  assert.equal(p.srs.s, W[GOOD - 1]);
  const e2 = { ...e, ...p };
  assert.equal(readingCredit(e2, false, T0 + DAY + 3600e3, 0.85), null, 'once a day');
  // A lookup later the same day still counts as a lapse, but only once.
  const lapse = readingCredit(e2, true, T0 + DAY + 3600e3, 0.85);
  assert.ok(lapse.srs.s < e2.srs.s);
  assert.equal(readingCredit({ ...e2, ...lapse }, true, T0 + DAY + 7200e3, 0.85), null);
});

test('the daily queue caps reviews and new cards, most valuable first', () => {
  const now = T0 + 30 * DAY;
  const card = (s, ago) => ({ s, d: 5, last: now - ago * DAY, due: now - 1, reps: 2, lapses: 0 });
  const entries = [
    { term: 'raro', status: 2, srs: card(5, 10) },
    { term: 'casa', status: 2, srs: card(5, 10) },
    { term: 'quasi', status: 2, srs: card(5, 30) },
    { term: 'futuro', status: 2, srs: { ...card(5, 1), due: now + 5 * DAY } },
    { term: 'nuovo1', status: 1, created: 1 },
    { term: 'nuovo2', status: 1, created: 2 },
    { term: 'noto', status: 5, srs: card(5, 10) },
  ];
  const weight = (w) => ({ casa: 5, quasi: 4, nuovo2: 5 })[w.term] || 1;
  const q = buildQueue(entries, { now, weight, maxReviews: 2, maxNew: 1 });
  assert.deepEqual(q.due.map((w) => w.term), ['quasi', 'casa']);
  assert.deepEqual(q.fresh.map((w) => w.term), ['nuovo2']);
  assert.equal(q.dueTotal, 3);
  const after = buildQueue(entries, { now, weight, maxReviews: 2, maxNew: 1, done: { reviews: 2, fresh: 1 } });
  assert.equal(after.due.length + after.fresh.length, 0);
});

test('interval labels', () => {
  assert.deepEqual([1, 13, 21, 90, 365, 800].map(ivlLabel), ['1d', '13d', '3w', '3mo', '1y', '2.2y']);
});
