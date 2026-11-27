import type { SopranoShape } from '../../render/keymap/models';
import { readJSON, writeJSON } from '../../shell/storage';

/** The Fingerings preferences in this browser (design 4.8): only the soprano saxophone's shape; the rest is in the URL. */
const KEY = 'fingerscore.fingerings';

export function readSoprano(): SopranoShape {
  const raw = readJSON<{ soprano?: unknown }>('local', KEY);
  return raw?.soprano === 'curved' ? 'curved' : 'straight';
}

export function writeSoprano(soprano: SopranoShape): void {
  writeJSON('local', KEY, { soprano });
}
