// Turns a base word's English sense into the sense of the inflected Italian form that was tapped.
// Wiktionary only says "third-person singular past historic of arrivare"; the base word says
// "to arrive". From the two we build "he/she arrived", so the reader sees what the word means here.
// Pure (no DOM), unit-tested in tests/english.test.mjs.

// base -> [past, past participle]. Regular verbs are handled by rule.
const IRREGULAR = Object.fromEntries(`
arise arose arisen|awake awoke awoken|bear bore borne|beat beat beaten|become became become|befall befell befallen
begin began begun|bend bent bent|bet bet bet|bind bound bound|bite bit bitten|bleed bled bled|blow blew blown
break broke broken|breed bred bred|bring brought brought|build built built|burst burst burst|buy bought bought
cast cast cast|catch caught caught|choose chose chosen|cling clung clung|come came come|cost cost cost
creep crept crept|cut cut cut|deal dealt dealt|dig dug dug|do did done|draw drew drawn|drink drank drunk
drive drove driven|eat ate eaten|fall fell fallen|feed fed fed|feel felt felt|fight fought fought|find found found
flee fled fled|fling flung flung|fly flew flown|forbid forbade forbidden|forget forgot forgotten
forgive forgave forgiven|freeze froze frozen|get got got|give gave given|go went gone|grind ground ground
grow grew grown|hang hung hung|have had had|hear heard heard|hide hid hidden|hit hit hit|hold held held
hurt hurt hurt|keep kept kept|kneel knelt knelt|know knew known|lay laid laid|lead led led|leap leapt leapt
leave left left|lend lent lent|let let let|lie lay lain|light lit lit|lose lost lost|make made made|mean meant meant
meet met met|pay paid paid|put put put|quit quit quit|read read read|ride rode ridden|ring rang rung|rise rose risen
run ran run|say said said|see saw seen|seek sought sought|sell sold sold|send sent sent|set set set|sew sewed sewn
shake shook shaken|shed shed shed|shine shone shone|shoot shot shot|show showed shown|shrink shrank shrunk
shut shut shut|sing sang sung|sink sank sunk|sit sat sat|slay slew slain|sleep slept slept|slide slid slid
sling slung slung|smell smelt smelt|speak spoke spoken|speed sped sped|spend spent spent|spin spun spun
spit spat spat|split split split|spread spread spread|spring sprang sprung|stand stood stood|steal stole stolen
stick stuck stuck|sting stung stung|stink stank stunk|stride strode stridden|strike struck struck
string strung strung|strive strove striven|swear swore sworn|sweep swept swept|swell swelled swollen
swim swam swum|swing swung swung|take took taken|teach taught taught|tear tore torn|tell told told
think thought thought|throw threw thrown|thrust thrust thrust|tread trod trodden|wake woke woken|wear wore worn
weave wove woven|weep wept wept|win won won|wind wound wound|wring wrung wrung|write wrote written
`.trim().split(/[|\n]/).map((s) => s.trim().split(' ')).map(([b, p, pp]) => [b, [p, pp]]));
const PREFIXES = ['under', 'over', 'with', 'mis', 'out', 'fore', 'up', 're'];

// Stress on the last syllable, so the final consonant doubles (prefer -> preferred).
const DOUBLE = new Set('admit commit compel control occur omit patrol permit prefer propel rebel refer regret submit transfer equip expel deter incur'.split(' '));
// Verbs that don't take "was …ing" in the imperfect (Italian "sapevo" is "I knew", not "I was knowing").
const STATIVE = new Set('be have know want need seem like love hate believe understand own mean prefer remember exist belong contain matter cost weigh resemble deserve owe appear wish hope'.split(' '));

