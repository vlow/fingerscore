import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { useApp } from '../state/store';

// The Tracks page's chunk fails to load; the Scales page loads.
vi.mock('../pages/Tracks', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

it('a failed page does not keep its notice after navigating to a page that loads', async () => {
  const swallow = (e: ErrorEvent) => e.preventDefault();
  window.addEventListener('error', swallow);
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  localStorage.clear();
  useApp.setState({ instId: 'asax' });
  render(<MemoryRouter initialEntries={['/tracks']}><App /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('This part of fingerscore could not be loaded.');
  await userEvent.click(screen.getByRole('link', { name: 'Scales' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Scales with fingerings' })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
  window.removeEventListener('error', swallow);
  quiet.mockRestore();
});
