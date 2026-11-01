// LingQ-style word / phrase card.
import { openSheet, closeSheet, esc, icons, $, $$ } from './ui.js';
import { entry, setWord, deleteWord, STATUS_LABELS } from './vocab.js';
import { translate, dictionaryLinks, speak, googleTranslateURL } from './services.js';
import { bump } from './stats.js';
import { lookup, gloss } from './dictionary.js';
import { settings } from './settings.js';
import { normalize, tokenize } from './text.js';
import { haptic } from './haptics.js';
import { freqSentence } from './freq.js';
import { parseForm, inflect, formLabel } from './english.js';

// Like LingQ, every LingQ keeps the sentence it was saved from (`example`), plus that sentence's
// translation (`exampleTr`) once you've translated it. Phrases also keep `display`, the text as printed.
// opts: {term, display, phrase, context, inPhrase, onClose, onOpenPhrase, onSaveSentence}
export function openWordCard(opts) {
  const { term, phrase = false, inPhrase = null } = opts;
  const e = entry(term) || { term, status: 0, meaning: '' };
  const display = opts.display || e.display || term;
  const context = opts.context || e.example || '';
  // A selection that is the whole sentence doesn't need the sentence printed again under it.
  const long = phrase && term.split(' ').length >= 6;
  const isSentence = phrase && tokenize(context).filter((t) => t.type === 'w').map((t) => normalize(t.text)).join(' ') === term;
  let sentTr = e.example === context.slice(0, 600) ? e.exampleTr || '' : '';

  const ctxHTML = context
    ? `<div class="ctx${isSentence ? ' bare' : ''}">${isSentence ? '' : highlight(context, display)}<span class="tr"${sentTr ? '' : ' hidden'}>${esc(sentTr)}</span><div class="ctx-actions">${sentTr ? '' : `<button class="tr-btn">Translate sentence</button>`}<a class="gt-link" href="${googleTranslateURL(context)}" target="_blank" rel="noopener">Google Translate ↗</a>${opts.onSaveSentence && !isSentence ? '<button class="sent-btn">Save whole sentence</button>' : ''}</div></div>`
    : '';

  const body = openSheet(`
    <div class="wcard">
      ${inPhrase ? `<button class="phrase-chip" data-ph>Phrase: ${esc(inPhrase)} ›</button>` : ''}
      <div class="head">
        <div class="term${long ? ' long' : ''}">${esc(display)}</div>
        <button class="speak" aria-label="Pronounce">${icons.speaker}</button>
        <button class="x" aria-label="Close">${icons.close}</button>
      </div>
      ${ctxHTML}
      ${!phrase && freqSentence(term) ? `<div class="freq-line">${freqSentence(term)}</div>` : ''}
      <div class="dict" hidden></div>
      <div class="hints"><div class="loading">Looking up translations…</div></div>
      <form class="meaning-input">
        <input name="m" placeholder="Your own meaning…" value="${esc(e.meaning)}" autocomplete="off" autocapitalize="off" enterkeyhint="done">
        <button>Save</button>
      </form>
      <div class="status-bar">
        ${[1, 2, 3, 4].map((s) => `<button class="s${s}" data-s="${s}">${s}</button>`).join('')}
        <button class="s5" data-s="5" aria-label="Known">${icons.check}</button>
        <button class="si" data-s="-1" aria-label="Ignore">${icons.trash}</button>
      </div>
      <div class="status-legend"><span>New</span><span>Recognized</span><span>Familiar</span><span>Learned</span><span>Known</span><span>Ignore</span></div>
      <div class="dicts">${dictionaryLinks(term).filter((d) => !long || /Reverso|Google/.test(d.name)).map((d) => `<a href="${d.url}" target="_blank" rel="noopener">${d.name}</a>`).join('')}</div>
    </div>`, { onClose: () => { dismiss(); opts.onClose?.(); }, transparent: true });

  // Like the bubble: closing the card on a New word or phrase you looked up makes it LingQ 1.
  let removed = false;
  function dismiss() {
    if (removed || entry(term)) return;
    const best = cur.meaning ? null : [...dictHints, ...mtHints][0];
    save({ status: 1, ...(best && { meaning: best.text }) });
  }

  let cur = entry(term) || e;
  const paintStatus = () => {
    $$('.status-bar button', body).forEach((b) => b.classList.toggle('on', +b.dataset.s === cur.status));
  };
  paintStatus();

  const save = async (patch) => {
    const before = cur.status;
    const ctx = cur.example ? {} : { example: context.slice(0, 600), ...(sentTr && { exampleTr: sentTr }) };
    cur = await setWord(term, { phrase, ...(phrase && { display }), ...ctx, ...patch });
    if ((before === 0 || before === 5 || before === -1) && cur.status >= 1 && cur.status <= 4) bump('lingqs');
    if (before !== 5 && cur.status === 5 && !phrase) bump('known');
    paintStatus();
    paintHints();
  };

  // Hints come from two sources: Wiktionary glosses first, then machine translation.
  let dictHints = [], mtHints = [], pending = 0, failed = '';
  const seenHints = new Set();
  const paintHints = () => {
    const box = $('.hints', body);
    const list = [];
    const seen = new Set();
    const add = (h) => { const k = h.text.toLowerCase(); if (!seen.has(k)) { seen.add(k); list.push(h); } };
    if (cur.meaning) add({ text: cur.meaning, on: true });
    dictHints.slice(0, 4).forEach(add);
    mtHints.slice(0, 3).forEach(add);
    if (!list.length) {
      box.innerHTML = pending ? '<div class="loading">Looking up…</div>'
        : `<div class="loading">${failed ? esc(failed) + ' — the dictionaries below still work.' : 'No suggestions — add your own meaning below.'}</div>`;
      return;
    }
    // Hints that arrive after the card opened slide in, one after another; ones already shown stay put.
    let n = 0;
    const enter = (h) => { const k = h.text.toLowerCase(); if (seenHints.has(k)) return ''; seenHints.add(k); return ` enter" style="--i:${n++}`; };
    box.innerHTML = list.map((h) => `<button class="hint${h.on ? ' on' : ''}${enter(h)}" data-t="${esc(h.text)}"><span>${esc(h.text)}${h.note ? ` <small>${esc(h.note)}</small>` : ''}</span>${h.on ? '<small>Saved</small>' : '<span class="plus">+</span>'}</button>`).join('')
      + (pending ? '<div class="loading">Looking up…</div>' : '');
  };

  const useDict = !phrase && settings.target === 'en';
  if (useDict) {
    pending++;
    lookup(display).then((r) => { if (r) { dictHints = dictionaryHints(r); paintDict(body, r); } })
      .catch((err) => { failed = err.message; })
      .finally(() => { pending--; paintHints(); });
  }
  pending++;
  translate(display, { word: !long }).then((r) => { mtHints = r.options; })
    .catch((err) => { failed = failed || err.message || 'Offline'; })
    .finally(() => { pending--; paintHints(); });
  paintHints();

  body.addEventListener('click', async (ev) => {
    const t = ev.target.closest('button, a');
    if (!t) return;
    if (t.matches('.x')) return closeSheet();
    if (t.matches('.speak')) return speak(display);
    if (t.matches('.lemma-btn')) {
      const lemma = t.dataset.lemma;
      return openWordCard({ term: normalize(lemma), display: lemma, context, onClose: opts.onClose });
    }
    if (t.matches('[data-ph]')) return opts.onOpenPhrase && opts.onOpenPhrase();
    if (t.matches('.hint')) {
      ev.preventDefault();
      if (!t.classList.contains('on')) haptic();
      const status = cur.status >= 1 && cur.status <= 4 ? cur.status : 1;
      if (t.classList.contains('on')) return;
      return save({ meaning: t.dataset.t, status });
    }
    if (t.matches('.status-bar button')) {
      haptic();
      const s = +t.dataset.s;
      if (s === cur.status && phrase) { removed = true; await deleteWord(term); return closeSheet(); }
      await save({ status: s });
      if (s === 5 || s === -1) setTimeout(closeSheet, 220);
      return;
    }
    if (t.matches('.sent-btn')) return opts.onSaveSentence();
    if (t.matches('.tr-btn')) {
      const tr = $('.ctx .tr', body);
      t.textContent = 'Translating…';
      try { sentTr = (await translate(context)).main; tr.textContent = sentTr; tr.hidden = false; t.remove(); }
      catch (err) { t.textContent = 'Translation unavailable (offline?)'; return; }
      // Keep it on the LingQ, so the vocabulary list and review can show it.
      const saved = entry(term);
      if (saved && saved.example === context.slice(0, 600)) cur = await setWord(term, { exampleTr: sentTr }, { silent: true });
    }
  });
  $('.meaning-input', body).addEventListener('submit', (ev) => {
    ev.preventDefault();
    haptic();
    const m = ev.target.m.value.trim();
    const status = cur.status >= 1 && cur.status <= 4 ? cur.status : 1;
    save({ meaning: m, status: m ? status : cur.status });
    ev.target.m.blur();
  });
}

