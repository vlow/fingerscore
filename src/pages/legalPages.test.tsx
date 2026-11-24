import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { operator, type Operator } from '../content/operator';
import Imprint from './Imprint';
import Terms from './Terms';

const filled: Operator = {
  ...operator,
  name: 'Ada Example',
  address: ['Sample Street 1', '12345 Sampletown', 'Germany'],
  email: 'ada@example.org',
  phone: '+49 123 456',
  responsibleForContent: 'Ada Example, Sample Street 1',
};

const inRouter = (ui: React.ReactElement, path = '/') => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
const bodyText = () => document.body.textContent ?? '';

describe('Terms', () => {
  it('has one h1 and the six sections in order', () => {
    inRouter(<Terms />);
    expect(screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent)).toEqual(['Terms of Use']);
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      'What fingerscore is', 'Your songs', 'What you make', 'Fingerings', 'No warranty', 'Changes and law',
    ]);
  });

  it('sets the document title and restores it', () => {
    const { unmount } = inRouter(<Terms />);
    expect(document.title).toBe('Terms of Use – fingerscore');
    unmount();
    expect(document.title).toBe('fingerscore');
  });

  it('carries the text of the design verbatim', () => {
    inRouter(<Terms />);
    for (const s of [
      'fingerscore runs in your browser.',
      'A file you open is read on your device.',
      'It is not sent to us and we do not store it.',
      'Import only music that is in the public domain, that you wrote yourself, or that you have permission or a licence to copy and arrange.',
      'By importing a file you confirm that this is the case.',
      'A song in the public domain can still come in a protected edition or arrangement.',
      'You are responsible for the sheets you make and for what you do with them: printing, sharing, publishing.',
      'Do not pass on sheets of protected music without permission.',
      'The fingering charts come from published charts.',
      'They can contain errors.',
      'Check them against your instrument.',
      'fingerscore is free and comes as it is.',
      'We are liable without limit for intent, for gross negligence and for injury to life, body or health.',
      'Any other liability is excluded as far as the law allows.',
      'We may change these terms; the date below shows the last change.',
      'German law applies.',
      'Contact: see the Imprint.',
    ]) expect(bodyText()).toContain(s);
    expect(bodyText()).toContain('Last changed: 24 November 2026');
  });

  it('links to the Imprint and never mentions fair use or private copying', () => {
    inRouter(<Terms />);
    expect(screen.getByRole('link', { name: 'Imprint' })).toHaveAttribute('href', '/imprint');
    expect(bodyText()).not.toMatch(/fair use/i);
    expect(bodyText()).not.toMatch(/private (use|copy)/i);
  });
});

describe('Imprint', () => {
  it('shows the details it is given', () => {
    inRouter(<Imprint details={filled} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Imprint' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Information according to § 5 DDG' })).toBeInTheDocument();
    for (const t of ['Ada Example', 'Sample Street 1', '12345 Sampletown', 'Germany', 'ada@example.org', '+49 123 456']) {
      expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole('heading', { name: 'Responsible for content (§ 18 (2) MStV)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Consumer dispute resolution' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Liability for links' })).toBeInTheDocument();
    expect(document.title).toBe('Imprint – fingerscore');
  });

  it('draws the optional rows only when they hold a value', () => {
    const { unmount } = inRouter(<Imprint details={filled} />);
    for (const l of ['Represented by', 'Register entry', 'VAT ID']) expect(screen.queryByText(l)).not.toBeInTheDocument();
    unmount();
    inRouter(<Imprint details={{ ...filled, representedBy: 'Ada', register: 'HRB 1', vatId: 'DE1' }} />);
    for (const l of ['Represented by', 'Register entry', 'VAT ID']) expect(screen.getByText(l)).toBeInTheDocument();
    expect(screen.getByText('HRB 1')).toBeInTheDocument();
  });

  it('draws placeholders as they are', () => {
    inRouter(<Imprint />);
    expect(screen.getByText(operator.email)).toBeInTheDocument();
  });

  it('links to Privacy and not to the EU platform', () => {
    inRouter(<Imprint details={filled} />);
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(within(document.body).queryAllByRole('link').filter(a => a.getAttribute('href')?.includes('ec.europa.eu'))).toEqual([]);
  });
});

describe('routes', () => {
  afterEach(cleanup);
  it.each([['/terms', 'Terms of Use'], ['/imprint', 'Imprint']])('%s shows its page', async (path, title) => {
    inRouter(<App />, path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });
});
