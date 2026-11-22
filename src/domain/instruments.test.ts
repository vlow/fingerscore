import { FAMILIES, familyDefault, familyMembers, familySubline, inst, intervalText, isTransposing, noteNameFlat, ORDER, rangeState, shortName, summary } from './instruments';

it('range states', () => {
  const x = inst('xc');
  expect([59, 60, 84, 85].map(w => rangeState(x, w))).toEqual(['bad','ok','ok','bad']);
  const a = inst('asax');
  expect([57, 58, 89, 90, 96, 97].map(w => rangeState(a, w))).toEqual(['bad','ok','ok','ext','ext','bad']);
});
it('xaphoon follows the official chart', () => { expect(inst('xbb')).toMatchObject({ lo: 60, hi: 84, ext: 84, easyTop: 79 }); });
it('family defaults', () => { expect(FAMILIES.map(familyDefault)).toEqual(['asax','cl','fl','xc','rs']); });
it('interval text', () => {
  expect(intervalText(inst('asax'))).toBe('Alto sax in E♭: you read a major sixth higher than it sounds');
  expect(intervalText(inst('fl'))).toBe('sounds as written');
  expect(intervalText(inst('rs'))).toBe('sounds an octave higher than written');
});
it('summary', () => { expect(summary(inst('asax'))).toBe('Alto sax in E♭ · B♭3 – F6 · reads a major sixth above concert'); });

it('orders families and members', () => {
  expect(FAMILIES).toEqual(['Saxophone','Clarinet','Flute','Xaphoon','Recorder']);
  expect(ORDER).toEqual(['ssax','asax','tsax','bsax','cl','fl','picc','afl','xc','xbb','rs','ra']);
  expect(familyMembers('Saxophone').map(i => i.id)).toEqual(['ssax','asax','tsax','bsax']);
  expect(familyMembers('Flute').map(i => i.id)).toEqual(['fl','picc','afl']);
  expect(familyMembers('Xaphoon').map(i => i.id)).toEqual(['xc','xbb']);
  expect(familyMembers('Recorder').map(i => i.id)).toEqual(['rs','ra']);
});
it('sublines', () => {
  expect(FAMILIES.map(familySubline)).toEqual(['4 types','B♭','3 types','2 keys','2 types']);
});
it('short names', () => {
  expect(ORDER.map(shortName)).toEqual(['Soprano B♭','Alto E♭','Tenor B♭','Baritone E♭','Clarinet B♭','Flute C','Piccolo C','Alto flute G','Xaphoon C','Xaphoon B♭','Soprano C','Alto F']);
});
it('transposing', () => {
  expect(isTransposing(inst('asax'))).toBe(true);
  expect(isTransposing(inst('fl'))).toBe(false);
  expect(isTransposing(inst('rs'))).toBe(false);
});
it('interval text for every offset', () => {
  expect(intervalText(inst('ssax'))).toBe('Soprano sax in B♭: you read a whole step higher than it sounds');
  expect(intervalText(inst('afl'))).toBe('Alto flute in G: you read a perfect fourth higher than it sounds');
  expect(intervalText(inst('tsax'))).toBe('Tenor sax in B♭: you read a ninth (octave + whole step) higher than it sounds');
  expect(intervalText(inst('bsax'))).toBe('Baritone sax in E♭: you read an octave + major sixth higher than it sounds');
  expect(intervalText(inst('picc'))).toBe('sounds an octave higher than written');
});
it('note names use flat spelling', () => {
  expect(noteNameFlat(58)).toBe('B♭3');
  expect(noteNameFlat(60)).toBe('C4');
  expect(noteNameFlat(61)).toBe('D♭4');
});
