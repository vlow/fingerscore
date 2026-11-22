import { parseMidi } from './midi';
import { parseMusicXml } from './musicxml';
import { ImportError, type ParsedSong } from './types';

export const ACCEPT = '.mid,.midi,.musicxml,.xml,.mxl';

function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export async function parseFile(file: File): Promise<ParsedSong> {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  const isMidi = ext === '.mid' || ext === '.midi';
  const isXml = ext === '.musicxml' || ext === '.xml' || ext === '.mxl';
  if (!isMidi && !isXml) {
    throw new ImportError(`"${file.name}" is not a format fingerscore reads yet. Use MIDI or MusicXML.`);
  }
  let bytes: Uint8Array;
  try {
    bytes = await readBytes(file);
  } catch {
    throw new ImportError(`"${file.name}" could not be read as a ${isMidi ? 'MIDI' : 'MusicXML'} file.`);
  }
  return isMidi ? parseMidi(file.name, bytes) : parseMusicXml(file.name, bytes);
}
