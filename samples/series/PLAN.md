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

## Written so far (books 1–10)

What later books must stay consistent with.

**Books 1–5**

- The kitchen clock is stopped at 10:20, with *12 agosto 1944* hidden inside it (Margherita's first riddle).
- The 1946 letter "Per Lucia" from the salotto wall: "perdonami… io volevo solo salvare…", then
  "Torna a casa. Ti aspetto sempre."
- The silver button from the stairs, after the dream of the two girls.
- Behind the Christmas door on the top floor: the girls' room, with two beds (Lucia's on the right, the
  one Nebbia sleeps on on the left), their drawings and a calendar stopped at August 1944.
- Lucia married a British soldier she met in Genoa and left in 1946. Andrea's photo, taken by the tower,
  was in her books. His name is on the war memorial: "Andrea, di anni 20. 12 agosto 1944."
- Bellini's offer is refused ("anche le case cambiano"). The antique dealer: Bellini asks him every year
  about a woman's portrait; Margherita bought frames there, never paintings. Margherita drew as a girl.

**Book 6 (late December – 6 January).** Tonino (7 in 1944, so about 89 now; wife Maria died 20 years ago;
daughter Anna in Genoa; boat called *Maria*) tells the story. The sisters' father was **il dottor Giuseppe
Ferrante**, the village doctor; their mother **Anna Rossi** died in 1935. Andrea, a fisherman's son, 13 years
older than Tonino, was a partisan (7th of 11 names on Elena's list; 7 came back, 4 didn't) and hid in a sea
**grotta** under the rock by the tower. Tonino carried bread there every morning; on 12 August he saw six or
seven soldiers going straight to the point, heard two shots, saw the church clock at 10:20. Andrea was left in
the piazza all day. Margherita was at home with the captain that morning; the village said she'd talked.
Lucia never spoke to her again. Tonino fears he showed the soldiers the way; Margherita told him "So di chi è
la colpa. E non è tua." Every 12 August Margherita sat by the tower from ten till evening; last August she
said "il prossimo anno viene qualcun altro". The house's change: an **eighth drawing**, a pencil portrait of
Andrea by the tower, signed "Margherita, luglio 1944". Also: Kate's flu (dottor Rizzi, the young doctor,
whose grandfather followed Ferrante), her New Year resolutions, Elena's class, the Befana rhyme, the order
signed "Capitano Weber". Letter line: "Io ho cercato per tutta la vita una cosa che non ho trovato."

**Book 7 (January).** Kate learns the imperfetto. Her grandmother hummed a Ligurian sea song without words.
Elena finds the **1938 notary's list** (on the grandfather's death): in the salotto "un ritratto di donna,
olio su tela, cornice d'oro, pittore di Genova dell'Ottocento, un metro per settanta" — the size of the pale
square. The seventh drawing in the girls' room is that portrait, "La signora del mare" (a young woman in
blue, seated before the sea, who looks at you from anywhere in the room). The change: a smell of fresh oil
paint in the salotto, three fresh drops (azzurro, bianco, rosso) under the square and an antique wet brush on
the windowsill. Kate's mother: Nonna stopped before a portrait in a museum and said "Noi ne avevamo uno così.
A casa." Bellini tells Kate his grandfather **Ettore Bellini** was born in Montemare, worked at the port in the
war, knew the house and the sisters, and called the portrait the finest he'd seen; he asks to see the cellar
(Matteo lies that it's unsafe). The dealer: Margherita's frames were always 1 m × 70 cm, for thirty years,
"per quando torna". Teresa: the captain sat before the portrait every evening; the doctor said it was a
countess from the villa. Matteo's grandfather's legend: a young unhappy countess married to an old count,
and a painter from Genoa. **Every clock Kate brings in stops at 10:20; phones don't.** Paolo's brother:
Bellini owns two houses next to Kate's and keeps them shut (the one on the left shares the cellar wall).
Kate and Matteo hold hands coming back from the villa. Letter line: "La cerca anche un'altra persona, e non
per amore."

**Book 8 (February).** Kate learns the future; her editor will publish the cat book (Fog) in the autumn.
Parish books: Margherita born 3 May 1925, Lucia 20 June 1927; Andrea "morto presso la torre… per mano dei
soldati tedeschi", buried 13 August "per il permesso ottenuto dal capitano Weber". **Don Piero** (10 in 1944,
rang the bells for **don Lorenzo**) saw Margherita in the salotto that evening pleading with the captain for
the burial permit; she watched the funeral from the window, and the village called her a coward. She
confessed every 12 August; her voice was "of someone who wanted to save someone and couldn't". Banns of
1 August 1944: Andrea and Lucia to marry on **16 September 1944** — "Non celebrato". The change: a narrow
wardrobe in the girls' room (wider than the door, so built inside it, with a hidden space behind its back,
1 m 80 × 70 cm, empty) and Lucia's **unfinished wedding dress**, made in secret by Margherita, with silver
buttons: Kate's button is the missing one. Teresa (11 in 1944; held the lamp) climbs to the room, her first
time in the house in 80 years, and reveals that **Margherita kept a diary** all her life. Paola (Luca's
mother, baker) tells of her grandmother **Nina**, the captain's cleaner: the captain was afraid of the house,
whose doors moved; "la casa gialla non ama chi entra senza invito". Bellini doubles his offer; a light moves
at night in his shut house and goes down to the cellar. **Matteo and Kate kiss** (dinner, after Carnevale was
interrupted by Luca). White flowers on Andrea's grave every Sunday since October, brought by a man with a
black car. Tonino: Ettore Bellini got rich in Genoa after the war, nobody knows how; **Margherita greeted
everyone except Ettore, for eighty years**. Kate's composition "Il mio inverno a Montemare" gets a 10.
Letter line: "Non credere a tutto quello che dice la gente."

