// Translation + speech services.
import { db } from './db.js';
import { settings } from './settings.js';
import { VOICES, piperSupported, warmUp, unlockAudio, speakPiper, stopPiper } from './piper.js';

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
    if (!t || seen.has(k) || k === text.toLowerCase() || (word && t.length > 80)) return;
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

// Google Translate web page (opens the Google Translate app on iPhone when it's installed).
export function googleTranslateURL(text) {
  return `https://translate.google.com/?sl=${settings.lang}&tl=${settings.target}&op=translate&text=${encodeURIComponent(text.slice(0, 4500))}`;
}

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
    { name: 'Google', url: googleTranslateURL(term) },
  ];
}

// ---------- Speech ----------
// settings.voice: '' is Riccardo and 'piper:paola' / 'piper:serena' the other bundled Piper voices,
// 'system' the best device voice, anything else a device voice by name. A Piper voice needs a
// moment to load, so until it's ready (or if it can't run here) the device voice speaks instead.
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

// The Piper voice to use, or null for a device voice.
export function piperVoice() {
  if (!piperSupported || settings.lang !== 'it') return null;
  const s = settings.voice;
  const v = !s ? 'riccardo' : s.startsWith('piper:') ? s.slice(6) : null;
  return VOICES[v] ? v : null;
}
// Start loading the Piper voice ahead of the first tap (the reader calls this when it opens).
export function prepareVoice() { const v = piperVoice(); if (v) warmUp(v); }

export function speak(text, { onend, onboundary } = {}) {
  stopSpeaking();
  // Unlock audio on every tap, even while the voice loads, so later clips can play outside a tap.
  const v = piperVoice();
  if (v) unlockAudio();
  if (v && warmUp(v) === 'ready') {
    speakPiper(text, { voice: v, rate: settings.rate, onend }).catch(() => speakSystem(text, { onend, onboundary }));
    return;
  }
  speakSystem(text, { onend, onboundary });
}
function speakSystem(text, { onend, onboundary }) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  voice = pickVoice() || voice;
  if (voice) u.voice = voice;
  u.lang = voice?.lang || 'it-IT';
  u.rate = settings.rate;
  if (onend) { u.onend = onend; u.onerror = onend; }
  if (onboundary) u.onboundary = onboundary;
  speechSynthesis.speak(u);
}
export function stopSpeaking() {
  stopPiper();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
