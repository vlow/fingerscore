import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { sampleDoc } from '../domain/fixture';
import App from './App';
import { routeModule, routePath } from './routes';

it('routePath strips one trailing slash and falls back to /', () => {
  expect(routePath('/sheet/')).toBe('/sheet');
  expect(routePath('/')).toBe('/');
  expect(routePath('/nope')).toBe('/');
  expect(routePath('/about')).toBe('/about');
});

it('a cold /sheet with a stored sheet renders the sheet', async () => {
  sessionStorage.setItem('fingerscore.doc', JSON.stringify(sampleDoc('asax')));
  await routeModule('/sheet').load();
  render(<MemoryRouter initialEntries={['/sheet']}><App /></MemoryRouter>);
  expect(screen.getByTestId('paper')).toBeInTheDocument();
});

it.each([['About', '/about'], ['Scales', '/scales']])('focusing the %s link prefetches its page', (name, path) => {
  const prefetch = vi.spyOn(routeModule(path), 'prefetch');
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
  screen.getByRole('link', { name }).focus();
  expect(prefetch).toHaveBeenCalled();
  prefetch.mockRestore();
});