**Book 9 (March).** Kate learns the conditional. Someone has been scraping the cellar wall from Bellini's
side; Matteo props it with oak beams. 8 March: Matteo gives Kate a branch of yellow flowers in front of the
whole bar. The change: Nebbia's stone in the cellar corner is a **botola** with an iron ring; 15 steps cut
in the rock lead to a vaulted room below the harbour, with a barred opening on the sea. There: the **30
empty gold frames** (1 m × 70 cm; the newest holds a card "Per quando torna"), and Captain Giacomo's sea
chest with his **original plan of the house** (rooms drawn then crossed out, double walls) and **Margherita's
diary**, sea-damaged; its first page: "Chi lo legge senza permesso sarà maledetto" and, in her old hand,
"Kate ha il permesso". Elena dries it a page at a time in the girls' room; many pages are lost. Readable
entries: 8 Sept 1943; Germans arrive 25 Sept; Weber moves in **2 October 1943**; she told the captain she
didn't know who painted the portrait ("Non è vero"); Andrea's night visits; the captain had a small museum at
home before the war; the dress begun in May; the Andrea portrait finished in July; the doctor treating a
German officer; Tonino's bread; the captain: "Ogni cosa ha un prezzo… Anche una persona"; last line before the
gap: "11 agosto 1944. Domani. Se Dio vuole, domani…". Bellini, at the grave, says his grandfather (died 15
years ago) made him promise three things: white flowers for Andrea once Margherita can't, buy the yellow
house at any price, find the portrait, which "was promised to him". He gave the keys of the next house to
**Rocco**, a big man with a scar on his right hand. School trip to the tower: Tonino tells the children.
Margherita's 100th birthday (May 2025): "mi dispiace soltanto una cosa: non ho rivisto mia sorella"; the next
day she had the lawyer find Kate, and wrote the letter. Luca has the sisters' childhood book *Fiabe del mare*
(the princess who keeps a light burning on the tower), given to him by Margherita "for a special person".
Kate finishes the cat book, dedicated "Per Margherita e Lucia". **Kate's mother sends Nonna's things**: her
first-communion prayer book (1935), a blue silk scarf, a silver spoon marked "Ferrante", and **a letter from
Margherita postmarked Montemare 1947, never opened**. Kate will open it only when she knows the whole truth.
Letter line: "La verità è nella casa, ma la casa la mostra piano."

