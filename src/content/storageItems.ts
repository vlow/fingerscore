/** Everything the app keeps in the browser, in plain words. Privacy lists these; a test keeps the list equal to the code. */
export interface StorageItem {
  key: string;
  where: 'local' | 'session';
  label: string;
}

export const STORAGE_ITEMS: StorageItem[] = [
  { key: 'fingerscore.library.v1', where: 'local', label: 'your saved sheets' },
  { key: 'fingerscore.inst', where: 'local', label: 'the instrument you chose' },
  { key: 'fingerscore.prefs', where: 'local', label: 'your display settings' },
  { key: 'fingerscore.playmode', where: 'local', label: 'your play-mode settings' },
  { key: 'fingerscore.playtempo', where: 'local', label: 'the play-mode tempo of each sheet' },
  { key: 'fingerscore.theme', where: 'local', label: 'the colour theme you chose' },
  { key: 'fingerscore.paper', where: 'local', label: 'the paper colour you chose for dark mode' },
  { key: 'fingerscore.scales', where: 'local', label: 'your last scale choice' },
  { key: 'fingerscore.song', where: 'session', label: 'the song that is open' },
  { key: 'fingerscore.doc', where: 'session', label: 'the sheet that is open' },
  { key: 'fingerscore.sheet', where: 'session', label: 'which saved sheet the open sheet came from' },
];
