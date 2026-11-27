import { clampZoom } from '../domain/playMode';
import { readJSON, writeJSON } from '../shell/storage';

const KEY = 'fingerscore.playmode';

/** Play mode's view preferences, kept per device: paper zoom in percent. The tempo is per sheet (playTempos.ts). */
export interface PlayModePrefs { zoom: number }

/** The stored preferences; anything missing, unreadable or out of range is the default. */
export function readPlayModePrefs(): PlayModePrefs {
  const raw = readJSON<Partial<Record<keyof PlayModePrefs, unknown>> | null>('local', KEY);
  return { zoom: clampZoom(raw?.zoom) };
}

export function writePlayModePrefs(p: PlayModePrefs): void {
  writeJSON('local', KEY, p);
}
