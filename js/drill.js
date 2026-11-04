// Training's session, full screen: today's steps one after another (Listen, Shadow, Say it), each with a
// short intro you can skip. You rate yourself (Again/Hard/Good/Easy); nothing listens to you.
//   drillSheet()                    today's plan
//   drillSheet({ extra: 10 })       "Train 10 more" once today's is done (counts as today's work)
//   drillSheet({ only: packId })    one pack's due and new sentences; rated for real, but today's plan is untouched
//   drillSheet({ practice: ids })   "Go over the ones I missed": Say it once more, with no rating
import { settings } from './settings.js';
import { openSheet, closeSheet, esc, icons, $, $$ } from './ui.js';
import { speak, stopSpeaking, translate } from './services.js';
import { haptic } from './haptics.js';
import { tokenize, normalize } from './text.js';
import { entry, setWord } from './vocab.js';
import { bump } from './stats.js';
import { lookup } from './dictionary.js';
import { dictionaryHints } from './wordcard.js';
import { preview, ivlLabel, AGAIN, HARD, GOOD, EASY } from './srs.js';
import { hint } from './sentences.js';
import { STEPS, todaysPlan, sentence, textOf, rateCard, undoRate, countDone, stepFinished, packMeta } from './training.js';
import { retention, todaysCount, reviewSheet } from './review.js';

const ICON = {
  listen: '<svg viewBox="0 0 24 24"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="6.5" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.5"/></svg>',
  shadow: '<svg viewBox="0 0 24 24"><path d="M3 12h3l2-5 3 10 2.5-7 1.5 2h6"/></svg>',
  say: '<svg viewBox="0 0 24 24"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z"/><path d="M8.5 9h7M8.5 12h4.5"/></svg>',
  words: icons.cards,
  play: '<svg viewBox="0 0 24 24" class="solid"><path d="M7 4.5v15l13-7.5z"/></svg>',
  slow: '<svg viewBox="0 0 24 24"><path d="M4 16c0-4 3.5-7 8-7s8 3 8 7z"/><path d="M8 16v3M16 16v3M20 13l1.5-1"/></svg>',
  bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
};
export const stepIcon = (k) => ICON[k];
const GRADES = [[AGAIN, 'Again', 'again'], [HARD, 'Hard', 'hard'], [GOOD, 'Good', 'good'], [EASY, 'Easy', 'easy']];
const REPS = 3;

