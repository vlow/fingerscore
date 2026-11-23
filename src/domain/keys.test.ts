import { MODES, accidental, keyName, keySignature, mod12, sigText, signatureLetters, spell, spelledName, staffPos, tonicName, type Spelled } from './keys';

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

it('spelled names, double accidentals included', () => {
  expect(spelledName(3, 1)).toBe('F♯');
  expect(spelledName(3, 2)).toBe('F𝄪');
  expect(spelledName(6, -2)).toBe('B𝄫');
  expect(spelledName(6, -1, 4)).toBe('B♭4');
  expect(spelledName(0, 0)).toBe('C');
  expect(spelledName(0, 0, 5)).toBe('C5');
});
it('accidentals for double sharps and double flats', () => {
  const fx: Spelled = { letter: 3, alter: 2, octave: 5, name: 'F𝄪5' };
  expect(accidental(fx, 5)).toBe('doubleSharp');           // F𝄪 in E major / G♯ minor
  expect(accidental(fx, 0)).toBe('doubleSharp');
  const bbb: Spelled = { letter: 6, alter: -2, octave: 4, name: 'B𝄫4' };
  expect(accidental(bbb, -2)).toBe('doubleFlat');
  expect(accidental(bbb, 0)).toBe('doubleFlat');
});

it('modes: signatures', () => {
  expect(keySignature(2, 'dorian')).toBe(0); expect(keySignature(7, 'mixolydian')).toBe(0);
  expect(keySignature(9, 'dorian')).toBe(1); expect(keySignature(3, 'dorian')).toBe(-5); expect(keySignature(6, 'dorian')).toBe(4);
  expect(keySignature(4, 'phrygian')).toBe(0); expect(keySignature(5, 'lydian')).toBe(0); expect(keySignature(11, 'locrian')).toBe(0);
});
it('modes: names', () => {
  expect(keyName(2, 'dorian')).toBe('D Dorian'); expect(keyName(3, 'dorian')).toBe('E♭ Dorian');
  expect(keyName(6, 'dorian')).toBe('F♯ Dorian'); expect(keyName(7, 'mixolydian')).toBe('G Mixolydian');
  expect(keyName(4, 'phrygian')).toBe('E Phrygian'); expect(keyName(5, 'lydian')).toBe('F Lydian'); expect(keyName(11, 'locrian')).toBe('B Locrian');
  expect(keyName(0, 'major')).toBe('C major'); expect(keyName(9, 'minor')).toBe('A minor');
});
it('modes: MODES lists all seven; signatures stay within -6..6', () => {
  expect(MODES).toEqual(['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian']);
  for (const m of MODES) for (let pc = 0; pc < 12; pc++) {
    const sig = keySignature(pc, m);
    expect(sig).toBeGreaterThanOrEqual(-6); expect(sig).toBeLessThanOrEqual(6);
  }
});
