export const PDF_FAILED = 'The PDF could not be made. Use Print instead.';

const MAX_LISTED = 12;

export class PdfError extends Error {
  userMessage: string;
  constructor(userMessage: string) {
    super(userMessage);
    this.name = 'PdfError';
    this.userMessage = userMessage;
  }
}

export function unsupportedMessage(chars: string[]): string {
  const listed = chars.slice(0, MAX_LISTED).join(', ');
  const more = chars.length > MAX_LISTED ? ` and ${chars.length - MAX_LISTED} more` : '';
  return `The PDF can't show these characters: ${listed}${more}. Use Print instead.`;
}
