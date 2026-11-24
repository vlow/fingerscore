// The owner's details. Every value that starts with "TODO:" is a placeholder: the pages draw it as it is,
// and `npm run check:release` fails until each one is filled. Optional fields stay '' when they do not apply.
import { repositoryUrl } from './repository';

export interface Operator {
  name: string;
  address: string[];
  email: string;
  phone: string;
  representedBy: string;
  register: string;
  vatId: string;
  responsibleForContent: string;
  hostName: string;
  hostAddress: string;
  logRetention: string;
  repositoryUrl: string;
  aboutLead: string;
  authorBio: string;
  story: string[];
  pullQuote: string;
}

export const operator: Operator = {
  name: 'TODO: full name of the provider',
  address: ['TODO: street and number', 'TODO: postcode and city', 'TODO: country'],
  email: 'TODO: e-mail address',
  phone: 'TODO: phone number',
  representedBy: '',
  register: '',
  vatId: '',
  responsibleForContent: 'TODO: name and address of the person responsible for content',
  hostName: 'TODO: name of the hosting provider',
  hostAddress: 'TODO: address of the hosting provider',
  logRetention: 'TODO: how long the host keeps server logs',
  repositoryUrl, // optional: edit src/content/repository.ts, not this line
  aboutLead: 'TODO: one or two sentences that open the About page',
  authorBio: 'TODO: short bio of the author',
  story: ['TODO: story paragraph'],
  pullQuote: '',
};

const OPTIONAL: ReadonlySet<string> = new Set(['representedBy', 'register', 'vatId', 'repositoryUrl', 'pullQuote']);

export function isPlaceholder(value: string): boolean {
  return value.startsWith('TODO:');
}

/** Names of the fields that still hold a placeholder. An array field counts when it is empty or any entry is one. */
export function placeholders(o: Operator): string[] {
  const names: string[] = [];
  for (const [key, value] of Object.entries(o)) {
    if (OPTIONAL.has(key) && value === '') continue;
    const open = Array.isArray(value) ? value.length === 0 || value.some(isPlaceholder) : isPlaceholder(value);
    if (open) names.push(key);
  }
  return names;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** '2026-11-24' → '24 November 2026'. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
