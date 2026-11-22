import { accidental, keyName, keySignature, mod12, sigText, signatureLetters, spell, staffPos, tonicName } from './keys';

it('signatures', () => {
  expect(keySignature(2,'major')).toBe(2); expect(keySignature(6,'major')).toBe(-6);
  expect(keySignature(9,'minor')).toBe(0); expect(keySignature(6,'minor')).toBe(3);
});
it('names', () => {
  expect(keyName(10,'major')).toBe('B♭ major'); expect(keyName(6,'major')).toBe('G♭ major');
  expect(keyName(6,'minor')).toBe('F♯ minor'); expect(sigText(-3)).toBe('3 ♭'); expect(sigText(0)).toBe('no sharps or flats');
});
it('spelling follows the signature', () => {
  expect(spell(66, 2).name).toBe('F♯4'); expect(spell(66, -1).name).toBe('G♭4'); expect(spell(61, 0).name).toBe('C♯4');
});
it('staff positions', () => {
  expect(staffPos(spell(64,0))).toBe(0); expect(staffPos(spell(60,0))).toBe(-2); expect(staffPos(spell(77,0))).toBe(8);
  expect(staffPos(spell(70,-2))).toBe(4);   // B♭4 sits on the B line
});
it('accidentals', () => {
  expect(accidental(spell(66,2), 2)).toBeNull();          // F♯ in D major
  expect(accidental(spell(65,2), 2)).toBe('natural');     // F♮ in D major
  expect(accidental(spell(70,0), 0)).toBe('sharp');       // A♯ in C major
  expect(accidental(spell(70,-2), -2)).toBeNull();
});

it('mod12 wraps negatives', () => { expect(mod12(-1)).toBe(11); expect(mod12(14)).toBe(2); });
it('tonic names', () => {
  expect(tonicName(3,'major')).toBe('E♭'); expect(tonicName(1,'minor')).toBe('C♯'); expect(tonicName(8,'minor')).toBe('G♯');
  expect(Array.from({ length: 12 }, (_, pc) => tonicName(pc,'major')).join(' ')).toBe('C D♭ D E♭ E F G♭ G A♭ A B♭ B');
});
it('every major tonic gets the specified signature', () => {
  const want = {0:0,1:-5,2:2,3:-3,4:4,5:-1,6:-6,7:1,8:-4,9:3,10:-2,11:5};
  for (const [pc, sig] of Object.entries(want)) expect(keySignature(Number(pc),'major')).toBe(sig);
});
it('sigText for sharps', () => { expect(sigText(2)).toBe('2 ♯'); });
it('signature letters', () => {
  expect(signatureLetters(0)).toEqual([]);
  expect(signatureLetters(3)).toEqual([3, 0, 4]);        // F C G
  expect(signatureLetters(-2)).toEqual([6, 2]);          // B E
});
it('spelled fields', () => {
  expect(spell(70,-2)).toMatchObject({ letter: 6, alter: -1, octave: 4, name: 'B♭4' });
  expect(spell(60,0)).toMatchObject({ letter: 0, alter: 0, octave: 4 });
  expect(spell(59,0)).toMatchObject({ letter: 6, octave: 3 });
});
it('accidental flat and natural in flat keys', () => {
  expect(accidental(spell(71,-2), -2)).toBe('natural');   // B♮ in B♭ major
  expect(accidental(spell(73,-2), -2)).toBe('flat');      // D♭ in B♭ major
});
