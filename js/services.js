// Translation + speech services.
import { db } from './db.js';
import { settings } from './settings.js';

// ---------- Translation (MyMemory: free, CORS-enabled, no key needed) ----------
const MYMEMORY = 'https://api.mymemory.translated.net/get';

export async function translate(text, { word = false } = {}) {
  const src = settings.lang, tgt = settings.target;
  const key = `${src}|${tgt}|${text}`;
  const cached = await db.get('tcache', key).catch(() => null);
  if (cached) return cached.value;

  const url = new URL(MYMEMORY);
  url.searchParams.set('q', text);
  url.searchParams.set('langpair', `${src}|${tgt}`);
  if (settings.email) url.searchParams.set('de', settings.email);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Translation failed (${res.status})`);
  const data = await res.json();
  if (data.responseStatus && +data.responseStatus !== 200) throw new Error(data.responseDetails || 'Translation failed');

  const main = clean(data.responseData?.translatedText || '');
  const seen = new Set();
  const options = [];
  const add = (t, src) => {
    t = clean(t);
    const k = t.toLowerCase();
    if (!t || seen.has(k) || k === text.toLowerCase() || t.length > 80) return;
    seen.add(k); options.push({ text: t, src });
  };
  add(main, 'MT');
  if (word) {
    const ms = (data.matches || []).slice().sort((a, b) => (b.match - a.match) || (b.quality - a.quality));
    for (const m of ms) {
      if (normalizeCmp(m.segment) !== normalizeCmp(text)) continue;
      add(m.translation, 'TM');
      if (options.length >= 5) break;
    }
  }
  const value = { main, options };
  db.put('tcache', { key, value }).catch(() => {});
  return value;
}

const clean = (s) => String(s || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().replace(/^[.,;:!?]+|[.,;:]+$/g, '');
const normalizeCmp = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\s']/gu, '').trim();

// External dictionaries (open in a new tab).
export function dictionaryLinks(term) {
  const q = encodeURIComponent(term);
  const tgt = settings.target;
  const wr = { en: 'iten', fr: 'itfr', es: 'ites', de: 'itde', pt: 'itpt' }[tgt] || 'iten';
  return [
    { name: 'WordReference', url: `https://www.wordreference.com/${wr}/${q}` },
    { name: 'Reverso', url: `https://context.reverso.net/translation/italian-english/${q}` },
    { name: 'Treccani', url: `https://www.treccani.it/vocabolario/ricerca/${q}/` },
    { name: 'Wiktionary', url: `https://en.wiktionary.org/wiki/${q}#Italian` },
    { name: 'Google', url: `https://translate.google.com/?sl=${settings.lang}&tl=${tgt}&text=${q}` },
  ];
}

// ---------- Speech (Web Speech API, Italian voice) ----------
let voice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith(settings.lang));
  if (!voices.length) return null;
  const pref = settings.voice && voices.find((v) => v.name === settings.voice);
  // Prefer enhanced/premium voices on iOS (Alice, Federica, Luca), then Google.
  return pref || voices.find((v) => /premium|enhanced|siri/i.test(v.name)) || voices.find((v) => /alice|federica|luca|google/i.test(v.name)) || voices[0];
}
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); };
}
export function voicesForLang() {
  if (!('speechSynthesis' in window)) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith(settings.lang));
}

export function speak(text, { onend, onboundary } = {}) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  voice = pickVoice() || voice;
  if (voice) u.voice = voice;
  u.lang = voice?.lang || 'it-IT';
  u.rate = settings.rate;
  if (onend) { u.onend = onend; u.onerror = onend; }
  if (onboundary) u.onboundary = onboundary;
  speechSynthesis.speak(u);
}
export function stopSpeaking() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
