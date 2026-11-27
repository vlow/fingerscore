// Reads the commit and the version tag from git at build time, for the footer (src/shell/buildInfo.ts).
// Version tags are v<major>.<minor>.<patch>, the tags CI runs the release check for.
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process';
import type { BuildInfo } from '../src/shell/buildInfo';

type Git = (...args: string[]) => string;

// False positive: this runs only at build time, on the owner's machine or on CI's single-use runners, where no one else
// can change PATH. Whoever can change PATH there can also replace git at a fixed path, so a fixed path protects nothing.
const options: ExecFileSyncOptionsWithStringEncoding = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
const git: Git = (...args) => execFileSync('git', args, options).trim(); // NOSONAR typescript:S4036 false positive, see above

/** Runs git, or returns '' when git fails: no repository, no tag, no git installed. */
const quiet = (run: Git): Git => (...args) => {
  try {
    return run(...args);
  } catch {
    return '';
  }
};

/** Parses `git describe --long --dirty` output such as "v1.3.1-4-ga1b2c3d-dirty". */
export function parseDescribe(describe: string): Pick<BuildInfo, 'version' | 'release'> {
  const dirty = describe.endsWith('-dirty');
  const clean = dirty ? describe.slice(0, -'-dirty'.length) : describe;
  // The tag may itself contain dashes ("v2.0.0-rc-1"), so the parts are read from the end.
  const [hash = '', distance = '', ...tagParts] = clean.split('-').reverse();
  const tag = tagParts.reverse().join('-');
  if (!tag.startsWith('v') || !hash.startsWith('g') || !/^\d+$/.test(distance)) return { version: '', release: false };
  return { version: tag.slice(1), release: distance === '0' && !dirty };
}

export function readBuildInfo(run: Git = git): BuildInfo {
  const safe = quiet(run);
  const commit = safe('rev-parse', '--short', 'HEAD');
  return { commit, ...parseDescribe(safe('describe', '--tags', '--long', '--dirty', '--match', 'v[0-9]*')) };
}
