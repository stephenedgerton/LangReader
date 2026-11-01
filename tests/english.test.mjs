// Unit tests for js/english.js: putting a base word's English sense into the tapped Italian form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseForm, inflect, past, participle, gerund, thirdPerson, plural, formLabel } from '../js/english.js';

const say = (form, gloss) => parseForm(form).map((f) => inflect(gloss, f));

test('English verb forms', () => {
  assert.deepEqual(['arrive', 'stop', 'study', 'play', 'go', 'understand', 'prefer', 'visit', 'be'].map(past),
    ['arrived', 'stopped', 'studied', 'played', 'went', 'understood', 'preferred', 'visited', 'was']);
  assert.deepEqual(['speak', 'write', 'open', 'withdraw'].map(participle), ['spoken', 'written', 'opened', 'withdrawn']);
  assert.deepEqual(['make', 'run', 'lie', 'see', 'eat', 'be'].map(gerund), ['making', 'running', 'lying', 'seeing', 'eating', 'being']);
  assert.deepEqual(['speak', 'go', 'watch', 'try', 'have', 'play'].map(thirdPerson), ['speaks', 'goes', 'watches', 'tries', 'has', 'plays']);
  assert.deepEqual(['suitcase', 'a train', 'cup of coffee', 'woman', 'city', 'box'].map(plural), ['suitcases', 'trains', 'cups of coffee', 'women', 'cities', 'boxes']);
});

test('tenses and persons', () => {
  assert.deepEqual(say('third-person singular past historic of arrivare', 'to arrive, to reach'), ['he/she arrived, reached']);
  assert.deepEqual(say('first-person singular present indicative of parlare', 'to speak, to talk'), ['I speak, talk']);
  assert.deepEqual(say('third-person singular present indicative of essere', 'to be'), ['he/she is']);
  assert.deepEqual(say('first-person singular imperfect indicative of parlare', 'to speak'), ['I was speaking']);
  assert.deepEqual(say('first-person singular imperfect indicative of sapere', 'to know'), ['I knew'], 'stative verbs take the simple past');
  assert.deepEqual(say('third-person plural imperfect indicative of essere', 'to be'), ['they were']);
  assert.deepEqual(say('first-person plural future of andare', 'to go'), ['we will go']);
  assert.deepEqual(say('third-person singular conditional of dovere', 'to have to'), ['he/she would have to']);
  assert.deepEqual(say('third-person singular present indicative of potere', 'to be able to, can'), ['he/she is able to']);
  assert.deepEqual(say('first/second/third-person singular imperfect subjunctive of essere', 'to be'), ['(if) I/you/he/she were']);
  assert.deepEqual(say('first/second/third-person singular present subjunctive of venire', 'to come'), ['(that) I/you/he/she come']);
  assert.deepEqual(say('first-person plural imperative of andare', 'to go'), ["let's go!"]);
  assert.deepEqual(say('gerund of mangiare', 'to eat'), ['eating']);
  assert.deepEqual(say('masculine singular past participle of dire', 'to say, to tell'), ['said, told']);
  assert.deepEqual(say('plural of valigia', 'suitcase'), ['suitcases']);
});

test('several readings, and senses that cannot be inflected', () => {
  const text = 'inflection of parlare: third-person singular present indicative second-person singular imperative';
  assert.deepEqual(say(text, 'to speak'), ['he/she speaks', 'speak!']);
  assert.deepEqual(parseForm(text).map(formLabel), ['3rd sg. present', '2nd sg. imperative']);
  assert.deepEqual(say('third-person singular present indicative of potere', 'can'), [null], 'not a "to …" verb');
  assert.deepEqual(parseForm('compound of dire and mi'), []);
});
