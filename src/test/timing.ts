/**
 * True in a run with `--coverage` (vite.config.ts sets COVERAGE). Coverage instruments the code and makes it about
 * three times slower, so a test skips its wall-clock budget there. The plain `npm test` run enforces every budget.
 */
export const instrumented = process.env.COVERAGE === '1';
