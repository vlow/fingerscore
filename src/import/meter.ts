import { isSupportedTimeSig } from '../domain/time';
import type { TimeSig } from '../domain/types';
import { ImportError } from './types';

/** The song's one time signature: the first in the list (4/4 for an empty list). Throws ImportError for an unsupported or changing meter. */
export function songTimeSig(file: string, sigs: readonly (readonly [number, number])[]): TimeSig {
  const first = sigs[0] ?? [4, 4];
  if (!isSupportedTimeSig(first[0], first[1])) {
    throw new ImportError(`${file} is in ${first[0]}/${first[1]}. fingerscore reads 4/4, 3/4, 2/4, 6/8 and 2/2 for now.`);
  }
  if (sigs.some(s => s[0] !== first[0] || s[1] !== first[1])) {
    throw new ImportError(`${file} changes its time signature. fingerscore reads one time signature per song for now.`);
  }
  return [first[0], first[1]] as TimeSig;
}
