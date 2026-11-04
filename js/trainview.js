// The Training tab: today's plan, the packs as covers on shelves (Your Packs with From reading, Ready-made,
// More to Add), and each pack's own page (back arrow, not a sheet): a Shadowing | Recall switch with ▶ (plays
// the pack on the page) and a pinned "Start Focus" (the Focus screen, focus.js), then its sentences in Italian
// only, each one playable, its English a tap away. Plus a sentence's sheet, a pack's ⋯ menu (with Train) and
// Training's settings. Adding and editing your own sentences and packs is in mysentences.js.
import { settings } from './settings.js';
import { esc, icons, openSheet, closeSheet, toast, $, $$ } from './ui.js';
import { speak, stopSpeaking } from './services.js';
import { haptic } from './haptics.js';
import { getDays, todayKey } from './stats.js';
import { level, learned, isNew, genderize } from './sentences.js';
import { STEPS, repsOf, loadSentences, syncPacks, packOn, setPackOn, packSentences, todaysPlan, minutes, doneToday, sizes, textOf, trainingStreak, setPaused, sentence,
  packMeta, ownPacks, readingPack, isTrained, focusPack, setFocus, deletePack, deleteSentence } from './training.js';
import { packCoverHTML, newSentenceSheet, packEditSheet, sentencePacksSheet, editSentenceSheet } from './mysentences.js';
import { drillSheet, stepIcon } from './drill.js';
import { focusSheet, focusSettingsSheet, createPlayer, MODES } from './focus.js';
import { reviewSheet, todaysCount, reviewedToday } from './review.js';
import { PACKS, packInfo, loadPack } from '../samples/packs/index.js';

let page = null;        // the pack whose page is open, or null for the tab itself
let showAll = false;       // every row's translation shown (Show English / Show Italian)
const shownEN = new Set(); // rows whose translation you've tapped open
let view = null;
const counts = new Map(); // pack id -> number of sentences (for packs that aren't on yet)

const back = '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>';
const play = '<svg viewBox="0 0 24 24" class="solid"><path d="M7 4.5v15l13-7.5z"/></svg>';
const stop = '<svg viewBox="0 0 24 24" class="solid"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

// Today's state, shared with Home's card.
export async function trainingToday() {
  await loadSentences(); await syncPacks();
  const plan = todaysPlan(), done = doneToday(), sz = sizes();
  const steps = STEPS.map((s) => {
    const left = plan[s.k].length, did = Math.min(done[s.k] || 0, sz[s.k]);
    return { ...s, left, did, frac: left ? did / (did + left) : 1, done: !left };
  }).filter((s) => sz[s.k] > 0);
  const allDone = steps.every((s) => s.done), days = await getDays(), today = todayKey();
  const reps = { today: days.find((d) => d.date === today)?.reps || 0, all: days.reduce((n, d) => n + (d.reps || 0), 0) };
  return { plan, steps, allDone, started: steps.some((s) => s.did), mins: minutes(plan), streak: trainingStreak(days), reps };
}

// Home's card: one line about today, opening the tab.
export async function trainingCardHTML() {
  const t = await trainingToday();
  const line = t.allDone ? `Done for today${t.streak ? ` · 🔥 ${t.streak} day${t.streak === 1 ? '' : 's'}` : ''}`
    : `${t.steps.filter((s) => !s.done).length} step${t.steps.filter((s) => !s.done).length === 1 ? '' : 's'} ${t.started ? 'left' : ''} · about ${t.mins} min`;
  return `<button class="card review-card training-card${t.allDone ? ' done' : ''}" data-act="training"><div class="rv-ico">${t.allDone ? '✓' : stepIcon('say')}</div>
    <div><h4>Today's Training</h4><p>${line.replace('  ', ' ')}</p></div><span class="chev">›</span></button>`;
}

const cover = (p, big = false) => packCoverHTML(p, { big, star: focusPack() === p.id });

function packStats(id) {
  const list = packSentences(id), now = Date.now(), end = new Date(); end.setHours(23, 59, 59, 999);
  return {
    n: list.length || counts.get(id) || 0,
    learned: list.filter(learned).length,
    due: list.filter((s) => !s.paused && ['listen', 'say'].some((d) => s.cards?.[d] && s.cards[d].due <= +end)).length,
    started: list.some((s) => !isNew(s)),
  };
}

