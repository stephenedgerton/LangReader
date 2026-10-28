// Quick-lookup bubble shown above a tapped word (LingQ's mobile popup). "More" opens the full card.
import { esc, icons } from './ui.js';
import { entry, setWord } from './vocab.js';
import { translate, speak } from './services.js';
import { lookup } from './dictionary.js';
import { dictionaryHints } from './wordcard.js';
import { settings } from './settings.js';
import { bump } from './stats.js';
import { haptic } from './haptics.js';

let current = null;
let closedAt = -Infinity;

export const bubbleOpen = () => !!current;
export const bubbleClosedAt = () => closedAt;

export function closeBubble() {
  if (!current) return;
  const c = current;
  current = null;
  closedAt = performance.now();
  c.el.remove();
  c.onClose?.();
}

// opts: {anchor (word element), container, term, display, context, onExpand, onClose}
export function openBubble(opts) {
  closeBubble();
  const { anchor, container, term, display, context } = opts;
  let cur = entry(term) || { term, status: 0, meaning: '' };
  let suggestion = null; // {text, lemma}

  const el = document.createElement('div');
  el.className = 'wpop';
  el.innerHTML = `
    <div class="wp-head">
      <button class="wp-term" data-more>${esc(display)}<span class="wp-lemma"></span></button>
      <button class="wp-icon" data-speak aria-label="Pronounce">${icons.speaker}</button>
    </div>
    <button class="wp-mean" data-mean><span class="wp-loading">Looking up…</span></button>
    <div class="wp-status">
      ${[1, 2, 3, 4].map((s) => `<button class="s${s}" data-s="${s}">${s}</button>`).join('')}
      <button class="s5" data-s="5" aria-label="Known">${icons.check}</button>
      <button class="wp-more" data-more aria-label="More">${icons.more}</button>
    </div>
    <div class="wp-arrow"></div>`;
  container.appendChild(el);
  current = { el, onClose: opts.onClose };

  const paint = () => {
    el.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', +b.dataset.s === cur.status));
    const mean = el.querySelector('[data-mean]');
    if (cur.meaning) mean.innerHTML = `<span>${esc(cur.meaning)}</span><small>Saved</small>`;
    else if (suggestion) mean.innerHTML = `<span>${esc(suggestion.text)}</span><b class="plus">+</b>`;
    else if (suggestion === false) mean.innerHTML = '<span class="wp-loading">No quick meaning — tap ⋯ for dictionaries</span>';
    mean.classList.toggle('saved', !!cur.meaning);
    const lemma = suggestion?.lemma;
    el.querySelector('.wp-lemma').textContent = lemma ? ` → ${lemma}` : '';
  };
  paint();
  position(el, anchor, container);

  const save = async (patch) => {
    const before = cur.status;
    cur = await setWord(term, { example: cur.example || context.slice(0, 600), ...patch });
    if ((before === 0 || before === 5 || before === -1) && cur.status >= 1 && cur.status <= 4) bump('lingqs');
    if (before !== 5 && cur.status === 5) bump('known');
    if (current?.el === el) paint();
  };

  // Best single meaning: Wiktionary gloss (base word's sense for inflected forms), else machine translation.
  (async () => {
    try {
      if (settings.target === 'en') {
        const r = await lookup(display).catch(() => null);
        const h = r && dictionaryHints(r)[0];
        if (h) { suggestion = { text: h.text, lemma: r.lemma }; return; }
      }
      const mt = await translate(display, { word: true });
      suggestion = mt.options[0] ? { text: mt.options[0].text } : false;
    } catch { suggestion = false; }
    finally { if (current?.el === el) { paint(); position(el, anchor, container); } }
  })();

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.speak != null) return speak(display);
    if (b.dataset.more != null) { closeBubble(); return opts.onExpand(); }
    if (b.dataset.mean != null) {
      if (cur.meaning || !suggestion) { closeBubble(); return opts.onExpand(); }
      haptic();
      return save({ meaning: suggestion.text, status: cur.status >= 1 && cur.status <= 4 ? cur.status : 1 });
    }
    if (b.dataset.s) {
      haptic();
      const s = +b.dataset.s;
      const patch = { status: s };
      // Creating a LingQ: fill in the suggested meaning so the flashcard isn't blank.
      if (s >= 1 && s <= 4 && !cur.meaning && suggestion) patch.meaning = suggestion.text;
      save(patch);
      if (s === 5) setTimeout(() => { if (current?.el === el) closeBubble(); }, 260);
    }
  });
  // Keep taps inside the bubble from reaching the page underneath.
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
}

// Above the word when there's room, otherwise below; arrow points at the word.
function position(el, anchor, container) {
  const cr = container.getBoundingClientRect();
  const r = anchor.getBoundingClientRect();
  const w = Math.min(330, cr.width - 24);
  el.style.width = w + 'px';
  const h = el.offsetHeight;
  const cx = r.left + r.width / 2 - cr.left;
  const left = Math.max(12, Math.min(cr.width - w - 12, cx - w / 2));
  const above = r.top - cr.top - h - 12;
  const below = r.bottom - cr.top + 12;
  const placeAbove = above > 56 || below + h > cr.height - 8;
  el.style.left = left + 'px';
  el.style.top = (placeAbove ? Math.max(8, above) : below) + 'px';
  el.classList.toggle('below', !placeAbove);
  el.querySelector('.wp-arrow').style.left = Math.max(16, Math.min(w - 16, cx - left)) + 'px';
}
