import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import App from '../App';
import { operator, type Operator } from '../content/operator';
import { STORAGE_ITEMS } from '../content/storageItems';
import About from './About';
import Imprint from './Imprint';
import Privacy from './Privacy';
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
      'The fingerings are taken from published fingering charts.',
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

describe('Privacy', () => {
  const host: Operator = { ...filled, hostName: 'Example Hosting Ltd', hostAddress: 'Host Road 2, 99999 Hostville', logRetention: '14 days' };

  it('has the heading, title and date', () => {
    const { unmount } = inRouter(<Privacy details={host} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(document.title).toBe('Privacy – fingerscore');
    expect(bodyText()).toContain('Last changed: 24 November 2026');
    unmount();
    expect(document.title).toBe('fingerscore');
  });

  it('shows the hosting details it is given and the legal bases', () => {
    inRouter(<Privacy details={host} />);
    for (const s of ['Example Hosting Ltd', 'Host Road 2, 99999 Hostville', '14 days', 'Art. 6 (1) (f) GDPR', '§ 25 (2) TDDDG']) {
      expect(bodyText()).toContain(s);
    }
  });

  it('lists local items under local storage and session items under session storage', () => {
    inRouter(<Privacy details={host} />);
    const lists = screen.getAllByRole('list');
    const listOf = (where: 'local' | 'session') => lists.find(l => l.getAttribute('data-storage') === where)!;
    for (const where of ['local', 'session'] as const) {
      const list = listOf(where);
      expect(list.previousElementSibling?.textContent).toMatch(new RegExp(`${where} storage`, 'i'));
      expect(within(list).getAllByRole('listitem').map(li => li.textContent)).toEqual(
        STORAGE_ITEMS.filter(i => i.where === where).map(i => i.label),
      );
    }
  });

  it('carries the fixed sentences, the six rights and the links', () => {
    inRouter(<Privacy details={host} />);
    for (const s of [
      'fingerscore sets no cookies.',
      'fingerscore does not track you.',
      'fingerscore loads nothing from other sites. The app serves its own fonts.',
      'The host keeps these logs for 14 days.',
      'A song file is read in your browser and is never uploaded.',
      'Delete a sheet in "Your sheets".',
      'clear the site data',
    ]) expect(bodyText()).toContain(s);
    for (const r of ['access', 'correction', 'deletion', 'restriction', 'objection', 'complaint with a supervisory authority']) {
      expect(bodyText()).toContain(r);
    }
    expect(screen.getByRole('link', { name: 'Imprint' })).toHaveAttribute('href', '/imprint');
  });
});

describe('About', () => {
  const story = ['First paragraph of the story.', 'Second paragraph of the story.'];
  const owner: Operator = { ...filled, aboutLead: 'The lead words.', authorBio: 'Plays the flute.', story };

  it('shows the owner\'s words under the fixed headings', () => {
    inRouter(<About details={owner} />);
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Why I made fingerscore' })).toBeInTheDocument();
    expect(document.title).toBe('About – fingerscore');
    for (const s of ['The lead words.', 'Ada Example', 'Plays the flute.', ...story]) expect(bodyText()).toContain(s);
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['The story', 'Under the hood', 'Thanks & credits']);
    expect(bodyText()).not.toContain('Last changed');
  });

  it('draws the pull quote only when there is one', () => {
    const { unmount } = inRouter(<About details={owner} />);
    expect(document.querySelector('blockquote')).toBeNull();
    unmount();
    inRouter(<About details={{ ...owner, pullQuote: 'A quote.' }} />);
    expect(document.querySelector('blockquote')?.textContent).toBe('A quote.');
  });

  it('draws the GitHub link only when there is a repository', () => {
    const { unmount } = inRouter(<About details={owner} />);
    expect(screen.queryByRole('link', { name: 'GitHub' })).not.toBeInTheDocument();
    unmount();
    inRouter(<About details={{ ...owner, repositoryUrl: 'https://example.org/repo' }} />);
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://example.org/repo');
  });

  it('credits the sources, not FreeSerif, and links the notices with a plain anchor', () => {
    inRouter(<Routes><Route path="/" element={<About details={owner} />} /><Route path="*" element={<p>moved</p>} /></Routes>);
    for (const s of ['The Woodwind Fingering Guide', 'Sax Teacher UK', 'Bravura', 'Atkinson Hyperlegible']) expect(bodyText()).toContain(s);
    expect(bodyText()).toContain('abcjs to read ABC files');
    expect(bodyText()).not.toContain('FreeSerif');
    const link = screen.getByRole('link', { name: 'third-party notices' });
    expect(link).toHaveAttribute('href', import.meta.env.BASE_URL + 'third-party-notices.txt');
    // The listener stops jsdom from trying to navigate. A router link would have moved to the catch-all route.
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener('click', stop);
    fireEvent.click(link);
    document.removeEventListener('click', stop);
    expect(screen.queryByText('moved')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Why I made fingerscore');
  });

  it('draws initials from a real name and no avatar for a placeholder', () => {
    const { unmount } = inRouter(<About details={owner} />);
    expect(screen.getByText('AE')).toBeInTheDocument();
    unmount();
    inRouter(<About />);
    expect(document.querySelector('[data-avatar]')).toBeNull();
  });
});

describe('routes', () => {
  afterEach(cleanup);
  it.each([['/terms', 'Terms of Use'], ['/imprint', 'Imprint'], ['/privacy', 'Privacy'], ['/about', 'Why I made fingerscore']])('%s shows its page', async (path, title) => {
    inRouter(<App />, path);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });
});