// Repetitions (once through hearing a sentence and saying it), today and in all.
const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? '' : 's'}`;
const repsLine = ({ reps }) => reps.all ? `<div class="tr-reps"><b>${plural(reps.today, 'repetition')}</b> today<span>${reps.all.toLocaleString()} in all</span></div>` : '';

// The focus pack, as a line at the bottom of the Today card.
const focusLine = () => { const f = focusPack() && packMeta(focusPack()); return f ? `<button class="tr-focus" data-pack="${esc(f.id)}"><b>★</b> New sentences come from <b>${esc(f.name)}</b> first</button>` : ''; };

function todayHTML(t) {
  const C = 2 * Math.PI * 28;
  if (!t.steps.length) return `<div class="card tr-today"><p class="muted">Every step is set to 0. Change that in Training settings (⚙︎).</p></div>`;
  const rings = `<div class="tr-rings">${t.steps.map((s) => `<div class="tr-ring${s.done ? ' done' : ''}"><div class="ring"><svg viewBox="0 0 68 68"><circle class="track" cx="34" cy="34" r="28"/>
      <circle class="prog" cx="34" cy="34" r="28" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - s.frac)}"/></svg><div class="ring-n">${s.done ? icons.check : stepIcon(s.k)}</div></div>
      <b>${s.name}</b><span>${s.done ? 'Done' : s.left}</span></div>`).join('')}</div>`;
  if (t.allDone) {
    return `<div class="card tr-today all-done">${rings}<div class="tr-foot"><div><div class="big">Done for today</div>
      <p>${t.streak ? `🔥 ${t.streak} day${t.streak === 1 ? '' : 's'} in a row · ` : ''}Come back tomorrow for a fresh set.</p></div>
      <button class="resume soft" data-act="more">More</button></div>${repsLine(t)}${focusLine()}</div>`;
  }
  return `<div class="card tr-today">${rings}<div class="tr-foot"><div><div class="big">About ${t.mins} min</div>
    <p>${t.steps.filter((s) => !s.done).length} step${t.steps.filter((s) => !s.done).length === 1 ? '' : 's'} ${t.started ? 'left' : 'today'}${t.streak ? ` · 🔥 ${t.streak}` : ''}</p></div>
    <button class="resume" data-act="start">${t.started ? 'Continue' : 'Start'}</button></div>${repsLine(t)}${focusLine()}</div>`;
}

function shelfItem(p) {
  const on = isTrained(p.id), st = packStats(p.id);
  return `<button class="book pack${on ? '' : ' off'}" data-pack="${p.id}">${cover(p)}
    <div class="pack-meta">${on ? `${st.learned} of ${st.n} learned` : `${st.n} sentences`}</div>
    ${on ? `<div class="hair"><i style="width:${st.n ? (st.learned / st.n) * 100 : 0}%"></i></div>` : ''}</button>`;
}

export async function renderTraining(v = view) {
  view = v;
  if (page) return renderPack(page);
  const t = await trainingToday();
  await Promise.all(PACKS.filter((p) => !packOn(p.id) && !counts.has(p.id)).map(async (p) => counts.set(p.id, (await loadPack(p.id)).length)));
  const words = todaysCount(), wordsDone = reviewedToday();
  const yours = [readingPack(), ...ownPacks()].filter(Boolean);
  const ready = PACKS.filter((p) => packOn(p.id)).map((p) => packMeta(p.id)), more = PACKS.filter((p) => !packOn(p.id)).map((p) => packMeta(p.id));
  v.innerHTML = `
    <div class="view-head"><h1 class="large-title">Training</h1>
      <div class="head-btns"><button class="circle-btn" data-act="new" aria-label="New sentence">${icons.plus}</button>
      <button class="circle-btn" data-act="settings" aria-label="Training settings">${icons.gear}</button></div></div>
    <div class="section-title">Today's Training</div>
    ${todayHTML(t)}
    ${!settings.trainWords && (words || wordsDone) ? `<button class="card review-card tr-words" data-act="words"><div class="rv-ico">${words ? icons.cards : '✓'}</div>
      <div><h4>${words ? `Bonus: ${words} word${words === 1 ? '' : 's'}` : 'Words done for today'}</h4><p>${words ? 'Your gems, if you’ve got a couple more minutes' : `${wordsDone} reviewed. Practise more if you like.`}</p></div><span class="chev">›</span></button>` : ''}
    <div class="section-title">Your Packs</div>
    <div class="shelf">${yours.map(shelfItem).join('')}<button class="book pack pk-new" data-act="newpack"><div class="cover pack-cover">${icons.plus}<div class="ct">New Pack</div></div>
      <div class="pack-meta">${yours.length ? '' : 'Your own sentences'}</div></button></div>
    <div class="section-title">Ready-made</div>
    ${ready.length ? `<div class="shelf">${ready.map(shelfItem).join('')}</div>` : '<p class="muted tr-empty">Add a pack below to train it.</p>'}
    ${more.length ? `<div class="section-title">More to Add</div><div class="shelf">${more.map(shelfItem).join('')}</div>` : ''}`;
  v.onclick = (e) => {
    const b = e.target.closest('[data-act],[data-pack]'); if (!b) return;
    if (b.dataset.pack) { page = b.dataset.pack; showAll = false; shownEN.clear(); window.scrollTo?.(0, 0); v.scrollTop = 0; return renderPack(page); }
    const a = b.dataset.act;
    if (a === 'start') return startToday();
    if (a === 'more') return moreSheet();
    if (a === 'words') return reviewSheet({ onClose: () => renderTraining() });
    if (a === 'settings') return trainingSettings();
    if (a === 'new') return newSentenceSheet({}, { onDone: () => renderTraining() });
    if (a === 'newpack') return packEditSheet(null, { onDone: (p) => { page = p.id; showAll = false; shownEN.clear(); renderPack(p.id); } });
  };
}

// Training opened from Home's card starts straight in the tab; Start begins today's session.
export function startToday() {
  return askGender(trainingSentences(), () => drillSheet({ onClose: () => renderTraining() }));
}
const trainingSentences = () => { const p = todaysPlan(); return [...p.listen, ...p.shadow, ...p.say].map(sentence).filter(Boolean); };

function moreSheet() {
  const more = todaysPlan({ extra: 10 }), n = more.listen.length + more.say.length, missed = doneToday().missed.filter((id) => sentence(id));
  const body = openSheet(`<h2>Keep going<button class="x">${icons.close}</button></h2>
    <p class="muted" style="margin-top:-6px">Only if you feel like it. Today's training is done.</p>
    <div class="action-list">
      ${n ? `<button data-a="extra"><span>Train ${Math.min(10, n)} more</span></button>` : ''}
      ${missed.length ? `<button data-a="missed"><span>Go over the ${missed.length === 1 ? 'one' : missed.length} I missed today</span></button>` : ''}
      ${!n && !missed.length ? '<button data-a="close"><span>Nothing more to train today</span></button>' : ''}
    </div>`);
  body.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'extra') return drillSheet({ extra: 10, onClose: () => renderTraining() });
    if (b.dataset.a === 'missed') return drillSheet({ practice: missed, onClose: () => renderTraining() });
    closeSheet();
  };
}

// ---------- a pack's page ----------
// ▶ plays the pack right here, in the mode the switch is on, with that mode's settings (the same loop as the
// Focus screen), highlighting the sentence that's playing.
let playing = null;
function stopPlayAll() {
  if (!playing) return;
  playing.stop(); playing = null;
  if (view) { $$('.tr-row.now', view).forEach((r) => r.classList.remove('now')); const b = $('[data-act=play]', view); if (b) { b.innerHTML = play; b.setAttribute('aria-label', 'Play'); b.classList.remove('on'); } }
}

const KICKER = { bundled: 'Ready-made', own: 'Your pack', reading: 'From your reading' };
const mode = () => (MODES[settings.focusMode] ? settings.focusMode : 'shadow');
const star = '<svg viewBox="0 0 24 24" class="solid"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>';

async function renderPack(id) {
  const v = view, p = packMeta(id);
  if (!p) { page = null; return renderTraining(); }
  stopPlayAll();
  const on = isTrained(id);
  // A pack that isn't on yet shows its sentences straight from the pack file.
  const list = on ? packSentences(id) : (await loadPack(id)).map((x) => ({ id: `${id}:${x.k}`, it: x.it, en: x.en, ctx: x.ctx, cards: {}, preview: true }));
  const st = packStats(id), live = list.filter((s) => !s.paused), m = mode();
  const text = (s) => genderize(s.it, settings.trainMe || 'm', settings.trainPartner || 'm');
  // Shadowing lists the Italian, Recall the English (so the list doesn't give the answer away); the other
  // language is behind a tap on each row.
  const recall = m === 'recall', other = recall ? 'Italian' : 'English';
  const main = (s) => (recall ? s.en : text(s)), hidden = (s) => (recall ? text(s) : s.en);
  const under = (s) => (showAll || shownEN.has(s.id) ? `<div class="tr-rev">${esc(hidden(s))}</div>` : `<div class="tr-tap">Tap to show the ${other}</div>`);
  const reps = on ? repsOf(list) : 0;
  const lv = (s) => {
    if (s.preview) return '';
    if (s.paused) return '<span class="tr-tag">Paused</span>';
    const n = level(s);
    if (!n) return '<span class="tr-tag new">New</span>';
    if (n === 5) return `<span class="tr-tag done">${icons.check}</span>`;
    return `<span class="stars" aria-label="Level ${n} of 4">${[1, 2, 3, 4].map((k) => `<i class="${k <= n ? 'on' : ''}">${star}</i>`).join('')}</span>`;
  };
  v.innerHTML = `
    <div class="tr-nav"><button class="tr-back" data-act="back">${back}Training</button>
      <button class="circle-btn" data-act="packmenu" aria-label="Pack options">${icons.more}</button></div>
    <div class="hero-book tr-hero">${cover(p, true)}
      <div class="hero-meta"><div class="kicker">${KICKER[p.kind]} · ${list.length} sentence${list.length === 1 ? '' : 's'}</div>
        <h3>${esc(p.name)}</h3>
        <div class="author">${on ? `${st.learned} learned${st.due ? ` · ${st.due} due` : ''}` : 'Not in your training yet'}</div>
        ${reps ? `<div class="tr-hero-reps">${plural(reps, 'repetition')}</div>` : ''}
        ${focusPack() === id ? '<div class="tr-hero-focus">★ Focus</div>' : ''}
        <div class="tr-hero-btns">${on ? `<button class="resume soft" data-act="addsent">${icons.plus}Sentence</button>` : '<button class="resume" data-act="add">Add to my packs</button>'}</div>
      </div></div>
    ${p.blurb ? `<p class="tr-blurb">${esc(p.blurb)}</p>` : ''}
    ${live.length ? `<div class="fc-modebar">
      <div class="seg fc-mode" role="tablist">${Object.entries(MODES).map(([k, x]) => `<button data-mode="${k}" role="tab" aria-selected="${k === m}" class="${k === m ? 'on' : ''}">${x.name}</button>`).join('')}</div>
      <button class="circle-btn" data-act="fsettings" aria-label="${MODES[m].name} settings">${icons.gear}</button>
      <button class="fc-bigplay" data-act="play" aria-label="Play">${play}</button></div>
      <p class="muted fc-modehelp">${m === 'shadow' ? 'Hear each sentence, then say it straight after.' : 'See or hear the English, say it in Italian, then hear it.'}</p>` : ''}
    <div class="tr-list-head"><div class="section-title">Sentences</div>
      <div><button data-act="en">${showAll ? 'Hide' : 'Show'} ${other}</button></div></div>
    ${list.length ? '' : `<p class="muted tr-empty">No sentences yet. Add one with + Sentence${p.kind === 'reading' ? ', or with “Train this sentence” on a word while you read' : ''}.</p>`}
    <div class="tr-list">${list.map((s) => `<div class="tr-row${s.paused ? ' paused' : ''}" data-id="${esc(s.id)}">
        <button class="rv-say" data-play aria-label="Play">${icons.speaker}</button>
        <button class="txt" data-reveal aria-expanded="${showAll || shownEN.has(s.id)}"><div class="it">${esc(main(s))}</div>${under(s)}</button>${lv(s)}
        <button class="tr-row-more" data-sent aria-label="Sentence options">${icons.more}</button></div>`).join('')}</div>
    <p class="muted tr-tip">${showAll ? `Tap Hide ${other} to test yourself again.` : `The ${other} is hidden so the list doesn’t give the answers away. Tap a sentence to see it, and again to hide it.`}</p>
    ${on && live.length ? `<div class="fc-start-space"></div><div class="fc-start"><button class="primary" data-act="focus">Start Focus · ${live.length}</button></div>` : ''}`;
  const find = (row) => list.find((s) => s.id === row.dataset.id);
  const items = () => live.map((s) => ({ id: s.id, text: text(s), en: s.en }));
  const startFocus = () => { stopPlayAll(); return askGender(packSentences(id), () => focusSheet({ pack: id, mode: mode(), ids: live.map((s) => s.id), onClose: () => renderPack(id) })); };
  v.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const row = b.closest('.tr-row'), a = b.dataset.act;
    if (b.dataset.play != null) { stopPlayAll(); return sayRow(b, text(find(row))); }
    if (b.dataset.reveal != null) {
      const s = find(row);
      if (showAll) return;
      if (shownEN.has(s.id)) shownEN.delete(s.id); else shownEN.add(s.id);
      b.setAttribute('aria-expanded', shownEN.has(s.id));
      b.lastElementChild.outerHTML = under(s);
      return;
    }
    if (b.dataset.sent != null) return sentenceSheet(find(row));
    if (b.dataset.mode) { haptic(); settings.focusMode = b.dataset.mode; showAll = false; shownEN.clear(); return renderPack(id); }
    if (a === 'back') { stopPlayAll(); page = null; return renderTraining(); }
    if (a === 'en') { showAll = !showAll; shownEN.clear(); return renderPack(id); }
    if (a === 'play') return playing ? stopPlayAll() : playHere(b);
    if (a === 'focus') return startFocus();
    if (a === 'fsettings') { stopPlayAll(); return focusSettingsSheet(mode(), { count: on ? live.length : 0, onStart: on ? startFocus : null }); }
    if (a === 'add') { haptic(); await setPackOn(id, true); return askGender(packSentences(id), () => renderPack(id), () => renderPack(id)); }
    if (a === 'packmenu') return packMenu(id);
    if (a === 'addsent') { stopPlayAll(); return newSentenceSheet({ pack: id }, { onDone: () => renderPack(id) }); }
  };
  function playHere(btn) {
    const rows = $$('.tr-row:not(.paused)', v);
    btn.innerHTML = stop; btn.setAttribute('aria-label', 'Stop'); btn.classList.add('on');
    const show = (i) => {
      $$('.tr-row.now', v).forEach((r) => r.classList.remove('now'));
      rows[i]?.classList.add('now'); rows[i]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    };
    const me = playing = createPlayer({ items: items(), mode: mode(), on: { show, end: () => { if (playing === me) stopPlayAll(); } } });
    show(0);
    me.play();
  }
}

function sayRow(b, text) {
  $$('.rv-say.playing', view).forEach((x) => x.classList.remove('playing'));
  b.classList.add('playing');
  const off = () => b.classList.remove('playing');
  speak(text, { onend: off });
  setTimeout(off, 6000);
}

// A sentence's sheet: the English behind a button, play, and (once it's yours to train) edit, its packs,
// pause and delete.
function sentenceSheet(s) {
  const text = textOf(s), live = !s.preview;
  const names = live ? s.packs.map((id) => packMeta(id)?.name).filter(Boolean).join(', ') : '';
  const body = openSheet(`<h2><span></span><button class="x">${icons.close}</button></h2>
    <div class="tr-sheet-it">${esc(text)}</div>
    <div class="tr-sheet-en" hidden>${esc(s.en)}</div>
    <button class="tr-show-en" data-a="en">Show English</button>
    ${s.ctx ? `<div class="tr-sheet-ctx">${esc(s.ctx)}</div>` : ''}
    ${s.from ? `<div class="tr-sheet-from">From <i>${esc(s.from)}</i></div>` : ''}
    ${s.reps ? `<div class="tr-sheet-from">Repeated ${s.reps === 1 ? 'once' : `${s.reps.toLocaleString()} times`}</div>` : ''}
    <div class="rv-tools tr-sheet-tools"><button data-a="play">${icons.speaker}Play</button><button data-a="slow">${stepIcon('slow')}Slow</button></div>
    ${live ? `<div class="action-list" style="margin-top:18px">
        <button data-a="edit"><span>Edit</span></button>
        <button data-a="packs"><span>Packs…</span><small class="muted">${esc(names)}</small></button>
        <button data-a="pause"><span>${s.paused ? 'Resume training this' : 'Pause training this'}</span></button>
        <button data-a="delete" class="danger"><span>Delete sentence</span></button></div>
      <p class="muted" style="font-size:13px;margin:8px 4px 0">${s.paused ? 'Paused: it stays in the pack but is left out of training.' : 'Pausing keeps it in the pack but leaves it out of training.'}</p>` : ''}`);
  const back = () => renderPack(page);
  body.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.x')) return closeSheet();
    const a = b.dataset.a;
    if (a === 'en') { $('.tr-sheet-en', body).hidden = false; b.remove(); return; }
    if (a === 'play') return speak(text);
    if (a === 'slow') return speak(text, { slow: true });
    if (a === 'pause') { await setPaused(s.id, !s.paused); closeSheet(); return back(); }
    if (a === 'edit') return editSentenceSheet(s, { onDone: back });
    if (a === 'packs') return sentencePacksSheet(s, { onDone: back });
    if (a === 'delete') {
      if (!confirm(`Delete “${text}”?${s.packs.length > 1 ? ' It’s taken out of every pack it’s in.' : ''}`)) return;
      await deleteSentence(s.id); closeSheet(); toast('Sentence deleted'); return back();
    }
  };
}

// A pack's ⋯: focus on it, add a sentence, edit or delete your own, add or remove a ready-made one.
function packMenu(id) {
  const p = packMeta(id), on = isTrained(id), focused = focusPack() === id;
  const n = packSentences(id).length, only = packSentences(id).filter((s) => s.packs.length === 1).length;
  const body = openSheet(`<h2>${esc(p.name)}<button class="x">${icons.close}</button></h2>
    <div class="action-list">
      ${on ? `<button data-a="train"${n ? '' : ' disabled'}><span>Train this pack<small class="muted">Rated; today’s plan stays as it is</small></span></button>
        <button data-a="focus"><span>${focused ? 'Stop focusing on this pack' : 'Focus on this pack'}</span><b class="pk-menu-star">★</b></button>
        <button data-a="addsent"><span>Add a sentence</span></button>` : ''}
      ${p.kind === 'own' ? '<button data-a="edit"><span>Edit pack…</span></button>' : ''}
      ${p.kind !== 'bundled' ? '<button data-a="delete" class="danger"><span>Delete pack</span></button>' : ''}
      ${p.kind === 'bundled' ? (on ? `<button data-a="off" class="danger"><span>Remove from my packs</span></button>` : '<button data-a="on"><span>Add to my packs</span></button>') : ''}
    </div>
    <p class="muted" style="font-size:13px;margin:8px 4px 0">${on ? (focused ? 'New sentences come from this pack first.' : 'Focus on a pack and its new sentences come first, one pack at a time.') : ''}
      ${p.kind === 'bundled' && on ? ' Your progress is kept if you remove it and add it again later.' : ''}</p>`);
  body.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.a;
    if (!a) return closeSheet();
    if (a === 'addsent') return newSentenceSheet({ pack: id }, { onDone: () => renderPack(id) });
    if (a === 'train') return askGender(packSentences(id), () => drillSheet({ only: id, onClose: () => renderPack(id) }));
    if (a === 'edit') return packEditSheet(p, { onDone: () => renderPack(id) });
    if (a === 'focus') { haptic(); setFocus(focused ? '' : id); closeSheet(); toast(focused ? 'No focus pack' : `Focusing on ${p.name}`); return renderPack(id); }
    if (a === 'delete') {
      const kept = n - only;
      if (!confirm(`Delete the pack “${p.name}”?${only ? ` Its ${only === 1 ? 'sentence goes' : `${only} sentences go`} too.` : ''}${kept ? ` ${kept === 1 ? 'One sentence is' : `${kept} sentences are`} in another pack too, so ${kept === 1 ? 'it stays' : 'they stay'} there.` : ''}`)) return;
      await deletePack(id); closeSheet(); page = null; toast('Pack deleted'); return renderTraining();
    }
    if (a === 'on' || a === 'off') await setPackOn(id, a === 'on');
    if (a === 'off' && focused) setFocus('');
    closeSheet();
    if (a === 'off') page = null;
    renderTraining();
  };
}

// Sentences with gendered forms ask, once, who's speaking and who to.
function askGender(list, then, cancel) {
  const needMe = !settings.trainMe && list.some((s) => /\{(?!p:)/.test(s.it));
  const needPartner = !settings.trainPartner && list.some((s) => s.it.includes('{p:'));
  if (!needMe && !needPartner) return then();
  const q = (name, label) => `<div class="field"><span>${label}</span><div class="seg tr-seg" data-name="${name}"><button data-v="m">Male</button><button data-v="f">Female</button></div></div>`;
  const body = openSheet(`<h2>Before you start<button class="x">${icons.close}</button></h2>
    <p class="muted" style="margin-top:-6px">Some sentences change with who's speaking, like <i>sono stanco</i> or <i>sono stanca</i>. You can change this in Training settings.</p>
    ${needMe ? q('trainMe', 'I am') : ''}${needPartner ? q('trainPartner', 'My partner is') : ''}
    <button class="primary" data-a="go" disabled>Continue</button>`);
  const pick = {};
  body.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.x')) { closeSheet(); return cancel?.(); }
    if (b.dataset.v) {
      const seg = b.closest('.seg');
      pick[seg.dataset.name] = b.dataset.v;
      $$('button', seg).forEach((x) => x.classList.toggle('on', x === b));
      $('[data-a=go]', body).disabled = (needMe && !pick.trainMe) || (needPartner && !pick.trainPartner);
      return;
    }
    if (b.dataset.a === 'go') { Object.assign(settings, pick); closeSheet(); return then(); }
  };
}

function trainingSettings() {
  const sel = (name, opts, num = true) => `<select name="${name}"${num ? ' data-num' : ''}>${opts.map(([v, l]) => `<option value="${v}" ${String(settings[name]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const n = (list) => list.map((x) => [x, x === 0 ? 'Off' : String(x)]);
  const body = openSheet(`<h2>Training Settings<button class="x">${icons.close}</button></h2>
    <p class="muted" style="font-size:13px;margin:-6px 0 12px">Today's plan is the same size every day, however long you've been away.</p>
    <label class="field"><span>Listen, sentences a day</span>${sel('trainListen', n([0, 2, 4, 6, 8, 10]))}</label>
    <label class="field"><span>Shadow, sentences a day</span>${sel('trainShadow', n([0, 2, 3, 4, 6, 8]))}</label>
    <label class="field"><span>Say it, sentences a day</span>${sel('trainSay', n([0, 4, 6, 8, 10, 12, 15]))}</label>
    <label class="field"><span>New sentences a day</span>${sel('trainNew', [[0, 'None'], [2, '2'], [3, '3'], [5, '5'], [8, '8'], [10, '10']])}</label>
    <label class="field"><span>Memory target</span>${sel('retention', [['relaxed', 'Relaxed · keep about 80%, fewest reviews'], ['normal', 'Normal · keep about 85%'], ['intense', 'Intense · keep about 90%, most reviews']], false)}</label>
    <div class="section-title tr-set-title">Who's speaking</div>
    <label class="field"><span>I am</span>${sel('trainMe', [['', 'Not set'], ['m', 'Male'], ['f', 'Female']], false)}</label>
    <label class="field"><span>My partner is</span>${sel('trainPartner', [['', 'Not set'], ['m', 'Male'], ['f', 'Female']], false)}</label>
    <div class="section-title tr-set-title">Words</div>
    <label class="field"><span>Word reviews</span>${sel('trainWords', [['false', 'A bonus after the sentences'], ['true', 'Part of the daily plan']], false)}</label>
    <label class="field"><span>Reviews a day (the rest wait, most useful first)</span>${sel('reviewsPerDay', [10, 20, 30, 50, 100].map((x) => [x, x]))}</label>
    <label class="field"><span>New cards a day</span>${sel('newPerDay', [0, 5, 10, 20].map((x) => [x, x]))}</label>
    <label class="field"><span>Card style</span>${sel('reviewStyle', [['mixed', 'Mixed · flashcards, pick the meaning, fill the gap'], ['flip', 'Flashcards only']], false)}</label>
    <p class="muted" style="font-size:13px;margin:-4px 0 0">Reading counts as review: gems you read past without tapping move forward, ones you look up come back sooner.</p>`, { onClose: () => renderTraining() });
  body.onclick = (e) => { if (e.target.closest('.x')) closeSheet(); };
  body.oninput = (e) => {
    const t = e.target; if (!t.name) return;
    settings[t.name] = t.dataset.num != null ? +t.value : t.value === 'true' ? true : t.value === 'false' ? false : t.value;
  };
}

// Leaving the tab stops Play all and goes back to the tab itself next time.
export function leaveTraining() { stopPlayAll(); page = null; }
