/** Saves a Blob as a file: a Blob URL on a temporary <a download>, no network. */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
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

/** Saves text as a JSON file. */
export function downloadText(name: string, text: string): void {
  downloadBlob(name, new Blob([text], { type: 'application/json' }));
}
