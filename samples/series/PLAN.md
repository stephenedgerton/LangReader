# La casa gialla: the series plan

Twenty graded books, one continuous cozy mystery. Book 1 assumes no Italian. By book 20 the reader has met
the 2,000 most common lemmas in Italian fiction (`data/freq-it-v1.json`), minus the noise listed in `SKIP`
in `tools/series-words.mjs`, and is reading an ordinary short novel in the literary past tense.

All twenty are in the library from the start. The reader is assumed to be an English speaker, so the
early books lean on transparent cognates (*stazione, treno, problema, famiglia, momento*).

## Checking

`node tools/check-series.mjs` reads every book with the app's tokenizer and lemma list:

- **unfamiliar**: share of words the reader has met fewer than 3 times so far in the series. About 100
  new words a book makes this roughly 300 / book length, so the caps fall as the books grow: 20% for
  books 2–3, 14% for 4–5, 10% for 6–8, 7% for 9–12, 5% after that (95% familiar is where reading gets
  comfortable). Book 1 is exempt.
- **new tgt / covered**: target lemmas introduced by the book and covered so far, against `PLAN`.
- **thin**: new target words used fewer than 4 times in the book that introduces them (information only).
- **unreinf**: words introduced in earlier books that still have fewer than 4 uses in all, after this
  book. Keep it small and falling: each book picks up what the earlier ones left thin.
- **unknown**: words outside the 20,000-lemma list that aren't names: typos or wrong forms. Must be zero.
- **late**: archaic words (`LATE`: *egli, uscio, udire …*) used before book 16. Must be zero.

`node tools/check-series.mjs --next 80` lists the most common target words not used yet, for planning the
next book. `tests/series.test.mjs` fails on unknown words, early late words and books over the unfamiliar cap.

## Style rules (there's no native reviewer, so play safe)

