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

it('adds the sentences about left-out jump marks to the ready message', async () => {
  vi.mocked(parseFile).mockResolvedValue({ dropped: ['A second Segno in bar 12 was left out.', 'D.S.S. in bar 20 is not supported and was left out.'] } as never);
  render(<MemoryRouter><DropZone instrumentName="alto sax" onSong={() => {}} onContinue={() => {}} /></MemoryRouter>);
  await userEvent.upload(screen.getByLabelText(/drop a song/i), new File(['x'], 'a.abc'));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'a.abc — Ready — next you pick the part to play. A second Segno in bar 12 was left out. D.S.S. in bar 20 is not supported and was left out.');
});

it('keeps the ready message as it was when nothing was left out', async () => {
  vi.mocked(parseFile).mockResolvedValue({ dropped: [] } as never);
  render(<MemoryRouter><DropZone instrumentName="alto sax" onSong={() => {}} onContinue={() => {}} /></MemoryRouter>);
  await userEvent.upload(screen.getByLabelText(/drop a song/i), new File(['x'], 'a.abc'));
  expect((await screen.findByRole('status')).textContent).toBe('a.abc — Ready — next you pick the part to play.');
});

describe('import notice', () => {
  const R = () => render(<MemoryRouter><DropZone instrumentName="alto sax" onSong={() => {}} onContinue={() => {}} /></MemoryRouter>);
  const notice = () => screen.getByRole('link', { name: 'Terms of Use' });

  function expectNotice() {
    expect(screen.getByText('Only import songs you have the rights to.', { exact: false })).toBeInTheDocument();
    expect(notice()).toHaveAttribute('href', '/terms');
    // The link is not inside the file input, a label, or a button: a click on it opens no file dialog.
    expect(notice().closest('input, label, button')).toBeNull();
  }

  it('shows the notice when idle', () => { R(); expectNotice(); });

  it('shows the notice with the "Choose another file" button', async () => {
    vi.mocked(parseFile).mockResolvedValue({ dropped: [] } as never);
    R();
    await userEvent.upload(screen.getByLabelText(/drop a song/i), new File(['x'], 'a.mid'));
    expect(await screen.findByRole('button', { name: 'Choose another file' })).toBeInTheDocument();
    expectNotice();
  });

  it('shows the notice after an error', async () => {
    vi.mocked(parseFile).mockRejectedValue(new Error('bad'));
    R();
    await userEvent.upload(screen.getByLabelText(/drop a song/i), new File(['x'], 'a.mid'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expectNotice();
  });
});
