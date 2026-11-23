import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

it('renders the shell on every route', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: /fingerscore/i })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'Songs' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Scales' })).toHaveAttribute('href', '/scales');
  expect(screen.getByRole('link', { name: 'Scales' })).not.toHaveAttribute('aria-current');
  expect(
    screen.getByText('Your sheets are stored in your browser. Nothing is stored on the server.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Imprint' })).toBeNull(); // version 2
});

it.each(['/', '/tracks', '/sheet'])('header: Songs is current on %s, the brand link never is', path => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: 'Songs' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Scales' })).not.toHaveAttribute('aria-current');
  expect(screen.getByRole('link', { name: /fingerscore/i })).not.toHaveAttribute('aria-current');
});

it('dev build: /dev/sheet previews the renderer for the fixture', async () => {
  render(
    <MemoryRouter initialEntries={['/dev/sheet?inst=asax&shift=0']}>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByTestId('paper')).toBeInTheDocument();
  expect(screen.getByText(/you read B major · sounds D major/)).toBeInTheDocument();
});
