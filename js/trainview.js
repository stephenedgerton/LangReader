// The Training tab: today's plan, your packs as covers on shelves, and each pack's own page (back arrow,
// not a sheet) with its sentences in Italian only, each one playable. Plus Training's settings.
import { settings } from './settings.js';
import { esc, icons, openSheet, closeSheet, $, $$ } from './ui.js';
import { speak, stopSpeaking } from './services.js';
import { haptic } from './haptics.js';
import { getDays } from './stats.js';
import { level, learned, isNew, genderize } from './sentences.js';
import { STEPS, loadSentences, syncPacks, packOn, setPackOn, packSentences, todaysPlan, minutes, doneToday, sizes, textOf, trainingStreak, setPaused, sentence } from './training.js';
import { drillSheet, stepIcon } from './drill.js';
import { reviewSheet, todaysCount, reviewedToday } from './review.js';
import { PACKS, packInfo, loadPack } from '../samples/packs/index.js';

let page = null;        // the pack whose page is open, or null for the tab itself
let showEN = false;
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
  const allDone = steps.every((s) => s.done);
  return { plan, steps, allDone, started: steps.some((s) => s.did), mins: minutes(plan), streak: trainingStreak(await getDays()) };
}

// Home's card: one line about today, opening the tab.
export async function trainingCardHTML() {
  const t = await trainingToday();
  const line = t.allDone ? `Done for today${t.streak ? ` · 🔥 ${t.streak} day${t.streak === 1 ? '' : 's'}` : ''}`
    : `${t.steps.filter((s) => !s.done).length} step${t.steps.filter((s) => !s.done).length === 1 ? '' : 's'} ${t.started ? 'left' : ''} · about ${t.mins} min`;
  return `<button class="card review-card training-card${t.allDone ? ' done' : ''}" data-act="training"><div class="rv-ico">${t.allDone ? '✓' : stepIcon('say')}</div>
    <div><h4>Today's Training</h4><p>${line.replace('  ', ' ')}</p></div><span class="chev">›</span></button>`;
}

const cover = (p, big = false) => `<div class="cover pack-cover${big ? ' big' : ''}" style="background:linear-gradient(160deg, ${p.colors[1]}, ${p.colors[0]})">
  <div><div class="ce">${p.emoji}</div><div class="ct">${esc(p.name)}</div></div><div class="ca">Ready-made</div></div>`;

function packStats(id) {
  const list = packSentences(id), now = Date.now(), end = new Date(); end.setHours(23, 59, 59, 999);
  return {
    n: list.length || counts.get(id) || 0,
    learned: list.filter(learned).length,
    due: list.filter((s) => !s.paused && ['listen', 'say'].some((d) => s.cards?.[d] && s.cards[d].due <= +end)).length,
    started: list.some((s) => !isNew(s)),
  };
}

function todayHTML(t) {
  const C = 2 * Math.PI * 28;
  if (!t.steps.length) return `<div class="card tr-today"><p class="muted">Every step is set to 0. Change that in Training settings (⚙︎).</p></div>`;
  const rings = `<div class="tr-rings">${t.steps.map((s) => `<div class="tr-ring${s.done ? ' done' : ''}"><div class="ring"><svg viewBox="0 0 68 68"><circle class="track" cx="34" cy="34" r="28"/>
      <circle class="prog" cx="34" cy="34" r="28" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - s.frac)}"/></svg><div class="ring-n">${s.done ? icons.check : stepIcon(s.k)}</div></div>
      <b>${s.name}</b><span>${s.done ? 'Done' : s.left}</span></div>`).join('')}</div>`;
  if (t.allDone) {
    return `<div class="card tr-today all-done">${rings}<div class="tr-foot"><div><div class="big">Done for today</div>
      <p>${t.streak ? `🔥 ${t.streak} day${t.streak === 1 ? '' : 's'} in a row · ` : ''}Come back tomorrow for a fresh set.</p></div>
      <button class="resume soft" data-act="more">More</button></div></div>`;
  }
  return `<div class="card tr-today">${rings}<div class="tr-foot"><div><div class="big">About ${t.mins} min</div>
    <p>${t.steps.filter((s) => !s.done).length} step${t.steps.filter((s) => !s.done).length === 1 ? '' : 's'} ${t.started ? 'left' : 'today'}${t.streak ? ` · 🔥 ${t.streak}` : ''}</p></div>
    <button class="resume" data-act="start">${t.started ? 'Continue' : 'Start'}</button></div></div>`;
}

