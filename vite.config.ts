import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// jsPDF imports html2canvas, dompurify and canvg only for doc.html() and addSvgAsImage, which the app never calls.
// Left alone, the build ships a chunk for each (about 380 kB). They resolve to an empty module instead.
const STUBBED = new Set(['html2canvas', 'dompurify', 'canvg']);
const STUB_ID = '\0stubbed-unused-pdf-library';
const stubUnusedPdfLibraries = {
  name: 'stub-unused-pdf-libraries',
  // Before Vite's own resolver, which would find the packages first.
  enforce: 'pre' as const,
  resolveId: (id: string) => (STUBBED.has(id) ? STUB_ID : null),
  load: (id: string) => (id === STUB_ID ? 'export default undefined;' : null),
};

export default defineConfig({
  plugins: [stubUnusedPdfLibraries, react()],
  // Parsers and the PDF code load on demand. Without this the dev server finds their libraries on first use,
  // re-optimises them and reloads the page, which breaks a first import (and a cold end-to-end run).
  optimizeDeps: {
    include: ['abcjs/src/parse/abc_parse', 'jszip', '@tonejs/midi', 'midi-file', 'jspdf', 'svg2pdf.js'],
    rolldownOptions: { plugins: [stubUnusedPdfLibraries] },
  },
  server: { port: 5173, strictPort: true },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    // Only with `npm test -- --coverage`. CI hands coverage/lcov.info to SonarCloud.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/test-setup.ts', 'src/vite-env.d.ts'],
    },
  },
});