// Meanings to offer as one-tap LingQ hints. For an inflected form, the base word's sense put into
// that form comes first ("arrivò": "he/she arrived"), then the base word's senses as they are.
export function dictionaryHints(r) {
  const src = r.lemma && r.lemmaEntries.length ? r.lemmaEntries : r.entries;
  const out = [];
  if (r.lemma && r.lemmaEntries.length) out.push(...inflectedHints(r));
  for (const e of src) {
    for (const d of e.defs) {
      if (d.lemma) continue; // "plural of …" isn't a meaning
      const g = gloss(d.text);
      if (g) out.push({ text: g, note: r.lemma ? r.lemma : '' });
      if (out.length >= 4) return out;
    }
  }
  return out;
}

// Each reading Wiktionary gives for the form (at most two), in English, from the base word's first
// sense that can take it: a verb's "to …" sense, or a noun's sense for a plural.
function inflectedHints(r) {
  const out = [];
  const seen = new Set();
  for (const e of r.entries) {
    for (const d of e.defs) {
      if (!d.lemma) continue;
      for (const f of parseForm(d.text)) {
        if (f.tense === 'plural' && !/noun/i.test(e.pos)) continue; // an adjective's plural reads the same in English
        const kind = f.tense === 'plural' ? /noun/i : /verb/i;
        const senses = r.lemmaEntries.filter((l) => kind.test(l.pos)).flatMap((l) => l.defs).filter((x) => !x.lemma);
        for (const s of senses) {
          const text = inflect(gloss(s.text), f);
          if (!text) continue;
          if (!seen.has(text)) { seen.add(text); out.push({ text, note: `${r.lemma} · ${formLabel(f)}` }); }
          break;
        }
        if (out.length >= 2) return out;
      }
    }
  }
  return out;
}

