// Unit tests for Training's pure parts: gendered forms, hints, levels and today's plan (no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genderize, genderProblems, hint, level, mastered, buildPlan, newOrder, sameText } from '../js/sentences.js';
import { schedule, GOOD } from '../js/srs.js';

const DAY = 86400000;
const NOW = new Date(2026, 9, 10, 12).getTime();

test('gendered forms follow you and your partner', () => {
  const s = 'Sono stanc{o|a}. E tu, sei pront{p:o|a}?';
  assert.equal(genderize(s, 'm', 'f'), 'Sono stanco. E tu, sei pronta?');
  assert.equal(genderize(s, 'f', 'm'), 'Sono stanca. E tu, sei pronto?');
  assert.equal(genderize('Ciao!'), 'Ciao!');
  assert.deepEqual(genderProblems(s), []);
  assert.deepEqual(genderProblems('Sei stanc{p:o|}?'), ['a gendered form with an empty half']);
  assert.deepEqual(genderProblems('Sei stanc{o?'), ['unbalanced gender markup']);
});

test('the hint gives away a little more each time', () => {
  assert.equal(hint('Cosa vuoi per cena?', 1), 'Cosa ___ ___ ___?');
  assert.equal(hint('Cosa vuoi per cena?', 2), 'C___ v___ p__ c___?');
  assert.equal(hint("Dov'è la stazione?", 1), "Dov'___ ___ ___?");
  assert.equal(hint("Dov'è la stazione?", 2), "D__'è l_ s_______?", 'elisions keep their apostrophe');
});

test('levels come from the say card, and a sentence is mastered when both cards hold for 180 days', () => {
  assert.equal(level({ cards: {} }), 0);
  const c = schedule(null, GOOD, NOW);
  assert.equal(level({ cards: { say: c } }), 2, 'Good on a new card is about 3 days: level 2');
  const strong = { ...c, s: 200 };
  assert.equal(mastered({ cards: { say: strong } }), false);
  assert.equal(mastered({ cards: { say: strong, listen: strong } }), true);
  assert.equal(level({ cards: { say: strong, listen: strong } }), 5);
});

test('with a direction, each card has its own level: Shadowing (listen) and Recall (say) don’t share stars', () => {
  const c = schedule(null, GOOD, NOW), strong = { ...c, s: 200 }, mid = { ...c, s: 60 };
  assert.equal(level({ cards: { listen: mid } }, 'listen'), 4);
  assert.equal(level({ cards: { listen: mid } }, 'say'), 0, 'not rated in Recall yet: no stars there');
  assert.equal(level({ cards: { listen: mid, say: c } }, 'say'), 2);
  assert.equal(level({ cards: { listen: strong } }, 'listen'), 5, 'that card alone can be done');
  assert.equal(level({ cards: { listen: strong } }, 'say'), 0);
});

const card = (dueInDays, s = 3, lastDaysAgo = 3) => ({ s, d: 5, last: NOW - lastDaysAgo * DAY, due: NOW + dueInDays * DAY, reps: 2, lapses: 0 });
const sent = (id, cards = {}) => ({ id, it: id, en: id, cards });

test('the plan takes due cards first, then fills up with new ones within the new allowance', () => {
  const list = [
    sent('a', { listen: card(-1), say: card(-1) }),
    sent('b', { listen: card(5), say: card(-2, 2, 10) }),
    sent('n1'), sent('n2'), sent('n3'),
  ];
  const p = buildPlan(list, { now: NOW, sizes: { listen: 3, shadow: 2, say: 4 }, maxNew: 2, rand: () => 0 });
  assert.deepEqual(p.fresh, ['n1', 'n2']);
  assert.deepEqual(p.listen, ['a', 'n1', 'n2']);
  assert.deepEqual(p.say, ['b', 'a', 'n1', 'n2'], 'the card closest to being forgotten comes first');
  assert.deepEqual(p.shadow, ['n1', 'n2'], 'new sentences are shadowed first');
});

test('the plan is the same size after a break, and shrinks as today’s work is done', () => {
  const list = Array.from({ length: 30 }, (_, i) => sent('s' + i, { listen: card(-20 + i % 5), say: card(-20) }));
  const p = buildPlan(list, { now: NOW, sizes: { listen: 4, shadow: 4, say: 8 }, maxNew: 5 });
  assert.equal(p.listen.length, 4);
  assert.equal(p.say.length, 8);
  const later = buildPlan(list, { now: NOW, sizes: { listen: 4, shadow: 4, say: 8 }, maxNew: 5, done: { listen: 4, say: 6, shadow: 4 } });
  assert.deepEqual([later.listen.length, later.say.length, later.shadow.length], [0, 2, 0]);
});

test('a sentence started in one direction is due in the other, misses are shadowed again, and mastered ones leave', () => {
  const strong = { ...card(400, 300), s: 300 };
  const list = [sent('half', { listen: card(4) }), sent('miss', { listen: card(1), say: card(1) }), sent('done', { listen: strong, say: strong })];
  const p = buildPlan(list, { now: NOW, sizes: { listen: 5, shadow: 1, say: 5 }, maxNew: 5, missed: ['miss'] });
  assert.deepEqual(p.say, ['half']);
  assert.deepEqual(p.listen, []);
  assert.deepEqual(p.shadow, ['miss']);
});

test('new sentences: the focus pack first, then your own, then the ready-made ones in pack order', () => {
  const s = (id, packs, extra = {}) => ({ id, packs, created: 0, cards: {}, ...extra });
  const list = [
    s('b2', ['survival'], { bundled: 'survival', order: 2 }), s('b1', ['survival'], { bundled: 'survival', order: 1 }),
    s('mine2', ['p1'], { created: 20 }), s('mine1', ['reading'], { created: 10 }),
    s('fb', ['partner'], { bundled: 'partner', order: 10001 }), s('fo', ['partner'], { created: 30 }),
  ];
  assert.deepEqual(newOrder(list).map((x) => x.id), ['mine1', 'mine2', 'fo', 'b1', 'b2', 'fb']);
  assert.deepEqual(newOrder(list, 'partner').map((x) => x.id), ['fo', 'fb', 'mine1', 'mine2', 'b1', 'b2']);
  assert.equal(list[0].id, 'b2', 'the list itself is left alone');
});

test('the same sentence, whatever its case, punctuation and spacing', () => {
  assert.ok(sameText('Dov’è la stazione?', "dov'è  la Stazione"));
  assert.ok(!sameText('Dov’è la stazione?', 'Dov’è la stazione centrale?'));
});