const VOWEL = /[aeiou]/;
function irregular(v) {
  if (IRREGULAR[v]) return IRREGULAR[v];
  for (const p of PREFIXES) {
    if (v.startsWith(p) && v.length - p.length >= 3 && IRREGULAR[v.slice(p.length)]) {
      const [a, b] = IRREGULAR[v.slice(p.length)];
      return [p + a, p + b];
    }
  }
  return null;
}
function doubles(v) {
  if (DOUBLE.has(v)) return true;
  // One-syllable consonant-vowel-consonant words: stop -> stopped (not w, x, y).
  const syllables = v.match(/[aeiouy]+/g) || [];
  return syllables.length === 1 && /[^aeiou][aeiou][b-df-hj-np-tvz]$/.test(v);
}
function regularPast(v) {
  if (v.endsWith('e')) return v + 'd';
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ied';
  if (/c$/.test(v) && /^(panic|picnic|mimic|traffic)$/.test(v)) return v + 'ked';
  if (doubles(v)) return v + v.slice(-1) + 'ed';
  return v + 'ed';
}
export const past = (v) => (v === 'be' ? 'was' : irregular(v)?.[0] || regularPast(v));
export const participle = (v) => (v === 'be' ? 'been' : irregular(v)?.[1] || regularPast(v));
export function gerund(v) {
  if (v === 'be') return 'being';
  if (v.endsWith('ie')) return v.slice(0, -2) + 'ying';
  if (/[^eoy]e$/.test(v) && v.length > 2) return v.slice(0, -1) + 'ing';
  if (doubles(v)) return v + v.slice(-1) + 'ing';
  return v + 'ing';
}
export function thirdPerson(v) {
  const special = { be: 'is', have: 'has', do: 'does', go: 'goes' };
  if (special[v]) return special[v];
  if (/(s|x|z|ch|sh|o)$/.test(v)) return v + 'es';
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ies';
  return v + 's';
}

const IRREG_PLURAL = { man: 'men', woman: 'women', child: 'children', person: 'people', foot: 'feet', tooth: 'teeth', mouse: 'mice', goose: 'geese', ox: 'oxen', knife: 'knives', wife: 'wives', life: 'lives', leaf: 'leaves', loaf: 'loaves', wolf: 'wolves', half: 'halves', shelf: 'shelves', thief: 'thieves', calf: 'calves', sheep: 'sheep', fish: 'fish', deer: 'deer', potato: 'potatoes', tomato: 'tomatoes', hero: 'heroes', echo: 'echoes' };
function pluralWord(w) {
  const lower = w.toLowerCase();
  if (IRREG_PLURAL[lower]) return IRREG_PLURAL[lower];
  if (/(s|x|z|ch|sh)$/.test(lower)) return w + 'es';
  if (/[^aeiou]y$/.test(lower)) return w.slice(0, -1) + 'ies';
  return w + 's';
}
// "cup of coffee" -> "cups of coffee"; "railway station" -> "railway stations"; drops a leading article.
export function plural(noun) {
  const n = noun.replace(/^(a|an|the)\s+/i, '');
  const m = n.match(/^(.*?)(\w+)((?:\s+(?:of|for|with|in|on|to|from)\b.*)|\s*\(.*\))?$/);
  if (!m || /\s/.test(m[1].trim()) && m[1].split(/\s+/).length > 3) return null;
  return m[1] + pluralWord(m[2]) + (m[3] || '');
}

// Wiktionary's description of a form -> the readings it lists, e.g.
// "inflection of parlare: third-person singular present indicative; second-person singular imperative"
// -> [{persons: [3], number: 'sg', tense: 'pres'}, {persons: [2], number: 'sg', tense: 'imp'}]
export function parseForm(text) {
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  const out = [];
  const re = /((?:first|second|third)(?:\s*\/\s*(?:first|second|third))*)-person (singular|plural)/g;
  const marks = [...t.matchAll(re)];
  const tenseOf = (s) => (/past historic|preterite|remote past/.test(s) ? 'ph'
    : /imperfect/.test(s) && /subjunctive/.test(s) ? 'impsubj'
    : /imperfect/.test(s) ? 'imperf'
    : /subjunctive/.test(s) ? 'subj'
    : /imperative/.test(s) ? 'imp'
    : /future/.test(s) ? 'fut'
    : /conditional/.test(s) ? 'cond'
    : /present/.test(s) ? 'pres' : null);
  marks.forEach((m, i) => {
    const rest = t.slice(m.index + m[0].length, marks[i + 1]?.index ?? t.length).split(/\bof\b|;/)[0];
    const tense = tenseOf(rest);
    if (!tense) return;
    const persons = m[1].split('/').map((p) => ({ first: 1, second: 2, third: 3 })[p.trim()]);
    out.push({ persons, number: m[2] === 'singular' ? 'sg' : 'pl', tense });
  });
  if (!out.length) {
    if (/\bgerund\b/.test(t)) out.push({ tense: 'ger' });
    else if (/past participle/.test(t)) out.push({ tense: 'pp' });
    else if (/present participle/.test(t)) out.push({ tense: 'prp' });
    else if (/\bplural\b/.test(t)) out.push({ tense: 'plural' });
  }
  return out;
}

