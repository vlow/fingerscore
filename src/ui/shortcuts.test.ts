import { GROUPS, keyName, keysOf, matches, modeHints, nowGroup, rowFor } from './shortcuts';

const press = (key: string, init: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key, ...init });
const group = (id: string) => GROUPS.find(g => g.id === id)!;

describe('the shortcut list', () => {
  it('has six groups in a fixed order and unique row ids', () => {
    expect(GROUPS.map(g => g.id)).toEqual(['sheet', 'move', 'notes', 'text', 'play', 'fingerings']);
    const ids = GROUPS.flatMap(g => g.rows.map(r => r.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names keys for the platform', () => {
    expect(keyName('Mod', true)).toBe('⌘');
    expect(keyName('Mod', false)).toBe('Ctrl');
    expect(keyName('Shift', true)).toBe('⇧');
    expect(keyName('Bksp', false)).toBe('Backspace');
    expect(keyName('T', true)).toBe('T');
  });

  it('shows Ctrl+Y and Del only off Apple', () => {
    const redo = group('sheet').rows.find(r => r.id === 'redo')!;
    const del = group('notes').rows.find(r => r.id === 'del')!;
    const keys = (apple: boolean) => keysOf(redo, apple).concat(keysOf(del, apple)).flatMap(p => (typeof p === 'string' ? [] : p.keys));
    expect(keys(false)).toEqual(expect.arrayContaining(['Y', 'Del']));
    expect(keys(true)).not.toContain('Y');
    expect(keys(true)).not.toContain('Del');
  });

  it('finds rows by label, synonym, group and key name', () => {
    const notes = group('notes');
    const oct = notes.rows.find(r => r.id === 'oct')!;
    const tie = notes.rows.find(r => r.id === 'tie')!;
    expect(matches(oct, notes, 'oct', true)).toBe(true);
    expect(matches(oct, notes, 'pitch edit', true)).toBe(true);
    expect(matches(oct, notes, 'ctrl', false)).toBe(true);
    expect(matches(oct, notes, 'ctrl', true)).toBe(false);
    expect(matches(tie, notes, 'slur', true)).toBe(true);
    expect(matches(tie, notes, 'octave', true)).toBe(false);
    expect(matches(tie, notes, '  ', true)).toBe(true);
  });

  it('marks the group of the mode and gives each mode a hint that ends with ? all keys', () => {
    expect(nowGroup('view')).toBe('move');
    expect(nowGroup('notes')).toBe('notes');
    expect(nowGroup('lyrics')).toBe('text');
    expect(nowGroup('chords')).toBe('text');
    for (const m of ['view', 'notes', 'lyrics', 'chords'] as const) {
      expect(modeHints(m).slice(-2)).toEqual([{ key: '?' }, { text: 'all keys' }]);
    }
  });
});

describe('rowFor', () => {
  it('finds the page chords anywhere', () => {
    expect(rowFor(press('s', { metaKey: true }), 'view', 'other')).toBe('save');
    expect(rowFor(press('z', { ctrlKey: true }), 'lyrics', 'field')).toBe('undo');
    expect(rowFor(press('Z', { ctrlKey: true, shiftKey: true }), 'view', 'other')).toBe('redo');
    expect(rowFor(press('y', { ctrlKey: true }), 'view', 'sheet')).toBe('redo');
    expect(rowFor(press('y', { metaKey: true }), 'view', 'sheet')).toBeNull();
  });

  it('finds the Edit notes keys on the sheet in Edit notes only', () => {
    expect(rowFor(press('ArrowUp'), 'notes', 'sheet')).toBe('semi');
    expect(rowFor(press('ArrowDown', { metaKey: true }), 'notes', 'sheet')).toBe('oct');
    expect(rowFor(press('e'), 'notes', 'sheet')).toBe('letter');
    expect(rowFor(press('4'), 'notes', 'sheet')).toBe('len');
    expect(rowFor(press('.'), 'notes', 'sheet')).toBe('dot');
    expect(rowFor(press('P'), 'notes', 'sheet')).toBe('trip');
    expect(rowFor(press('r'), 'notes', 'sheet')).toBe('rest');
    expect(rowFor(press('t'), 'notes', 'sheet')).toBe('tie');
    expect(rowFor(press('Backspace'), 'notes', 'sheet')).toBe('del');
    expect(rowFor(press('t'), 'view', 'sheet')).toBeNull();
    expect(rowFor(press('t'), 'notes', 'other')).toBeNull();
  });

  it('finds the moving keys in every mode, and Esc by mode', () => {
    expect(rowFor(press('ArrowLeft'), 'view', 'sheet')).toBe('lr');
    expect(rowFor(press('End'), 'chords', 'sheet')).toBe('he');
    expect(rowFor(press(' '), 'notes', 'sheet')).toBe('listen');
    expect(rowFor(press('Escape'), 'view', 'sheet')).toBe('esc');
    expect(rowFor(press('Escape'), 'lyrics', 'sheet')).toBe('tesc');
    expect(rowFor(press('Tab'), 'lyrics', 'sheet')).toBe('tabin');
    expect(rowFor(press('Tab'), 'view', 'sheet')).toBeNull();
  });

  it('finds the field keys in the Lyric or Chord field', () => {
    expect(rowFor(press('Enter'), 'lyrics', 'field')).toBe('next');
    expect(rowFor(press('Tab'), 'chords', 'field')).toBe('next');
    expect(rowFor(press('Tab', { shiftKey: true }), 'chords', 'field')).toBe('prev');
    expect(rowFor(press('Escape'), 'lyrics', 'field')).toBe('tesc');
    expect(rowFor(press('a'), 'lyrics', 'field')).toBeNull();
    expect(rowFor(press('ArrowUp', { altKey: true }), 'notes', 'sheet')).toBeNull();
  });
});