function paintDict(body, r) {
  const box = $('.dict', body);
  if (!box) return;
  box.innerHTML = dictHTML(r);
  box.hidden = false;
}

// Wiktionary's senses as HTML. lemmaButton: false prints the base word without the "Open base word" button.
export function dictHTML(r, { lemmaButton = true } = {}) {
  const section = (entries, max) => entries.slice(0, 2).map((e) => `
    <div class="pos"><span>${esc(e.pos)}</span><ol>${e.defs.slice(0, max).map((d) => `<li>${esc(d.text)}</li>`).join('')}</ol></div>`).join('');
  let html = '';
  const formDefs = r.entries.flatMap((e) => e.defs).filter((d) => d.lemma);
  if (r.lemma) {
    html += `<div class="form-of">${esc(formDefs[0]?.text || 'Form of ' + r.lemma)}</div>`;
    if (lemmaButton) html += `<button class="lemma-btn" data-lemma="${esc(r.lemma)}"><b>${esc(r.lemma)}</b><span>Open base word ›</span></button>`;
    html += section(r.lemmaEntries, 3);
  } else {
    html += section(r.entries, 3);
  }
  return html + '<div class="src">Wiktionary</div>';
}

export function highlight(context, display) {
  const i = context.toLowerCase().replace(/’/g, "'").indexOf(display.toLowerCase().replace(/’/g, "'"));
  if (i < 0) return esc(context);
  return esc(context.slice(0, i)) + '<b>' + esc(context.slice(i, i + display.length)) + '</b>' + esc(context.slice(i + display.length));
}

export { STATUS_LABELS };