const PRONOUNS = { sg: { 1: 'I', 2: 'you', 3: 'he/she' }, pl: { 1: 'we', 2: 'you', 3: 'they' } };
const BE = { pres: { sg: { 1: 'am', 2: 'are', 3: 'is' }, pl: 'are' }, past: { sg: { 1: 'was', 2: 'were', 3: 'was' }, pl: 'were' } };
const be = (tense, number, person) => (number === 'pl' ? BE[tense].pl : BE[tense].sg[person]);

// One English verb phrase ("arrive", "get up", "be able to") in one Italian form.
function conjugateVerb(phrase, f) {
  const [head, ...restWords] = phrase.split(' ');
  const rest = restWords.length ? ' ' + restWords.join(' ') : '';
  const p = f.persons?.[0];
  const pres = () => (head === 'be' ? be('pres', f.number, p) : f.number === 'sg' && p === 3 ? thirdPerson(head) : head);
  const pastFinite = () => (head === 'be' ? be('past', f.number, p) : past(head));
  switch (f.tense) {
    case 'pres': return pres() + rest;
    case 'ph': return pastFinite() + rest;
    case 'imperf': return (STATIVE.has(head) ? pastFinite() : be('past', f.number, p) + ' ' + gerund(head)) + rest;
    case 'fut': return 'will ' + head + rest;
    case 'cond': return 'would ' + head + rest;
    case 'subj': return head + rest;
    case 'impsubj': return (head === 'be' ? 'were' : past(head)) + rest;
    case 'imp': return head + rest;
    case 'ger': case 'prp': return gerund(head) + rest;
    case 'pp': return participle(head) + rest;
  }
  return null;
}

function subject(f) {
  const ps = f.persons.map((p) => PRONOUNS[f.number][p]);
  return [...new Set(ps)].join('/');
}

const LABELS = { pres: 'present', ph: 'past historic', imperf: 'imperfect', fut: 'future', cond: 'conditional', subj: 'present subjunctive', impsubj: 'imperfect subjunctive', imp: 'imperative', ger: 'gerund', pp: 'past participle', prp: 'present participle', plural: 'plural' };
const ORD = { 1: '1st', 2: '2nd', 3: '3rd' };
export function formLabel(f) {
  const who = f.persons ? `${f.persons.map((p) => ORD[p]).join('/')} ${f.number}. ` : '';
  return who + LABELS[f.tense];
}

// One reading of the form, in English. `gloss` is the base word's sense ("to arrive, to reach");
// returns null when the sense can't be put into that form (it isn't a "to …" verb, say).
export function inflect(gloss, f) {
  if (f.tense === 'plural') {
    const parts = gloss.split(/,\s*/).filter((s) => s && !/^to /.test(s)).slice(0, 2).map(plural);
    return parts.length && parts.every(Boolean) ? parts.join(', ') : null;
  }
  const verbs = gloss.split(/,\s*|\s+or\s+/).filter((s) => /^to [a-z]/i.test(s)).slice(0, 2).map((s) => s.slice(3).trim());
  if (!verbs.length) return null;
  const forms = verbs.map((v) => conjugateVerb(v.toLowerCase() === v ? v : v.charAt(0).toLowerCase() + v.slice(1), f));
  if (forms.some((x) => x == null)) return null;
  const list = forms.join(', ');
  switch (f.tense) {
    case 'subj': return `(that) ${subject(f)} ${list}`;
    case 'impsubj': return `(if) ${subject(f)} ${list}`;
    case 'imp':
      if (f.number === 'pl' && f.persons[0] === 1) return `let's ${list}!`;
      return f.persons[0] === 3 ? `${list}! (formal)` : `${list}!`;
    case 'ger': case 'prp': case 'pp': return list;
    default: return `${subject(f)} ${list}`;
  }
}
