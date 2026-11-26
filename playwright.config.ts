import { defineConfig } from '@playwright/test';

// The suite starts its own dev server on a port of its own, from this checkout. Reusing a running server let a local run
// test whatever checkout had started it (another worktree's `npm run dev` on 5173). If the port is taken, the run fails
// instead of testing someone else's code.
const PORT = 5179;

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: `http://localhost:${PORT}` },
  forbidOnly: !!process.env.CI,
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
  },
});
