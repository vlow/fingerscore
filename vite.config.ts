import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Parsers load on demand. Without this the dev server finds their libraries on first use,
  // re-optimises them and reloads the page, which breaks a first import (and a cold end-to-end run).
  optimizeDeps: { include: ['abcjs/src/parse/abc_parse', 'jszip', '@tonejs/midi', 'midi-file'] },
  server: { port: 5173, strictPort: true },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
