// Where the production build is served: `vite preview` on 4179 by default; the nginx job of CI sets E2E_BASE_URL.
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4179';
export const ON_NGINX = process.env.E2E_BASE_URL !== undefined;
