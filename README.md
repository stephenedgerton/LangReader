# LangReader

A web app for reading Italian on your phone. It looks and feels like **Apple Books** and has the reading tools of **LingQ**. It runs in the browser and installs to the iPhone home screen as an app. There's no build step, no server and no account. Everything is stored on your device.

## Features

**Apple Books-style reading**
- Library grid with book covers (taken from the EPUB, or generated), a "Continue" book and progress percentages
- A Reading Goals ring that times today's reading, plus a streak count
- Real pages instead of scrolling: swipe pages that follow your finger, or tap the left or right edge to turn. Two columns on wide screens.
- Themes & Settings: Original, Quiet, Paper, Bold, Calm and Focus themes, each with a dark version. Font size, the iOS Books fonts (New York, Athelas, Charter, Georgia, Iowan, Palatino, San Francisco, Seravek), line spacing, margins and justified text.
- Contents list, chapter name at the top, "N pages left in chapter" at the bottom, and controls that hide while you read

**LingQ-style learning**
- Every word is tappable. Unknown words are **blue**, LingQs (words you're learning) are **yellow** at 4 levels, and known words are plain.
- The word card shows translation hints, your own meaning, the 1–4 / Known / Ignore levels, the sentence with a translation, Italian pronunciation, and links to WordReference, Reverso, Treccani, Wiktionary and Google
- **Phrases**: long-press a word, then tap the last word, to save a phrase as one LingQ
- **Turning the page marks the blue words you skipped as Known**, like LingQ. You can switch this off.
- Words on this page, Translate Page, Listen to Page (text-to-speech), and Mark Chapter Complete
- Vocabulary list (LingQs, Phrases, Known, Ignored), flashcard review, and CSV export for Anki
- Stats for known words, LingQs, words read today and new known words today
- Elisions split the way LingQ does: *dell'anno* becomes *dell'* + *anno*

**Import**: paste text, or open `.txt` or `.epub` files. Lines like "Capitolo 2" split pasted text into chapters.

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
- Translations come from the free [MyMemory](https://mymemory.translated.net) API, cached on the device. Adding your email in Settings raises the daily free limit.
- All data lives in IndexedDB on the device. Use Settings → Export to back it up or move it to another device.
