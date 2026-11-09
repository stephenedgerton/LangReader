// Training's session, full screen: today's steps one after another (Listen, Shadow, Say it). Each step's intro
// shows the first time only (langreader.trainIntros; ⓘ on the step line shows it again). It's laid out like
// Focus mode (focus.js): the step's toggle row at the top, the sentence in the middle, the actions and grades
// pinned at the bottom. You rate yourself (Listen: Didn't get it / Mostly / Got it; Say it: Focus's four);
// nothing listens to you. The toggles share Focus mode's settings: Listen and Shadow use Shadowing's, Say it
// Recall's, except Listen's Translation, which is its own (settings.trainListenEn). ⚙︎ in the header opens the
// step's settings in the same sheet. Shadow plays through createPlayer(), and Next shows once its repeats are done
// (with the Auto next toggle, settings.trainShadowAuto, the next sentence starts by itself).
//   drillSheet()                    today's plan
//   drillSheet({ extra: 10 })       "Train 10 more" once today's is done (counts as today's work)
//   drillSheet({ only: packId })    one pack's due and new sentences; rated for real, but today's plan is untouched
//   drillSheet({ practice: ids })   "Go over the ones I missed": Say it once more, with no rating
// A pack's hands-free playing (Shadowing and Recall) is Focus mode, in focus.js.
import { settings } from './settings.js';
import { openSheet, closeSheet, esc, icons, $, $$ } from './ui.js';
import { speak, stopSpeaking } from './services.js';
import { haptic } from './haptics.js';
import { celebrate } from './celebrate.js';
import { tokenize, normalize } from './text.js';
import { openCardBubble, closeBubble, bubbleOpen } from './bubble.js';
import { entry } from './vocab.js';
import { bump } from './stats.js';
import { AGAIN, HARD, GOOD } from './srs.js';
import { hint } from './sentences.js';
import { STEPS, todaysPlan, sentence, textOf, rateCard, undoRate, countDone, markToday, doneToday, stepFinished, packMeta, countRep } from './training.js';
import { todaysCount, reviewSheet } from './review.js';
import { createPlayer, ringHTML, repsHTML, ringPhase, ringReps, focusCfg, toggleRowHTML, flipToggle, settingsHTML, bindSettings, MODES, GRADES } from './focus.js';

const ICON = {
  listen: '<svg viewBox="0 0 24 24"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="6.5" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.5"/></svg>',
  shadow: '<svg viewBox="0 0 24 24"><path d="M3 12h3l2-5 3 10 2.5-7 1.5 2h6"/></svg>',
  say: '<svg viewBox="0 0 24 24"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z"/><path d="M8.5 9h7M8.5 12h4.5"/></svg>',
  words: icons.cards,
  play: '<svg viewBox="0 0 24 24" class="solid"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" class="solid"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  slow: '<svg viewBox="0 0 24 24"><path d="M4 16c0-4 3.5-7 8-7s8 3 8 7z"/><path d="M8 16v3M16 16v3M20 13l1.5-1"/></svg>',
  bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/></svg>',
  en: '<svg viewBox="0 0 24 24"><path d="M4 5h9M8.5 3v2M6 5c.5 3 2.5 6 6 8M11 5c-.5 3-3 7-7 8.5M13 20l3.5-9 3.5 9M14.2 17h4.6"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
};
export const stepIcon = (k) => ICON[k];
// Listen is recognition: no Easy.
const LISTEN_GRADES = [[AGAIN, 'Didn’t get it', 'again'], [HARD, 'Mostly', 'hard'], [GOOD, 'Got it', 'good']];
// Which Focus mode's settings each step uses, and which toggles it shows.
const CFG = { listen: 'shadow', shadow: 'shadow', say: 'recall' };
const TOGS = { listen: ['en', 'speed'], shadow: ['en', 'dual', 'rep', 'speed', 'auto'], say: ['dual', 'speed'] };
// Shadow's "Auto": the next sentence starts by itself once the repeats are done, hands-free.
const AUTO_WAIT = 1200;

