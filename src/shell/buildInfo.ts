// What the footer says about the build. Vite fills __BUILD_INFO__ from git when it builds (scripts/build-info.ts).

export type BuildInfo = {
  /** Short commit hash; '' when the build had no git. */
  commit: string;
  /** The newest version tag at or before the commit, without its 'v'; '' when there is none. */
  version: string;
  /** True when the commit carries that tag and the working tree had no changes. */
  release: boolean;
};

export const buildInfo: BuildInfo = __BUILD_INFO__;

/** "1.3.1", "dev based on 1.3.1" or "dev", then the commit: "dev based on 1.3.1 · a1b2c3d". */
export function versionLabel({ commit, version, release }: BuildInfo): string {
  let name = 'dev';
  if (release) name = version;
  else if (version) name = `dev based on ${version}`;
  return commit ? `${name} · ${commit}` : name;
}
