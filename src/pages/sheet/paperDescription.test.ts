import { derive } from '../../domain/derive';
import { sampleDoc } from '../../domain/fixture';
import { DEFAULT_PREFS } from '../../domain/transpose';
import { paperDescription } from './paperDescription';

describe('paperDescription', () => {
  const doc = sampleDoc('asax');
  const derived = derive(doc, DEFAULT_PREFS);

  it('names the title, the instrument and the written key', () => {
    const text = paperDescription({ title: 'Auld Lang Syne' }, derived);
    expect(text).toBe(`Auld Lang Syne. ${derived.inst.name}. Written key: ${derived.writtenKey}.`);
  });

  it('follows the instrument and its key', () => {
    const other = derive(sampleDoc('tsax'), DEFAULT_PREFS);
    expect(paperDescription(doc, other)).toContain(other.inst.name);
    expect(paperDescription(doc, other)).toContain(`Written key: ${other.writtenKey}.`);
  });

  it('calls an empty title Untitled and trims a padded one', () => {
    expect(paperDescription({ title: '  ' }, derived)).toMatch(/^Untitled\. /);
    expect(paperDescription({ title: ' Song ' }, derived)).toMatch(/^Song\. /);
  });
});
