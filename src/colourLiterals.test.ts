import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Every colour comes from a token in src/styles/tokens.css (dark mode design 4.1). A colour literal anywhere else would
 * stay light in dark mode, so none is allowed outside the files listed here.
 */
const SRC = __dirname;
const ALLOWED: Record<string, string> = {
  'styles/tokens.css': 'the tokens themselves',
  'render/palette.tsx': 'the light palette of the PDF, which must not follow the theme',
  'pdf/devHook.ts': 'a development page for PDF experiments; it is not part of the app',
};
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;
const OLD_NAMES = ['ink', 'text', 'muted', 'muted-2', 'border', 'border-2', 'page', 'pagebar', 'card', 'teal', 'teal-hover',
  'teal-tint', 'teal-light', 'teal-border', 'amber', 'amber-bg', 'red', 'red-bg', 'ghost'];
const OLD = new RegExp(`var\\(--(?:${OLD_NAMES.join('|')})[),]`);

function files(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return files(p, pattern);
    return pattern.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !(relative(SRC, p) in ALLOWED) ? [p] : [];
  });
}

/** "file:line" of every line that matches. */
function hits(pattern: RegExp, names: RegExp): string[] {
  return files(SRC, names).flatMap(f => readFileSync(f, 'utf8').split('\n')
    .flatMap((line, k) => (pattern.test(line) ? [`${relative(SRC, f)}:${k + 1}`] : [])));
}

describe('colour literals', () => {
  it('finds a hex colour and an rgb colour, and lets a variable through', () => {
    expect(LITERAL.test('color: #15171c;')).toBe(true);
    expect(LITERAL.test('fill="#fff"')).toBe(true);
    expect(LITERAL.test('box-shadow: 0 1px rgba(0, 0, 0, 0.5);')).toBe(true);
    expect(LITERAL.test('color: var(--c-text);')).toBe(false);
  });

  it('has none in a stylesheet outside tokens.css', () => {
    expect(hits(LITERAL, /\.css$/)).toEqual([]);
  });

  it('has none in code outside the light palette', () => {
    expect(hits(LITERAL, /\.tsx?$/)).toEqual([]);
  });

  it('has no variable under a name from before the tokens', () => {
    expect(OLD.test('color: var(--ink);')).toBe(true);
    expect(OLD.test('color: var(--c-text);')).toBe(false);
    expect(hits(OLD, /\.(css|tsx?)$/)).toEqual([]);
  });

  it('allows only files that exist', () => {
    for (const f of Object.keys(ALLOWED).filter(f => f !== 'render/palette.tsx')) expect(existsSync(join(SRC, f)), f).toBe(true);
  });
});
