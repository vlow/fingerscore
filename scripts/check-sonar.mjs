// Zero-violation rule: fails when SonarCloud lists any open issue on a branch, whatever the quality gate's thresholds
// allow. Runs in the sonar job of .github/workflows/ci.yml after the scan, with no npm install: plain Node, no packages.
// Usage: SONAR_BRANCH=<branch> [SONAR_TOKEN=<token>] node scripts/check-sonar.mjs
import { pathToFileURL } from 'node:url';

const HOST = 'https://sonarcloud.io';
const PROJECT = 'vlow_fingerscore';
const PAGE = 100;

/** One line per issue, as the log shows it; a last line counts the issues past the first page. */
export function describeIssues({ total, issues }) {
  const lines = issues.map(i => {
    const file = i.component.slice(i.component.indexOf(':') + 1);
    return `${i.type} ${i.severity} ${i.rule} ${file}${i.line ? `:${i.line}` : ''} ${i.message}`;
  });
  if (total > issues.length) lines.push(`… and ${total - issues.length} more`);
  return lines;
}

async function main() {
  const branch = process.env.SONAR_BRANCH;
  if (!branch) {
    console.error('check-sonar: set SONAR_BRANCH to the analysed branch.');
    process.exit(2);
  }
  const url = `${HOST}/api/issues/search?componentKeys=${PROJECT}&branch=${encodeURIComponent(branch)}&resolved=false&ps=${PAGE}`;
  const headers = process.env.SONAR_TOKEN ? { Authorization: `Bearer ${process.env.SONAR_TOKEN}` } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`check-sonar: SonarCloud answered ${res.status} for ${url}`);
    process.exit(2);
  }
  const body = await res.json();
  const lines = describeIssues(body);
  if (lines.length === 0) {
    console.log(`check-sonar: no open issues on ${branch}.`);
    return;
  }
  console.error(`check-sonar: ${body.total} open issue(s) on ${branch}. The rule is zero:`);
  for (const l of lines) console.error(`  ${l}`);
  console.error(`  ${HOST}/project/issues?id=${PROJECT}&branch=${encodeURIComponent(branch)}&resolved=false`);
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
