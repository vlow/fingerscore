import { formatDate, isPlaceholder, operator, placeholders, type Operator } from './operator';

const filled: Operator = {
  name: 'A. Person',
  address: ['Street 1', '12345 Town'],
  email: 'a@example.org',
  phone: '+49 1',
  representedBy: '',
  register: '',
  vatId: '',
  responsibleForContent: 'A. Person',
  hostName: 'Host',
  hostAddress: 'Host street',
  logRetention: '7 days',
  repositoryUrl: '',
  aboutLead: 'Lead.',
  authorBio: 'Bio.',
  story: ['One.'],
  pullQuote: '',
};

it('lists every required field of the shipped details and none of the optional ones', () => {
  const open = placeholders(operator);
  for (const f of ['name', 'address', 'email', 'phone', 'responsibleForContent', 'hostName', 'hostAddress', 'logRetention', 'aboutLead', 'authorBio', 'story']) {
    expect(open).toContain(f);
  }
  for (const f of ['representedBy', 'register', 'vatId', 'repositoryUrl', 'pullQuote']) expect(open).not.toContain(f);
});

it('lists nothing for filled details', () => {
  expect(placeholders(filled)).toEqual([]);
});

it('counts an array with one placeholder entry or no entry', () => {
  expect(placeholders({ ...filled, address: ['Street 1', 'TODO: city'] })).toEqual(['address']);
  expect(placeholders({ ...filled, story: [] })).toEqual(['story']);
});

it('counts a filled optional field only when it is a placeholder', () => {
  expect(placeholders({ ...filled, vatId: 'DE123' })).toEqual([]);
  expect(placeholders({ ...filled, vatId: 'TODO: VAT ID' })).toEqual(['vatId']);
});

it('recognises a placeholder by its prefix', () => {
  expect(isPlaceholder('TODO: x')).toBe(true);
  expect(isPlaceholder('x TODO: y')).toBe(false);
});

it('formats an ISO date', () => {
  expect(formatDate('2026-11-24')).toBe('24 November 2026');
  expect(formatDate('2027-01-05')).toBe('5 January 2027');
});
