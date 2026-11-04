// Focus mode: a pack played like a player rather than a quiz. Two modes, each with its own settings
// (settings.focus.shadow / .recall, over FOCUS_DEFAULTS):
//   Shadowing  the Italian plays, then it's your turn (a gap as long as the sentence × "Your turn"), × Repeats,
//              then the next sentence by itself. With Dual audio the English plays first.
//   Recall     the English plays (Dual audio) or shows, a gap to say it in Italian, then the Italian.
// Rating is optional and never advances: a grade rates that sentence's card (Shadowing → listen, Recall → say)
// without touching today's plan, and can be changed while you're still in the session (it's re-rated from
// where the card was, so it counts once). An unrated sentence isn't scheduled.
//
//   focusSheet({ pack, mode, ids })   the full-screen Focus screen (no intro: it starts playing in the tap)
//   focusSettingsSheet(mode, { onStart })  the settings sheet, with Start pinned at the bottom
//   createPlayer(...)                 the playback loop, shared with the pack page's ▶. It's timers and speak()
//                                     calls, so it stops with the screen; lock-screen audio would swap this one
//                                     function for a rendered audio file (see docs/focus-mode-plan.md).
import { settings } from './settings.js';
import { openSheet, closeSheet, esc, icons, $, $$ } from './ui.js';
import { speak, stopSpeaking } from './services.js';
import { haptic } from './haptics.js';
import { openCardBubble, closeBubble, bubbleOpen } from './bubble.js';
import { bump } from './stats.js';
import { AGAIN, HARD, GOOD, EASY } from './srs.js';
import { sentence, textOf, rateCard, rerateCard, packMeta, countRep } from './training.js';
import { sentenceHTML, stepIcon } from './drill.js';

export const MODES = {
  shadow: { name: 'Shadowing', dir: 'listen' },
  recall: { name: 'Recall', dir: 'say' },
};
// turn: the gap for you, as a multiple of the sentence's length (0 = Speak along: no gap). it: shown | later
// (hidden from the 2nd repeat) | hidden. en: shown | tap (tap to reveal) | hidden. gap: seconds between the
// English and the Italian.
export const FOCUS_DEFAULTS = {
  shadow: { repeats: 3, turn: 1.5, speed: 1, loop: false, enFirst: false, enOnce: true, gap: 0.5, it: 'shown', en: 'shown' },
  recall: { repeats: 1, turn: 1.5, speed: 1, loop: false, enFirst: true, enOnce: true, gap: 0.5, it: 'shown', en: 'shown' },
};
export const focusCfg = (mode) => ({ ...FOCUS_DEFAULTS[mode], ...(settings.focus?.[mode] || {}) });
export function setFocusCfg(mode, patch) {
  const all = settings.focus || {};
  settings.focus = { ...all, [mode]: { ...(all[mode] || {}), ...patch } };
}
const SPEEDS = [0.75, 0.9, 1, 1.1];
const x = (n) => `${n}×`;

// The row of toggles over the sentence (Focus screen and the daily session): each writes the mode's settings.
// `keys` picks which ones show: en (Translation: English shown ↔ tap to reveal), dual (English first),
// rep (Repeat, round 1–5), speed (round 0.75–1.1×).
export function toggleRowHTML(mode, keys = ['en', 'dual', 'rep', 'speed']) {
  const c = focusCfg(mode);
  const t = (k, label, on, val = '') => `<button class="fc-tog${on ? ' on' : ''}" data-tog="${k}" aria-pressed="${on}"><span>${label}</span>${val ? `<b>${val}</b>` : ''}</button>`;
  const all = { en: () => t('en', 'Translation', c.en === 'shown'), dual: () => t('dual', 'Dual audio', c.enFirst),
    rep: () => t('rep', 'Repeat', c.repeats > 1, x(c.repeats)), speed: () => t('speed', 'Speed', c.speed !== 1, x(c.speed)) };
  return `<div class="fc-togs" style="grid-template-columns:repeat(${keys.length},1fr)">${keys.map((k) => all[k]()).join('')}</div>`;
}
export function flipToggle(mode, k) {
  const c = focusCfg(mode);
  if (k === 'en') setFocusCfg(mode, { en: c.en === 'shown' ? 'tap' : 'shown' });
  if (k === 'dual') setFocusCfg(mode, { enFirst: !c.enFirst });
  if (k === 'rep') setFocusCfg(mode, { repeats: c.repeats % 5 + 1 });
  if (k === 'speed') setFocusCfg(mode, { speed: SPEEDS[(SPEEDS.indexOf(c.speed) + 1) % SPEEDS.length] });
}

