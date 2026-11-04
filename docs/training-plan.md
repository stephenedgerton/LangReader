# Training: drilling sentences for speaking and listening

A fifth tab, **Training**, for active recall of useful sentences: the most common things people say,
sentences you want to be able to say yourself, and sentences you've read. It's about getting
comfortable listening and speaking, a little every day, without ever being shown a backlog.

The throwaway prototype is on the `prototype/practice-tab` branch (`prototypes/practice-tab.prototype.html`).

## Decisions

### Where it lives
- A fifth tab, **Training**, in the middle of the tab bar.
- Word (gem) reviews move here. Home's review card and Vocabulary's review button go; Home gets one
  "Today's Training" card that opens the tab. Reading still counts as review (`creditReading()` stays).
- Everything about Training is in Training's own settings sheet (⚙︎ in its header): the size of each
  step, new sentences a day, "Include Words in the plan", "I am / my partner is" (m/f), memory target,
  and the word-review settings that used to be in the main settings.

### The daily plan
- One session, three steps, about 10 minutes:
  1. **Listen**: 4 sentences. The sentence plays; you reveal it (Italian and English) and rate yourself.
  2. **Shadow**: 4 sentences × 3. Listen, then repeat it aloud straight after, three times. Not scheduled.
  3. **Say it**: 8 sentences. See the English (plus a context chip like "to your partner"), say the
     Italian aloud, then check and rate yourself.
- **Words** is a bonus after the steps ("Bonus: 10 words"): the existing review sheet, unchanged. It never
  counts toward the day being done or the streak, unless "Include Words in the plan" is on.
- The plan is the same size every day. Missed days never make it bigger; the overdue cards closest to being
  forgotten come first. A step with too few due cards fills up with new sentences (within the new-a-day cap);
  a step with nothing at all shows as done.
- Each step can be skipped for today, and you can stop between steps. Each count can be set to 0.
- When it's done: "Done for today", with optional extras (train 10 more, go over the ones I missed).
- Shadowing uses today's new sentences first, then recent misses, then others from your packs, so a new
  sentence goes hear → repeat → say in one session.

### Checking yourself
- You rate yourself: Again / Hard / Good / Easy (1–4). No microphone, no speech recognition.
- **Hint** on Say it is always behind a button, three steps: the first word and blanks for the rest
  ("Cosa _ _ _?"), then the first letter of each word, then the answer (which counts as Again). After a
  hint, the best rating is Hard.
- Playback: ▶︎ and 🐢 slow (a slower Piper speed, not stretched audio).

### Scheduling
- FSRS (`srs.js`, unchanged), with each sentence holding two cards: **listen** and **say**. Recognising a
  sentence is much easier than producing it, so they're scheduled apart.
- Separate daily counts from word reviews (`langreader.trainDay`).
- A sentence is **mastered** once both cards reach a stability of 180 days; it leaves the drills, like a
  Known word.

### Sentences and packs
- A separate IndexedDB store, `sentences`. Sentences don't touch reader underlines or word stats, but their
  words are coloured by your vocabulary status on the cards, and you can tap one to look it up.
- **Packs are the only container.** The Packs list holds bundled packs, your own packs, and an automatic
  **From reading** pack. A sentence can be in several packs (like books in collections:
  `sentence.packs: [id]`) and is learned once.
- You can add your own sentences to a bundled pack and edit a bundled sentence; app updates never
  overwrite your edits. Deleting a bundled sentence hides it.
- Bundled packs are off until you add them, except **Survival**.
- One pack can be the **focus** (★): new sentences come from it first.
- Gendered forms are written `{o|a}` (about you) and `{p:o|a}` (about your partner), chosen by the
  "I am / my partner is" settings.

### Look
- Apple Books style: packs drawn as book covers on shelves (Your Packs, Ready-made, More to Add); the
  Today card like Reading Goals, with three rings and a pill Start button.
- A pack opens as its own page in the tab (a back arrow, not a sheet): the cover, its progress,
  **Train** and **Shadow**, then the sentences as an open hairline list in **Italian only**, each with a
  🔊 button and level dots. **Play all** plays the pack; **Show English** shows the translations.

