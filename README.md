# fingerscore

Sheet music with fingering charts for woodwinds. Runs in the browser only.

- `npm run dev`: start the dev server on http://localhost:5173
- `npm run build`: type-check and build to `dist/`
- `npm test`: run unit tests (Vitest)
- `npm run test:e2e`: run end-to-end tests (Playwright)

History routing: the server must serve `index.html` for `/tracks` and `/sheet` (nginx: `try_files $uri /index.html;`).