const ICON = {
  play: '<svg viewBox="0 0 24 24" class="solid"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" class="solid"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  prev: '<svg viewBox="0 0 24 24" class="solid"><path d="M11.5 6v12L3.5 12zM20.5 6v12l-8-6z"/></svg>',
  next: '<svg viewBox="0 0 24 24" class="solid"><path d="M12.5 6v12l8-6zM3.5 6v12l8-6z"/></svg>',
  en: '<svg viewBox="0 0 24 24"><path d="M4 5h9M8.5 3v2M6 5c.5 3 2.5 6 6 8M11 5c-.5 3-3 7-7 8.5M13 20l3.5-9 3.5 9M14.2 17h4.6"/></svg>',
};

// ---------- the playback loop ----------
// items: [{id, text, en}]. Calls on.show(i) when it moves to a sentence, on.phase(name, {rep, ms}) as each part
// starts ('en', 'it', 'turn', 'rep' when a repetition ends, 'done' after the last), on.sentenceDone(item) when a
// sentence has played all its repeats (each repetition is counted with countRep()), on.state() when it starts or stops playing, on.end() at the end of the list.
// The mode's settings are read at the start of each sentence, so changes apply from the next one; `config` can
// adjust them (the daily session's Shadow plays one sentence at a time, so it turns Loop off).
export function createPlayer({ items, mode, at = 0, slow = () => false, config = () => focusCfg(mode), on = {} }) {
  const p = { i: Math.max(0, Math.min(at, items.length - 1)), rep: 0, playing: false, ended: false, cfg: config() };
  let run = 0, timer = null;
  const lens = new Map(); // `${text}|${rate}` -> how long the Italian took, for Recall's gap before it
  const halt = () => { run++; clearTimeout(timer); timer = null; };
  const wait = (ms, then) => { const mine = ++run; timer = setTimeout(() => { if (mine === run) then(); }, ms); };
  const guess = (text, rate) => Math.max(1200, (text.length * 75) / rate);
  // Says one thing; `then(ms)` gets how long it took (from the voice's end, else the length-based guess).
  const say = (text, opts, then) => {
    const mine = ++run, t0 = performance.now(), g = guess(text, opts.rate || 1);
    let done = false;
    const fin = (ended) => { if (done || mine !== run) return; done = true; clearTimeout(timer); then(ended ? performance.now() - t0 : g); };
    speak(text, { ...opts, onend: () => setTimeout(() => fin(true), 150) });
    if (mine === run) timer = setTimeout(() => fin(false), g + 2500); // if the voice never says it's finished
  };
  const emit = (name, extra = {}) => on.phase?.(name, { rep: p.rep, ...extra });

  function rep() {
    const item = items[p.i], cfg = p.cfg;
    if (!item) return;
    if (p.rep >= cfg.repeats) {
      emit('done'); on.sentenceDone?.(item);
      return wait(900, advance);
    }
    const r = (cfg.speed || 1) * (slow() ? 0.7 : 1), key = `${item.text}|${r}`;
    const next = () => { p.rep++; countRep(item.id); emit('rep'); rep(); };
    const italian = (then) => { emit('it'); say(item.text, { rate: r }, (ms) => { lens.set(key, ms); then(ms); }); };
    const turn = (ms, then) => {
      if (!cfg.turn) return wait(mode === 'recall' ? cfg.gap * 1000 : 300, then); // Speak along
      const t = Math.max(1200, ms * cfg.turn);
      emit('turn', { ms: t }); wait(t, then);
    };
    const english = (then) => { emit('en'); say(item.en, { lang: 'en', rate: cfg.speed || 1 }, () => then()); };
    const withEN = cfg.enFirst && item.en && (!cfg.enOnce || p.rep === 0);
    if (mode === 'shadow') {
      const go = () => italian((ms) => turn(ms, next));
      return withEN ? english(() => wait(cfg.gap * 1000, go)) : go();
    }
    const ask = () => turn(lens.get(key) || guess(item.text, r), () => italian(() => wait(700, next)));
    return withEN ? english(ask) : ask();
  }
  function startSentence() { p.cfg = config(); p.rep = 0; rep(); }
  function advance() {
    if (p.i + 1 < items.length) return goto(p.i + 1);
    if (p.cfg.loop && items.length) return goto(0);
    halt(); p.playing = false; p.ended = true; on.state?.(); on.end?.();
  }
  function goto(i) {
    halt(); stopSpeaking();
    p.i = Math.max(0, Math.min(i, items.length - 1)); p.rep = 0; p.ended = false;
    on.show?.(p.i);
    if (p.playing) startSentence();
  }
  return {
    get i() { return p.i; }, get rep() { return p.rep; }, get playing() { return p.playing; }, get ended() { return p.ended; },
    get cfg() { return p.cfg; },
    // Starts (or resumes: the current repetition again from its start). Call it in a tap, for iOS.
    play() {
      if (!items.length) return;
      if (p.ended) { p.playing = true; on.state?.(); return goto(0); }
      p.playing = true; on.state?.();
      halt();
      if (p.rep >= p.cfg.repeats || p.rep === 0) startSentence(); else rep();
    },
    pause() { halt(); stopSpeaking(); if (p.playing) { p.playing = false; on.state?.(); } },
    toggle() { if (p.playing) this.pause(); else this.play(); },
    next() { if (p.i + 1 < items.length) goto(p.i + 1); else if (p.cfg.loop) goto(0); else if (!p.ended) { goto(p.i); halt(); p.playing = false; p.ended = true; on.state?.(); on.end?.(); } },
    prev() { goto(p.i - 1); },
    goto,
    stop() { halt(); stopSpeaking(); p.playing = false; },
  };
}