### Adding sentences (PR 2)
- Built in PR 2. Two choices made while building it: "Train this sentence" adds in one tap (no confirm sheet;
  you can edit the sentence afterwards), and New Sentence has both an Italian and an English field rather than
  guessing the language: fill one, and it offers MyMemory's version of the other. Your own sentences come before
  ready-made ones among the new ones (after the focus pack's), since you added them because you want them.
- From the reader: "Train this sentence" in the word bubble and card takes the sentence the word is in,
  into From reading. From a word's card: add its example sentence. The English comes from "Translate
  sentence" (reusing `exampleTr`).
- Your own: type English or Italian; when it's English the app suggests Italian (MyMemory), and nothing is
  saved until you confirm it. Choose the pack it goes into.

### Bundled content
- Written by hand, not machine-translated, about 25–30 sentences a pack, always with *tu* in the partner
  packs. Planned packs: Survival, Partner: everyday, Partner: plans & errands, Café & restaurant,
  Directions, Shopping, Small talk, Travel, Feelings, When I don't understand.
- `tools/check-sentences.mjs` and `tests/sentences.test.mjs` read every sentence with the app's tokenizer
  and lemma list: unknown words (typos), gender markup with both halves, pack sizes, unique ids, and a
  "common lemmas only" target for the Survival and Partner packs.

## Shipping

1. **The base**: the `sentences` store, bundled packs, the Training tab and pack pages (play, play all,
   show English), the daily session (Listen, Shadow, Say it, plus the bonus Words row), the Training
   settings, and the Home card in place of the review entry points. Ships Survival and both Partner packs.
   Sentences are in the JSON backup.
2. **Your own sentences**: from the reader and from word examples, adding with the suggested Italian,
   your own packs, editing, moving and copying between packs, deleting, focus.
3. **The rest**: the other ready-made packs, Shadow all, and Training in the Stats tab. Badges for Training
   come later, once there's real data for their levels.

### The rest (PR 3)
- Built in PR 3. The seven packs (Café & restaurant, Directions, Shopping, Small talk, Travel, Feelings, When I don't
  understand) are off until added, and aren't held to the common-lemmas cap; modern words the 19th-century lemma list
  lacks (*autobus, aeroporto, prenotato* …) are in `EXTRA` in `tools/check-sentences.mjs`. No sentence repeats one in
  another pack, since each copy would be trained separately.
- **Shadow all** is the pack page's Shadow button: every sentence in the pack that isn't paused, three times each,
  moving on by itself, with Pause and Skip. It's practice, like Play all: nothing is rated and today's plan is
  untouched. It keeps the screen awake where the browser allows.
- **Training in Stats**: a section between the word bands and Themes with sentences you can say (say card held for a
  week), mastered and started, the training streak, days trained in the last 30, cards this week, a 14-day bar
  chart of cards a day, and each trained pack's progress.

## Next: Focus mode (PR 4)

Status: designed, not started. Comes from comparing Training with HyperLingua (an iOS app with Shadowing and
Active Recall over sentence lists; screenshots of its home, list, Focus screen and settings were reviewed in
the session that wrote this). The main lesson: they treat practice as a **player** (one list, a mode switch, ▶,
back/play/forward with autoplay, rating optional and non-blocking); ours is a **quiz** (step intros, flip cards,
rate to advance). Focus mode brings the player to pack pages first; the daily session moves to its layout after.

### Decisions
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

### Implementation notes
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

### Also on the list (found in the same review)
- Bugs: the icons inside the Shadow ring are drawn sideways (`.dr-ring svg { transform: rotate(-90deg) }` also
  turns `.mid svg`; use `.dr-ring > svg`). For a one-word sentence the first Say it hint shows the whole answer;
  go straight to the first-letter hint.
- After Focus mode, the daily session (`drill.js`): actions and ratings pinned to the bottom, step intros only
  the first time, the same rating labels and toggle row, Next only after Shadow's repeats, Listen with two or
  three grades, the context chip next to the English prompt, and an end screen listing the missed sentences
  with ▶.
- Later: Missed Say it cards come back a few cards later in the same session; recording yourself to compare
  (MediaRecorder, no recognition); lock-screen audio (above); grammar-pattern packs and per-book packs.
