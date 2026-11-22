import { downloadText } from './download';

it('downloads through a Blob URL on a temporary link', async () => {
  vi.useFakeTimers();
  const create = vi.fn(() => 'blob:x');
  const revoke = vi.fn();
  vi.stubGlobal('URL', { ...URL, createObjectURL: create, revokeObjectURL: revoke });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe('a.fingerscore.json');
    expect(this.getAttribute('href')).toBe('blob:x');
  });
  downloadText('a.fingerscore.json', '{}');
  expect(click).toHaveBeenCalledTimes(1);
  expect(await (create.mock.calls[0] as unknown as [Blob])[0].text()).toBe('{}');
  expect(document.querySelector('a[download]')).toBeNull();
  vi.advanceTimersByTime(9999);
  expect(revoke).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(revoke).toHaveBeenCalledWith('blob:x');
  click.mockRestore();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
