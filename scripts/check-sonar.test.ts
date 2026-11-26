// @vitest-environment node
import { describeIssues } from './check-sonar.mjs';

it('reports nothing when there are no open issues', () => {
  expect(describeIssues({ total: 0, issues: [] })).toEqual([]);
});

it('names each open issue with rule, file, line and message', () => {
  const lines = describeIssues({
    total: 2,
    issues: [
      { rule: 'typescript:S2871', severity: 'CRITICAL', type: 'BUG', component: 'vlow_fingerscore:scripts/bundle-layers/layers.ts', line: 79, message: 'Provide a compare function.' },
      { rule: 'typescript:S1135', severity: 'INFO', type: 'CODE_SMELL', component: 'vlow_fingerscore:src/a.ts', message: 'Complete the task.' },
    ],
  });
  expect(lines).toEqual([
    'BUG CRITICAL typescript:S2871 scripts/bundle-layers/layers.ts:79 Provide a compare function.',
    'CODE_SMELL INFO typescript:S1135 src/a.ts Complete the task.',
  ]);
});

it('says how many are not listed when the page holds fewer than the total', () => {
  const issue = { rule: 'r', severity: 'MINOR', type: 'CODE_SMELL', component: 'k:f.ts', line: 1, message: 'm' };
  expect(describeIssues({ total: 3, issues: [issue] }).at(-1)).toBe('… and 2 more');
});
