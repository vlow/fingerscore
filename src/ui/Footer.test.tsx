import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Footer from './Footer';

const renderFooter = (repositoryUrl?: string) => render(<MemoryRouter><Footer repositoryUrl={repositoryUrl} /></MemoryRouter>);

it('orders the row: brand, year, storage sentence, then the Site links', () => {
  renderFooter('');
  const row = document.querySelector('.footer-row')!;
  const kids = [...row.children];
  expect(kids[0]).toHaveClass('footer-brand');
  expect(kids[0]).toHaveTextContent('© 2026');
  expect(kids[1]).toHaveTextContent('Your sheets are stored in your browser. Nothing is stored on the server.');
  expect(kids[2]).toBe(screen.getByRole('navigation', { name: 'Site' }));
  const links = within(screen.getByRole('navigation', { name: 'Site' })).getAllByRole('link');
  expect(links.map(l => [l.textContent, l.getAttribute('href')])).toEqual([
    ['About', '/about'], ['Terms', '/terms'], ['Privacy', '/privacy'], ['Imprint', '/imprint'],
  ]);
});

it('puts a GitHub link between About and Terms when a repository address is given, without a logo', () => {
  renderFooter('https://example.org/r');
  const links = within(screen.getByRole('navigation', { name: 'Site' })).getAllByRole('link');
  expect(links.map(l => l.textContent)).toEqual(['About', 'GitHub', 'Terms', 'Privacy', 'Imprint']);
  const gh = links[1];
  expect(gh).toHaveAttribute('href', 'https://example.org/r');
  for (const img of gh.querySelectorAll('img, svg')) {
    expect(img.outerHTML.toLowerCase()).not.toContain('github');
    expect(img.getAttribute('aria-hidden')).toBe('true');
  }
});

it('has no GitHub link when the repository address is empty', () => {
  renderFooter('');
  expect(screen.queryByRole('link', { name: /github/i })).toBeNull();
});
