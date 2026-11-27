import { parseDescribe, readBuildInfo } from './build-info';

describe('parseDescribe', () => {
  it('reads a tagged commit as a release', () => {
    expect(parseDescribe('v1.3.1-0-ga1b2c3d')).toEqual({ version: '1.3.1', release: true });
  });

  it('reads a commit after the tag as a dev build of that version', () => {
    expect(parseDescribe('v1.3.1-4-ga1b2c3d')).toEqual({ version: '1.3.1', release: false });
  });

  it('reads a tagged commit with local changes as a dev build', () => {
    expect(parseDescribe('v1.3.1-0-ga1b2c3d-dirty')).toEqual({ version: '1.3.1', release: false });
  });

  it('keeps a pre-release suffix that itself contains dashes', () => {
    expect(parseDescribe('v2.0.0-rc-1-0-gabc1234')).toEqual({ version: '2.0.0-rc-1', release: true });
  });

  it('has no version when there is no tag', () => {
    expect(parseDescribe('')).toEqual({ version: '', release: false });
  });
});

describe('readBuildInfo', () => {
  it('combines the commit with the described version', () => {
    const run = (...args: string[]) => (args[0] === 'rev-parse' ? 'a1b2c3d' : 'v1.3.1-2-ga1b2c3d');
    expect(readBuildInfo(run)).toEqual({ commit: 'a1b2c3d', version: '1.3.1', release: false });
  });

  it('falls back to empty values when git fails', () => {
    const run = () => { throw new Error('not a git repository'); };
    expect(readBuildInfo(run)).toEqual({ commit: '', version: '', release: false });
  });

  it('reads this checkout', () => {
    expect(readBuildInfo().commit).toMatch(/^[0-9a-f]{7,}$/);
  });
});
