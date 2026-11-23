import JSZip from 'jszip';
import { ImportError, type ParsedSong } from './types';
import { readV2 } from './mscz/v2';
import { readV3 } from './mscz/v3';

const MAX_UNPACKED = 50 * 1024 * 1024;

const unreadable = (file: string) => new ImportError(`"${file}" could not be read as a MuseScore file.`);
const tooOld = (file: string) => new ImportError(
  `"${file}" was saved with a MuseScore version fingerscore does not read. Open it in a current MuseScore and save it again, or export MusicXML.`);

/** Declared unpacked size of a zip entry (JSZip keeps it on the entry's internal data record). An early guard only: without the field it is 0 and the length check after unpacking still applies. */
const declaredSize = (entry: JSZip.JSZipObject): number =>
  (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;

async function readSource(file: string, bytes: Uint8Array): Promise<string> {
  const isZip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return new TextDecoder('utf-8').decode(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const entry = Object.values(zip.files).find(f => !f.dir && !f.name.includes('/') && f.name.endsWith('.mscx'));
  if (!entry || declaredSize(entry) > MAX_UNPACKED) throw unreadable(file);
  const data = await entry.async('uint8array');
  if (data.length > MAX_UNPACKED) throw unreadable(file);
  return new TextDecoder('utf-8').decode(data);
}

export async function parseMuseScore(file: string, bytes: Uint8Array): Promise<ParsedSong> {
  const doc = new DOMParser().parseFromString(await readSource(file, bytes), 'application/xml');
  const root = doc.documentElement;
  if (!root || doc.getElementsByTagName('parsererror').length > 0 || root.localName !== 'museScore') throw unreadable(file);
  const declared = root.getAttribute('version')?.trim() ?? '';
  const version = declared === '' ? NaN : Number(declared);
  if (!Number.isFinite(version)) throw unreadable(file);
  if (version < 2) throw tooOld(file);
  const score = Array.from(root.children).find(c => c.localName === 'Score');
  if (!score) throw unreadable(file);
  return (version < 3 ? readV2 : readV3)(file, score, version);
}
