// How common words are in Italian fiction, and how much of it your vocabulary covers.
// data/freq-it-v1.json (built by tools/build-freq.mjs) ranks the 20,000 most common lemmas (dictionary
// forms) in 199 novels, each with the word forms that belong to it. A lemma counts as known when any of
// its forms is Known (knowing "arrivò" means you know "arrivare"); Ignored words count as known for
// coverage, but not toward the words you know.
import { allEntries } from './vocab.js';
import { record } from './stats.js';
import { esc } from './ui.js';

const URL = 'data/freq-it-v1.json';
export const COMMON = 2000;  // new words this common get a stronger mark in the reader
export const BANDS = [100, 500, 1000, 2000, 5000, 10000, 20000];
export const COMFORT = [95, 98]; // coverage at which reading gets comfortable, then easy
// A rough level from how many of the most common lemmas you know.
export const LEVELS = [[500, 'A1'], [1000, 'A2'], [2000, 'B1'], [4000, 'B2'], [8000, 'C1']];

let data = null;   // {lemmas, counts, forms: Map form -> index, total, source}
let loading = null;

export const freqLoaded = () => !!data;
export const freqSource = () => data?.source || '';

export function loadFreq() {
  loading ||= fetch(URL).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(build).catch(() => { loading = null; return null; });
  return loading;
}

function build(j) {
  const n = j.lemmas.length;
  const lemmas = new Array(n), counts = new Float64Array(n), forms = new Map();
  // Listed forms first, so a lemma spelled like another lemma's form (era) looks up as that form (essere).
  j.lemmas.forEach(([l, c, f], i) => { lemmas[i] = l; counts[i] = c; if (f) for (const x of f.split('|')) forms.set(x, i); });
  lemmas.forEach((l, i) => { if (!forms.has(l)) forms.set(l, i); });
  data = { lemmas, counts, forms, total: j.total, source: j.source };
  return data;
}

// {lemma, rank (1-based), perMillion} for a normalised word, or null if it isn't in the list
// (or the list hasn't loaded).
export function lookupFreq(term) {
  if (!data) return null;
  const i = data.forms.get(term);
  if (i === undefined) return null;
  return { lemma: data.lemmas[i], rank: i + 1, perMillion: (data.counts[i] / data.total) * 1e6 };
}

// The bubble's tag: "arrivare · #268 · Top 500 ●●●●○" (the lemma only when it isn't the word itself).
export function freqTagHTML(term) {
  const f = lookupFreq(term);
  if (!f) return '<span class="fq-rare">Rare · beyond top 20k</span>';
  const d = dotsFor(f.rank);
  return `${f.lemma !== term ? `<b>${esc(f.lemma)}</b> · ` : ''}#${f.rank.toLocaleString()} · ${bandLabel(bandOf(f.rank))}`
    + ` <span class="fq-dots" aria-label="${d} of 5">${'●'.repeat(d)}<i>${'●'.repeat(5 - d)}</i></span>`;
}

// The full card's sentence: how common the word is, in words.
export function freqSentence(term) {
  const f = lookupFreq(term);
  if (!f) return data ? 'Not among the 20,000 most common words in Italian fiction.' : '';
  const every = Math.round(1e6 / f.perMillion);
  return `${f.lemma !== term ? `From <b>${esc(f.lemma)}</b>, the` : 'The'} ${ordinal(f.rank)} most common word in Italian fiction (${bandLabel(bandOf(f.rank)).toLowerCase()}): about 1 in every ${every.toLocaleString()} words.`;
}
const ordinal = (n) => n.toLocaleString() + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

export const isCommon = (term) => { const i = data?.forms.get(term); return i !== undefined && i < COMMON; };

export const bandOf = (rank) => BANDS.find((b) => rank <= b);
export const bandLabel = (b) => `Top ${b >= 1000 ? b / 1000 + 'k' : b}`;
// Five dots for the most common words, one for the rarest in the list.
export const dotsFor = (rank) => (rank <= 500 ? 5 : rank <= 2000 ? 4 : rank <= 5000 ? 3 : rank <= 10000 ? 2 : 1);

// Per lemma: 0 new, 1 learning (a LingQ), 2 known, 3 ignored. Phrases don't count.
export function lemmaStates() {
  const st = new Uint8Array(data.lemmas.length);
  for (const w of allEntries()) {
    if (w.phrase) continue;
    const i = data.forms.get(w.term);
    if (i === undefined) continue;
    if (w.status === 5) st[i] = 2;
    else if (w.status === -1) { if (st[i] !== 2) st[i] = 3; }
    else if (w.status >= 1 && w.status <= 4 && st[i] === 0) st[i] = 1;
  }
  return st;
}

export function levelFor(known) {
  let reached = LEVELS.findIndex(([n]) => known < n);
  if (reached === -1) reached = LEVELS.length;
  const next = LEVELS[reached];
  return { level: reached ? LEVELS[reached - 1][1] : 'Pre-A1', next: next ? { level: next[1], words: next[0] - known } : null };
}

// Everything the Stats tab shows about frequency. Coverage figures are percentages of running words in
// the novels; the known share counts Ignored words, and learning (LingQs) is kept apart.
export function wordStats(st = lemmaStates()) {
  const { counts, total } = data;
  let known = 0, learning = 0, covKnown = 0, covLearning = 0;
  const bands = BANDS.map((top) => ({ top, known: 0, learning: 0 }));
  for (let i = 0; i < st.length; i++) {
    const s = st[i];
    if (!s) continue;
    if (s === 2) known++;
    if (s === 1) { learning++; covLearning += counts[i]; } else covKnown += counts[i];
    for (const b of bands) if (i < b.top) { if (s === 1) b.learning++; else b.known++; }
  }
  return {
    known, learning,
    coverage: { known: (covKnown / total) * 100, learning: (covLearning / total) * 100 },
    bands: bands.map((b) => ({ ...b, knownPct: (b.known / b.top) * 100, learningPct: (b.learning / b.top) * 100 })),
    ...levelFor(known),
  };
}

// A theme's words that are in the list, most common first, each with its state.
export function themeWords(words, st = lemmaStates()) {
  return words.map((w) => ({ lemma: w, i: data.forms.get(w) })).filter((w) => w.i !== undefined && data.lemmas[w.i] === w.lemma)
    .sort((a, b) => a.i - b.i).map((w) => ({ lemma: w.lemma, rank: w.i + 1, state: st[w.i] }));
}

// Today's snapshot for the Stats trend: lemmas known, and fiction coverage known / learning.
export function recordSnapshot(s = wordStats()) {
  record({ lemmas: s.known, cover: Math.round(s.coverage.known * 10) / 10, coverL: Math.round(s.coverage.learning * 10) / 10 });
}
