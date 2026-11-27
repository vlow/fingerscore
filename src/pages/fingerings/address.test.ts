import { defaultNote, readAddress, writeAddress } from './address';

const read = (query: string, stored: 'straight' | 'curved' = 'straight') => readAddress(new URLSearchParams(query), 'asax', stored);

describe('Fingerings address', () => {
  it('reads instrument, note, fingering, system and shape', () => {
    expect(read('inst=rs&note=Bb4&alt=2&system=german')).toEqual({ inst: 'rs', note: 70, alt: 1, system: 'german', shape: 'straight' });
    expect(read('inst=ssax&note=C5&shape=curved')).toEqual({ inst: 'ssax', note: 72, alt: 0, system: 'baroque', shape: 'curved' });
  });

  it('falls back to the preferred instrument, its C5, the standard fingering and the stored shape', () => {
    expect(read('')).toEqual({ inst: 'asax', note: 72, alt: 0, system: 'baroque', shape: 'straight' });
    expect(read('inst=tuba&note=H9&alt=-1&system=x&shape=bent', 'curved'))
      .toEqual({ inst: 'asax', note: 72, alt: 0, system: 'baroque', shape: 'curved' });
    expect(read('inst=asax&note=C0')).toMatchObject({ note: 72 });
    expect(read('inst=asax&alt=1.5')).toMatchObject({ alt: 0 });
  });

  it('takes a note up to two octaves outside the range, as the range banners link to one', () => {
    expect(read('inst=asax&note=C2')).toMatchObject({ note: 36 });
    expect(read('inst=asax&note=G9')).toMatchObject({ note: 72 }); // above C7 + two octaves
  });

  it('starts an instrument whose range has no C5 on its nearest note', () => {
    // Every instrument's range holds C5 today; the fallback still clamps into the range.
    expect(defaultNote('ra')).toBe(72);
    expect(defaultNote('picc')).toBe(72);
  });

  it('writes only what differs from the defaults beyond instrument and note', () => {
    const base = { inst: 'asax' as const, note: 70, alt: 0, system: 'baroque' as const, shape: 'straight' as const };
    expect(writeAddress(base).toString()).toBe('inst=asax&note=Bb4');
    expect(writeAddress({ ...base, alt: 2 }).toString()).toBe('inst=asax&note=Bb4&alt=3');
    expect(writeAddress({ ...base, inst: 'rs', system: 'german' }).toString()).toBe('inst=rs&note=Bb4&system=german');
    expect(writeAddress({ ...base, system: 'german' }).toString()).toBe('inst=asax&note=Bb4');
    expect(writeAddress({ ...base, inst: 'ssax', shape: 'curved' }).toString()).toBe('inst=ssax&note=Bb4&shape=curved');
  });
});
