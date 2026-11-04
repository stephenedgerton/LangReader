// Your own sentences and packs, in sheets: "Train this sentence" (reader bubble and card, a word's card in
// Vocabulary, the review card), New Sentence (type Italian or English; MyMemory suggests the other side,
// and nothing is saved until you add it), making and editing a pack, ticking the packs a sentence is in,
// and editing a sentence. The data side is in training.js.
import { settings } from './settings.js';
import { openSheet, closeSheet, esc, icons, toast, $, $$ } from './ui.js';
import { translate } from './services.js';
import { haptic } from './haptics.js';
import { entry, setWord } from './vocab.js';
import {
  loadSentences, findSentence, addSentence, addToPack, editSentence, setSentencePacks, savePack, packMeta, pickablePacks,
  ownPacks, focusPack, READING, PACK_COLORS, PACK_EMOJI,
} from './training.js';

// A pack drawn as a book cover. `star` marks the focus pack.
const KIND = { bundled: 'Ready-made', own: 'Your pack', reading: 'Your reading' };
export const packCoverHTML = (p, { big = false, star = false } = {}) => `<div class="cover pack-cover${big ? ' big' : ''}" style="background:linear-gradient(160deg, ${p.colors[1]}, ${p.colors[0]})">
  ${star ? '<span class="pk-star" aria-label="Focus">★</span>' : ''}<div><div class="ce">${esc(p.emoji)}</div><div class="ct">${esc(p.name)}</div></div><div class="ca">${KIND[p.kind] || ''}</div></div>`;

// ---------- Train this sentence ----------
// Puts a sentence from your reading into From reading. The English is the sentence's translation if the word
// you tapped already has one (exampleTr), otherwise MyMemory's, which is then kept on the word too.
// Returns {state: 'added' | 'already' | 'failed', s}.
export async function trainThisSentence({ it, en = '', term = '', from = '' }) {
  await loadSentences();
  it = String(it).replace(/\s+/g, ' ').trim();
  const have = findSentence(it);
  if (have) return { state: 'already', s: have };
  const w = term ? entry(term) : null, mine = w && w.example === it.slice(0, 600);
  if (!en && mine) en = w.exampleTr || '';
  if (!en) {
    try { en = (await translate(it)).main; } catch { en = ''; }
    if (!en) return { state: 'failed' };
    if (mine && !w.exampleTr) await setWord(term, { exampleTr: en }, { silent: true });
  }
  return { state: 'added', s: await addSentence({ it, en, packs: [READING], from }), en };
}

// The button, for the bubble and the cards. In training already: a tick instead.
export function trainButtonHTML(it, cls = '') {
  const have = findSentence(it);
  return `<button class="train-btn ${cls}" data-train${have ? ' disabled' : ''}>${have ? `${icons.check}In training` : `${icons.plus}Train this sentence`}</button>`;
}
export async function onTrainButton(btn, opts) {
  if (btn.disabled) return null;
  haptic();
  btn.disabled = true; btn.textContent = 'Adding…';
  const r = await trainThisSentence(opts);
  btn.innerHTML = r.state === 'added' ? `${icons.check}Added to From reading` : r.state === 'already' ? `${icons.check}In training` : 'Translation unavailable (offline?)';
  if (r.state === 'failed') btn.disabled = false;
  return r;
}

