import { ImportError } from './types';
import { songTimeSig } from './meter';

describe('songTimeSig', () => {
  it('is 4/4 without a signature and the first signature otherwise', () => {
    expect(songTimeSig('a.mid', [])).toEqual([4, 4]);
    expect(songTimeSig('a.mid', [[2, 2]])).toEqual([2, 2]);
  });
  it('rejects a meter fingerscore does not read', () => {
    const err = (() => { try { songTimeSig('a.mid', [[5, 4]]); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(ImportError);
    expect((err as ImportError).userMessage).toBe('a.mid is in 5/4. fingerscore reads 4/4, 3/4, 2/4, 6/8 and 2/2 for now.');
  });
  it('rejects a changing meter', () => {
    const err = (() => { try { songTimeSig('a.mid', [[4, 4], [3, 4]]); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(ImportError);
    expect((err as ImportError).userMessage).toBe('a.mid changes its time signature. fingerscore reads one time signature per song for now.');
  });
});
