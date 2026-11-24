import type { Derived } from '../../domain/derive';
import type { Doc } from '../../domain/types';

/** What the paper's accessible description says: the title, the instrument and the written key ("Auld Lang Syne. Alto sax (E♭). Written key: C major."). */
export function paperDescription(doc: Pick<Doc, 'title'>, derived: Pick<Derived, 'inst' | 'writtenKey'>): string {
  const title = doc.title.trim() === '' ? 'Untitled' : doc.title.trim();
  return `${title}. ${derived.inst.name}. Written key: ${derived.writtenKey}.`;
}
