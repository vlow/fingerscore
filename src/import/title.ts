/**
 * The song title a file states: the first candidate with text, whitespace runs folded to one space.
 * Empty when the file names none; buildDoc then takes the file name.
 */
export function fileTitle(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    const t = c?.replace(/\s+/g, ' ').trim();
    if (t) return t;
  }
  return '';
}
