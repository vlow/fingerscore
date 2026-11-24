import { defineConfig } from '@playwright/test';

// The production build served by `vite preview`, for e2e-preview/ (npm run test:e2e:preview; run `npm run build` first).
export default defineConfig({
  testDir: 'e2e-preview',
  forbidOnly: !!process.env.CI,
  use: { baseURL: 'http://localhost:4179' },
  webServer: { command: 'npx vite preview --port 4179 --strictPort', url: 'http://localhost:4179', reuseExistingServer: false },
});
