// Bottom sheets, toasts and small DOM helpers.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const icons = {
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  speaker: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zm12-1a5 5 0 0 1 0 8m2.5-10.5a8.5 8.5 0 0 1 0 13"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
  cards: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 20V9m-5 5 5-5 5 5M5 4h14"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  hl: '<svg viewBox="0 0 24 24"><path d="M4 20h16M7 16l2-6 7-7 3 3-7 7-6 2z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};

let onSheetClose = null;
let closedAt = -Infinity;

export function openSheet(html, { onClose, transparent = false } = {}) {
  const sheet = $('#sheet'), scrim = $('#scrim');
  if (!sheet.hidden && onSheetClose) { const f = onSheetClose; onSheetClose = null; f(); }
  sheet.classList.remove('closing');
  // Fresh element per sheet so listeners from the previous sheet never linger.
  const body = document.createElement('div');
  body.id = 'sheet-body';
  $('#sheet-body').replaceWith(body);
  body.innerHTML = html;
  sheet.hidden = false;
  scrim.hidden = false;
  scrim.style.background = transparent ? 'transparent' : '';
  sheet.scrollTop = 0;
  onSheetClose = onClose || null;
  return body;
}

export function closeSheet() {
  const sheet = $('#sheet'), scrim = $('#scrim');
  if (sheet.hidden) return;
  closedAt = performance.now();
  sheet.classList.add('closing');
  scrim.hidden = true;
  const f = onSheetClose; onSheetClose = null;
  setTimeout(() => { sheet.hidden = true; sheet.classList.remove('closing'); }, 190);
  if (f) f();
}
export const sheetClosedAt = () => closedAt;
export const sheetOpen = () => !$('#sheet').hidden && !$('#sheet').classList.contains('closing');

// Swipe the sheet down to dismiss it.
export function initSheetGestures() {
  const sheet = $('#sheet');
  let y0 = null, dy = 0;
  sheet.addEventListener('touchstart', (e) => {
    if (sheet.scrollTop > 0) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (y0 == null) return;
    sheet.style.transform = '';
    if (dy > 90) closeSheet();
    y0 = null;
  });
  $('#scrim').addEventListener('click', closeSheet);
}

let toastTimer;
// opts.action + opts.onAction add a button (e.g. "Undo") and keep the toast up a little longer.
export function toast(msg, opts = {}) {
  const el = opts.el || $('#r-toast');
  el.textContent = msg;
  el.classList.toggle('has-action', !!opts.action);
  if (opts.action) {
    const b = document.createElement('button');
    b.textContent = opts.action;
    b.onclick = (e) => { e.stopPropagation(); el.hidden = true; opts.onAction(); };
    el.appendChild(b);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, opts.action ? 4500 : 1800);
}

// Generated cover for books without artwork: deterministic colour from the title.
const PALETTES = [
  ['#1f3b57', '#3a6b8c'], ['#7a2e2e', '#b5523b'], ['#2f4f3a', '#5f8a5a'], ['#4b2e5c', '#8a5a9a'],
  ['#8a5a14', '#d19a3a'], ['#203040', '#506070'], ['#6b1f3a', '#a8476a'], ['#14505a', '#2f8f8a'],
];
export function coverHTML(book) {
  if (book.cover) return `<div class="cover"><img src="${book.cover}" alt="" loading="lazy"></div>`;
  let h = 0;
  for (const c of book.title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = book.coverColors || PALETTES[h % PALETTES.length];
  return `<div class="cover" style="background:linear-gradient(160deg, ${b}, ${a})">
    <div class="ct">${esc(book.title)}</div><div class="ca">${esc(book.author || '')}</div></div>`;
}