**Book 10 (early April).** The storm; Matteo goes to his father's roof. Rocco breaks through the cellar wall,
hammers at the salotto wall under the square, then climbs and descends the same twelve stairs for an hour
believing they never end, and falls down the botola into the frame room (broken leg, the frames smashed).
**Maresciallo Santoro** arrests him. Rocco drove and nursed old Ettore, who raved about the portrait. Bellini
apologises: his grandfather "wasn't a good man… the flowers were for guilt, not love". The local paper:
"Notte di paura nella casa dei misteri" (now on the bar wall). Kate learns the congiuntivo and reads **the whole
letter** (its full text is in chapter 10; it says Margherita hid something precious in 1944 and couldn't find
it again, "la casa l'aveva nascosta meglio di me"; that Lucia left believing in a betrayal; and where the key
is). Under a loose board by Lucia's bed: her childhood treasures (three white stones, a pink shell, a red
ribbon, a heart with two initials, an old coin) and the **little brass key**. The box holds: **Andrea's gold
ring** engraved "A. e L. 16.9.1944"; a **large iron key with a brass tag engraved with a sailing ship**
(Captain Giacomo's mark: on his tomb in the Ferrante chapel and on a ship's knife he gave Matteo's
great-grandfather); and a grey notebook, **"Per Lucia. Quello che è successo davvero. Montemare, 1946."**, written
in the passato remoto. Teresa: on 13 August Lucia put the ring on the table and said "Tieni tu l'anello.
Tanto lo volevi." Matteo's father **Giovanni**, a carpenter, says Giacomo built the house over years "for a
woman he couldn't marry, who never came", and sailed one winter morning and never returned. Don Piero on
forgiveness. Elena keeps the grey notebook in the town safe; Kate leaves for **a week in Bristol**; Elena
promises they'll read it together, with the passato remoto, when she's back. In the notebook's first page
Margherita calls one person only "E.".

**Changes to the plan.** Part 3 is read from the grey notebook (Margherita's 1946 account, in the passato
remoto, which suits the plan's narration), with the wet diary's fragments as a second voice. The unopened
1947 letter is new: keep it closed until the end (book 20 is the natural place). `congiuntivo` is in `EXTRA`.

Open threads and small facts to keep straight:

- **Unresolved:** the iron key with the ship (the plan's last door, book 19); what Margherita bargained with
  Weber for, and what "E." did; who painted the portrait and whom it shows; where it is; the unopened 1947
  letter; Rocco's trial; Bellini's third promise.
- **Kate's floor plans:** every morning, plus the frame room under the cellar. The house never takes back what
  it shows: the girls' room, eight drawings, the wardrobe and dress, the botola stay.
- **People:** *tu* between Kate and Giulia, Tonino, Elena, Matteo, Paola; *Lei* with the lawyer, Bellini, the
  dealer, don Piero, the maresciallo, Teresa (who says *tu* to Kate). Matteo's father Giovanni says *tu*.
  Giulia's children are Sofia and Marco (in Elena's class); Paolo's brother works at the port of Genoa;
  Elena's cousin is the mayor.
- **Season:** book 10 ends in early April with Kate leaving for Bristol for a week; book 11 starts on her
  return. Tonino promised her night fishing with the moon.
- **Word debt:** after book 10, coverage is 1,013 against a plan of 1,050, and about 175 earlier words are
  still under 4 uses. Book 11 should pick up both: reuse the thin words from books 6–10 (the checker lists
  them) and bring in about 40 more targets than its plan.

## How to write the next book

What worked for books 1–10:

1. **Plan the scenes.** Work from this file and `node tools/check-series.mjs --next 150` (the most
   common unused target words). Pick the ones the story's subject brings naturally.
2. **Plan more scenes than feels necessary.** Drafts have come out at about 60% of the planned word
   count every time.
3. **Write, then run the checker.** `node tools/check-series.mjs <n>` lists the book's new words, its
   thin ones, and every earlier word still under 4 uses.
4. **Fix the owed words with scenes, not lists.** Write one or two extra scenes that use the owed words
   naturally: the bar, the market, an errand, a dinner, a dream, a walk. Don't add filler sentences.
   In books 6–10 a story-first draft brought in only 40–70 new targets; what worked for both new and owed
   words were scenes that carry a lot of vocabulary on their own terms: Kate's school composition, diary
   pages, a fairy tale read aloud (kings, castles, knights), a newspaper article read out in the bar, a round
   of goodbyes through the village. Keep the narration's grammar to the plan even in these: "come se" and
   "credo che" need the subjunctive, so rephrase them before book 10 (and in narration, until Part 3).
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
