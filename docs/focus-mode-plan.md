# Focus mode for Training (PR 4)

Status: built in PR 4 (`js/focus.js`); see "How it was built" at the end for the choices made while building it. The rest of Training's decisions are in `docs/training-plan.md`. Comes from comparing Training with HyperLingua (an iOS app with Shadowing and
Active Recall over sentence lists; screenshots of its home, list, Focus screen and settings were reviewed in
the session that wrote this). The main lesson: they treat practice as a **player** (one list, a mode switch, ▶,
back/play/forward with autoplay, rating optional and non-blocking); ours is a **quiz** (step intros, flip cards,
rate to advance). Focus mode brings the player to pack pages first; the daily session moves to its layout after.

## Decisions
- **Pack page:** a **Shadowing | Recall** switch and one big ▶ at the top, and a pinned bottom button
  ("Start Focus · N"). It replaces the Train / Shadow / Play all buttons. Train (rated, today's plan untouched)
  stays reachable, e.g. in the pack's ⋯. Rows get tap-to-reveal English each (instead of only the global Show
  English) and the level as stars. Range play (long-press a row, tap another) comes later.
- **The Focus screen** (full-screen sheet, like `drillSheet()`): the progress line and "Shadowing 4 / 30" at the
  top; one row of toggle buttons (Translation, Dual audio, Repeat, Speed); the sentence in the middle (words
  tappable → `openCardBubble()`); at the **bottom, in thumb reach**: ‹‹ ▶/❚❚ ›› (auto-play) and the rating row.
  No intro screen.
  - **Shadowing:** the Italian plays, then your turn, × the repeat count, then the next sentence by itself.
  - **Recall:** the English plays (with Dual audio on) or shows, a gap to say it, then the Italian; then next.
- **Rating is optional and doesn't advance.** Tapping a grade rates that sentence's card (Shadowing → `listen`,
  Recall → `say`) via `rateCard(id, dir, g, { count: false })`, and it can be changed while the sentence is on
  screen (re-rate from the snapshot the first rating returned, so it isn't counted twice). An unrated sentence
  isn't scheduled. It doesn't count toward today's plan. Labels say how well you knew it, not intervals:
  Again "Didn't get it", Hard, Good, Easy "Knew it". No 1d/2d/5d/4w under them.
- **Settings sheet** (⚙︎ in the Focus screen and on the pack page), one scrolling sheet, mode name in its
  title, saved **per mode** (`settings.focus.shadow`, `settings.focus.recall`), with Start pinned at the bottom
  when opened before starting. Changes mid-session apply from the next sentence.
  - Playback: **Repeats** 1–5 (default 3 Shadowing, 1 Recall). **Your turn** 1× / 1.5× / 2× the sentence's
    length, or **Speak along** (no gap; default 1.5×). **Speed** 0.75 / 0.9 / 1 / 1.1×, with 🐢 still a one-tap
    override. **Loop** at the end of the list.
  - Dual audio: **English first** on/off (default on in Recall, off in Shadowing), **English only on the first
    repeat** (default on), **gap between them** 0.5 s.
  - Display: **Italian text** shown / hidden from the 2nd repeat / hidden; **English** shown / tap to reveal /
    hidden.
- **Not copying:** backlog counts ("60 due · 0 / 75"), points, a 5-point scale, a help banner, four settings tabs.
- **Replaces Shadow all** (`drillSheet({ shadowAll })` and its test go; the Shadowing mode does the same and
  more). Keep its screen wake lock.

## Implementation notes
- Start a new module, `js/focus.js` (`focusSheet({ pack, mode, ids })`), rather than growing `drill.js`.
  Reuse from `drill.js`: `sentenceHTML()` (export it), the ring/rep timing in `shadowRep()` (a rep's length
  comes from the voice's `onend`, with a length-based guess as fallback), `stepIcon()`. Reuse `askGender()`
  from `trainview.js` before starting.
- Speech: `speak(text, { onend, slow })` in `services.js` multiplies `settings.rate`; Piper honours any rate
  (`length_scale / rate` in `tts-worker.js`), so add a `rate` option to `speak()` for the speed steps. English
  for Dual audio needs a device English voice: `speakSystem()` always picks the Italian voice (`pickVoice()`),
  so add a `lang: 'en'` path that picks an English Web Speech voice (and skips Piper). Test it with
  `speechSynthesis.speak` stubbed, as the Training tests do.
- iOS: the first `speak()` must be in the tap (Start / ▶). Lock-screen playback isn't possible with timers;
  the later fix is rendering the session to one audio file with silences and playing it through `<audio>` with
  the Media Session API. Leave it out of PR 4, but keep the playback loop in one place so it can be swapped.
- Tests: `tests/training.test.mjs` has the helpers (`tr()`, the `speechSynthesis` stub, `GENDER`). Add tests
  for: auto-advance through two sentences; Pause; ‹‹ / ››; rating without advancing, then changing it (one card
  update, counts untouched); settings per mode (repeats 1 → one play per sentence; Dual audio → English then
  Italian in the recorded speech); the pack page's mode switch and pinned button. Bump `VERSION` in `sw.js` and
  add `js/focus.js` to `SHELL`.

## Also on the list (found in the same review)
- Bugs: the icons inside the Shadow ring are drawn sideways (`.dr-ring svg { transform: rotate(-90deg) }` also
  turns `.mid svg`; use `.dr-ring > svg`). For a one-word sentence the first Say it hint shows the whole answer;
  go straight to the first-letter hint.
- After Focus mode, the daily session (`drill.js`): actions and ratings pinned to the bottom, step intros only
  the first time, the same rating labels and toggle row, Next only after Shadow's repeats, Listen with two or
  three grades, the context chip next to the English prompt, and an end screen listing the missed sentences
  with ▶.
- Later: Missed Say it cards come back a few cards later in the same session; recording yourself to compare
  (MediaRecorder, no recognition); lock-screen audio (above); grammar-pattern packs and per-book packs.

## How it was built
Choices made where the decisions above left room:
- **▶ on the pack page plays the pack right there** (the row playing is highlighted), in the mode the switch is
  on, with that mode's settings. "Start Focus · N" opens the Focus screen. Both use `createPlayer()`.
- **Rows:** tapping a sentence shows or hides its English; a ⋯ on each row opens the sentence's sheet (Edit,
  Packs…, Pause, Delete), which used to open on the tap. Level stars are 1–4; New and mastered keep their tags.
- **The toggle row** writes the same per-mode settings as the sheet: Translation is English shown ↔ tap to
  reveal, Dual audio is English first, Repeat goes round 1–5, Speed round 0.75–1.1×.
- **Settings inside a session** open in the same full-screen sheet (the app has one shared sheet), with Done to
  go back; playback carries on behind them.
- **Recall:** the Italian stays hidden (tap to show it) until it plays. Without Dual audio the English is always
  shown, as it's the prompt. The gap before the Italian uses how long that sentence took earlier in the session,
  else a length-based guess. Speak along in Recall waits only the gap setting.
- **Tapping a word** pauses playback and opens the bubble.
- A rating can be changed for as long as the session is open, not only while the sentence is on screen (going
  back with ‹‹ still re-rates from the first snapshot, so it's never two reviews).
- Rating Again puts the sentence in today's missed list, as elsewhere; changing it to another grade takes it out.
- At the end of the list (Loop off) the screen says so, with "Play again from the start" and Done.
