# Vocabulary stats: frequency, themes and fiction coverage

Agreed in a grilling session on 2026-10-30. This records the decisions; the code is the source of truth for details.

## Data

- `data/freq-it-v1.json` holds the 20,000 most common Italian **lemmas** (dictionary forms) in fiction, ranked, each with its corpus count and the word forms that belong to it. It is built once, offline, by `tools/build-freq.mjs` from:
  - 199 Italian novels from Project Gutenberg by authors born 1830 or later (`tools/gutenberg-ids.txt`). Liber Liber was the other candidate, but its downloads sit behind a CAPTCHA.
  - Morph-it! (Baroni & Zanchetta, CC BY-SA 2.0 / LGPL) for form → lemma, with gaps filled from the novels and a short hand-checked table. The Universal Dependencies treebanks would have resolved ambiguous forms better, but they are non-commercial (CC BY-NC-SA), so they aren't used.
- Only derived counts ship, never the novels. The file is served cache-first like the voices, so a change means a new file name (`-v2`).
- Caveat: the novels are about a century old, so modern words rank lower than in today's Italian (*telefono* is #7020).

## Matching your vocabulary

- A lemma counts as **known** when any of its forms is Known (status 5); knowing *arrivò* means *arrivare* is known. It is **learning** when any form is a LingQ (1–4) and none is Known.
- **Ignored** words count as known for coverage and bands, but not toward "words you know" or the level estimate. Names are already removed from the list.
- Phrases are left out.

## What you see

- **Tapping a word**: the bubble shows the lemma's rank and band, e.g. *arrivare · #268 · Top 500 ●●●●○* (the lemma is named only when it differs from the form). Beyond the list: *Rare · beyond top 20k*. The full card gives the same in words.
- **Stats tab** (a fourth tab):
  - Level estimate, labelled rough, from known lemmas: A1 500, A2 1,000, B1 2,000, B2 4,000, C1 8,000.
  - Fiction coverage: the share of running words in a typical novel you know, with the 95% and 98% comfort lines. Known is solid; learning is stacked on top as a separate "+% learning" layer and never counted in the main number.
  - Frequency bands: top 100 / 500 / 1k / 2k / 5k / 10k / 20k, each with known and learning.
  - Trend: fiction coverage over time from a daily snapshot (stored from now on in the `days` store, no reconstruction of the past), with a forecast of when you'd reach 95%.
  - Themes: about 25 hand-picked themes (food, travel, body …) with % known; tapping one lists its words, missing ones first.
- **Reader**: new (blue) words among the top 2,000 lemmas get a stronger mark. A setting, on by default.

## Out of scope for now

Parts of speech, other genres (news, conversation), frequency-ordered review, a "learn next" list.
