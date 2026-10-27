// LingQ-style word / phrase card.
import { openSheet, closeSheet, esc, icons, $, $$ } from './ui.js';
import { entry, setWord, deleteWord, STATUS_LABELS } from './vocab.js';
import { translate, dictionaryLinks, speak } from './services.js';
import { bump } from './stats.js';
import { lookup, gloss } from './dictionary.js';
import { settings } from './settings.js';
import { normalize } from './text.js';

// opts: {term, display, phrase, context, inPhrase, onClose, onOpenPhrase}
export function openWordCard(opts) {
  const { term, display = term, phrase = false, context = '', inPhrase = null } = opts;
  const e = entry(term) || { term, status: 0, meaning: '' };

  const ctxHTML = context
    ? `<div class="ctx">${highlight(context, display)}<span class="tr" hidden></span><button class="tr-btn">Translate sentence</button></div>`
    : '';

  const body = openSheet(`
    <div class="wcard">
      ${inPhrase ? `<button class="phrase-chip" data-ph>Phrase: ${esc(inPhrase)} ›</button>` : ''}
      <div class="head">
        <div class="term">${esc(display)}</div>
        <button class="speak" aria-label="Pronounce">${icons.speaker}</button>
        <button class="x" aria-label="Close">${icons.close}</button>
      </div>
      ${ctxHTML}
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
      <div class="dicts">${dictionaryLinks(term).map((d) => `<a href="${d.url}" target="_blank" rel="noopener">${d.name}</a>`).join('')}</div>
    </div>`, { onClose: opts.onClose, transparent: true });

  let cur = entry(term) || e;
  const paintStatus = () => {
    $$('.status-bar button', body).forEach((b) => b.classList.toggle('on', +b.dataset.s === cur.status));
  };
  paintStatus();

  const save = async (patch) => {
    const before = cur.status;
    cur = await setWord(term, { phrase, example: cur.example || context.slice(0, 300), ...patch });
    if ((before === 0 || before === 5 || before === -1) && cur.status >= 1 && cur.status <= 4) bump('lingqs');
    if (before !== 5 && cur.status === 5 && !phrase) bump('known');
    paintStatus();
    paintHints();
  };

  // Hints come from two sources: Wiktionary glosses first, then machine translation.
  let dictHints = [], mtHints = [], pending = 0, failed = '';
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
    box.innerHTML = list.map((h) => `<button class="hint${h.on ? ' on' : ''}" data-t="${esc(h.text)}"><span>${esc(h.text)}${h.note ? ` <small>${esc(h.note)}</small>` : ''}</span>${h.on ? '<small>Saved</small>' : '<span class="plus">+</span>'}</button>`).join('')
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
  translate(display, { word: true }).then((r) => { mtHints = r.options; })
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
      const status = cur.status >= 1 && cur.status <= 4 ? cur.status : 1;
      if (t.classList.contains('on')) return;
      return save({ meaning: t.dataset.t, status });
    }
    if (t.matches('.status-bar button')) {
      const s = +t.dataset.s;
      if (s === cur.status && phrase) { await deleteWord(term); return closeSheet(); }
      await save({ status: s });
      if (s === 5 || s === -1) setTimeout(closeSheet, 220);
      return;
    }
    if (t.matches('.tr-btn')) {
      const tr = $('.ctx .tr', body);
      t.textContent = 'Translating…';
      try { tr.textContent = (await translate(context)).main; tr.hidden = false; t.remove(); }
      catch (err) { t.textContent = 'Translation unavailable (offline?)'; }
    }
  });
  $('.meaning-input', body).addEventListener('submit', (ev) => {
    ev.preventDefault();
    const m = ev.target.m.value.trim();
    const status = cur.status >= 1 && cur.status <= 4 ? cur.status : 1;
    save({ meaning: m, status: m ? status : cur.status });
    ev.target.m.blur();
  });
}

// Meanings to offer as one-tap LingQ hints. For an inflected form, use the base word's senses.
function dictionaryHints(r) {
  const src = r.lemma && r.lemmaEntries.length ? r.lemmaEntries : r.entries;
  const out = [];
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

function paintDict(body, r) {
  const box = $('.dict', body);
  if (!box) return;
  const section = (entries, max) => entries.slice(0, 2).map((e) => `
    <div class="pos"><span>${esc(e.pos)}</span><ol>${e.defs.slice(0, max).map((d) => `<li>${esc(d.text)}</li>`).join('')}</ol></div>`).join('');
  let html = '';
  const formDefs = r.entries.flatMap((e) => e.defs).filter((d) => d.lemma);
  if (r.lemma) {
    html += `<div class="form-of">${esc(formDefs[0]?.text || 'Form of ' + r.lemma)}</div>
      <button class="lemma-btn" data-lemma="${esc(r.lemma)}"><b>${esc(r.lemma)}</b><span>Open base word ›</span></button>`;
    html += section(r.lemmaEntries, 3);
  } else {
    html += section(r.entries, 3);
  }
  html += '<div class="src">Wiktionary</div>';
  box.innerHTML = html;
  box.hidden = false;
}

function highlight(context, display) {
  const i = context.toLowerCase().replace(/’/g, "'").indexOf(display.toLowerCase().replace(/’/g, "'"));
  if (i < 0) return esc(context);
  return esc(context.slice(0, i)) + '<b>' + esc(context.slice(i, i + display.length)) + '</b>' + esc(context.slice(i + display.length));
}

export { STATUS_LABELS };
