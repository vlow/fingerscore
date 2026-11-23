import { slug } from '../domain/persistence';

function join(parts: string[]): string {
  return `${parts.map(slug).filter(Boolean).join('-')}.pdf`;
}

/** "Alto sax (E♭)" → "Alto sax": a key in brackets at the end is not part of the file name. */
function withoutKey(instrument: string): string {
  return instrument.replace(/ \([^)]*\)$/, '');
}

export function sheetPdfName(title: string, instrument: string): string {
  return join([slug(title) || 'sheet', withoutKey(instrument)]);
}

export function scalePdfName(key: string, scale: string, instrument: string): string {
  return join([key, scale, withoutKey(instrument)]);
}
