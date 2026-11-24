# CI pipeline: design

**Purpose.** Every push to `github.com/vlow/fingerscore` is built, tested, scanned for known vulnerabilities and analysed by SonarCloud. A failed stage fails the run. This note records what the owner decided and what was left to the builder.

## Goals

- Every push, on any branch, runs the build and the full test suite, then Trivy, then SonarCloud.
- A failed SonarCloud quality gate fails the run.
- Every push runs `npm run check:bundle`. A release also runs `npm run check:release`.

## Non-goals

- Deployment. The pipeline publishes nothing.
- Pull-request triggers. A pull request from a branch of this repository is covered by the push to that branch.

## Approaches

1. **Three jobs in sequence (chosen).** `build`, then `trivy`, then `sonar`, linked with `needs`. The run page shows which stage failed. Cost: the coverage report travels between jobs as an artifact.
2. **One job with all steps.** No artifact, one checkout. Rejected: a red run does not show the failed stage without opening the log.
3. **Three jobs in parallel.** Faster. Rejected: the owner asked for an order, and Sonar needs the coverage report from the tests.

## Design

One workflow, `.github/workflows/ci.yml`, on `push` to any branch and to tags matching `v*`.

- **build:** `npm ci`, `npm run build`, `npm run check:bundle`, `npm run notices -- --check`, `npm test -- --coverage`, `npm run test:e2e`, `npm run test:e2e:preview`. On a tag: `npm run check:release`. Uploads `coverage/lcov.info`.
- **trivy:** filesystem scan of the repository for vulnerable packages, secrets and misconfiguration. Fails on HIGH or CRITICAL findings that have a fixed version.
- **sonar:** downloads the coverage report and runs the SonarCloud scan. `sonar-project.properties` sets `sonar.qualitygate.wait=true`.

## Builder's calls

- A release is a pushed tag matching `v*`. `check:release` fails until the owner's details are filled in, so it cannot run on every push.
- `npm run notices -- --check` runs on every push, so a stale package list fails on the commit that caused it.
- Node 24, the version used locally. Playwright runs on Chromium only, as it does locally.
- Actions are pinned to commits, with the release named in a comment.
- Coverage comes from `@vitest/coverage-v8`, a new dev dependency.
- SonarCloud keys: organisation `vlow`, project `vlow_fingerscore`. Unconfirmed until the owner imports the project.

## Owner's steps

1. Import the repository on sonarcloud.io and switch off Automatic Analysis.
2. Add the token as the repository secret `SONAR_TOKEN`.
