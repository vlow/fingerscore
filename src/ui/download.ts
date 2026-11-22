/** Saves text as a file: a Blob URL on a temporary <a download>, no network. */
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Some browsers cancel a download whose URL is revoked too soon.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