// Step intros show the first time only; the steps you've seen are kept on this device.
const INTRO_KEY = 'langreader.trainIntros';
const introsSeen = () => { try { return JSON.parse(localStorage.getItem(INTRO_KEY)) || []; } catch { return []; } };
function sawIntro(k) {
  const seen = introsSeen();
  if (seen.includes(k)) return;
  try { localStorage.setItem(INTRO_KEY, JSON.stringify([...seen, k])); } catch {}
}

// The sentence with each word tappable and coloured by your vocabulary (blue New, yellow gem).
export function sentenceHTML(text) {
  return tokenize(text).map((t) => {
    if (t.type !== 'w') return esc(t.text);
    const st = entry(normalize(t.text))?.status ?? 0;
    return `<span class="cw${st >= 0 && st <= 4 ? ' s' + st : ''}" data-w="${esc(t.text)}">${esc(t.text)}</span>`;
  }).join('');
}

export function drillSheet({ only = null, extra = 0, practice = null, onClose } = {}) {
  const counts = !only && !practice;
  let steps;
  if (practice) steps = [{ k: 'say', ids: practice, practice: true }];
  else {
    const plan = todaysPlan({ extra, only });
    steps = STEPS.filter((s) => plan[s.k].length).map((s) => ({ k: s.k, ids: plan[s.k] }));
    if (counts && settings.trainWords && todaysCount() && !doneToday().skipped.includes('words')) steps.push({ k: 'words', ids: [] });
  }
  const title = only ? packMeta(only)?.name || 'Pack' : practice ? 'Missed sentences' : extra ? 'Extra Training' : "Today's Training";
  const onKey = (e) => keydown(e);
  const body = openSheet('', { full: true, onClose: () => { removeEventListener('keydown', onKey); closeBubble(); stopShadow(); holdWake(false); stopSpeaking(); saving.catch(() => {}).then(() => onClose?.()); } });
  body.classList.add('drill');
  addEventListener('keydown', onKey);

  let si = 0, ii = -1, cur = null, busy = false, saving = Promise.resolve(), info = false, setFor = null;
  const undo = [], tally = { n: 0, again: 0, shadowed: 0 }, missed = [];
  const total = steps.reduce((n, s) => n + s.ids.length, 0);
  const doneItems = () => steps.slice(0, si).reduce((n, s) => n + s.ids.length, 0) + Math.max(0, ii);
  const cfg = () => focusCfg(CFG[cur.st.k]);
  const rate = () => cfg().speed || 1;

  const head = () => `<h2><span>${esc(title)}</span><span class="rv-hbtns">${undo.length ? `<button class="rv-undo" aria-label="Undo">${ICON.undo}</button>` : ''}${cur ? `<button class="fc-gear" data-gear aria-label="Settings">${icons.gear}</button>` : ''}<button class="x" aria-label="Close">${icons.close}</button></span></h2>
    <div class="progress-line"><i style="width:${total ? (doneItems() / total) * 100 : 0}%"></i></div>`;
  const stepLine = () => {
    const { st } = cur;
    return `<div class="dr-step"><span class="dr-step-name"><b>${STEPS.find((x) => x.k === st.k).name}</b><button class="dr-info" data-info aria-label="How this step works">${ICON.info}</button></span>
      <span>${ii + 1} of ${st.ids.length}${st.practice ? '' : '<button class="dr-skip" data-skip-step>Skip step</button>'}</span></div>
      ${togs()}`;
  };
  const listenEn = () => settings.trainListenEn !== 'tap';
  const togs = () => toggleRowHTML(CFG[cur.st.k], TOGS[cur.st.k], cur.st.k === 'listen' ? { en: listenEn() } : { auto: !!settings.trainShadowAuto });
  const say = (text, isSlow = false) => `<button class="dr-say" data-say="${esc(text)}"${isSlow ? ' data-slow' : ''}>${isSlow ? ICON.slow : icons.speaker}${isSlow ? 'Slow' : 'Play'}</button>`;

  const render = () => {
    closeBubble();
    stopShadow();
    if (si >= steps.length) return renderEnd();
    const st = steps[si];
    if (ii >= st.ids.length) { if (counts && !st.skipped && st.ids.length) stepFinished(); si++; ii = -1; return render(); }
    $('#sheet').scrollTop = 0;
    if (ii < 0 && (st.k === 'words' || !introsSeen().includes(st.k))) return renderIntro(st);
    if (info) return renderIntro(st);
    if (ii < 0) ii = 0;
    const s = sentence(st.ids[ii]);
    if (!s) { ii++; return render(); }
    cur = { st, s, text: textOf(s), hint: 0, revealed: false, tapEN: false, tapIt: false };
    if (st.k === 'shadow') return renderShadow();
    drawCard(true);
    // In the tap that brought this card, for iOS.
    if (st.k === 'listen') playBtn($('.dr-disc', body));
    else if (cfg().enFirst && s.en) speak(s.en, { lang: 'en', rate: cfg().speed || 1 });
  };

  const drawCard = (enter) => {
    body.innerHTML = `${head()}${stepLine()}
      <div class="dr-main"><div class="flash${enter ? ' enter' : ''}${cur.revealed ? ' flipped' : ''} dr-${cur.st.k}">${cardHTML()}</div></div>
      <div class="fc-bottom dr-bottom">${actionsHTML()}</div>`;
  };

  // ---------- the step's settings, in this same sheet; Done comes back to the card ----------
  const openSettings = () => {
    closeBubble(); stopShadow(); stopSpeaking();
    setFor = cur;
    const k = cur.st.k, mode = CFG[k];
    const listen = k === 'listen' ? `<div class="section-title fc-set-title">Listen</div>
      <div class="ts-group"><label class="ts-item"><span class="lbl">English<small>On the back of the card</small></span>
        <select data-train="trainListenEn"><option value="shown"${listenEn() ? ' selected' : ''}>Shown</option><option value="tap"${listenEn() ? '' : ' selected'}>Tap to reveal</option></select></label></div>` : '';
    body.innerHTML = `<h2><span>${STEPS.find((x) => x.k === k).name} Settings</span><span class="rv-hbtns"><button class="fc-done-set" data-close-set>Done</button></span></h2>
      <div class="fc-settings">${listen}${settingsHTML(mode, { note: `Shared with Focus mode’s ${MODES[mode].name}.${k === 'listen' ? ' The English above is Listen’s own.' : ''}` })}</div>`;
  };
  const closeSettings = () => {
    cur = setFor; setFor = null;
    cur.tapEN = false;
    // Shadow starts the sentence again with the new settings (in this tap, for iOS); a card comes back as it was.
    if (cur.st.k === 'shadow') return render();
    drawCard(false);
  };
  bindSettings(body, () => CFG[setFor.st.k]);
  body.addEventListener('change', (e) => { const k = e.target.dataset?.train; if (k) settings[k] = e.target.value; });

  const renderIntro = (st) => {
    const back = info;
    cur = null; info = false;
    if (st.k === 'words') {
      body.innerHTML = `${head()}<div class="dr-intro"><div class="dr-ico">${ICON.words}</div><h3>Words</h3><p>Your gems, as in reviews.</p><small>${todaysCount()} cards</small></div>
        <button class="primary" data-words>Start Words</button><button class="link-btn" data-skip-step>Skip for today</button>`;
      return;
    }
    const s = STEPS.find((x) => x.k === st.k);
    body.innerHTML = `${head()}<div class="dr-intro"><div class="dr-ico">${ICON[st.k]}</div><h3>${s.name}</h3><p>${s.how}</p>
        <small>${st.ids.length} ${s.what}${steps.length > 1 ? ` · step ${si + 1} of ${steps.length}` : ''}</small></div>
      <button class="primary" data-go>${back ? 'Carry on' : `Start ${s.name}`}</button>${st.practice ? '' : '<button class="link-btn" data-skip-step>Skip this step today</button>'}`;
  };

  const ctxChip = () => (cur.s.ctx ? `<span class="dr-ctx">${esc(cur.s.ctx)}</span>` : '');
  // The English under the Italian, as the Translation toggle has it (or tap to show it).
  const enMode = () => (cur.st.k === 'listen' ? (listenEn() ? 'shown' : 'tap') : cfg().en);
  const enHTML = (en) => (cur.tapEN || enMode() === 'shown' ? `<div class="dr-en">${esc(en)}</div>`
    : enMode() === 'tap' ? '<button class="fc-hidden en" data-reveal="en">Tap to show the English</button>' : '');
  const cardHTML = () => {
    const { st, s, text } = cur;
    const back = `${ctxChip()}<div class="dr-it">${sentenceHTML(text)}</div>${st.k === 'say' ? `<div class="dr-en">${esc(s.en)}</div>` : enHTML(s.en)}
      <div class="rv-tools">${say(text)}${say(text, true)}</div>`;
    let front;
    if (st.k === 'listen') {
      front = `${ctxChip()}<div class="q-label">What did you hear?</div>
        <button class="dr-disc" data-say="${esc(text)}" aria-label="Play again">${ICON.play}</button>
        <div class="rv-tools">${say(text, true)}</div>`;
    } else {
      // The context sits next to the prompt, since it's what tells you which Italian is meant.
      front = `<div class="q-label">Say it in Italian</div><div class="dr-prompt">${esc(s.en)}${s.ctx ? ` <span class="dr-ctx">${esc(s.ctx)}</span>` : ''}</div>
        <div class="dr-hint">${cur.hint ? `<div class="dr-hint-text">${esc(hint(text, cur.hint))}</div>` : ''}
          <button class="dr-hint-btn" data-hint>${ICON.bulb}${['Hint', 'More', 'Show it'][cur.hint]}<span class="dots">${[1, 2, 3].map((n) => `<i class="${n <= cur.hint ? 'on' : ''}"></i>`).join('')}</span></button>
          ${cur.hint ? `<small>${cur.hint < 2 ? 'With a hint, the best rating is Hard' : 'Next tap shows the answer and counts as Again'}</small>` : ''}</div>`;
    }
    return `<div class="card3d"><div class="face front">${front}</div><div class="face back">${back}</div></div>`;
  };
  const actionsHTML = () => {
    if (!cur.revealed) return `${cur.st.k === 'say' ? '<div class="fc-rate-label">Say it out loud first.</div>' : ''}<button class="primary" data-flip>${cur.st.k === 'listen' ? 'Show the sentence' : 'I’ve said it, check'}</button>`;
    if (cur.st.practice) return `<div class="review-btns"><button class="again" data-r="${AGAIN}">Still learning</button><button class="good" data-r="${GOOD}">Got it</button></div>`;
    if (cur.hint >= 3) return `<button class="primary" data-r="${AGAIN}">Next (counts as Again)</button>`;
    const grades = cur.st.k === 'listen' ? LISTEN_GRADES : GRADES;
    return `<div class="fc-rate-label">${cur.hint ? 'You used a hint, so the best rating is Hard.' : cur.st.k === 'listen' ? 'Did you understand it?' : 'How close were you? Tap a word to look it up.'}</div>
      <div class="review-btns fc-rate ${grades.length === 3 ? 'three' : 'four'}">${grades.map(([g, l, c]) => `<button class="${c}" data-r="${g}"${cur.hint && g > HARD ? ' disabled' : ''}>${l}</button>`).join('')}</div>`;
  };

  const reveal = () => {
    if (!cur || cur.revealed) return;
    cur.revealed = true;
    if (cur.st.k === 'say') speak(cur.text, { rate: rate() });
    $('.flash', body).classList.add('flipped');
    $('.dr-bottom', body).innerHTML = actionsHTML();
  };
  const moreHint = () => {
    if (!cur || cur.revealed) return;
    haptic();
    cur.hint++;
    // With one word, the first hint would be the whole answer: go straight to its first letter.
    if (cur.hint === 1 && tokenize(cur.text).filter((t) => t.type === 'w').length < 2) cur.hint = 2;
    if (cur.hint >= 3) return reveal();
    $('.flash .card3d', body).outerHTML = cardHTML();
  };

  const grade = (g) => {
    if (busy || !cur) return;
    haptic();
    const { st, s } = cur;
    const pos = { si, ii, tally: { ...tally }, missed: [...missed] };
    tally.n++;
    if (g === AGAIN) { tally.again++; if (!missed.includes(s.id)) missed.push(s.id); }
    countRep(s.id);
    if (st.practice) { undo.push({ pos }); ii++; return render(); }
    busy = true;
    // The next card renders straight away, in this tap (so Listen can play on iOS); the save follows.
    const job = saving = rateCard(s.id, st.k, g, { count: counts });
    ii++; render();
    job.then((snap) => { undo.push({ pos, snap }); refreshHead(); }).finally(() => { busy = false; });
  };
  const refreshHead = () => {
    if (setFor) return;
    const h = $('h2 .rv-hbtns', body);
    if (h && undo.length && !$('.rv-undo', h)) h.insertAdjacentHTML('afterbegin', `<button class="rv-undo" aria-label="Undo">${ICON.undo}</button>`);
  };
  const undoLast = async () => {
    if (busy || !undo.length) return;
    busy = true;
    const u = undo.pop();
    try {
      if (u.snap) await undoRate(u.snap);
      if (u.shadow && counts) { countDone('shadow', -1); markToday('shadowed', u.shadow, false); }
    } finally { busy = false; }
    ({ si, ii } = u.pos);
    Object.assign(tally, u.pos.tally); missed.length = 0; missed.push(...u.pos.missed);
    render();
  };

  // ---------- Shadow: Focus's Shadowing for one sentence (listen, your turn, × Repeat); then Next ----------
  let player = null;
  let autoTimer = 0, wake = null;
  function stopShadow() { clearTimeout(autoTimer); player?.stop(); player = null; }
  const autoNext = () => {
    clearTimeout(autoTimer);
    const mine = cur;
    autoTimer = setTimeout(() => { if (cur === mine && cur.done && !setFor && !bubbleOpen()) nextShadow(); }, AUTO_WAIT);
  };
  // While Auto is on, keep the screen awake through Shadow, as Focus mode does.
  const holdWake = (on) => {
    if (on && !wake) { wake = navigator.wakeLock?.request('screen').then((l) => l, () => null) || null; }
    if (!on && wake) { wake.then((l) => l?.release().catch(() => {})); wake = null; }
  };
  const shadowText = () => {
    const c = cfg(), rep = player?.rep || 0;
    const showIT = cur.tapIt || c.it === 'shown' || (c.it === 'later' && rep === 0);
    return `${showIT ? `<div class="dr-it">${sentenceHTML(cur.text)}</div>`
      : '<button class="fc-hidden" data-reveal="it">Italian hidden<small>Tap to show it</small></button>'}${enHTML(cur.s.en)}`;
  };
  const shadowActions = () => (cur.done
    ? '<button class="primary" data-next>Next sentence</button><button class="link-btn" data-again>Once more</button>'
    : `<button class="secondary dr-pause" data-toggle>${player?.playing ? `${ICON.pause}Pause` : `${ICON.play}Play`}</button>`);
  const renderShadow = () => {
    const { s } = cur;
    if (settings.trainShadowAuto) holdWake(true);
    cur.done = false;
    body.innerHTML = `${head()}${stepLine()}
      <div class="dr-main dr-shadow">
        ${!s.cards?.say && !s.cards?.listen ? '<span class="dr-new">New today</span>' : ''}
        ${ringHTML()}
        <div class="dr-shadow-text">${shadowText()}</div>
        ${repsHTML(cfg().repeats)}
      </div>
      <div class="fc-bottom dr-bottom">${shadowActions()}</div>`;
    const ring = $('.dr-ring', body);
    const bottom = () => { $('.dr-bottom', body).innerHTML = shadowActions(); };
    const mine = cur;
    player = createPlayer({
      items: [{ id: s.id, text: cur.text, en: s.en }], mode: 'shadow',
      config: () => ({ ...focusCfg('shadow'), loop: false }),
      on: {
        phase: (name, { rep, ms }) => {
          if (cur !== mine) return;
          ringPhase(ring, name, ms);
          if (name === 'rep') {
            ringReps(body, rep);
            $('.dr-shadow-text', body).innerHTML = shadowText();
          }
          if (name === 'done') {
            cur.done = true; bottom();
            if (settings.trainShadowAuto) autoNext();
          }
        },
        state: () => { if (cur === mine && !cur.done) bottom(); },
      },
    });
    player.play(); // in the tap that brought this sentence, for iOS
  };
  const nextShadow = () => {
    if (!cur || !cur.done) return;
    haptic();
    clearTimeout(autoTimer);
    if (counts) { countDone('shadow'); markToday('shadowed', cur.s.id); }
    tally.shadowed++; bump('drills');
    undo.push({ pos: { si, ii, tally: { ...tally, shadowed: tally.shadowed - 1 }, missed: [...missed] }, shadow: cur.s.id });
    ii++; render();
  };
  const shadowAgain = () => {
    clearTimeout(autoTimer);
    cur.done = false;
    ringReps(body, 0);
    $('.dr-bottom', body).innerHTML = shadowActions();
    player.goto(0); player.play();
  };

  // ---------- the end ----------
  const renderEnd = async () => {
    cur = null;
    body.innerHTML = head();
    await saving.catch(() => {}); // what's left today counts the last card too
    const daily = counts;
    const left = daily ? todaysPlan() : null;
    const allDone = daily && STEPS.every((s) => !left[s.k].length);
    const more = daily && allDone ? todaysPlan({ extra: 10 }) : null;
    const moreN = more ? more.listen.length + more.say.length : 0;
    const words = !settings.trainWords && todaysCount();
    const missedList = missed.map(sentence).filter(Boolean);
    const did = tally.n || tally.shadowed;
    body.innerHTML = `${head()}<div class="rv-done${did ? ' celebrating' : ''}">
        <div class="dr-done-ico">${icons.check}</div>
        <h3>${practice ? 'That’s all of them' : only ? 'Pack session done' : allDone ? 'Done for today' : 'Done for now'}</h3>
        <div class="rv-done-line">${tally.n ? `${tally.n} card${tally.n === 1 ? '' : 's'}${tally.shadowed ? ` · ${tally.shadowed} shadowed` : ''}${tally.again ? ` · ${tally.again} to go over` : ''}` : tally.shadowed ? `${tally.shadowed} shadowed` : 'Nothing was due.'}</div>
        ${only ? '<div class="rv-done-sub">Ratings saved. Today’s plan is unchanged.</div>' : daily && !allDone ? '<div class="rv-done-sub">The rest of today’s training is waiting on the Training tab.</div>' : ''}
      </div>
      ${missedList.length ? `<div class="section-title dr-missed-title">${practice ? 'Still learning' : 'The ones you missed'}</div>
        <div class="dr-missed">${missedList.map((s) => `<div class="dr-mrow"><button class="dr-mplay" data-say="${esc(textOf(s))}" aria-label="Play">${ICON.play}</button>
          <div><div class="dr-mit">${sentenceHTML(textOf(s))}</div><div class="dr-men">${esc(s.en)}</div></div></div>`).join('')}</div>` : ''}
      ${daily && words ? `<button class="card review-card dr-bonus" data-words><div class="rv-ico">${icons.cards}</div><div><h4>Bonus: ${words} words</h4><p>Your gems, if you’ve got a couple more minutes</p></div><span class="chev">›</span></button>` : ''}
      <button class="primary" data-done>Done</button>
      ${moreN || (missed.length && !practice) ? `<div class="rv-more"><div class="rv-more-title">Want to keep going? <span>Only if you feel like it.</span></div>
        ${moreN ? `<button class="secondary" data-extra>Train ${Math.min(10, moreN)} more</button>` : ''}
        ${missed.length && !practice ? `<button class="secondary" data-missed>Go over the ${missed.length === 1 ? 'one' : missed.length} I missed</button>` : ''}</div>` : ''}`;
    // The whole day's plan done gets the full celebration; a part of it, a pack or extras a smaller one.
    if (did) celebrate($('.dr-done-ico', body), { big: allDone && !practice });
  };

  // ---------- looking up a word on the card: the reader's bubble ----------
  const showWord = (span) => { player?.pause(); openCardBubble(span, { root: body, context: span.closest('.dr-mrow')?.querySelector('.dr-mit')?.textContent || cur?.text || '' }); };

  const playBtn = (b) => {
    $$('.playing', body).forEach((x) => x.classList.remove('playing'));
    b.classList.add('playing');
    const off = () => b.classList.remove('playing');
    const speed = cur ? cfg().speed || 1 : 1;
    speak(b.dataset.say, { rate: speed, slow: b.dataset.slow != null, onend: off });
    setTimeout(off, 8000);
  };

  // Space flips (or, in Shadow, pauses and moves on once it's done), H hints, 1–4 rate, Z undoes.
  function keydown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select')) return;
    const k = e.key;
    if (k === 'Escape' && bubbleOpen()) { e.preventDefault(); return closeBubble(); }
    if (setFor) return;
    if (k === 'z' || k === 'Z') { e.preventDefault(); return undoLast(); }
    if (!cur) { if (k === ' ' || k === 'Enter') { e.preventDefault(); $('[data-go], [data-done]', body)?.click(); } return; }
    if (cur.st.k === 'shadow') { if (k === ' ' || k === 'Enter') { e.preventDefault(); if (cur.done) nextShadow(); else player?.toggle(); } return; }
    if (!cur.revealed) {
      if (k === ' ' || k === 'Enter') { e.preventDefault(); reveal(); }
      else if ((k === 'h' || k === 'H') && cur.st.k === 'say') { e.preventDefault(); moreHint(); }
      return;
    }
    if (/^[1-4]$/.test(k)) {
      const b = $(`[data-r="${k}"]:not(:disabled)`, body) || (cur.hint >= 3 && $('[data-r]', body));
      if (b) { e.preventDefault(); grade(+b.dataset.r); }
    }
  }

  const setTog = (k) => {
    if (k === 'auto') {
      settings.trainShadowAuto = !settings.trainShadowAuto;
      holdWake(settings.trainShadowAuto);
      if (!settings.trainShadowAuto) clearTimeout(autoTimer);
      else if (cur.done) autoNext();
    } else if (k === 'en' && cur.st.k === 'listen') settings.trainListenEn = listenEn() ? 'tap' : 'shown';
    else flipToggle(CFG[cur.st.k], k);
    haptic();
    $('.fc-togs', body).outerHTML = togs();
    if (k !== 'en') return;
    cur.tapEN = false;
    if (cur.st.k === 'shadow') $('.dr-shadow-text', body).innerHTML = shadowText();
    else { const f = $('.flash', body); if (f) f.innerHTML = cardHTML(); }
  };

  render();
  body.onclick = (e) => {
    const b = e.target.closest('button');
    // With a word's bubble open, a tap elsewhere only closes it (as in the reader), except on ✕.
    if (bubbleOpen()) { closeBubble(); if (!b?.matches('.x')) return; }
    if (b) {
      if (b.matches('.x') || b.dataset.done != null) return closeSheet();
      if (b.matches('.rv-undo')) return undoLast();
      if (b.dataset.gear != null) return openSettings();
      if (b.dataset.closeSet != null) return closeSettings();
      if (b.dataset.say != null) return playBtn(b);
      if (b.dataset.go != null) { if (steps[si]) sawIntro(steps[si].k); return render(); }
      if (b.dataset.info != null) { info = true; return render(); }
      if (b.dataset.skipStep != null) {
        const st = steps[si];
        if (st) { sawIntro(st.k); st.skipped = true; if (counts) markToday('skipped', st.k); }
        si++; ii = -1; return render();
      }
      // Each of these replaces this sheet (openSheet closes it first).
      if (b.dataset.words != null) return reviewSheet({ onClose });
      if (b.dataset.flip != null) return reveal();
      if (b.dataset.hint != null) return moreHint();
      if (b.dataset.r != null) return grade(+b.dataset.r);
      if (b.dataset.tog) return setTog(b.dataset.tog);
      if (b.dataset.reveal) {
        cur[b.dataset.reveal === 'it' ? 'tapIt' : 'tapEN'] = true;
        if (cur.st.k === 'shadow') { $('.dr-shadow-text', body).innerHTML = shadowText(); return; }
        b.outerHTML = `<div class="dr-en">${esc(cur.s.en)}</div>`; return;
      }
      if (b.dataset.toggle != null) { haptic(); return player?.toggle(); }
      if (b.dataset.next != null) return nextShadow();
      if (b.dataset.again != null) return shadowAgain();
      if (b.dataset.extra != null) return drillSheet({ extra: 10, onClose });
      if (b.dataset.missed != null) return drillSheet({ practice: [...missed], onClose });
      return;
    }
    // Tapping the ring during "Your turn" ends it: you've said it, go on.
    if (e.target.closest('.dr-ring.turn') && player?.skipTurn()) return haptic();
    const cw = e.target.closest('.cw');
    if (cw && (cur?.revealed || cur?.st.k === 'shadow' || cw.closest('.dr-missed'))) return showWord(cw);
  };
}
