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
- Written by hand, not machine-translated, always with *tu* in the partner packs. The packs shipped with
  25–30 sentences each; rev 2 grew every pack to 300 or more, so the daily plan has plenty of new ones. Planned packs: Survival, Partner: everyday, Partner: plans & errands, Café & restaurant,
  Directions, Shopping, Small talk, Travel, Feelings, When I don't understand.
- `tools/check-sentences.mjs` and `tests/sentences.test.mjs` read every sentence with the app's tokenizer
  and lemma list: unknown words (typos), gender markup with both halves, pack sizes, unique ids, and a
  "common lemmas only" target for the Survival and Partner packs (at most 12 words outside the 2,000
  commonest, or one for every three sentences in a bigger pack).

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

Designed in `docs/focus-mode-plan.md`.