// The sentence with each word tappable and coloured by your vocabulary (blue New, yellow gem).
function sentenceHTML(text) {
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
    if (counts && settings.trainWords && todaysCount()) steps.push({ k: 'words', ids: [] });
  }
  const title = only ? packMeta(only)?.name || 'Pack' : practice ? 'Missed sentences' : extra ? 'Extra Training' : "Today's Training";
  const onKey = (e) => keydown(e);
  const body = openSheet('', { full: true, onClose: () => { removeEventListener('keydown', onKey); stopShadow(); stopSpeaking(); saving.catch(() => {}).then(() => onClose?.()); } });
  body.classList.add('drill');
  addEventListener('keydown', onKey);

  let si = 0, ii = -1, cur = null, busy = false, glossSeq = 0, saving = Promise.resolve();
  const undo = [], tally = { n: 0, again: 0, shadowed: 0 }, missed = [];
  const total = steps.reduce((n, s) => n + s.ids.length, 0);
  const doneItems = () => steps.slice(0, si).reduce((n, s) => n + s.ids.length, 0) + Math.max(0, ii);

  const head = () => `<h2><span>${esc(title)}</span><span class="rv-hbtns">${undo.length ? `<button class="rv-undo" aria-label="Undo">${ICON.undo}</button>` : ''}<button class="x" aria-label="Close">${icons.close}</button></span></h2>
    <div class="progress-line"><i style="width:${total ? (doneItems() / total) * 100 : 0}%"></i></div>`;
  const say = (text, slow = false, label = slow ? 'Slow' : 'Play') => `<button class="dr-say" data-say="${esc(text)}"${slow ? ' data-slow' : ''}>${slow ? ICON.slow : icons.speaker}${label}</button>`;

  const render = () => {
    stopShadow();
    if (si >= steps.length) return renderEnd();
    const st = steps[si];
    if (ii >= st.ids.length) { if (counts && !st.skipped && st.ids.length) stepFinished(); si++; ii = -1; return render(); }
    $('#sheet').scrollTop = 0;
    if (ii < 0) return renderIntro(st);
    const s = sentence(st.ids[ii]);
    if (!s) { ii++; return render(); }
    cur = { st, s, text: textOf(s), hint: 0, revealed: false };
    if (st.k === 'shadow') return renderShadow();
    body.innerHTML = `${head()}<div class="dr-step"><b>${STEPS.find((x) => x.k === st.k).name}</b><span>${ii + 1} of ${st.ids.length}</span></div>
      <div class="flash enter dr-${st.k}">${cardHTML()}</div><div class="rv-actions">${actionsHTML()}</div>`;
    if (st.k === 'listen') playBtn($('.dr-disc', body)); // in the tap that brought this card, for iOS
  };

  const renderIntro = (st) => {
    cur = null;
    if (st.k === 'words') {
      body.innerHTML = `${head()}<div class="dr-intro"><div class="dr-ico">${ICON.words}</div><h3>Words</h3><p>Your gems, as in reviews.</p><small>${todaysCount()} cards</small></div>
        <button class="primary" data-words>Start Words</button><button class="link-btn" data-skip-step>Skip for today</button>`;
      return;
    }
    const info = STEPS.find((x) => x.k === st.k);
    body.innerHTML = `${head()}<div class="dr-intro"><div class="dr-ico">${ICON[st.k]}</div><h3>${info.name}</h3><p>${info.how}</p>
        <small>${st.ids.length} ${info.what}${steps.length > 1 ? ` · step ${si + 1} of ${steps.length}` : ''}</small></div>
      <button class="primary" data-go>Start ${info.name}</button>${st.practice ? '' : '<button class="link-btn" data-skip-step>Skip this step today</button>'}`;
  };

  const ctxChip = () => (cur.s.ctx ? `<span class="dr-ctx">${esc(cur.s.ctx)}</span>` : '');
  const cardHTML = () => {
    const { st, s, text } = cur;
    const back = `${ctxChip()}<div class="dr-it">${sentenceHTML(text)}</div><div class="dr-en">${esc(s.en)}</div>
      <div class="rv-tools">${say(text)}${say(text, true)}</div>`;
    let front;
    if (st.k === 'listen') {
      front = `${ctxChip()}<div class="q-label">What did you hear?</div>
        <button class="dr-disc" data-say="${esc(text)}" aria-label="Play again">${ICON.play}</button>
        <div class="rv-tools">${say(text, true)}</div>`;
    } else {
      front = `${ctxChip()}<div class="q-label">Say it in Italian</div><div class="dr-prompt">${esc(s.en)}</div>
        <div class="dr-hint">${cur.hint ? `<div class="dr-hint-text">${esc(hint(text, cur.hint))}</div>` : ''}
          <button class="dr-hint-btn" data-hint>${ICON.bulb}${['Hint', 'More', 'Show it'][cur.hint]}<span class="dots">${[1, 2, 3].map((n) => `<i class="${n <= cur.hint ? 'on' : ''}"></i>`).join('')}</span></button>
          ${cur.hint ? `<small>${cur.hint < 2 ? 'With a hint, the best rating is Hard' : 'Next tap shows the answer and counts as Again'}</small>` : ''}</div>`;
    }
    return `<div class="card3d"><div class="face front">${front}</div><div class="face back">${back}</div></div>`;
  };
  const actionsHTML = () => {
    if (!cur.revealed) return `<button class="primary" data-flip>${cur.st.k === 'listen' ? 'Show the sentence' : 'I’ve said it, check'}</button>
      ${cur.st.k === 'say' ? '<div class="dr-note">Say it out loud first.</div>' : ''}`;
    if (cur.st.practice) return `<div class="review-btns"><button class="again" data-r="${AGAIN}">Still learning</button><button class="good" data-r="${GOOD}">Got it</button></div>`;
    if (cur.hint >= 3) return `<button class="primary" data-r="${AGAIN}">Next (counts as Again)</button>`;
    const iv = preview(cur.s.cards?.[cur.st.k], Date.now(), retention());
    return `<div class="review-btns four">${GRADES.map(([g, l, c]) => `<button class="${c}" data-r="${g}"${cur.hint && g > HARD ? ' disabled' : ''}><span>${l}</span><small>${ivlLabel(iv[g])}</small></button>`).join('')}</div>
      <div class="dr-note">${cur.hint ? 'You used a hint, so Good and Easy are off for this one.' : cur.st.k === 'listen' ? 'Did you understand it?' : 'How close were you? Tap a word to look it up.'}</div>`;
  };

  const reveal = () => {
    if (!cur || cur.revealed) return;
    cur.revealed = true;
    if (cur.st.k === 'say') speak(cur.text);
    $('.flash', body).classList.add('flipped');
    $('.rv-actions', body).innerHTML = actionsHTML();
  };
  const moreHint = () => {
    if (!cur || cur.revealed) return;
    haptic();
    cur.hint++;
    if (cur.hint >= 3) return reveal();
    const card = $('.flash .card3d', body);
    card.outerHTML = cardHTML();
  };

  const grade = (g) => {
    if (busy || !cur) return;
    haptic();
    const { st, s } = cur;
    const pos = { si, ii, tally: { ...tally }, missed: [...missed] };
    tally.n++;
    if (g === AGAIN) { tally.again++; if (!missed.includes(s.id)) missed.push(s.id); }
    if (st.practice) { undo.push({ pos }); ii++; return render(); }
    busy = true;
    // The next card renders straight away, in this tap (so Listen can play on iOS); the save follows.
    const job = saving = rateCard(s.id, st.k, g, { count: counts });
    ii++; render();
    job.then((snap) => { undo.push({ pos, snap }); refreshHead(); }).finally(() => { busy = false; });
  };
  const refreshHead = () => {
    const h = $('h2 .rv-hbtns', body);
    if (h && undo.length && !$('.rv-undo', h)) h.insertAdjacentHTML('afterbegin', `<button class="rv-undo" aria-label="Undo">${ICON.undo}</button>`);
  };
  const undoLast = async () => {
    if (busy || !undo.length) return;
    busy = true;
    const u = undo.pop();
    try {
      if (u.snap) await undoRate(u.snap);
      if (u.shadow && counts) countDone('shadow', -1);
    } finally { busy = false; }
    ({ si, ii } = u.pos);
    Object.assign(tally, u.pos.tally); missed.length = 0; missed.push(...u.pos.missed);
    render();
  };

  // ---------- Shadow: listen, then your turn (1.5× as long), three times ----------
  let timer = null, run = 0;
  function stopShadow() { clearTimeout(timer); timer = null; run++; }
  const renderShadow = () => {
    const { s, text } = cur;
    body.innerHTML = `${head()}<div class="dr-step"><b>Shadow</b><span>${ii + 1} of ${cur.st.ids.length}</span></div>
      <div class="dr-shadow">
        ${!s.cards?.say && !s.cards?.listen ? '<span class="dr-new">New today</span>' : ''}
        <div class="dr-ring"><svg viewBox="0 0 200 200"><circle class="track" cx="100" cy="100" r="90"/><circle class="prog" cx="100" cy="100" r="90" pathLength="100"/></svg>
          <div class="mid"></div></div>
        <div class="dr-it">${sentenceHTML(text)}</div><div class="dr-en">${esc(s.en)}</div>
        <div class="dr-reps">${Array.from({ length: REPS }, () => '<i></i>').join('')}</div>
      </div>
      <div class="rv-actions"><button class="primary" data-next>Next sentence</button><button class="link-btn" data-again>Once more</button></div>`;
    shadowRep(0);
  };
  const shadowRep = (rep) => {
    const mine = ++run, ring = $('.dr-ring', body);
    if (!ring) return;
    const prog = $('.prog', ring), mid = $('.mid', ring);
    const anim = (ms) => {
      prog.style.transition = 'none'; prog.style.strokeDashoffset = 100; prog.getBoundingClientRect();
      prog.style.transition = `stroke-dashoffset ${ms}ms linear`; prog.style.strokeDashoffset = 0;
    };
    if (rep >= REPS) {
      ring.classList.remove('turn'); mid.innerHTML = `${icons.check}<b>Nice</b>`;
      prog.style.transition = 'none'; prog.style.strokeDashoffset = 0;
      return;
    }
    ring.classList.remove('turn'); mid.innerHTML = `${ICON.listen}<b>Listen…</b>`;
    // How long the sentence takes, from the voice itself when it reports the end, else a guess.
    const guess = Math.max(1200, cur.text.length * 75), t0 = performance.now();
    let ended = false;
    const yourTurn = () => {
      if (ended || mine !== run) return;
      ended = true;
      const ms = Math.max(1500, (performance.now() - t0) * 1.5);
      ring.classList.add('turn'); mid.innerHTML = `${ICON.say}<b>Your turn</b>`; anim(ms);
      timer = setTimeout(() => {
        if (mine !== run) return;
        $$('.dr-reps i', body)[rep]?.classList.add('on');
        shadowRep(rep + 1);
      }, ms);
    };
    anim(guess);
    speak(cur.text, { onend: () => setTimeout(yourTurn, 150) });
    timer = setTimeout(yourTurn, guess + 2500); // if the voice never says it's finished
  };
  const nextShadow = () => {
    if (!cur) return;
    haptic();
    if (counts) countDone('shadow');
    tally.shadowed++; bump('drills');
    undo.push({ pos: { si, ii, tally: { ...tally, shadowed: tally.shadowed - 1 }, missed: [...missed] }, shadow: true });
    ii++; render();
  };

  // ---------- the end ----------
  const renderEnd = async () => {
    cur = null;
    body.innerHTML = head();
    await saving.catch(() => {}); // what's left today counts the last card too
    const daily = !only && !practice;
    const left = daily ? todaysPlan() : null;
    const allDone = daily && STEPS.every((s) => !left[s.k].length);
    const more = daily && allDone ? todaysPlan({ extra: 10 }) : null;
    const moreN = more ? more.listen.length + more.say.length : 0;
    const words = !settings.trainWords && todaysCount();
    body.innerHTML = `${head()}<div class="rv-done">
        <div class="dr-done-ico">${icons.check}</div>
        <h3>${practice ? 'That’s all of them' : only ? 'Pack session done' : allDone ? 'Done for today' : 'Done for now'}</h3>
        <div class="rv-done-line">${tally.n ? `${tally.n} card${tally.n === 1 ? '' : 's'}${tally.shadowed ? ` · ${tally.shadowed} shadowed` : ''}${tally.again ? ` · ${tally.again} to go over` : ''}` : tally.shadowed ? `${tally.shadowed} shadowed` : 'Nothing was due.'}</div>
        ${only ? '<div class="rv-done-sub">Ratings saved. Today’s plan is unchanged.</div>' : daily && !allDone ? '<div class="rv-done-sub">The rest of today’s training is waiting on the Training tab.</div>' : ''}
      </div>
      ${daily && words ? `<button class="card review-card dr-bonus" data-words><div class="rv-ico">${icons.cards}</div><div><h4>Bonus: ${words} words</h4><p>Your gems, if you’ve got a couple more minutes</p></div><span class="chev">›</span></button>` : ''}
      <button class="primary" data-done>Done</button>
      ${moreN || missed.length ? `<div class="rv-more"><div class="rv-more-title">Want to keep going? <span>Only if you feel like it.</span></div>
        ${moreN ? `<button class="secondary" data-extra>Train ${Math.min(10, moreN)} more</button>` : ''}
        ${missed.length && !practice ? `<button class="secondary" data-missed>Go over the ${missed.length === 1 ? 'one' : missed.length} I missed</button>` : ''}</div>` : ''}`;
  };

  // ---------- looking up a word on the card ----------
  const showGloss = async (span) => {
    const text = span.dataset.w, term = normalize(text), face = span.closest('.face, .dr-shadow');
    speak(text); // in the tap, for iOS
    $$('.cw.on', body).forEach((x) => x.classList.remove('on'));
    span.classList.add('on');
    let bar = $('.cgloss', face);
    if (!bar) { bar = document.createElement('div'); bar.className = 'cgloss'; $('.dr-it', face).after(bar); }
    const paint = (m, loading = false) => {
      const st = entry(term)?.status ?? 0;
      bar.innerHTML = `<b>${esc(text)}</b><span class="cg-m">${loading ? 'Looking up…' : esc(m || 'No translation found')}</span>`
        + (!loading && m && st === 0 ? `<button class="cg-add" data-t="${esc(term)}" data-m="${esc(m)}">+ Gem</button>` : st >= 1 && st <= 4 ? '<small>Gem</small>' : '');
    };
    const saved = entry(term)?.meaning;
    if (saved) return paint(saved);
    paint('', true);
    const seq = ++glossSeq;
    let m = '';
    if (settings.target === 'en') { try { const r = await lookup(text); m = (r && dictionaryHints(r)[0]?.text) || ''; } catch {} }
    if (!m) { try { m = (await translate(text, { word: true })).main || ''; } catch {} }
    if (seq === glossSeq && bar.isConnected) paint(m);
  };
  const addGem = async (b) => {
    haptic();
    const term = b.dataset.t, s = cur?.s;
    await setWord(term, { status: 1, meaning: b.dataset.m, ...(s && { example: cur.text, exampleTr: s.en }) });
    bump('lingqs');
    $$('.cw', body).forEach((x) => { if (normalize(x.dataset.w) === term) { x.classList.remove('s0'); x.classList.add('s1'); } });
    b.outerHTML = '<small>Saved as a gem</small>';
  };

  const playBtn = (b) => {
    $$('.playing', body).forEach((x) => x.classList.remove('playing'));
    b.classList.add('playing');
    const off = () => b.classList.remove('playing');
    speak(b.dataset.say, { slow: b.dataset.slow != null, onend: off });
    setTimeout(off, 8000);
  };

  // Space flips, H hints, 1–4 rate, Z undoes.
  function keydown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select')) return;
    const k = e.key;
    if (k === 'z' || k === 'Z') { e.preventDefault(); return undoLast(); }
    if (!cur) { if (k === ' ' || k === 'Enter') { e.preventDefault(); $('[data-go], [data-done]', body)?.click(); } return; }
    if (cur.st.k === 'shadow') { if (k === ' ' || k === 'Enter') { e.preventDefault(); nextShadow(); } return; }
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

  render();
  body.onclick = (e) => {
    const b = e.target.closest('button');
    if (b) {
      if (b.matches('.x') || b.dataset.done != null) return closeSheet();
      if (b.matches('.rv-undo')) return undoLast();
      if (b.dataset.say != null) return playBtn(b);
      if (b.dataset.go != null) { ii = 0; return render(); }
      if (b.dataset.skipStep != null) { steps[si].skipped = true; si++; ii = -1; return render(); }
      // Each of these replaces this sheet (openSheet closes it first).
      if (b.dataset.words != null) return reviewSheet({ onClose });
      if (b.dataset.flip != null) return reveal();
      if (b.dataset.hint != null) return moreHint();
      if (b.dataset.r != null) return grade(+b.dataset.r);
      if (b.dataset.next != null) return nextShadow();
      if (b.dataset.again != null) { stopShadow(); $$('.dr-reps i', body).forEach((x) => x.classList.remove('on')); return shadowRep(0); }
      if (b.matches('.cg-add')) return addGem(b);
      if (b.dataset.extra != null) return drillSheet({ extra: 10, onClose });
      if (b.dataset.missed != null) return drillSheet({ practice: [...missed], onClose });
      return;
    }
    const cw = e.target.closest('.cw');
    if (cw && (cur?.revealed || cur?.st.k === 'shadow')) return showGloss(cw);
    if (e.target.closest('.flash') && cur && !cur.revealed && cur.st.k === 'listen') return; // the disc plays; the button reveals
  };
}
