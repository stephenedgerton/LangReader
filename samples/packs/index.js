// The ready-made sentence packs for Training. Each pack is its own module (loaded only when it's added),
// with stable sentence keys, so a sentence keeps its progress when the pack grows. To ship a pack: add its
// file, add it here and to SHELL in sw.js, and run `node tools/check-sentences.mjs`. To add sentences to a
// released pack, append them with new keys and raise its `rev`: libraries that have it pick them up.
// Never reuse or renumber a key. Sentences the user edited or hid stay as they are.
export const PACKS = [
  { id: 'survival', name: 'Survival', emoji: '🧭', colors: ['#0e5a43', '#2bb487'], rev: 1, common: true,
    blurb: 'The first things to be able to say: greetings, please and thank you, and what to say when you don’t understand.' },
  { id: 'partner', name: 'Partner: everyday', emoji: '💬', colors: ['#6b1f3a', '#c2577e'], rev: 1, common: true,
    blurb: 'The little things you say at home: how was your day, what’s for dinner, I miss you.' },
  { id: 'partner-plans', name: 'Partner: plans & errands', emoji: '🗓️', colors: ['#4b2e5c', '#9a6ab0'], rev: 1, common: true,
    blurb: 'Making plans and sharing the chores: what time are you home, how shall we get there, did you buy the milk.' },
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