- Standard Italian only: no dialect, no slang. Ligurian colour comes from places, food and the sea.
- Prefer the plainest correct construction over an idiom; use an idiom only when it's certain and common.
- Strangers and older people use *Lei*; friends switch to *tu* in book 3 (Giulia proposes it).
- Each book recycles the earlier books' words; a new word appears at least 4 times where it's introduced.
- Narration is third person. The tense of the narration follows the grammar plan below; dialogue can run
  slightly ahead of it (a past tense in speech before it's used in narration). Book 1 has a few fixed
  past forms (*era, parlava, è morta*) because the grandmother is dead; keep such forms rare until book 6.
- Reread every book for agreement (gender, number), clitic order, auxiliaries (*essere* with motion and
  reflexive verbs), prepositions with articles, and accents (*è, perché, più, città*).

## Setting and people

**Montemare**, a small fictional village on the Ligurian coast between Genoa and La Spezia: a harbour,
coloured houses, steep narrow lanes (*strade strette*, not the dialect *carruggi*), a church on the hill, the ruined villa of the old counts above the village, a tower on the point.
The story runs from November to May.

- **Kate Morley**, 34, an illustrator of children's books from Bristol. Speaks no Italian at the start; draws everything.
- **Margherita Ferrante** (1925–2026, aged 101), Kate's great-aunt, whom she never met. Leaves Kate *la casa gialla*
  on the harbour. Never married.
- **Lucia Ferrante** (1927–2016), Margherita's younger sister and Kate's grandmother. Left Italy in 1946, married in
  England, never spoke Italian at home and never spoke about Montemare. Died ten years ago.
- **Nebbia**, Margherita's grey cat, who comes with the house.
- **Giulia**, 40s, runs the Bar del Porto. Warm, talks a lot, the village's news.
- **Tonino**, 80s, retired fisherman. Knew Margherita all his life. Speaks slowly; tells the old stories.
- **Matteo**, 30s, carpenter who restores old houses. Quiet; a slow friendship that becomes more.
- **Avvocato Rinaldi**, the lawyer who handles the will.
- **Elena**, the schoolteacher and keeper of the small village archive; reads old handwriting. Gives Kate
  Italian lessons from book 5.
- **Signora Teresa**, over 90, black hat, knew the sisters as a girl; speaks to nobody but Kate ("what
  people say isn't true"). **Don Piero**, the old priest. The **antique dealer** behind the church, who
  says Bellini asks him every year about a woman's portrait from the yellow house.
- **Giulia's family**: her husband Paolo and their children Sofia and Marco. **Luca**, the little boy
  from the bread stall, who says the yellow house changes at night.
- **Ingegner Bellini**, an engineer from Genoa who wants to buy the house for a hotel.
- In 1944: **Andrea**, Lucia's fiancé, a partisan; **Ettore Bellini**, the engineer's grandfather; a
  German officer, **il capitano Weber**, quartered in the yellow house.
- In the 1880s: **Capitano Giacomo Ferrante**, sea captain who built the house; **Isabella**, the young
  countess of the villa; a painter who painted her portrait.

**Margherita's letter.** The lawyer hands Kate a two-page letter from Margherita, in Italian. Kate
decides not to have it translated: she'll read it herself when she can. Each book she tries again and
understands a little more (a line or two quoted, more of it each time); she reads all of it in book 10.
It tells her the house is hers because of Lucia, and asks her to find "what I couldn't".

**The house.** The yellow house changes, and the story never fully says why. Its rules, which the
reader works out slowly and the book never states:

- It changes only at night, while Kate sleeps there, and never while anyone is watching.
- It shows Kate more as she understands more: each time she learns something true about the past, a door,
  a room or an object tied to it is there in the morning. It never takes back what it has shown.
- Nebbia always knows where the change is, and walks there first.
- The kitchen clock is stopped at *le dieci e venti*: the time Andrea died, in August 1944. Every clock
  Kate brings into the house stops at the same minute.

Rational hints run alongside: Captain Giacomo, once a ship's carpenter, built false walls, panels and a
turning bookcase, and Matteo finds some of the mechanisms. They explain some changes, never all (a room
longer inside than the outside allows, a window showing snow in May). Kate draws a floor plan every
morning; comparing the plans is how she, and the reader, spot what changed.

**Margherita's notes.** From book 4, short riddles in Margherita's hand turn up where the house has
changed. They're fair play: every clue is in the text, so a careful reader can solve each one a chapter
before Kate does. Keep each riddle within the vocabulary the reader has by then.

**How strongly, when.** Books 1–3: easy-to-miss details that could be imagination (the stopped clock and
a ticking at night in 1; in 2 the light square on the wall has moved and the box is under a bed that
was empty; in 3 Matteo's measurements don't add up). Book 5: the first change Kate can't deny. Part 2:
one change per book, each tied to what Kate learns. Parts 3–4: the house is a main thread alongside the
sisters' story. It's how the portrait is found (book 19, in a room that's on no plan), and after that it
stops changing, except for one last small thing on the last page.

**The mystery.** Why did Lucia leave and never come back? What did Margherita wait for all her life? Where
is the portrait that once hung in the house? The answers are layered: 1944 (a betrayal Lucia blamed on
her sister) and the 1880s (a forbidden love and the portrait itself).

## Grammar and register by part

| Part | Books | Narration | Dialogue adds | Register |
|---|---|---|---|---|
| 1 · L'arrivo | 1–5 | present | *mi piace*, *c'è*, a few fixed past forms; Elena teaches the passato prossimo in book 5 | everyday, short sentences |
| 2 · Le domande | 6–10 | present | passato prossimo (6), imperfetto (7), future (8), conditional (9), first subjunctives (10) | everyday; old people's stories in the past |
| 3 · Il diario | 11–15 | passato remoto + imperfetto | full subjunctive, pluperfect | 1940s diary, plainly written |
| 4 · Le lettere | 16–20 | passato remoto | everything | 19th-century letters; `LATE` words allowed |

## The books

The word and lemma columns are the first estimates. The live targets are `PLAN` in
`tools/series-words.mjs`, which the checker prints next to each book.

| # | Title | Story | Words | Target lemmas by the end |
|---|---|---|---|---|
| 1 | Una casa a Montemare | Kate arrives by train. Giulia's bar, the lawyer, the key, the yellow house, the cat. | 1,500 | 160 |
| 2 | Il gatto e la scatola | First days: the market, the harbour, Tonino. A locked box, a photo of two girls. | 2,000 | 260 |
| 3 | Il mare d'inverno | Matteo starts on the house; his measurements don't add up, and Kate begins her morning floor plans. A storm. Tonino: "Margherita waited for someone all her life." Kate decides to stay the winter. | 2,500 | 360 |
| 4 | Una lettera nel muro | A 1946 letter in a wall that wasn't hollow yesterday: "Lucia, perdonami." Margherita's first riddle note. Bellini offers to buy the house. | 3,000 | 460 |
| 5 | Natale al porto | Christmas morning: a door on the top floor that has never been there, and behind it two girls' bedroom. Christmas in the village. Italian lessons with Elena. The photo: two sisters and a young man. Kate's mother: Nonna never spoke of Italy. | 3,500 | 560 |
| 6 | Quello che ricorda Tonino | Tonino tells of the war: the two sisters, Andrea, the summer of 1944. | 4,000 | 660 |
| 7 | Il quadro che manca | A smell of fresh paint in a room nobody has painted in for 80 years. The pale square on the wall. An old inventory lists "ritratto di donna". Bellini shows interest in the cellar. | 4,500 | 760 |
| 8 | La chiesa sulla collina | The parish records (Kate already saw Andrea's name on the war memorial at Christmas). Don Piero remembers. | 5,000 | 860 |
| 9 | Il diario in cantina | The cellar stairs go one floor further down than yesterday. Kate and Matteo find Margherita's diary there, water-damaged. Elena helps read it. | 5,500 | 960 |
| 10 | Una notte di tempesta | Someone breaks in, but the doors are never where the intruder expects. Kate finally reads Margherita's whole letter. The box opens: a ring and a second key. | 6,000 | 1,060 |
| 11 | Estate 1944 | Diary: the village under occupation; Lucia and Andrea; Margherita's secret. | 6,500 | 1,160 |
| 12 | Il capitano tedesco | A room appears furnished as in 1944. Diary: Weber is quartered in the house, loves painting, wants the portrait. Margherita hides it. | 7,000 | 1,260 |
| 13 | Il tradimento | Diary: someone tells the Germans where Andrea hides. Andrea is killed. Lucia blames her sister. | 7,500 | 1,360 |
| 14 | Due sorelle | Diary: Margherita was bargaining with Weber to save Andrea; the informer was Ettore Bellini. Lucia leaves. | 8,000 | 1,450 |
| 15 | La verità a metà | Kate tells Bellini; he knew. He withdraws his offer. The diary's last line: "Il ritratto è con il capitano." | 8,500 | 1,540 |
| 16 | Il capitano Giacomo | Elena finds Giacomo Ferrante's letters from the 1880s in the archive. | 9,000 | 1,630 |
| 17 | La contessa della villa | Isabella, the villa on the hill, the painter and the portrait; her marriage to the count. | 9,500 | 1,720 |
| 18 | Il naufragio | Giacomo's last voyage; the letters stop. Which captain did Margherita mean? | 10,000 | 1,800 |
| 19 | La stanza che non c'è | The search: the family chapel, the tower on the point, the captain's plans. The portrait is found in a room that is on no plan. | 11,000 | 1,870 |
| 20 | La casa gialla | Spring. The house stops changing. The portrait comes home; the sisters' story is told; Kate stays in Montemare. | 12,000 | 1,930 |

About 136,000 words in all. Vocabulary each book naturally brings: 1–5 travel, food, house, family,
weather, the sea, numbers, time, Christmas; 6–10 war and memory, church, art, the law, the night; 11–15
occupation, soldiers, fear, hiding, betrayal, love; 16–20 ships, nobility, honour, fate, the old world.

## Written so far (books 1–5)

What later books must stay consistent with:

- The kitchen clock is stopped at 10:20, with *12 agosto 1944* hidden inside it (Margherita's first riddle).
- The 1946 letter "Per Lucia" from the salotto wall: "perdonami… io volevo solo salvare…", then
  "Torna a casa. Ti aspetto sempre."
- The silver button from the stairs, after the dream of the two girls.
- Behind the Christmas door on the top floor: the girls' room, with two beds, their drawings and a
  calendar stopped at August 1944. Matteo's missing metre is now there.
- Lucia married a British soldier she met in Genoa and left in 1946. Andrea's photo, taken by the tower,
  was in her books. His name is on the war memorial: "Andrea, di anni 20. 12 agosto 1944."
- Bellini's offer is refused ("anche le case cambiano"). He asks the antique dealer every year about a
  woman's portrait. Margherita bought frames there, never paintings. Margherita drew as a girl.
- Kate's letter so far: "Cara Kate, questa casa è tua. È tua perché è di Lucia, e Lucia non può tornare.
  Non avere paura della casa. La casa ti mostra solo quello che sei pronta a vedere." It says
  "perdonami" twice.
- Tonino promised at Christmas to tell everything after Christmas (book 6).
- Still owed after book 5: about 110 words from books 1–5 are under 4 uses; book 6 should work them down.

Open threads and small facts to keep straight:

- **Still unresolved:** the locked wooden box from under the bed (book 2), whose small key isn't found
  until book 10; the light square in the salotto (where the portrait hung).
- **Kate's letter:** two pages, not finished.
- **Season:** book 5 ends on Christmas Day, so book 6 starts in the days after Christmas.
- **Kate's habits:** a floor plan every morning in her drawing book, with notes on it ("Il metro c'è",
  "Bottone. Sogno?"); her picture book about a grey city cat who goes to the sea; two lessons a week
  with Elena.
- **Elena's promise:** "there's another form for very old stories, but that's for another day". That's
  the passato remoto, so pay it off when the diary starts (book 11).
- **People:** Giulia and Kate use *tu*; Tonino uses *tu* to Kate and she uses *tu* back since book 3.
  Kate and Elena use *tu*; the lawyer, Bellini and the antique dealer use *Lei*.
- **Matteo:** gave Kate a small grey wooden cat (on the kitchen table, under the clock). He worked ten
  years in an office in Milan, then came home and has restored houses for five years. His
  grandfather watched the German ships from the tower as a boy and said "non tutti erano amici".
- **Unexplained so far:** the ticking at night is always the kitchen clock, which never moves.
  Nobody has explained the notes "Per Kate" (Kate thinks Margherita prepared them before she died).

## How to write the next book

What worked for books 1–5:

1. **Plan the scenes.** Work from this file and `node tools/check-series.mjs --next 150` (the most
   common unused target words). Pick the ones the story's subject brings naturally.
2. **Plan more scenes than feels necessary.** Drafts have come out at about 60% of the planned word
   count every time.
3. **Write, then run the checker.** `node tools/check-series.mjs <n>` lists the book's new words, its
   thin ones, and every earlier word still under 4 uses.
4. **Fix the owed words with scenes, not lists.** Write one or two extra scenes that use the owed words
   naturally: the bar, the market, an errand, a dinner, a dream, a walk. Don't add filler sentences.
5. **Proofread the whole book** (print it with the snippet below), then run the checker again. Mistakes
   caught so far:
   - Present tense where Italian needs a past: "ieri sera Kate ha paura" (→ aveva), "forse Margherita
     prepara tutto" (→ ha preparato), "il bottone cade" (→ è caduto), "chi la scrive?" (→ chi l'ha
     scritta?). Look-backs need the passato prossimo; dead people's habits need the imperfetto.
   - Subjunctives sneaking in before book 10 ("prima che suoni", "credo che sia"). Rephrase them.
   - Wrong verbs and idioms: getting out of a car is *scendere*, not *uscire*; a knock is *bussare*;
     "aprire gli occhi grandi" isn't Italian (say *è molto sorpresa*).
   - Continuity: who uses *tu* or *Lei*; what's in each room; dates; ages.
   - Dialogue in English (Kate and her mother) is still written in Italian, as a convention.
6. **Ship it** (see `CLAUDE.md`, "Bundled content"):
   - add the book to `SERIES.books` and `REVS` in `index.js`, to `SHELL` in `sw.js`, and to the title
     list in `tests/library.test.mjs`;
   - add new names to `js/names.js` and bump `NAMES_VERSION`;
   - bump `VERSION` in `sw.js`;
   - raise a book's `REVS` number whenever a released book's text changes;
   - update "Written so far" above.
7. **Run `node --test`.** `tests/voice.test.mjs` sometimes times out under the full run; when it fails,
   run it on its own (`node --test tests/voice.test.mjs`) to confirm it passes.

To print a book for proofreading:
`node --input-type=module -e "import {loadSeriesBook} from './samples/series/index.js'; const b=await loadSeriesBook(5); for (const c of b.chapters) for (const x of c.blocks) console.log(x.x)"`

Workflow with the owner: write on branch `langreader-app`; merge to `main` (open a PR, then merge) only
when asked, since merging is the deploy.