// ---------- settings ----------
function settingsHTML(mode) {
  const c = focusCfg(mode);
  const sel = (k, opts) => `<select data-k="${k}"${typeof opts[0][0] === 'number' ? ' data-num' : ''}>${opts.map(([v, l]) => `<option value="${v}"${String(c[k]) === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  const sw = (k) => `<span class="switch"><input type="checkbox" data-k="${k}"${c[k] ? ' checked' : ''}><i></i></span>`;
  const item = (label, ctl, sub = '') => `<label class="ts-item"><span class="lbl">${label}${sub ? `<small>${sub}</small>` : ''}</span>${ctl}</label>`;
  return `<div class="section-title fc-set-title">Playback</div>
    <div class="ts-group">
      ${item('Repeats', sel('repeats', [1, 2, 3, 4, 5].map((n) => [n, x(n)])), 'Each sentence, this many times')}
      ${item('Your turn', sel('turn', [[1, '1× the sentence'], [1.5, '1.5× the sentence'], [2, '2× the sentence'], [0, 'Speak along']]), mode === 'recall' ? 'The gap to say it before the Italian plays' : 'The gap after the Italian, to say it')}
      ${item('Speed', sel('speed', SPEEDS.map((n) => [n, x(n)])), '🐢 on the screen still slows it down')}
      ${item('Loop', sw('loop'), 'Start again at the end of the pack')}
    </div>
    <div class="section-title fc-set-title">Dual audio</div>
    <div class="ts-group">
      ${item('English first', sw('enFirst'), 'The English plays before the Italian')}
      ${item('English only on the first repeat', sw('enOnce'))}
      ${item('Gap between them', sel('gap', [[0.25, '0.25 s'], [0.5, '0.5 s'], [1, '1 s'], [1.5, '1.5 s']]))}
    </div>
    <div class="section-title fc-set-title">Display</div>
    <div class="ts-group">
      ${item('Italian text', sel('it', [['shown', 'Shown'], ['later', 'Hidden from the 2nd repeat'], ['hidden', 'Hidden']]))}
      ${item('English', sel('en', [['shown', 'Shown'], ['tap', 'Tap to reveal'], ['hidden', 'Hidden']]))}
    </div>
    <p class="muted fc-set-note">Saved for ${MODES[mode].name} only. Changes apply from the next sentence.</p>`;
}
function bindSettings(root, mode, onChange) {
  root.addEventListener('change', (e) => {
    const t = e.target, k = t.dataset?.k;
    if (!k) return;
    setFocusCfg(mode, { [k]: t.type === 'checkbox' ? t.checked : t.dataset.num != null ? +t.value : t.value });
    onChange?.(k);
  });
}

// From the pack page: the settings for the mode, with Start pinned at the bottom.
export function focusSettingsSheet(mode, { onStart, count = 0 } = {}) {
  const body = openSheet(`<h2>${MODES[mode].name} Settings<button class="x" aria-label="Close">${icons.close}</button></h2>
    <div class="fc-settings">${settingsHTML(mode)}</div>
    ${onStart ? `<div class="fc-pin"><button class="primary" data-start>Start ${MODES[mode].name}${count ? ` · ${count}` : ''}</button></div>` : ''}`);
  bindSettings(body, mode);
  body.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('.x')) return closeSheet();
    if (b.dataset.start != null) return onStart();
  };
}

