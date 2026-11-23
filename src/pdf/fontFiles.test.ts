// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertFonts, coverageJson, OUT_DIR, PKG } from '../../scripts/make-pdf-fonts';

const HINT = 'The committed font files no longer match the installed font package: run npm run fonts';
const pkgDir = dirname(createRequire(import.meta.url).resolve(`${PKG}/package.json`));
const converted = convertFonts(pkgDir);

describe('the committed PDF fonts', () => {
  it('are the TrueType files the conversion makes from the installed WOFF files', () => {
    expect([...converted.files.keys()]).toHaveLength(6);
    for (const [name, bytes] of converted.files) {
      const committed = new Uint8Array(readFileSync(join(OUT_DIR, name)));
      expect(Buffer.from(committed).equals(Buffer.from(bytes)), `${name}: ${HINT}`).toBe(true);
    }
  });
  it('have the coverage the conversion computes', () => {
    expect(readFileSync(join(OUT_DIR, 'coverage.json'), 'utf8'), `coverage.json: ${HINT}`).toBe(coverageJson(converted.coverage));
  });
  it('come with the licence text of the installed package', () => {
    expect(Buffer.from(readFileSync(join(OUT_DIR, 'OFL.txt'))).equals(Buffer.from(converted.licence)), `OFL.txt: ${HINT}`).toBe(true);
  });
});
