// @vitest-environment node
import { describeIssues, loggable } from './check-sonar.mjs';

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

it('loggable keeps a branch name and replaces anything else, line breaks included', () => {
  expect(loggable('claude/bundle-size-performance-20141b')).toBe('claude/bundle-size-performance-20141b');
  expect(loggable('main\ncheck-sonar: no open issues')).toBe('main_check-sonar__no_open_issues');
});