function shelfItem(p) {
  const on = packOn(p.id), st = packStats(p.id);
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
  const mine = PACKS.filter((p) => packOn(p.id)), more = PACKS.filter((p) => !packOn(p.id));
  v.innerHTML = `
    <div class="view-head"><h1 class="large-title">Training</h1>
      <button class="circle-btn" data-act="settings" aria-label="Training settings">${icons.gear}</button></div>
    <div class="section-title">Today's Training</div>
    ${todayHTML(t)}
    ${!settings.trainWords && (words || wordsDone) ? `<button class="card review-card tr-words" data-act="words"><div class="rv-ico">${words ? icons.cards : '✓'}</div>
      <div><h4>${words ? `Bonus: ${words} word${words === 1 ? '' : 's'}` : 'Words done for today'}</h4><p>${words ? 'Your gems, if you’ve got a couple more minutes' : `${wordsDone} reviewed. Practise more if you like.`}</p></div><span class="chev">›</span></button>` : ''}
    <div class="section-title">Your Packs</div>
    ${mine.length ? `<div class="shelf">${mine.map(shelfItem).join('')}</div>` : '<p class="muted tr-empty">Add a pack below to start training.</p>'}
    ${more.length ? `<div class="section-title">More to Add</div><div class="shelf">${more.map(shelfItem).join('')}</div>` : ''}`;
  v.onclick = (e) => {
    const b = e.target.closest('[data-act],[data-pack]'); if (!b) return;
    if (b.dataset.pack) { page = b.dataset.pack; showEN = false; window.scrollTo?.(0, 0); v.scrollTop = 0; return renderPack(page); }
    const a = b.dataset.act;
    if (a === 'start') return startToday();
    if (a === 'more') return moreSheet();
    if (a === 'words') return reviewSheet({ onClose: () => renderTraining() });
    if (a === 'settings') return trainingSettings();
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
let playing = null;
function stopPlayAll() {
  if (!playing) return;
  playing.stop = true; playing = null;
  stopSpeaking();
  if (view) { $$('.tr-row.now', view).forEach((r) => r.classList.remove('now')); const b = $('[data-act=playall]', view); if (b) b.innerHTML = `${play} Play all`; }
}

async function renderPack(id) {
  const v = view, p = packInfo(id);
  if (!p) { page = null; return renderTraining(); }
  const on = packOn(id);
  // A pack that isn't on yet shows its sentences straight from the pack file.
  const list = on ? packSentences(id) : (await loadPack(id)).map((x) => ({ id: `${id}:${x.k}`, it: x.it, en: x.en, ctx: x.ctx, cards: {}, preview: true }));
  const st = packStats(id);
  const text = (s) => genderize(s.it, settings.trainMe || 'm', settings.trainPartner || 'm');
  const lv = (s) => {
    if (s.preview) return '';
    if (s.paused) return '<span class="tr-tag">Paused</span>';
    const n = level(s);
    if (!n) return '<span class="tr-tag new">New</span>';
    if (n === 5) return `<span class="tr-tag done">${icons.check}</span>`;
    return `<span class="lvl" aria-label="Level ${n} of 4">${[1, 2, 3, 4].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  };
  v.innerHTML = `
    <div class="tr-nav"><button class="tr-back" data-act="back">${back}Training</button>
      <button class="circle-btn" data-act="packmenu" aria-label="Pack options">${icons.more}</button></div>
    <div class="hero-book tr-hero">${cover(p, true)}
      <div class="hero-meta"><div class="kicker">Ready-made · ${list.length} sentences</div>
        <h3>${esc(p.name)}</h3>
        <div class="author">${on ? `${st.learned} learned${st.due ? ` · ${st.due} due` : ''}` : 'Not in your training yet'}</div>
        <div class="tr-hero-btns">${on ? '<button class="resume" data-act="train">Train</button>' : '<button class="resume" data-act="add">Add to my packs</button>'}</div>
      </div></div>
    <p class="tr-blurb">${esc(p.blurb)}</p>
    <div class="tr-list-head"><div class="section-title">Sentences</div>
      <div><button data-act="playall">${play} Play all</button><button data-act="en">${showEN ? 'Hide English' : 'Show English'}</button></div></div>
    <div class="tr-list">${list.map((s) => `<div class="tr-row${s.paused ? ' paused' : ''}" data-id="${esc(s.id)}">
        <button class="rv-say" data-play aria-label="Play">${icons.speaker}</button>
        <button class="txt" data-sent><div class="it">${esc(text(s))}</div>${showEN ? `<div class="en">${esc(s.en)}</div>` : ''}</button>${lv(s)}</div>`).join('')}</div>
    <p class="muted tr-tip">${showEN ? 'Tap Hide English to test yourself again.' : 'The English is hidden so the list doesn’t give the answers away. Tap a sentence to see it.'}</p>`;
  const rowText = (row) => text(list.find((s) => s.id === row.dataset.id));
  v.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const row = b.closest('.tr-row'), a = b.dataset.act;
    if (b.dataset.play != null) { stopPlayAll(); return sayRow(b, rowText(row)); }
    if (b.dataset.sent != null) return sentenceSheet(list.find((s) => s.id === row.dataset.id));
    if (a === 'back') { stopPlayAll(); page = null; return renderTraining(); }
    if (a === 'en') { showEN = !showEN; stopPlayAll(); return renderPack(id); }
    if (a === 'playall') return playing ? stopPlayAll() : playAll(b);
    if (a === 'train') { stopPlayAll(); return askGender(packSentences(id), () => drillSheet({ only: id, onClose: () => renderPack(id) })); }
    if (a === 'add') { haptic(); await setPackOn(id, true); return askGender(packSentences(id), () => renderPack(id), () => renderPack(id)); }
    if (a === 'packmenu') return packMenu(id);
  };
  // Play all: each sentence in turn, with a short pause between, highlighting the one that's playing.
  function playAll(btn) {
    const rows = $$('.tr-row:not(.paused)', v);
    const me = playing = { stop: false };
    btn.innerHTML = `${stop} Stop`;
    let i = 0;
    const next = () => {
      if (me.stop) return;
      $$('.tr-row.now', v).forEach((r) => r.classList.remove('now'));
      if (i >= rows.length || !rows[i].isConnected) { if (playing === me) stopPlayAll(); return; }
      const row = rows[i++];
      row.classList.add('now');
      row.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      let went = false;
      const go = () => { if (!went) { went = true; setTimeout(next, 900); } };
      speak(rowText(row), { onend: go });
      setTimeout(go, Math.max(2500, rowText(row).length * 110)); // if the voice never says it's done
    };
    next();
  }
}

function sayRow(b, text) {
  $$('.rv-say.playing', view).forEach((x) => x.classList.remove('playing'));
  b.classList.add('playing');
  const off = () => b.classList.remove('playing');
  speak(text, { onend: off });
  setTimeout(off, 6000);
}

function sentenceSheet(s) {
  const text = textOf(s), live = !s.preview;
  const body = openSheet(`<h2><span></span><button class="x">${icons.close}</button></h2>
    <div class="tr-sheet-it">${esc(text)}</div>
    <div class="tr-sheet-en" hidden>${esc(s.en)}</div>
    <button class="tr-show-en" data-a="en">Show English</button>
    ${s.ctx ? `<div class="tr-sheet-ctx">${esc(s.ctx)}</div>` : ''}
    <div class="rv-tools tr-sheet-tools"><button data-a="play">${icons.speaker}Play</button><button data-a="slow">${stepIcon('slow')}Slow</button></div>
    ${live ? `<div class="action-list" style="margin-top:18px"><button data-a="pause"><span>${s.paused ? 'Resume training this' : 'Pause training this'}</span></button></div>
      <p class="muted" style="font-size:13px;margin:8px 4px 0">${s.paused ? 'Paused: it stays in the pack but is left out of training.' : 'Pausing keeps it in the pack but leaves it out of training.'}</p>` : ''}`);
  body.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.x')) return closeSheet();
    if (b.dataset.a === 'en') { $('.tr-sheet-en', body).hidden = false; b.remove(); return; }
    if (b.dataset.a === 'play') return speak(text);
    if (b.dataset.a === 'slow') return speak(text, { slow: true });
    if (b.dataset.a === 'pause') { await setPaused(s.id, !s.paused); closeSheet(); return renderPack(page); }
  };
}

function packMenu(id) {
  const p = packInfo(id), on = packOn(id);
  const body = openSheet(`<h2>${esc(p.name)}<button class="x">${icons.close}</button></h2>
    <div class="action-list">${on ? `<button data-a="off" class="danger"><span>Remove from my packs</span></button>` : '<button data-a="on"><span>Add to my packs</span></button>'}</div>
    ${on ? '<p class="muted" style="font-size:13px;margin:8px 4px 0">Your progress is kept if you add it again later.</p>' : ''}`);
  body.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a) await setPackOn(id, b.dataset.a === 'on');
    closeSheet();
    if (b.dataset.a === 'off') page = null;
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
