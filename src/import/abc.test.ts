import { parseAbc } from './abc';
import { ImportError, type ParsedSong } from './types';

const enc = (s: string) => new TextEncoder().encode(s);
const parse = (tune: string, file = 't.abc'): Promise<ParsedSong> => parseAbc(file, enc(tune));
const midis = (s: ParsedSong, track = 0) => s.tracks[track].notes.map(n => n.midi);
const message = (p: Promise<unknown>) => p.then(() => null, (e: ImportError) => e.userMessage);
const tune = (body: string, header = 'M:4/4\nL:1/4\nK:C') => `X:1\n${header}\n${body}\n`;

const BASIC = 'X:1\nM:4/4\nL:1/4\nK:C\nCDEF|G2A2|';

describe('parseAbc', () => {
  it('parser runs under jsdom', async () => {
    const s = await parse('X:1\nK:C\nCDEF|');
    expect(midis(s)).toEqual([60, 62, 64, 65]);
  });

  it('reads notes, durations, track name and format', async () => {
    const s = await parse(BASIC);
    expect(s.format).toBe('ABC');
    expect(s.file).toBe('t.abc');
    expect(s.tracks).toHaveLength(1);
    const t = s.tracks[0];
    expect(t.name).toBe('Melody');
    expect(t.percussion).toBe(false);
    expect(t.channel).toBeNull();
    expect(t.notes).toEqual([
      { start: 0, dur: 1, midi: 60 }, { start: 1, dur: 1, midi: 62 }, { start: 2, dur: 1, midi: 64 }, { start: 3, dur: 1, midi: 65 },
      { start: 4, dur: 2, midi: 67 }, { start: 6, dur: 2, midi: 69 },
    ]);
    expect(s.key).toEqual({ tonicPc: 0, mode: 'major' });
    expect(s.timeSig).toEqual([4, 4]);
    expect(s.pickup).toBe(0);
  });

  it('octave marks', async () => {
    expect(midis(await parse(tune("c c' C, c,")))).toEqual([72, 84, 48, 60]);
  });

  describe('pitches', () => {
    it('key signature applies', async () => {
      expect(midis(await parse(tune('B e', 'M:4/4\nL:1/4\nK:Bb')))).toEqual([70, 75]);
    });

    it('explicit accidental holds to the end of the bar, for that octave only', async () => {
      const s = await parse(tune('=E E e | E', 'M:4/4\nL:1/4\nK:Bb'));
      expect(midis(s)).toEqual([64, 64, 75, 63]);
    });

    it('sharps, flats and double accidentals', async () => {
      expect(midis(await parse(tune('^C _D ^^E __F')))).toEqual([61, 61, 66, 63]);
    });

    it('a tie keeps the pitch across the bar line', async () => {
      const s = await parse(tune('^c2- | c2'));
      expect(s.tracks[0].notes).toEqual([{ start: 0, dur: 4, midi: 73 }]);
    });

    it('an inline key change moves the pitches after it and leaves the song key', async () => {
      const s = await parse(tune('F [K:G] F'));
      expect(midis(s)).toEqual([65, 66]);
      expect(s.key).toEqual({ tonicPc: 0, mode: 'major' });
    });
  });

  describe('keys', () => {
    const key = async (k: string) => (await parse(`X:1\nL:1/4\nK:${k}\nC|`)).key;
    it('names tonic and mode as written', async () => {
      expect(await key('Ador')).toEqual({ tonicPc: 9, mode: 'dorian' });
      expect(await key('Dmix')).toEqual({ tonicPc: 2, mode: 'mixolydian' });
      expect(await key('Em')).toEqual({ tonicPc: 4, mode: 'minor' });
      expect(await key('Cmaj')).toEqual({ tonicPc: 0, mode: 'major' });
      expect(await key('F# phrygian')).toEqual({ tonicPc: 6, mode: 'phrygian' });
      expect(await key('Bb Lydian')).toEqual({ tonicPc: 10, mode: 'lydian' });
      expect(await key('C locrian')).toEqual({ tonicPc: 0, mode: 'locrian' });
      expect(await key('A aeolian')).toEqual({ tonicPc: 9, mode: 'minor' });
      expect(await key('D ionian')).toEqual({ tonicPc: 2, mode: 'major' });
    });

    it('the signature follows the key as written, not its pitch class', async () => {
      const fb = async (k: string) => midis(await parse(`X:1\nM:4/4\nL:1/4\nK:${k}\nF B|`));
      expect(await fb('F#')).toEqual([66, 71]);
      expect(await fb('C#')).toEqual([66, 72]);
      expect(await fb('D#m')).toEqual([66, 71]);
      expect(await fb('G# mix')).toEqual([66, 72]);
      expect(await fb('Abm')).toEqual([64, 70]);
      expect(await fb('Cb')).toEqual([64, 70]);
      expect(await fb('Gb')).toEqual([65, 70]);
      expect(await fb('A#m')).toEqual([66, 72]);
    });

    it('refuses a signature beyond seven sharps or flats', async () => {
      expect(await message(parse('X:1\nK:G#\nCDEF|'))).toBe('"t.abc" could not be read as an ABC file.');
      expect(await message(parse('X:1\nK:D#\nCDEF|'))).toBe('"t.abc" could not be read as an ABC file.');
    });

    it('refuses a key abcjs did not read, accepts a line without a tonic', async () => {
      const bad = '"t.abc" could not be read as an ABC file.';
      expect(await message(parse('X:1\nK:Fb\nCDEF|'))).toBe(bad);
      expect(await message(parse('X:1\nK:E#\nCDEF|'))).toBe(bad);
      expect(await message(parse('X:1\nK:H\nCDEF|'))).toBe(bad);
      expect(await message(parse('X:1\nL:1/4\nK:C\nCD|[K:Fb]EF|'))).toBe(bad);
      const bass = await parse('X:1\nL:1/4\nK:clef=bass\nC|');
      expect(bass.key).toEqual({ tonicPc: 0, mode: 'major' });
      expect(await key('none')).toEqual({ tonicPc: 0, mode: 'major' });
      expect(await key('A#m')).toEqual({ tonicPc: 10, mode: 'minor' });
    });

    it('refuses keys it cannot read', async () => {
      expect(await message(parse('X:1\nK:HP\nCDEF|'))).toBe('"t.abc" could not be read as an ABC file.');
      expect(await message(parse('X:1\nK:D exp ^f\nCDEF|'))).toBe('"t.abc" could not be read as an ABC file.');
      expect(await message(parse('X:1\nK:G _b\nCDEF|'))).toBe('"t.abc" could not be read as an ABC file.');
    });
  });

  describe('lengths', () => {
    it('multiples of L: and broken rhythm', async () => {
      const s = await parse(tune('A2 B/2 c3/2 d>e', 'M:4/4\nL:1/8\nK:C'));
      expect(s.tracks[0].notes.map(n => n.dur)).toEqual([1, 0.25, 0.75, 0.75, 0.25]);
    });

    it('default unit is 1/16 below 3/4 and 1/8 otherwise', async () => {
      const a = await parse('X:1\nM:2/4\nK:C\nA|');
      expect(a.tracks[0].notes[0].dur).toBeCloseTo(0.25);
      const b = await parse('X:1\nM:4/4\nK:C\nA|');
      expect(b.tracks[0].notes[0].dur).toBeCloseTo(0.5);
    });

    it('triplets', async () => {
      const s = await parse(tune('(3abc', 'M:4/4\nL:1/8\nK:C'));
      const notes = s.tracks[0].notes;
      expect(notes).toHaveLength(3);
      notes.forEach((n, i) => {
        expect(n.dur).toBeCloseTo(1 / 3);
        expect(n.start).toBeCloseTo(i / 3);
      });
    });

    it('rests z, x and Z advance time', async () => {
      const s = await parse(tune('z2 C x | D z3 | Z | E'));
      expect(s.tracks[0].notes.map(n => n.start)).toEqual([2, 4, 12]);
    });

    it('ties merge notes', async () => {
      const s = await parse(tune('c2-|c2'));
      expect(s.tracks[0].notes).toEqual([{ start: 0, dur: 4, midi: 72 }]);
    });

    it('brackets give simultaneous notes', async () => {
      const s = await parse(tune('[CEG]2'));
      expect(s.tracks[0].notes).toEqual([
        { start: 0, dur: 2, midi: 60 }, { start: 0, dur: 2, midi: 64 }, { start: 0, dur: 2, midi: 67 },
      ]);
    });
  });

  describe('meter and tempo', () => {
    it('C and C| are 4/4 and 2/2', async () => {
      expect((await parse('X:1\nM:C\nL:1/4\nK:C\nC|')).timeSig).toEqual([4, 4]);
      expect((await parse('X:1\nM:C|\nL:1/4\nK:C\nC|')).timeSig).toEqual([2, 2]);
    });

    it('refuses other meters and an inline change', async () => {
      expect(await message(parse('X:1\nM:5/4\nL:1/4\nK:C\nC|'))).toBe(
        't.abc is in 5/4. fingerscore reads 4/4, 3/4, 2/4, 6/8 and 2/2 for now.');
      expect(await message(parse('X:1\nM:4/4\nL:1/4\nK:C\nCDEF|[M:3/4]CDE|'))).toBe(
        't.abc changes its time signature. fingerscore reads one time signature per song for now.');
    });

    it('tempo is quarters per minute', async () => {
      expect((await parse('X:1\nQ:1/4=140\nL:1/4\nK:C\nC|')).tempo).toBe(140);
      expect((await parse('X:1\nQ:3/8=80\nL:1/4\nK:C\nC|')).tempo).toBeCloseTo(120);
      expect((await parse('X:1\nL:1/4\nK:C\nC|')).tempo).toBe(120);
    });

    it('a first bar shorter than the meter is the pickup', async () => {
      const s = await parse('X:1\nM:4/4\nL:1/4\nK:C\nF/2|B2c2|');
      expect(s.pickup).toBeCloseTo(0.5);
      expect(s.tracks[0].notes.map(n => n.start)).toEqual([0, 0.5, 2.5]);
    });
  });

  describe('voices', () => {
    const two = 'X:1\nM:4/4\nL:1/4\nV:1 name="Tune"\nV:2 clef=bass octave=-1\nK:C\n[V:1] CDEF|\n[V:2] CDEF|\n';

    it('one track per voice, named by name or id', async () => {
      const s = await parse(two);
      expect(s.tracks.map(t => t.name)).toEqual(['Tune', '2']);
      expect(new Set(s.tracks.map(t => t.id)).size).toBe(2);
    });

    it('octave= shifts sounding pitch', async () => {
      const s = await parse(two);
      expect(midis(s, 0)).toEqual([60, 62, 64, 65]);
      expect(midis(s, 1)).toEqual([48, 50, 52, 53]);
    });

    it('clef=treble-8 sounds an octave lower, +8 an octave higher', async () => {
      const s = await parse('X:1\nM:4/4\nL:1/4\nV:1 clef=treble-8\nV:2 clef=treble+8\nK:C\n[V:1] C|\n[V:2] C|\n');
      expect(midis(s, 0)).toEqual([48]);
      expect(midis(s, 1)).toEqual([72]);
    });

    it('transpose= shifts by semitones, other modifiers are ignored', async () => {
      const s = await parse('X:1\nM:4/4\nL:1/4\nV:1 transpose=-2 clef=alto middle=d\nK:C\n[V:1] C|\n');
      expect(midis(s)).toEqual([58]);
    });

    it('a voice without notes gives no track', async () => {
      const s = await parse('X:1\nM:4/4\nL:1/4\nV:1\nV:2\nK:C\n[V:2] CDEF|\n');
      expect(s.tracks.map(t => t.name)).toEqual(['2']);
    });
  });

  describe('lyrics', () => {
    it('aligns syllables to notes, drops extra syllables', async () => {
      const s = await parse(tune('E3 | G2 c | d3 |', 'M:3/4\nL:1/4\nK:C') + 'w:Qual gran-de va-ga_\n');
      expect(s.tracks[0].lyrics).toEqual([
        { at: 0, text: 'Qual' }, { at: 3, text: 'gran-' }, { at: 5, text: 'de' }, { at: 6, text: 'va-' },
      ]);
    });

    it('* skips a note, ~ joins words with a space, W: lines are ignored', async () => {
      const s = await parse(tune('C D E F |', 'M:4/4\nL:1/4\nK:C') + 'w:a * b~c\nW:Nothing here\n');
      expect(s.tracks[0].lyrics).toEqual([{ at: 0, text: 'a' }, { at: 2, text: 'b c' }]);
    });

    it('reads the first verse only', async () => {
      const s = await parse(tune('C D |') + 'w:one two\nw:three four\n');
      expect(s.tracks[0].lyrics.map(l => l.text)).toEqual(['one', 'two']);
    });

    it('a chord in brackets takes one syllable', async () => {
      const s = await parse(tune('[CEG] D |') + 'w:one two\n');
      expect(s.tracks[0].lyrics).toEqual([{ at: 0, text: 'one' }, { at: 1, text: 'two' }]);
    });
  });

  describe('chord symbols', () => {
    it('keeps chords, ignores annotations', async () => {
      const s = await parse(tune('"C"E3 | "Dm/F"d3 | "^slowly"A3', 'M:3/4\nL:1/4\nK:C'));
      expect(s.tracks[0].chords).toEqual([{ at: 0, text: 'C' }, { at: 3, text: 'Dm/F' }]);
    });

    it('transpose= moves chord roots and basses, not the kind', async () => {
      const t = (body: string) => parse('X:1\nM:4/4\nL:1/4\nV:1 transpose=-2\nK:C\n[V:1] ' + body + '|\n');
      const a = await t('"C"C "G"G');
      expect(midis(a)).toEqual([58, 65]);
      expect(a.tracks[0].chords.map(c => c.text)).toEqual(['B♭', 'F']);
      expect((await t('"Dm/F"D')).tracks[0].chords.map(c => c.text)).toEqual(['Cm/E♭']);
    });

    it('drops D.C., D.S., "A tempo" and other text that only starts with a note name', async () => {
      const s = await parse(tune('"D.C."C "D.S."D "D.C. al Fine"E "A tempo"F | "A."C "A"D "D"E "C/E"F | "G(add9)"C "C+"D "C-7"E "C\u03947"F'));
      expect(s.tracks[0].chords.map(c => c.text)).toEqual(['A', 'D', 'C/E', 'G(add9)', 'C+', 'C-7', 'C\u03947']);
    });

    it('accepts C6/9 and A7alt, drops words', async () => {
      const s = await parse(tune('"C6/9"C "A7alt"D "Coda"E "Fine"F | "Dsus4"C "Gadd9"D "Co"E "Cdim"F'));
      expect(s.tracks[0].chords.map(c => c.text)).toEqual(['C6/9', 'A7alt', 'Dsus4', 'Gadd9', 'C°', 'Cdim']);
    });

    it('writes roots by pitch class and keeps the suffix', async () => {
      const s = await parse(tune('"Bb"C "F#m7"D "G7/B"E "Allegro"F'));
      expect(s.tracks[0].chords.map(c => c.text)).toEqual(['B♭', 'F♯m7', 'G7/B']);
    });
  });

  describe('repeats and endings', () => {
    it('|: :| and numbered endings', async () => {
      const s = await parse(tune('|: C4 |1 D4 :|2 E4 |]'));
      expect(s.marks).toEqual([{ bar: 0, rs: true }, { bar: 1, re: true, volta: '1' }, { bar: 2, volta: '2' }]);
    });

    it(':: ends one repeat and starts the next', async () => {
      const s = await parse(tune('|: C4 :: D4 :|'));
      expect(s.marks).toEqual([{ bar: 0, rs: true, re: true }, { bar: 1, rs: true, re: true }]);
    });

    it('bars count the pickup as bar 0', async () => {
      const s = await parse('X:1\nM:4/4\nL:1/4\nK:C\nG|: C4 :|');
      expect(s.pickup).toBe(1);
      expect(s.marks).toEqual([{ bar: 1, rs: true, re: true }]);
    });
  });

  describe('further cases', () => {
    it('[1 and :|[2 endings', async () => {
      const s = await parse(tune('|: C4 [1 D4 :|[2 E4 |]'));
      expect(s.marks).toEqual([{ bar: 0, rs: true }, { bar: 1, re: true, volta: '1' }, { bar: 2, volta: '2' }]);
    });

    it('lyric | advances to the next bar, \\- keeps a hyphen, _ holds', async () => {
      const bar = await parse(tune('C D | E F |') + 'w:a | b c\n');
      expect(bar.tracks[0].lyrics).toEqual([{ at: 0, text: 'a' }, { at: 2, text: 'b' }, { at: 3, text: 'c' }]);
      const hyphen = await parse(tune('C D |') + 'w:a\\-b c\n');
      expect(hyphen.tracks[0].lyrics.map(l => l.text)).toEqual(['a-b', 'c']);
      const hold = await parse(tune('C D E |') + 'w:a_ b\n');
      expect(hold.tracks[0].lyrics).toEqual([{ at: 0, text: 'a' }, { at: 2, text: 'b' }]);
    });

    it('a tied continuation consumes a syllable', async () => {
      const s = await parse(tune('c2- c2 d |') + 'w:a b c\n');
      expect(s.tracks[0].notes.map(n => n.dur)).toEqual([4, 1]);
      expect(s.tracks[0].lyrics).toEqual([{ at: 0, text: 'a' }, { at: 4, text: 'c' }]);
    });

    it('>> and broken rhythm with a chord or a tuplet', async () => {
      const dbl = await parse(tune('C>>D', 'M:4/4\nL:1/4\nK:C'));
      expect(dbl.tracks[0].notes.map(n => [n.start, n.dur])).toEqual([[0, 1.75], [1.75, 0.25]]);
      const chord = await parse(tune('[CE]>G', 'M:4/4\nL:1/4\nK:C'));
      expect(chord.tracks[0].notes.map(n => [n.start, n.dur, n.midi])).toEqual([[0, 1.5, 60], [0, 1.5, 64], [1.5, 0.5, 67]]);
      const tup = await parse(tune('(3C>DE F', 'M:4/4\nL:1/4\nK:C'));
      const t = tup.tracks[0].notes;
      expect(t[0].dur + t[1].dur + t[2].dur).toBeCloseTo(2);
      expect(t[3].start).toBeCloseTo(2);
    });

    it('K: with clef=bass reads the key and keeps the pitch', async () => {
      const s = await parse('X:1\nM:4/4\nL:1/4\nK:G clef=bass\nF|');
      expect(s.key).toEqual({ tonicPc: 7, mode: 'major' });
      expect(midis(s)).toEqual([66]);
    });

    it('inline [V:] on the first music line adds no default voice', async () => {
      const s = await parse('X:1\nM:4/4\nL:1/4\nK:C\n[V:1] CDEF|\n[V:2] GGGG|\n');
      expect(s.tracks.map(t => t.name)).toEqual(['1', '2']);
    });

    it('a pickup after |:', async () => {
      const s = await parse('X:1\nM:4/4\nL:1/4\nK:C\n|: G | C4 :|');
      expect(s.pickup).toBe(1);
      expect(s.marks).toEqual([{ bar: 0, rs: true }, { bar: 1, re: true }]);
    });

    it('music before the first V: line and a later V:2 give two tracks', async () => {
      const s = await parse('X:1\nM:4/4\nL:1/4\nK:C\nCDEF|\nV:2\nGGGG|\n');
      expect(s.tracks.map(t => t.name)).toEqual(['Melody', '2']);
      expect(midis(s, 0)).toEqual([60, 62, 64, 65]);
      expect(midis(s, 1)).toEqual([67, 67, 67, 67]);
    });
  });

  describe('file handling', () => {
    it('reads only the first tune', async () => {
      const s = await parse('X:1\nM:4/4\nL:1/4\nK:C\nCDEF|\n\nX:2\nM:4/4\nL:1/4\nK:D\nGGGG|\n');
      expect(midis(s)).toEqual([60, 62, 64, 65]);
      expect(s.key).toEqual({ tonicPc: 0, mode: 'major' });
    });

    it('byte-order mark, CRLF, directives before X: and Latin-1 all give the same notes', async () => {
      const expected = midis(await parse(BASIC));
      const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc(BASIC)]);
      expect(midis(await parseAbc('t.abc', bom))).toEqual(expected);
      expect(midis(await parse(BASIC.replace(/\n/g, '\r\n')))).toEqual(expected);
      expect(midis(await parse(`%abc-2.1\n%%scale 0.8\n${BASIC}`))).toEqual(expected);
      const latin = Uint8Array.from(`X:1\nT:Música\nM:4/4\nL:1/4\nK:C\nCDEF|G2A2|\n`, c => c.charCodeAt(0));
      expect(midis(await parseAbc('t.abc', latin))).toEqual(expected);
    });

    it('a file without X: is one tune', async () => {
      expect(midis(await parse('M:4/4\nL:1/4\nK:C\nCDEF|'))).toEqual([60, 62, 64, 65]);
    });

    it('a file without notes has no melody track', async () => {
      expect(await message(parse('X:1\nT:Empty\nK:C\n'))).toBe('"t.abc" has no melody track.');
    });
  });

  describe('transpose= and the song key', () => {
    it('moves the key with the notes and chord symbols; the mode stays', async () => {
      const s = await parse('X:1\nM:4/4\nL:1/4\nV:1 transpose=-2\nK:D\n[V:1] "D"DEFG|\n');
      expect(midis(s)).toEqual([60, 62, 64, 65]);
      expect(s.tracks[0].chords.map(c => c.text)).toEqual(['C']);
      expect(s.key).toEqual({ tonicPc: 0, mode: 'major' });
    });

    it('without transpose= the key is as written', async () => {
      const s = await parse('X:1\nM:4/4\nL:1/4\nV:1\nK:D\n[V:1] "D"DEFG|\n');
      expect(s.key).toEqual({ tonicPc: 2, mode: 'major' });
      const minor = await parse('X:1\nM:4/4\nL:1/4\nV:1 transpose=3\nK:Em\n[V:1] EFGA|\n');
      expect(minor.key).toEqual({ tonicPc: 7, mode: 'minor' });
    });

    it('takes the key from the first voice with notes', async () => {
      const s = await parse('X:1\nM:4/4\nL:1/4\nV:1\nV:2 transpose=-2\nK:D\n[V:2] DEFG|\n');
      expect(s.tracks.map(t => t.name)).toEqual(['2']);
      expect(s.key).toEqual({ tonicPc: 0, mode: 'major' });
    });
  });

  describe('chord spelling', () => {
    it('keeps the written root and bass when the voice is not transposed', async () => {
      const s = await parse(tune('"C#m"C "Db/Ab"D "A#7/F#"E "Bb"F'));
      expect(s.tracks[0].chords.map(c => c.text)).toEqual(['C♯m', 'D♭/A♭', 'A♯7/F♯', 'B♭']);
    });

    it('names roots by pitch class when the voice is transposed', async () => {
      const s = await parse('X:1\nM:4/4\nL:1/4\nV:1 transpose=2\nK:C\n[V:1] "Bm"C "G#7/B#"D|\n');
      expect(s.tracks[0].chords.map(c => c.text)).toEqual(['D♭m', 'B♭7/D']);
    });
  });

  describe('bars of the wrong length', () => {
    const notes = (s: ParsedSong, track = 0) => s.tracks[track].notes.map(n => [n.start, n.midi]);

    it('a pickup inside the tune starts so that it ends on the next bar line', async () => {
      // 6/8, eighth = 0.5 quarter, bar = 3 quarters, pickup bar 0.5: bar lines at 0.5, 3.5, 6.5, 9.5, 12.5, 15.5.
      const s = await parse('X:1\nM:6/8\nL:1/8\nK:G\nD|:G2B dBG|G2B dBG:|\n|:"D"d|g2f e2d|g2f e2d:|\nw:a b\n');
      expect(s.pickup).toBe(0.5);
      const n = notes(s);
      expect(n[11]).toEqual([9, 74]);       // the second part's pickup d: one eighth before the bar line at 9.5
      expect(n[12]).toEqual([9.5, 79]);     // g on the bar line
      expect(n[n.length - 1]).toEqual([15, 74]);
      expect(s.tracks[0].chords).toEqual([{ at: 9, text: 'D' }]);
      expect(s.tracks[0].lyrics).toEqual([{ at: 9, text: 'a' }, { at: 9.5, text: 'b' }]);
      // |: before the pickup marks bar 3, the bar that holds it
      expect(s.marks).toEqual([{ bar: 1, rs: true }, { bar: 2, re: true }, { bar: 3, rs: true }, { bar: 5, re: true }]);
    });

    it('two short bars that make a full bar stay where they are', async () => {
      const s = await parse(tune('C4 | D3 :| E | F4 |'));
      expect(notes(s)).toEqual([[0, 60], [4, 62], [7, 64], [8, 65]]);
      expect(s.marks).toEqual([{ bar: 1, re: true }]);
    });

    it('a short last bar stays where it is', async () => {
      const s = await parse(tune('C4 | D4 | E2 |'));
      expect(notes(s)).toEqual([[0, 60], [4, 62], [8, 64]]);
    });

    it('a bar longer than the meter is taken as written', async () => {
      const s = await parse(tune('C4 | D5 | E4 |'));
      expect(notes(s)).toEqual([[0, 60], [4, 62], [9, 64]]);
    });

    it('pads two voices alike', async () => {
      const s = await parse('X:1\nM:4/4\nL:1/4\nV:1\nV:2\nK:C\n[V:1] C4 | D4 | E | F4 |\n[V:2] G4 | A4 | B | c4 |\n');
      expect(notes(s, 0)).toEqual([[0, 60], [4, 62], [11, 64], [12, 65]]);
      expect(notes(s, 1)).toEqual([[0, 67], [4, 69], [11, 71], [12, 72]]);
    });
  });

  describe('names every object inherits', () => {
    it('refuses a voice named __proto__ or constructor before parsing', async () => {
      const before = Object.getOwnPropertyNames(Object.prototype);
      expect(await message(parse('X:1\nM:4/4\nL:1/4\nV:__proto__ name="x"\nK:C\n[V:__proto__] C|\n')))
        .toBe('"t.abc" could not be read as an ABC file.');
      expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(before);
      expect(await message(parse('X:1\nM:4/4\nL:1/4\nV:constructor\nK:C\nC|\n'))).toBe('"t.abc" could not be read as an ABC file.');
      expect(await message(parse('X:1\nM:4/4\nL:1/4\nK:C\n[V:prototype] C|\n'))).toBe('"t.abc" could not be read as an ABC file.');
      expect(await message(parse('X:1\nM:4/4\nL:1/4\n%%score (toString)\nK:C\nC|\n'))).toBe('"t.abc" could not be read as an ABC file.');
    });

    it('reads ordinary voice ids', async () => {
      const s = await parse('X:1\nM:4/4\nL:1/4\nV:Proto name="x"\nV:Sop\nK:C\n[V:Proto] C|\n[V:Sop] D|\n');
      expect(s.tracks.map(t => t.name)).toEqual(['x', 'Sop']);
    });

    it('a mode word or key word that names an inherited property gives no NaN', async () => {
      for (const k of ['C constructor', 'C toString', 'Ctostring', 'D hasOwnProperty']) {
        const s = await parse(`X:1\nM:4/4\nL:1/4\nK:${k}\nC|\n`).catch((e: ImportError) => e.userMessage);
        if (typeof s === 'string') expect(s).toBe('"t.abc" could not be read as an ABC file.');
        else {
          expect(Number.isFinite(s.key!.tonicPc)).toBe(true);
          expect(s.key!.mode).toBe('major');
          expect(midis(s).every(Number.isFinite)).toBe(true);
        }
      }
    });
  });
});
