// Daily reading statistics (reading time for the goal ring, words read, new known words, LingQs created).
import { db } from './db.js';

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

let pending = {};
let timer = null;

export function bump(field, n = 1) {
  if (!n) return;
  pending[field] = (pending[field] || 0) + n;
  clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}

export async function flush() {
  clearTimeout(timer);
  const p = pending; pending = {};
  if (!Object.keys(p).length) return;
  const date = todayKey();
  const day = (await db.get('days', date)) || { date, seconds: 0, wordsRead: 0, known: 0, lingqs: 0 };
  for (const [k, v] of Object.entries(p)) day[k] = (day[k] || 0) + v;
  await db.put('days', day);
}

export async function getDays() {
  await flush();
  const days = await db.all('days');
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}

export function streak(days, goalSeconds) {
  const set = new Map(days.map((d) => [d.date, d]));
  let n = 0;
  const d = new Date();
  // Today counts if met; otherwise the streak continues from yesterday.
  if (!((set.get(todayKey(d))?.seconds || 0) >= goalSeconds)) d.setDate(d.getDate() - 1);
  while ((set.get(todayKey(d))?.seconds || 0) >= goalSeconds) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// Reading timer: counts seconds while the reader is open and the page is visible.
let tick = null;
export function startReadingClock() {
  stopReadingClock();
  tick = setInterval(() => { if (document.visibilityState === 'visible') bump('seconds', 5); }, 5000);
}
export function stopReadingClock() { clearInterval(tick); tick = null; flush(); }
