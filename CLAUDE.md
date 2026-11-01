# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LangReader is a phone-first web app (PWA) for reading Italian. It copies the look and gestures of Apple Books (paginated pages, themes, page curl) and the learning features of LingQ (blue/yellow word statuses, LingQs, phrases, "page turn marks blue words known"). It's plain HTML/CSS/ES modules: **no build step, no package.json, no CDN**. The only third-party code is the vendored Piper voice runtime in `vendor/`. All user data stays on the device.

## Running and deploying

- Run locally: `python3 -m http.server 8000`, then open http://localhost:8000. ES modules and the service worker need http(s), not `file://`.
- Deploy: GitHub Pages serves `main` from the repo root (https://stephenedgerton.github.io/LangReader/). Merging to `main` is the deploy. So far the workflow has been: work on branch `langreader-app`, open a PR, merge.
- **On every release, bump `VERSION` in `sw.js`, and add any new file to its `SHELL` list**, or installed home-screen copies keep stale or missing modules. The service worker is network-first for same-origin requests and falls back to its cache offline.

## Tests

- Run everything: `node --test` (Node 22+, takes about 20 s). One file: `node --test tests/words.test.mjs`. One test by name: `node --test --test-name-pattern="hold and drag"`.
- `tests/text.test.mjs` holds plain unit tests for `js/text.js`. The other files drive the real app in headless Chromium through Playwright, at the iPhone 13 viewport (390×664).
- `tests/helpers.mjs` starts a static server for the repo on a random port. `openApp()` opens a fresh browser context, mocks `en.wiktionary.org` (the `WIKTIONARY` fixture map; any other title returns 404) and `api.mymemory.translated.net`, marks the tips as seen, and collects page errors. Tests assert that the error list is empty. Pass `settings` to preset `langreader.settings`, `tipsSeen: false` to show the tips card, or `mt: null` to make translation fail.
- Playwright is loaded with `createRequire`, so a globally installed copy (`NODE_PATH`) works. There's no `package.json`. Elsewhere, install Playwright and its Chromium first.
- Most tests use the bundled *Un caffè a Bologna*, its opening sentence and the words in it (`treno`, `arrivò`, `valigia` …). Changing that story's text will break tests.
- There's no linter.

## Architecture

`index.html` holds the static shell: four tab views, the `#reader` overlay, and one shared bottom `#sheet`. `js/app.js` boots the app (loads vocabulary, adds bundled stories, registers the service worker) and renders the Home, Library and Vocabulary tabs as HTML strings (the Stats tab is `statsview.js`). `js/reader.js` owns everything inside the reader.

### Data (`db.js`, `vocab.js`, `settings.js`)
- IndexedDB `langreader` has these stores: `books` (metadata and progress; `chapterTitles` and `chapterWords` are denormalised here), `chapters` (key `${bookId}:${idx}`, `blocks: [{t:'h'|'p', x}]`), `words` (vocabulary), `tcache` (translation and dictionary cache), and `days` (daily stats). Adding a store means bumping `DB_VERSION` and adding it in `onupgradeneeded`.
- Word status: a missing entry (status 0) is New/blue, 1–4 are LingQ levels (yellow), 5 is Known and -1 is Ignored. `setWord` *deletes* an entry that ends up at status 0 with no meaning. Terms are normalised by `normalize()` in `text.js`: lowercase NFC, with `’` turned into `'`. A phrase is stored as its normalised tokens joined by single spaces, with `phrase: true`.
- `vocab.js` keeps every word in an in-memory `Map` loaded at boot, and notifies `onChange` listeners. The reader recolours matching `.w[data-w]` spans in place, and re-renders the whole chapter when a phrase changes, because phrase underlines are computed at render time.
- A word entry keeps `example` (the sentence it was saved from, set once) and `exampleTr` (that sentence's translation, once the user translates it). Phrase entries also keep `display`, the text as printed with its punctuation.
- `names.js` lists names that `ignoreNames()` in `app.js` marks Ignored on first launch through `setMany` (which never touches existing entries). Bump `NAMES_VERSION` after adding names. Leave out names that are also ordinary words. These pre-seeded names don't count toward the backup reminder.
- Settings live in localStorage `langreader.settings`, behind a Proxy that saves on every write (avoid writing in hot paths). Other localStorage keys: `langreader.seeded`, `langreader.samplesAdded`, `langreader.tipsSeen`, `langreader.lastBackup`, `langreader.backupSnooze`, `langreader.namesIgnored`, `langreader.badges`, `langreader.srsDay`.

### Text and rendering (`text.js`)
- `tokenize` splits elisions the way LingQ does (*dell'anno* → *dell'* + *anno*) and keeps the apostrophe only on known truncations (*po'*). `paragraphHTML` wraps sentences in `.sent` and words in `.w` spans carrying status classes `s0`–`s4`, plus `ph` for words inside a saved phrase. Phrases match within one paragraph only, so a selection can't cross paragraphs. How the classes look depends on `#reader[data-hl]`: `underline` (LingQ's style, the default) or `background`.
- `textToChapters` splits pasted or .txt text on headings like "Capitolo N". `importer.js` also splits chapters longer than about 4000 words, and has its own minimal ZIP reader (built on `DecompressionStream`) for EPUB.

### Reader (`reader.js`)
- Pages come from **CSS multi-column layout**: `#page-content` is one column-filled element shifted by `translateX(-page * R.step)`. The page count comes from the position of the trailing `.end` marker. Which page each word span is on (`R.pageOf`) is computed lazily from bounding rects and reset by `layout()`. Only one chapter is in the DOM at a time.
- One pointer pipeline in `initGestures()` decides between a tap (open the bubble, turn at the edges, toggle the controls), a long press (≈480 ms; then dragging extends a phrase selection, up to `MAX_PHRASE` words), and a horizontal drag (page curl or slide). A flick needs at least 30 px, and a tap within 450 ms of the bubble or a sheet closing does nothing, so taps on them can't fall through and turn the page. `#page-area` has `touch-action: none` so iOS can't cancel these gestures. `R.busy` blocks input while a turn animates.
- Page curl (`curl.js`): `beginCurl` builds two full-screen copies of the turning page (`curlPage()`: **a clone of `#page-content`** plus the running head and page number) and the real element moves to show the page underneath. One copy is the front; the other is mirrored across the fold at low opacity as the see-through back of the flap. The curl layer sits above the page number but below the buttons. The clone keeps the duplicate id on purpose, because the reading styles are keyed on `#page-content`. The curl is skipped on wide two-column layouts (≥900px) and at chapter boundaries, which use a slide or fade instead.
- Mark Chapter Complete marks the chapter's blue words Known and records them in `book.progress.marked[chapter]`, so its Undo toast, or Mark Chapter Not Complete in the menu later, can revert exactly those. For chapters completed before that was recorded, `guessMarked()` takes the biggest same-timestamp batch of the chapter's plain Known words.
- `leavePage()` runs on every forward turn: it bumps the stats and marks the page's blue words Known, with Undo through `revertToNew`. Words inside `h1`/`h2` are excluded.

### Reading goals (`goals.js`)
- Each book can have `goal: {pages, since, cheered}` (pages a day). Progress is the reading *position* in words (`wordsAt`), so jumping ahead counts and re-reading doesn't count twice. `progress.frac` says which page to reopen at; `progress.read` (page / pages, or 1 once the book is finished) is how much of the chapter is behind you, and is what goals and `bookPct` use.
- `trackProgress()` runs on every `saveProgress()` in the reader: it keeps `book.log[date] = {from, to}` (today's pages = to − from) and `book.milestones` (25/50/75/100% → date reached; `null` for ones passed before tracking started, which aren't celebrated). It returns celebrations, which the reader shows one at a time in `#r-cheer` at the top, clear of the bottom toasts.
- A "page" is `settings.wordsPerPage`, measured by `layout()` from the current chapter (only when it has 3+ pages), so it follows text size.
- The goal sheet opens from the reader menu, the Library ⋯ menu and Home's goal cards.

### Difficulty and achievements (`difficulty.js`, `achievements.js`)
- A book's difficulty is the share of its distinct words that are New (status 0), leaving out Ignored ones, as LingQ rates lessons. Each book's word list is built from its chapters once per session and kept in memory. `fillDifficulty()` fills `[data-diff]` placeholders after a view renders (`data-long` gives the full wording).
- Badges (known words, words read, best streak of days meeting the minutes goal, books finished) are all derived from data. Only the date each was earned is stored, in `langreader.badges`. `boot()` runs the first check so badges you already had are recorded quietly (date `null`). After that, the reader checks 2 s after each progress save and celebrates new ones in `#r-cheer`.

### Word frequency and the Stats tab (`freq.js`, `themes.js`, `statsview.js`)
- `data/freq-it-v1.json` ranks the 20,000 most common lemmas in 199 Gutenberg novels: `lemmas: [[lemma, count, "form|form…"]]` plus `total` (all non-name tokens). It's built offline by `tools/build-freq.mjs <morph-it.txt> <corpus dir>` (Morph-it! for form → lemma; `EXTRA` there holds hand-checked forms, and `DUMP_AMBIGUOUS=<n>` prints how frequent ambiguous forms were read). `sw.js` serves `data/` cache-first from the assets cache, so a rebuilt list needs a new file name (`-v2`) and a matching `URL` in `freq.js`.
- `freq.js` loads it once (boot starts the fetch) into a `Map` form → index. Listed forms win over a lemma spelled the same (*era* is *essere*). A lemma is known when any of its forms is Known; Ignored counts as known for coverage and bands but not for the known count or the level. Phrases don't count. `wordStats()` gives the level, coverage and bands; `themeWords()` a theme's words with their state.
- `recordSnapshot()` writes `lemmas`, `cover` and `coverL` into today's `days` record through `record()` in `stats.js` (fields that are set, not added). It runs at boot, when the reader closes and when the Stats tab renders; the trend reads these.
- The bubble's `.wp-freq` tag and the card's `.freq-line` come from `freqTagHTML()` / `freqSentence()`. The reader passes `isCommon` to `paragraphHTML`, which adds `c` to spans of the 2,000 most common lemmas; `#reader.common-hl` (`settings.commonHL`) styles `.s0.c` stronger and other `.s0` lighter. The in-place recolouring keeps `c`.
- Theme lists in `themes.js` are lemmas; any word that isn't a lemma in the list is dropped silently, so check new ones against the data file.

### Reviews (`srs.js`, `review.js`)
- LingQs (status 1–4) are spaced-repetition cards scheduled by FSRS-5 with default weights. `srs.js` is pure (unit-tested in `tests/srs.test.mjs`); the card lives on the word entry as `srs: {s, d, last, due, reps, lapses, tap}`. A LingQ without `srs` is a new card.
- Reading is review: `leavePage()` passes the page's LingQs (words, plus phrases via `.ph0`) and `R.tapped` (terms tapped in this chapter) to `creditReading()`. Each card gets one credit a day: read past → Good, tapped → Again (once a day, `srs.tap`). A LingQ saved today is left alone. Writes go through `updateMany()` in `vocab.js`.
- Levels follow stability up (`levelFor`) but never down, except Again drops one level. A card with stability ≥ 180 days becomes Known and leaves the reviews.
- The day is capped (`settings.reviewsPerDay`, `settings.newPerDay`); `buildQueue()` orders due cards by (1 − recall) × word weight (frequency dots; phrases 3) and new cards by weight. Counts done today are in localStorage `langreader.srsDay`. The UI only shows today's share, never the backlog; "Review 10 more" raises today's cap for the session. `settings.retention` (relaxed/normal/intense = 80/85/90%) sets intervals.
- The review sheet (`reviewSheet()`) is a 3D flip card (`.card3d` with `.face.front`/`.face.back` stacked in one grid cell). Flashcards can be swiped (right → Good, left → Again); the rated card is cloned into `#sheet` as `.rv-fly` to fly off while the next one renders. With `settings.reviewStyle` `'mixed'` (the default), due cards take turns by `srs.reps % 3`: flashcard, fill the gap (`cloze`, needs the word in its `example`) and pick the meaning (`choice`); distractors come from your other words. New and forgotten cards are always flashcards. A right pick rates Good, a wrong one Again. Tests that click through flashcards preset `reviewStyle: 'flip'`.
- On the back of the card you can play the word and its sentence, fix the meaning (inline edit, or tap a suggestion in the Dictionary panel, built from `dictHTML()`/`dictionaryHints()` in `wordcard.js`). Undo (button or Z) restores the card's previous `status`/`srs` and today's counts. Keys: Space flips, 1–4 rate or pick, ←/→ swipe.

### Word lookup (`bubble.js` → `wordcard.js`)
- Tapping a word opens the small bubble. ⋯ opens the full card in the shared sheet. Phrases open the full card directly.
- Lookup order: the saved meaning, then Wiktionary (`dictionary.js`, used only when the translation language is English; it follows "… of *lemma*" links to the base form), then MyMemory (`services.js`). Both are cached in `tcache`. Google Translate links are plain URLs built by `googleTranslateURL`.

### Speech (`services.js` → `piper.js` → `tts-worker.js`)
- `speak()` uses a Piper neural voice that runs on the device. `settings.voice` `''` (the default) is Riccardo; `'piper:paola'` and `'piper:serena'` are the other two (`VOICES` in `piper.js`). `'system'` picks the best device voice, and any other value is a device voice's name. Until the Piper voice has loaded, or if it fails, the Web Speech voice speaks instead.
- With `settings.speakOnTap` (default on), `onTap()` in the reader says the tapped word or saved phrase. It has to call `speak()` synchronously in the tap, for iOS.
- `prepareVoice()` (called when the reader opens, and when the voice setting changes) starts the worker loading. The worker keeps one voice in memory and releases the previous one when you switch. `tts-worker.js` is a classic worker: `piper_phonemize` (espeak-ng in WebAssembly, one fresh instance per call) turns text into phoneme ids, one line per sentence, and ONNX Runtime runs the voice model. `piper.js` caches the last 60 clips and plays them through Web Audio. `unlockAudio()` has to run synchronously in the tap, for iOS.
- The models and runtime live in `voices/` and `vendor/` (see `vendor/README.md`): 28 + 64 + 64 MB of voices and 16 MB of runtime. `sw.js` serves those two folders cache-first from their own `langreader-assets-v1` cache, which survives `VERSION` bumps. So never change one of those files in place: give it a new name.
- `openApp()` sets the device voice unless you pass `voice: ''`, so only `tests/voice.test.mjs` loads the Piper voices.

### UI conventions (`ui.js`)
- `openSheet()` **replaces `#sheet-body` with a fresh element** every time, so a sheet's listeners never leak into the next one. Attach handlers to the returned body.
- The reader themes are CSS variables on `#reader[data-theme]`, plus a `.dark` class. While the reader is open, `documentElement[data-appearance]` is set so the shared sheets follow the reader's light/dark appearance.
- On iOS, `haptic()` (`haptics.js`) clicks a hidden `<input type=checkbox switch>`, because iOS Safari has no Vibration API. It only fires when called synchronously from a user gesture.
- `storage.js` asks for persistent storage, tracks backup reminders, and saves exports through the iOS share sheet (`navigator.share` with files) when available.

### Bundled content (`samples/`)
`sample.js` (*Un caffè a Bologna*) and `stories.js` hold the original stories. Each has a stable `id`. `addBundledStories()` in `app.js` adds each id once per device, never re-adds a deleted story, and skips titles already in the library. To ship a new story, append it to `STORIES` with a new id; existing installs pick it up on their next launch. Add its character names to `js/names.js` too.
