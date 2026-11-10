// Translation + speech services.
import { db } from './db.js';
import { settings } from './settings.js';
import { VOICES, EN_VOICE, piperSupported, warmUp, unlockAudio, speakPiper, stopPiper } from './piper.js';

// ---------- Translation ----------
// With a Google Cloud Translation API key in Settings (settings.googleKey, kept on this device only),
// Google translates and MyMemory is the fallback; without one, MyMemory (free, CORS-enabled, no key).
const MYMEMORY = 'https://api.mymemory.translated.net/get';
const GOOGLE = 'https://translation.googleapis.com/language/translate/v2';

// `reverse` translates the other way, into the language you're learning (New Sentence's suggestion).
// Returns {main, options: [{text, src}], by: 'Google' | 'MyMemory'}.
export async function translate(text, { word = false, reverse = false } = {}) {
  const [src, tgt] = reverse ? [settings.target, settings.lang] : [settings.lang, settings.target];
  const gkey = settings.googleKey;
  if (gkey) {
    const key = `g|${src}|${tgt}|${text}`;
    const cached = await db.get('tcache', key).catch(() => null);
    if (cached) return cached.value;
    // A word also gets MyMemory's alternatives, best-effort.
    const [g, m] = await Promise.allSettled([googleTranslate(text, src, tgt, gkey), word ? myMemory(text, src, tgt, word) : null]);
    if (g.status === 'fulfilled') {
      const opts = new Options(text, word);
      const main = clean(g.value, !word && /[.;:]\s*$/.test(text));
      opts.add(main, 'MT');
      for (const o of (m.status === 'fulfilled' && m.value?.options) || []) if (o.src === 'TM' && opts.list.length < 5) opts.add(o.text, 'TM');
      const value = { main, options: opts.list, by: 'Google' };
      db.put('tcache', { key, value }).catch(() => {});
      return value;
    }
    console.warn('Google Translate failed, using MyMemory:', g.reason?.message);
  }
  const key = `${src}|${tgt}|${text}`;
  const cached = await db.get('tcache', key).catch(() => null);
  if (cached) return { by: 'MyMemory', ...cached.value };
  const value = await myMemory(text, src, tgt, word);
  db.put('tcache', { key, value }).catch(() => {});
  return value;
}

// Checks a key with a one-word translation; resolves to an error message, or '' when it works.
export async function checkGoogleKey(key) {
  try { await googleTranslate('ciao', 'it', 'en', key); return ''; } catch (e) { return e.message || 'It didn’t work'; }
}

async function googleTranslate(text, src, tgt, key) {
  let res;
  try {
    res = await fetch(`${GOOGLE}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: src, target: tgt, format: 'text' }),
    });
  } catch { throw new Error('Couldn’t reach Google (offline?)'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Google Translate failed (${res.status})`);
  const out = data.data?.translations?.[0]?.translatedText;
  if (out == null) throw new Error('Google Translate returned nothing');
  return out;
}

class Options {
  constructor(text, word) { this.text = text.toLowerCase(); this.word = word; this.seen = new Set(); this.list = []; }
  add(t, src) {
    t = clean(t);
    const k = t.toLowerCase();
    if (!t || this.seen.has(k) || k === this.text || (this.word && t.length > 80)) return;
    this.seen.add(k); this.list.push({ text: t, src });
  }
}

async function myMemory(text, src, tgt, word) {
  const url = new URL(MYMEMORY);
  url.searchParams.set('q', text);
  url.searchParams.set('langpair', `${src}|${tgt}`);
  if (settings.email) url.searchParams.set('de', settings.email);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Translation failed (${res.status})`);
  const data = await res.json();
  if (data.responseStatus && +data.responseStatus !== 200) throw new Error(data.responseDetails || 'Translation failed');

  // A sentence that ends with a full stop keeps it in translation; a word's gloss never has one.
  const main = clean(data.responseData?.translatedText || '', !word && /[.;:]\s*$/.test(text));
  const opts = new Options(text, word);
  opts.add(main, 'MT');
  if (word) {
    const ms = (data.matches || []).slice().sort((a, b) => (b.match - a.match) || (b.quality - a.quality));
    for (const m of ms) {
      if (normalizeCmp(m.segment) !== normalizeCmp(text)) continue;
      opts.add(m.translation, 'TM');
      if (opts.list.length >= 5) break;
    }
  }
  return { main, options: opts.list, by: 'MyMemory' };
}

const clean = (s, keepEnd = false) => String(s || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().replace(keepEnd ? /^[.,;:!?]+/ : /^[.,;:!?]+|[.,;:]+$/g, '');
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
  return VOICES[v]?.lang === 'it' ? v : null;
}
// The Piper voice for English (Focus mode's Dual audio), or null for a device voice (settings.enVoice 'system').
const englishVoice = () => (piperSupported && settings.enVoice !== 'system' ? EN_VOICE : null);
// Start loading the Piper voice ahead of the first tap (the reader calls this when it opens; Training with
// `lang: 'en'` when the English prompt will be spoken).
export function prepareVoice({ lang = '' } = {}) {
  const v = lang === 'en' ? englishVoice() : piperVoice();
  if (v) warmUp(v);
}

// `slow` (Training's 🐢) speaks at 70% of the usual rate: Piper makes the voice itself slower, rather than
// stretching the audio. `rate` multiplies the usual rate too (Focus mode's speed steps). `lang: 'en'` speaks
// English (Focus mode's Dual audio): the English Piper voice, or a device voice until it has loaded.
export function speak(text, { onend, onboundary, slow = false, rate: times = 1, lang = '' } = {}) {
  stopSpeaking();
  const rate = settings.rate * times * (slow ? 0.7 : 1);
  const other = lang && lang !== settings.lang;
  if (other && lang !== 'en') return speakSystem(text, { onend, onboundary, rate, lang });
  // Unlock audio on every tap, even while the voice loads, so later clips can play outside a tap.
  const v = other ? englishVoice() : piperVoice();
  if (other && !v) return speakSystem(text, { onend, onboundary, rate, lang });
  const sys = () => speakSystem(text, { onend, onboundary, rate, lang: other ? lang : '' });
  if (v) unlockAudio();
  if (v && warmUp(v) === 'ready') {
    speakPiper(text, { voice: v, rate, onend }).catch(sys);
    return;
  }
  sys();
}
// The best device voice for another language (English for Dual audio), preferring enhanced ones.
function otherVoice(lang) {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
  return voices.find((v) => /premium|enhanced|siri/i.test(v.name) && /en-(us|gb)/i.test(v.lang)) || voices.find((v) => v.default)
    || voices.find((v) => /en-(us|gb)/i.test(v.lang)) || voices[0] || null;
}
function speakSystem(text, { onend, onboundary, rate = settings.rate, lang = '' }) {
  if (!('speechSynthesis' in window)) { onend?.(); return; }
  const u = new SpeechSynthesisUtterance(text);
  if (lang) {
    const v = otherVoice(lang);
    if (v) u.voice = v;
    u.lang = v?.lang || ({ en: 'en-US' }[lang] || lang);
  } else {
    voice = pickVoice() || voice;
    if (voice) u.voice = voice;
    u.lang = voice?.lang || 'it-IT';
  }
  u.rate = rate;
  if (onend) { u.onend = onend; u.onerror = onend; }
  if (onboundary) u.onboundary = onboundary;
  speechSynthesis.speak(u);
}
export function stopSpeaking() {
  stopPiper();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
