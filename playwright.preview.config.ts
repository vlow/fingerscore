import { defineConfig } from '@playwright/test';
import { BASE_URL, ON_NGINX } from './e2e-preview/base';

// The production build, for e2e-preview/ (npm run test:e2e:preview; run `npm run build` first). By default `vite preview`
// serves it; with E2E_BASE_URL set (CI's nginx job, deploy/nginx/ci.conf) the tests run against that server instead.
export default defineConfig({
  testDir: 'e2e-preview',
  forbidOnly: !!process.env.CI,
  use: { baseURL: BASE_URL },
  webServer: ON_NGINX ? undefined : { command: 'npx vite preview --port 4179 --strictPort', url: BASE_URL, reuseExistingServer: false },
});