// ---------- New Sentence ----------
// draft: {it, en, ctx, pack}; `pack` is chosen to start with.
export async function newSentenceSheet(draft = {}, { onDone } = {}) {
  await loadSentences();
  const packs = pickablePacks(), has = (id) => id && packs.some((p) => p.id === id);
  let chosen = [draft.pack, settings.trainLastPack, focusPack(), ownPacks()[0]?.id, packs.find((p) => p.kind === 'bundled')?.id].find(has) || '';
  let suggested = '';
  const body = openSheet(`<h2>New Sentence<button class="x">${icons.close}</button></h2>
    <p class="muted ns-help">Type it in Italian, or in English and get a suggestion.</p>
    <label class="field ns"><span>Italian</span><textarea name="it" rows="2" autocapitalize="sentences" placeholder="Dov’è la stazione?">${esc(draft.it || '')}</textarea></label>
    <label class="field ns"><span>English</span><textarea name="en" rows="2" autocapitalize="sentences" placeholder="Where is the station?">${esc(draft.en || '')}</textarea></label>
    <button class="secondary ns-suggest" data-a="suggest" hidden></button>
    <p class="ns-note" hidden></p>
    <label class="field"><span>Context (optional)</span><input name="ctx" value="${esc(draft.ctx || '')}" placeholder="e.g. to your partner" autocomplete="off"></label>
    <div class="field"><span>Pack</span><div class="chips ns-packs">
      ${packs.map((p) => `<button data-p="${esc(p.id)}" class="${p.id === chosen ? 'on' : ''}">${esc(p.emoji)} ${esc(p.name)}</button>`).join('')}
      <button class="chip-new" data-a="newpack" aria-label="New pack">${icons.plus}</button></div></div>
    <button class="primary" data-a="add" disabled>Add Sentence</button>`);
  const f = (n) => $(`[name=${n}]`, body), sug = $('.ns-suggest', body), note = $('.ns-note', body);
  const val = (n) => f(n).value.replace(/\s+/g, ' ').trim();
  const paint = () => {
    const it = val('it'), en = val('en');
    sug.hidden = !!it === !!en;
    sug.textContent = en ? 'Suggest the Italian' : 'Translate to English';
    $('[data-a=add]', body).disabled = !(it && en && chosen);
  };
  paint();
  body.oninput = (e) => { if (e.target.name === suggested) { note.hidden = true; suggested = ''; } paint(); };
  body.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.x')) return closeSheet();
    if (b.dataset.p) { chosen = b.dataset.p; $$('[data-p]', body).forEach((x) => x.classList.toggle('on', x === b)); return paint(); }
    const a = b.dataset.a;
    if (a === 'newpack') {
      const keep = { it: f('it').value, en: f('en').value, ctx: f('ctx').value };
      return packEditSheet(null, { onDone: (p) => newSentenceSheet({ ...keep, pack: p?.id || chosen }, { onDone }), onCancel: () => newSentenceSheet({ ...keep, pack: chosen }, { onDone }) });
    }
    if (a === 'suggest') {
      const toIt = !val('it'), from = toIt ? val('en') : val('it');
      sug.disabled = true; sug.textContent = toIt ? 'Suggesting…' : 'Translating…';
      let out = '';
      try { out = (await translate(from, { reverse: toIt })).main; } catch {}
      sug.disabled = false;
      if (!body.isConnected) return;
      if (!out) { note.textContent = 'No suggestion right now (offline?). You can type it yourself.'; note.hidden = false; return paint(); }
      const name = toIt ? 'it' : 'en';
      f(name).value = out; suggested = name;
      note.textContent = `Suggested by MyMemory. Check the ${toIt ? 'Italian' : 'English'}, and change it if it isn’t right, before you add it.`;
      note.hidden = false;
      return paint();
    }
    if (a === 'add') {
      haptic();
      const it = val('it'), en = val('en'), ctx = val('ctx'), name = packMeta(chosen)?.name || '';
      const have = findSentence(it);
      const s = have ? await addToPack(have.id, chosen) : await addSentence({ it, en, ctx, packs: [chosen] });
      settings.trainLastPack = chosen;
      closeSheet();
      toast(have ? `You already had it. It’s in ${name} now` : `Added to ${name}`);
      onDone?.(s);
    }
  };
}

// ---------- making and editing a pack ----------
// p: the pack to edit, or null for a new one. onDone gets the saved pack; onCancel (its ✕) goes back to the
// sheet that opened this one.
export function packEditSheet(p = null, { onDone, onCancel } = {}) {
  let emoji = p?.emoji || PACK_EMOJI[0];
  let colors = p?.colors || PACK_COLORS[ownPacks().length % PACK_COLORS.length];
  const body = openSheet(`<h2>${p ? 'Edit Pack' : 'New Pack'}<button class="x">${icons.close}</button></h2>
    <div class="pk-preview"></div>
    <label class="field"><span>Name</span><input name="name" value="${esc(p?.name || '')}" maxlength="40" placeholder="e.g. At work" autocomplete="off" enterkeyhint="done"></label>
    <div class="field"><span>Emoji</span><div class="pk-emoji">${PACK_EMOJI.map((x) => `<button data-e="${x}">${x}</button>`).join('')}</div></div>
    <div class="field"><span>Colour</span><div class="pk-colors">${PACK_COLORS.map((c, i) => `<button data-c="${i}" style="background:linear-gradient(160deg, ${c[1]}, ${c[0]})" aria-label="Colour ${i + 1}"></button>`).join('')}</div></div>
    <button class="primary" data-a="save">${p ? 'Save' : 'Create Pack'}</button>`);
  const name = () => $('[name=name]', body).value.trim();
  const paint = () => {
    $('.pk-preview', body).innerHTML = packCoverHTML({ name: name() || 'New Pack', emoji, colors, kind: 'own' });
    $$('[data-e]', body).forEach((b) => b.classList.toggle('on', b.dataset.e === emoji));
    $$('[data-c]', body).forEach((b) => b.classList.toggle('on', PACK_COLORS[b.dataset.c].join() === colors.join()));
    $('[data-a=save]', body).disabled = !name();
  };
  paint();
  body.oninput = paint;
  const save = async () => {
    if (!name()) return;
    haptic();
    const pack = await savePack({ ...(p || {}), name: name(), emoji, colors });
    closeSheet();
    onDone?.(pack);
  };
  $('[name=name]', body).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } };
  body.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.x')) return onCancel ? onCancel() : closeSheet(); // opening the other sheet replaces this one
    if (b.dataset.e) { emoji = b.dataset.e; return paint(); }
    if (b.dataset.c) { colors = PACK_COLORS[b.dataset.c]; return paint(); }
    if (b.dataset.a === 'save') return save();
  };
}

