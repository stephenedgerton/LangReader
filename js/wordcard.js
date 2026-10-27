// LingQ-style word / phrase card.
import { openSheet, closeSheet, esc, icons, $, $$ } from './ui.js';
import { entry, setWord, deleteWord, STATUS_LABELS } from './vocab.js';
import { translate, dictionaryLinks, speak } from './services.js';
import { bump } from './stats.js';

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

  let hints = [];
  const paintHints = () => {
    const box = $('.hints', body);
    const list = [];
    if (cur.meaning) list.push({ text: cur.meaning, src: 'Saved', on: true });
    for (const h of hints) if (h.text.toLowerCase() !== (cur.meaning || '').toLowerCase()) list.push(h);
    if (!list.length) { box.innerHTML = hints.loading ? '<div class="loading">Looking up translations…</div>' : '<div class="loading">No suggestions — add your own meaning below.</div>'; return; }
    box.innerHTML = list.map((h) => `<button class="hint${h.on ? ' on' : ''}" data-t="${esc(h.text)}"><span>${esc(h.text)}</span>${h.on ? '<small>Saved</small>' : '<span class="plus">+</span>'}</button>`).join('');
  };

  hints.loading = true;
  translate(display, { word: true }).then((r) => {
    hints = r.options; paintHints();
  }).catch((err) => {
    hints = []; paintHints();
    $('.hints', body).insertAdjacentHTML('beforeend', `<div class="loading">${esc(err.message || 'Offline')} — dictionaries below still work.</div>`);
  });
  if (cur.meaning) paintHints();

  body.addEventListener('click', async (ev) => {
    const t = ev.target.closest('button, a');
    if (!t) return;
    if (t.matches('.x')) return closeSheet();
    if (t.matches('.speak')) return speak(display);
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

function highlight(context, display) {
  const i = context.toLowerCase().replace(/’/g, "'").indexOf(display.toLowerCase().replace(/’/g, "'"));
  if (i < 0) return esc(context);
  return esc(context.slice(0, i)) + '<b>' + esc(context.slice(i, i + display.length)) + '</b>' + esc(context.slice(i + display.length));
}

export { STATUS_LABELS };
