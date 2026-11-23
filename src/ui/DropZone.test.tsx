import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { parseFile } from '../import';
import { ImportError } from '../import/types';
import { LOAD_FAILED } from '../loadFailed';
import DropZone from './DropZone';

vi.mock('../import', async importOriginal => ({ ...(await importOriginal<typeof import('../import')>()), parseFile: vi.fn() }));

it('shows the load message and offers another try when a parser chunk fails to load', async () => {
  vi.mocked(parseFile).mockRejectedValue(new ImportError(LOAD_FAILED));
  render(<MemoryRouter><DropZone instrumentName="alto sax" onSong={() => {}} onContinue={() => {}} /></MemoryRouter>);
  await userEvent.upload(screen.getByLabelText(/drop a song/i), new File(['x'], 'a.mid'));
  expect(await screen.findByRole('alert')).toHaveTextContent(LOAD_FAILED);
  expect(screen.getByRole('button', { name: 'Try another file' })).toBeInTheDocument();
});

it('lists the five formats as chips and accepts MuseScore and ABC files', () => {
  render(<MemoryRouter><DropZone instrumentName="alto sax" onSong={() => {}} onContinue={() => {}} /></MemoryRouter>);
  const chips = [...screen.getByTestId('drop-zone').querySelectorAll('span[class*=chip]')].map(c => c.textContent);
  expect(chips).toEqual(['MIDI .mid', 'MusicXML .musicxml .mxl', 'MuseScore .mscz', 'ABC .abc', 'Saved sheet .json']);
  const accept = screen.getByLabelText(/drop a song/i).getAttribute('accept') ?? '';
  for (const ext of ['.mscz', '.mscx', '.abc']) expect(accept).toContain(ext);
});
