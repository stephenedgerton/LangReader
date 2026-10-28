# LangReader

A web app for reading Italian on your phone. It looks and feels like **Apple Books** and has the reading tools of **LingQ**. It runs in the browser and installs to the iPhone home screen as an app. There's no build step, no server and no account. Everything is stored on your device.

## Features

**Apple Books-style reading**
- Library grid with book covers (taken from the EPUB, or generated), a "Continue" book and progress percentages
- A Reading Goals ring that times today's reading, plus a streak count
- Real pages instead of scrolling, with Books' **page curl** that follows your finger (or Slide / None). Tap the left or right edge to turn. Two columns on wide screens.
- Themes & Settings: Original, Quiet, Paper, Bold, Calm and Focus themes, each with a dark version. Font size, the iOS Books fonts (New York, Athelas, Charter, Georgia, Iowan, Palatino, San Francisco, Seravek), line spacing, margins and justified text.
- Contents list, chapter name at the top, "N pages left in chapter" at the bottom, and controls that hide while you read

**LingQ-style learning**
- Tap a word for a quick **bubble** above it: the top meaning, its base form, pronunciation and the 1–4 / Known buttons. Tap ⋯ for the full card.
- The full card shows Wiktionary definitions and the base form of inflected words (*arrivò* → *arrivare*), with one tap to open the base word.
- Unknown words are **blue**, LingQs (words you're learning) are **yellow** at 4 levels, and known words are plain.
- The word card shows translation hints, your own meaning, the 1–4 / Known / Ignore levels, the sentence with a translation, Italian pronunciation, and links to WordReference, Reverso, Treccani, Wiktionary and Google
- **Phrases**: hold a word and drag across the phrase (or hold, lift, and tap the last word) to save it as one LingQ. A quick swipe still turns the page.
- First-run reading tips (Settings › Show reading tips again)
- **Turning the page marks the blue words you skipped as Known**, like LingQ, with an **Undo** button. Chapter titles don't count. You can switch this off.
- Light haptic feedback when you set a level or save a meaning (iPhone with iOS 18+, and Android).
- Words on this page, Translate Page, Listen to Page (text-to-speech), and Mark Chapter Complete
- Vocabulary list (LingQs, Phrases, Known, Ignored), flashcard review, and CSV export for Anki
- Stats for known words, LingQs, words read today and new known words today
- Elisions split the way LingQ does: *dell'anno* becomes *dell'* + *anno*

**Import**: paste text, or open `.txt` or `.epub` files. Lines like "Capitolo 2" split pasted text into chapters.

**Bundled stories**: five original stories ship with the app and are added to the library once: *Un caffè a Bologna* (A2–B1), plus four B1 stories, one each in sci-fi, mystery, crime and fantasy. Add more in `samples/stories.js`, each with its own `id`.

## Run it

Any static file server works:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

### On your iPhone
1. Host the folder over HTTPS. The easiest way is **GitHub Pages**: repo Settings → Pages → Deploy from branch → `main` / root.
2. Open the URL in Safari → Share → **Add to Home Screen**. It then opens full-screen and works offline.
3. For better pronunciation, download an enhanced Italian voice in iOS Settings → Accessibility → Spoken Content → Voices → Italian.

## Notes
- Word lookups use [Wiktionary](https://en.wiktionary.org) (free, no key): parts of speech, definitions, and the base form of inflected words (*arrivò* → *arrivare*). Wiktionary lookups apply when translating into English.
- Sentence translations, and words Wiktionary doesn't have, use the free [MyMemory](https://mymemory.translated.net) API. Results from both are cached on the device. Adding your email in Settings raises MyMemory's daily free limit.
- All data lives in IndexedDB on the device. Use Settings → Export to back it up or move it to another device.
