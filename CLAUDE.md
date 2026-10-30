# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LangReader is a phone-first web app (PWA) for reading Italian. It copies the look and gestures of Apple Books (paginated pages, themes, page curl) and the learning features of LingQ (blue/yellow word statuses, LingQs, phrases, "page turn marks blue words known"). It's plain HTML/CSS/ES modules: **no build step, no package.json, no dependencies, no CDN**. All user data stays on the device.

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

`index.html` holds the static shell: three tab views, the `#reader` overlay, and one shared bottom `#sheet`. `js/app.js` boots the app (loads vocabulary, adds bundled stories, registers the service worker) and renders the Home, Library and Vocabulary tabs as HTML strings. `js/reader.js` owns everything inside the reader.

### Data (`db.js`, `vocab.js`, `settings.js`)
- IndexedDB `langreader` has these stores: `books` (metadata and progress; `chapterTitles` and `chapterWords` are denormalised here), `chapters` (key `${bookId}:${idx}`, `blocks: [{t:'h'|'p', x}]`), `words` (vocabulary), `tcache` (translation and dictionary cache), and `days` (daily stats). Adding a store means bumping `DB_VERSION` and adding it in `onupgradeneeded`.
- Word status: a missing entry (status 0) is New/blue, 1–4 are LingQ levels (yellow), 5 is Known and -1 is Ignored. `setWord` *deletes* an entry that ends up at status 0 with no meaning. Terms are normalised by `normalize()` in `text.js`: lowercase NFC, with `’` turned into `'`. A phrase is stored as its normalised tokens joined by single spaces, with `phrase: true`.
- `vocab.js` keeps every word in an in-memory `Map` loaded at boot, and notifies `onChange` listeners. The reader recolours matching `.w[data-w]` spans in place, and re-renders the whole chapter when a phrase changes, because phrase underlines are computed at render time.
- A word entry keeps `example` (the sentence it was saved from, set once) and `exampleTr` (that sentence's translation, once the user translates it). Phrase entries also keep `display`, the text as printed with its punctuation.
- `names.js` lists names that `ignoreNames()` in `app.js` marks Ignored on first launch through `setMany` (which never touches existing entries). Bump `NAMES_VERSION` after adding names. Leave out names that are also ordinary words. These pre-seeded names don't count toward the backup reminder.
- Settings live in localStorage `langreader.settings`, behind a Proxy that saves on every write (avoid writing in hot paths). Other localStorage keys: `langreader.seeded`, `langreader.samplesAdded`, `langreader.tipsSeen`, `langreader.lastBackup`, `langreader.backupSnooze`, `langreader.namesIgnored`.

### Text and rendering (`text.js`)
- `tokenize` splits elisions the way LingQ does (*dell'anno* → *dell'* + *anno*) and keeps the apostrophe only on known truncations (*po'*). `paragraphHTML` wraps sentences in `.sent` and words in `.w` spans carrying status classes `s0`–`s4`, plus `ph` for words inside a saved phrase. Phrases match within one paragraph only, so a selection can't cross paragraphs. How the classes look depends on `#reader[data-hl]`: `underline` (LingQ's style, the default) or `background`.
- `textToChapters` splits pasted or .txt text on headings like "Capitolo N". `importer.js` also splits chapters longer than about 4000 words, and has its own minimal ZIP reader (built on `DecompressionStream`) for EPUB.

### Reader (`reader.js`)
- Pages come from **CSS multi-column layout**: `#page-content` is one column-filled element shifted by `translateX(-page * R.step)`. The page count comes from the position of the trailing `.end` marker. Which page each word span is on (`R.pageOf`) is computed lazily from bounding rects and reset by `layout()`. Only one chapter is in the DOM at a time.
- One pointer pipeline in `initGestures()` decides between a tap (open the bubble, turn at the edges, toggle the controls), a long press (≈480 ms; then dragging extends a phrase selection, up to `MAX_PHRASE` words), and a horizontal drag (page curl or slide). A flick needs at least 30 px, and a tap within 450 ms of the bubble or a sheet closing does nothing, so taps on them can't fall through and turn the page. `#page-area` has `touch-action: none` so iOS can't cancel these gestures. `R.busy` blocks input while a turn animates.
- Page curl (`curl.js`): `beginCurl` **clones `#page-content`** for the turning page, and the real element moves to show the page underneath. The clone keeps the duplicate id on purpose, because the reading styles are keyed on `#page-content`. The curl is skipped on wide two-column layouts (≥900px) and at chapter boundaries, which use a slide or fade instead.
- `leavePage()` runs on every forward turn: it bumps the stats and marks the page's blue words Known, with Undo through `revertToNew`. Words inside `h1`/`h2` are excluded.

### Reading goals (`goals.js`)
- Each book can have `goal: {pages, since, cheered}` (pages a day). Progress is the reading *position* in words (`wordsAt`), so jumping ahead counts and re-reading doesn't count twice. `progress.frac` says which page to reopen at; `progress.read` (page / pages, or 1 once the book is finished) is how much of the chapter is behind you, and is what goals and `bookPct` use.
- `trackProgress()` runs on every `saveProgress()` in the reader: it keeps `book.log[date] = {from, to}` (today's pages = to − from) and `book.milestones` (25/50/75/100% → date reached; `null` for ones passed before tracking started, which aren't celebrated). It returns celebrations, which the reader shows one at a time in `#r-cheer` at the top, clear of the bottom toasts.
- A "page" is `settings.wordsPerPage`, measured by `layout()` from the current chapter (only when it has 3+ pages), so it follows text size.
- The goal sheet opens from the reader menu, the Library ⋯ menu and Home's goal cards.

### Word lookup (`bubble.js` → `wordcard.js`)
- Tapping a word opens the small bubble. ⋯ opens the full card in the shared sheet. Phrases open the full card directly.
- Lookup order: the saved meaning, then Wiktionary (`dictionary.js`, used only when the translation language is English; it follows "… of *lemma*" links to the base form), then MyMemory (`services.js`). Both are cached in `tcache`. Google Translate links are plain URLs built by `googleTranslateURL`.

### UI conventions (`ui.js`)
- `openSheet()` **replaces `#sheet-body` with a fresh element** every time, so a sheet's listeners never leak into the next one. Attach handlers to the returned body.
- The reader themes are CSS variables on `#reader[data-theme]`, plus a `.dark` class. While the reader is open, `documentElement[data-appearance]` is set so the shared sheets follow the reader's light/dark appearance.
- On iOS, `haptic()` (`haptics.js`) clicks a hidden `<input type=checkbox switch>`, because iOS Safari has no Vibration API. It only fires when called synchronously from a user gesture.
- `storage.js` asks for persistent storage, tracks backup reminders, and saves exports through the iOS share sheet (`navigator.share` with files) when available.

### Bundled content (`samples/`)
`sample.js` (*Un caffè a Bologna*) and `stories.js` hold the original stories. Each has a stable `id`. `addBundledStories()` in `app.js` adds each id once per device, never re-adds a deleted story, and skips titles already in the library. To ship a new story, append it to `STORIES` with a new id; existing installs pick it up on their next launch. Add its character names to `js/names.js` too.