// ---------- a sentence's packs ----------
// Tick every pack the sentence is in, like a book's collections. It has to stay in one at least.
export function sentencePacksSheet(s, { onDone } = {}) {
  const inIt = new Set(s.packs);
  const list = pickablePacks();
  for (const id of s.packs) if (!list.some((p) => p.id === id) && packMeta(id)) list.push(packMeta(id));
  const body = openSheet(`<h2>Packs<button class="x">${icons.close}</button></h2>
    <p class="muted coll-for">It’s learned once, whichever packs it’s in.</p>
    <div class="action-list coll-pick">
      ${list.map((p) => `<button data-p="${esc(p.id)}" class="${inIt.has(p.id) ? 'on' : ''}"><span>${esc(p.emoji)} ${esc(p.name)}</span><i class="tick">${icons.check}</i></button>`).join('')}
      <button data-a="new" class="btn-new">${icons.plus}<span>New Pack…</span></button>
    </div>
    <p class="muted coll-help" data-note hidden>A sentence has to be in one pack at least. To remove it, delete it.</p>`, { onClose: onDone });
  body.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.x')) return closeSheet();
    if (b.dataset.a === 'new') {
      return packEditSheet(null, {
        onDone: async (p) => { const next = await setSentencePacks(s.id, [...inIt, p.id]); sentencePacksSheet(next, { onDone }); },
        onCancel: () => sentencePacksSheet(s, { onDone }),
      });
    }
    const id = b.dataset.p; if (!id) return;
    if (inIt.has(id) && inIt.size === 1) { $('[data-note]', body).hidden = false; return; }
    haptic();
    if (inIt.has(id)) inIt.delete(id); else inIt.add(id);
    s = await setSentencePacks(s.id, [...inIt]);
    b.classList.toggle('on', inIt.has(id));
  };
}

// ---------- editing a sentence ----------
export function editSentenceSheet(s, { onDone } = {}) {
  const body = openSheet(`<h2>Edit Sentence<button class="x">${icons.close}</button></h2>
    <label class="field ns"><span>Italian</span><textarea name="it" rows="2">${esc(s.it)}</textarea></label>
    ${/\{/.test(s.it) ? '<p class="muted ns-help">{o|a} picks the form for who’s speaking, and {p:o|a} for your partner.</p>' : ''}
    <label class="field ns"><span>English</span><textarea name="en" rows="2">${esc(s.en)}</textarea></label>
    <label class="field"><span>Context (optional)</span><input name="ctx" value="${esc(s.ctx || '')}" autocomplete="off"></label>
    ${s.bundled ? '<p class="muted ns-help">Your changes are kept when the pack is updated.</p>' : ''}
    <button class="primary" data-a="save">Save</button>`);
  const val = (n) => $(`[name=${n}]`, body).value.replace(/\s+/g, ' ').trim();
  body.oninput = () => { $('[data-a=save]', body).disabled = !val('it') || !val('en'); };
  body.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.x')) return closeSheet();
    if (b.dataset.a === 'save') {
      haptic();
      const next = await editSentence(s.id, { it: val('it'), en: val('en'), ctx: val('ctx') });
      closeSheet();
      onDone?.(next);
    }
  };
}
