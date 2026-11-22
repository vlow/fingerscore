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
  expect(screen.queryByRole('link', { name: 'Scales' })).toBeNull(); // version 2
  expect(
    screen.getByText('Your sheets are stored in your browser. Nothing is stored on the server.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Imprint' })).toBeNull(); // version 2
});