// ---------- the Focus screen ----------
// Labels say how well you knew it, not intervals. Shared with the daily session's Say it.
export const GRADES = [[AGAIN, 'Didn’t get it', 'again'], [HARD, 'Hard', 'hard'], [GOOD, 'Good', 'good'], [EASY, 'Knew it', 'easy']];

export function focusSheet({ pack, mode = 'shadow', ids, onClose }) {
  const items = ids.map(sentence).filter(Boolean).map((s) => ({ id: s.id, text: textOf(s), en: s.en, ctx: s.ctx }));
  const M = MODES[mode], title = packMeta(pack)?.name || 'Pack';
  const rated = new Map();    // id -> {g, job: Promise<snap>}: changing it re-rates from the first rating's snapshot
  const counted = new Set();  // ids already in days[].drills this session
  let saving = Promise.resolve(), view = 'player', slow = false, wake = null;
  let cur = { heard: false, tapIt: false, tapEN: false };
  const onKey = (e) => keydown(e);
  navigator.wakeLock?.request('screen').then((l) => { wake = l; }, () => {});
  const body = openSheet('', { full: true, onClose: () => {
    removeEventListener('keydown', onKey); closeBubble(); player.stop(); wake?.release().catch(() => {});
    saving.catch(() => {}).then(() => onClose?.());
  } });
  body.classList.add('focus');
  addEventListener('keydown', onKey);

  const player = createPlayer({ items, mode, slow: () => slow, on: {
    show: () => { cur = { heard: false, tapIt: false, tapEN: false }; closeBubble(); draw(); },
    phase: (name, { rep, ms }) => {
      if (name === 'it') cur.heard = true;
      if (name === 'rep' && mode === 'recall') cur.heard = false;
      if (view !== 'player') return;
      if (name === 'it' || name === 'rep') drawText();
      drawPhase(name, rep, ms);
    },
    sentenceDone: (item) => { if (!counted.has(item.id)) { counted.add(item.id); bump('drills'); } },
    state: () => { if (view === 'player') drawTransport(); },
    end: () => { if (view === 'player') draw(); },
  } });

  const head = () => `<h2><span>${esc(title)}</span><span class="rv-hbtns"><button class="fc-gear" data-gear aria-label="${M.name} settings">${icons.gear}</button><button class="x" aria-label="Close">${icons.close}</button></span></h2>`;
  const item = () => items[player.i];

  const togs = () => toggleRowHTML(mode);

  // What's visible: Recall keeps the Italian back until it has played; "hidden from the 2nd repeat" hides it
  // after the first time through. A hidden part can be tapped to show it.
  const textHTML = () => {
    const it = item(), c = focusCfg(mode);
    if (!it) return '';
    const rep = player.rep;
    const showIT = cur.tapIt || (c.it === 'shown' || (c.it === 'later' && rep === 0)) && (mode === 'shadow' || cur.heard);
    // Recall's English is the prompt: without Dual audio it's always shown.
    const enMode = mode === 'recall' && !c.enFirst ? 'shown' : c.en;
    const showEN = cur.tapEN || enMode === 'shown';
    const itHTML = showIT ? `<div class="dr-it fc-it">${sentenceHTML(it.text)}</div>`
      : `<button class="fc-hidden" data-reveal="it">${mode === 'recall' && !cur.heard ? 'Say it in Italian' : 'Italian hidden'}<small>Tap to show it</small></button>`;
    const enHTML = showEN ? `<div class="dr-en fc-en">${esc(it.en)}</div>`
      : enMode === 'tap' ? `<button class="fc-hidden en" data-reveal="en">Tap to show the English</button>` : '';
    return `${it.ctx ? `<span class="dr-ctx fc-ctx">${esc(it.ctx)}</span>` : ''}${mode === 'recall' ? enHTML + itHTML : itHTML + enHTML}`;
  };
  const drawText = () => { const el = $('.fc-text', body); if (el) el.innerHTML = textHTML(); };

  const PHASE = { en: ['English', ICON.en], it: ['Listen…', stepIcon('listen')], turn: ['Your turn', stepIcon('say')], done: ['Next one…', icons.check] };
  const drawPhase = (name, rep, ms) => {
    const el = $('.fc-phase', body); if (!el) return;
    const n = player.cfg.repeats;
    $$('.fc-reps i', el).forEach((d, k) => d.classList.toggle('on', k < Math.min(rep, n)));
    const lab = $('.fc-ph', el), bar = $('.fc-bar i', el);
    if (name === 'rep') return;
    const [txt, ic] = !player.playing ? (player.ended ? ['The end', icons.check] : ['Paused', ICON.pause]) : PHASE[name] || ['', ''];
    lab.innerHTML = `${ic}<span>${txt}</span>`;
    el.classList.toggle('turn', name === 'turn' && player.playing);
    bar.style.transition = 'none'; bar.style.width = '0';
    if (name === 'turn' && ms) { bar.getBoundingClientRect(); bar.style.transition = `width ${ms}ms linear`; bar.style.width = '100%'; }
  };
  const drawTransport = () => {
    const b = $('[data-toggle]', body);
    if (b) { b.innerHTML = player.playing ? ICON.pause : ICON.play; b.setAttribute('aria-label', player.playing ? 'Pause' : 'Play'); }
    if (!player.playing) drawPhase('stop', player.rep);
  };
  const rateHTML = () => {
    const r = item() && rated.get(item().id);
    return GRADES.map(([g, l, c]) => `<button class="${c}${r?.g === g ? ' on' : ''}" data-r="${g}" aria-pressed="${r?.g === g}">${l}</button>`).join('');
  };

  const draw = () => {
    if (view === 'settings') return drawSettings();
    const n = items.length, it = item();
    if (!it) { body.innerHTML = `${head()}<p class="muted">Nothing to play: every sentence in this pack is paused.</p>`; return; }
    const ended = player.ended;
    body.innerHTML = `${head()}
      <div class="progress-line"><i style="width:${n ? ((ended ? n : player.i + 1) / n) * 100 : 0}%"></i></div>
      <div class="fc-count"><b>${M.name}</b><span>${player.i + 1} / ${n}</span></div>
      ${togs()}
      <div class="fc-main">${ended ? `<div class="fc-end"><div class="dr-done-ico">${icons.check}</div><h3>That’s the whole pack</h3>
          <p class="muted">${n} sentence${n === 1 ? '' : 's'}. ${rated.size ? `${rated.size} rated.` : 'Rating them is up to you.'}</p>
          <button class="secondary" data-restart>Play again from the start</button><button class="link-btn" data-done>Done</button></div>`
        : `<div class="fc-text">${textHTML()}</div>
        <div class="fc-phase"><div class="fc-ph"></div><div class="fc-bar"><i></i></div>
          <div class="fc-reps">${Array.from({ length: player.cfg.repeats }, () => '<i></i>').join('')}</div></div>
        <div class="rv-tools fc-tools"><button data-replay>${icons.speaker}Play</button><button data-slow class="${slow ? 'on' : ''}" aria-pressed="${slow}">${stepIcon('slow')}Slow</button></div>`}</div>
      <div class="fc-bottom">
        <div class="fc-rate-label">Optional: how well did you know it?</div>
        <div class="review-btns four fc-rate">${rateHTML()}</div>
        <div class="fc-ctrl"><button data-prev aria-label="Previous sentence">${ICON.prev}</button>
          <button class="fc-play" data-toggle aria-label="${player.playing ? 'Pause' : 'Play'}">${player.playing ? ICON.pause : ICON.play}</button>
          <button data-next aria-label="Next sentence">${ICON.next}</button></div>
      </div>`;
    if (!ended) drawPhase(player.playing ? 'it' : 'stop', player.rep);
  };

  // Settings, in this same sheet (the shared sheet can only hold one thing); playback carries on behind it.
  const drawSettings = () => {
    body.innerHTML = `<h2><span>${M.name} Settings</span><span class="rv-hbtns"><button class="fc-done-set" data-close-set>Done</button></span></h2>
      <div class="fc-settings">${settingsHTML(mode)}</div>`;
  };
  bindSettings(body, mode);

  const rate = (g) => {
    const it = item(); if (!it || player.ended) return;
    haptic();
    const prev = rated.get(it.id);
    if (prev?.g === g) return;
    const job = prev ? prev.job.then((snap) => rerateCard(snap, g))
      : rateCard(it.id, M.dir, g, { count: false, drill: !counted.has(it.id) });
    counted.add(it.id);
    job.catch(() => {});
    rated.set(it.id, { g, job });
    saving = Promise.all([saving, job]).catch(() => {});
    const row = $('.fc-rate', body); if (row) row.innerHTML = rateHTML();
  };
  const setTog = (k) => {
    flipToggle(mode, k);
    haptic();
    $('.fc-togs', body).outerHTML = togs();
    if (k === 'en') { cur.tapEN = false; drawText(); }
  };

  function keydown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select') || view !== 'player') return;
    const k = e.key;
    if (k === 'Escape' && bubbleOpen()) { e.preventDefault(); return closeBubble(); }
    if (k === ' ') { e.preventDefault(); return player.toggle(); }
    if (k === 'ArrowRight') { e.preventDefault(); return player.next(); }
    if (k === 'ArrowLeft') { e.preventDefault(); return player.prev(); }
    if (/^[1-4]$/.test(k)) { e.preventDefault(); return rate(+k); }
  }

  body.onclick = (e) => {
    const b = e.target.closest('button');
    if (bubbleOpen()) { closeBubble(); if (!b?.matches('.x')) return; }
    if (b) {
      if (b.matches('.x') || b.dataset.done != null) return closeSheet();
      if (b.dataset.toggle != null) { haptic(); return player.toggle(); }
      if (b.dataset.next != null) { haptic(); return player.next(); }
      if (b.dataset.prev != null) { haptic(); return player.prev(); }
      if (b.dataset.restart != null) { player.goto(0); return player.play(); }
      if (b.dataset.r != null) return rate(+b.dataset.r);
      if (b.dataset.tog) return setTog(b.dataset.tog);
      if (b.dataset.reveal) { cur[b.dataset.reveal === 'it' ? 'tapIt' : 'tapEN'] = true; return drawText(); }
      if (b.dataset.gear != null) { view = 'settings'; $('#sheet').scrollTop = 0; return draw(); }
      if (b.dataset.closeSet != null) { view = 'player'; return draw(); }
      if (b.dataset.slow != null) { slow = !slow; b.classList.toggle('on', slow); b.setAttribute('aria-pressed', slow); return; }
      if (b.dataset.replay != null) { player.pause(); b.classList.add('playing'); return speak(item().text, { rate: (focusCfg(mode).speed || 1) * (slow ? 0.7 : 1), onend: () => b.classList.remove('playing') }); }
      return;
    }
    // A word: the reader's bubble, with the playback paused so the two don't talk over each other.
    const cw = e.target.closest('.cw');
    if (cw) { player.pause(); return openCardBubble(cw, { root: body, context: item()?.text || '' }); }
  };

  draw();
  player.play(); // in the tap that opened the screen, for iOS
  return player;
}
