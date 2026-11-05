// The ready-made sentence packs for Training. Each pack is its own module (loaded only when it's added),
// with stable sentence keys, so a sentence keeps its progress when the pack grows. To ship a pack: add its
// file, add it here and to SHELL in sw.js, and run `node tools/check-sentences.mjs`. To add sentences to a
// released pack, append them with new keys and raise its `rev`: libraries that have it pick them up.
// Never reuse or renumber a key. Sentences the user edited or hid stay as they are.
export const PACKS = [
  { id: 'survival', name: 'Survival', emoji: '🧭', colors: ['#0e5a43', '#2bb487'], rev: 2, common: true,
    blurb: 'The first things to be able to say: greetings, please and thank you, and what to say when you don’t understand.' },
  { id: 'partner', name: 'Partner: everyday', emoji: '💬', colors: ['#6b1f3a', '#c2577e'], rev: 2, common: true,
    blurb: 'The little things you say at home: how was your day, what’s for dinner, I miss you.' },
  { id: 'partner-plans', name: 'Partner: plans & errands', emoji: '🗓️', colors: ['#4b2e5c', '#9a6ab0'], rev: 2, common: true,
    blurb: 'Making plans and sharing the chores: what time are you home, how shall we get there, did you buy the milk.' },
  { id: 'cafe', name: 'Café & restaurant', emoji: '☕', colors: ['#5a3418', '#b07a45'], rev: 2,
    blurb: 'Ordering at the bar and at the table, asking what’s in a dish, and paying the bill.' },
  { id: 'directions', name: 'Directions', emoji: '🗺️', colors: ['#1f3b57', '#3a6b8c'], rev: 2,
    blurb: 'Asking the way, understanding the answer, and finding the right bus.' },
  { id: 'shopping', name: 'Shopping', emoji: '🛍️', colors: ['#7a2e2e', '#b5523b'], rev: 2,
    blurb: 'In shops and at the market: sizes, prices, a bag, and a hundred grams of ham.' },
  { id: 'small-talk', name: 'Small talk', emoji: '☀️', colors: ['#8a5a14', '#d19a3a'], rev: 2,
    blurb: 'The weather, where you’re from, what you do: chatting with neighbours and new friends.' },
  { id: 'travel', name: 'Travel', emoji: '🚆', colors: ['#14505a', '#2f8f8a'], rev: 2,
    blurb: 'Trains, hotels, taxis and the beach, and what to say when something goes wrong.' },
  { id: 'feelings', name: 'Feelings', emoji: '❤️', colors: ['#6b1f3a', '#c2577e'], rev: 2,
    blurb: 'Saying how you feel: happy, tired, worried, proud, fed up, in love.' },
  { id: 'not-understand', name: 'When I don’t understand', emoji: '🤔', colors: ['#203040', '#506070'], rev: 2,
    blurb: 'Slowing people down, asking what a word means, and finding a way round the word you don’t know.' },
];
// Packs that start switched on for everyone.
export const DEFAULT_PACKS = ['survival'];

export const packInfo = (id) => PACKS.find((p) => p.id === id);
export const packFiles = () => PACKS.map((p) => `samples/packs/${p.id}.js`);
// A pack's sentences: [{k, it, en, ctx}], `it` with gender markup (see genderize() in js/sentences.js).
export async function loadPack(id) {
  const m = await import(`./${id}.js`);
  return m.SENTENCES.map(([k, it, en, ctx]) => ({ k, it, en, ctx: ctx || '' }));
}
