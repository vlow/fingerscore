# fingerscore: rules for working in this repository

## Zero SonarCloud violations

`main` has no open SonarCloud issue, and nothing merges into it with one. The project uses SonarCloud's free plan, whose quality gate cannot be set to zero, so this rule is ours to keep.

Before a branch is called ready, and before any merge into `main`:

1. Push, and wait until CI's SonarCloud job has analysed that push.
2. Run `SONAR_BRANCH=<branch> node scripts/check-sonar.mjs`. It lists every open issue on the branch, of any type and severity.
3. Fix each issue in the code, commit and push. Then go back to step 1.
4. Stop only when the script prints `no open issues`.

Never mark an issue "won't fix" or "false positive" to get it off the list without the owner's word. A new `// NOSONAR` comment counts as the same. The three in `src/ui/ModeSwitch.tsx`, `src/ui/Segmented.tsx` and `src/pages/SheetPage.tsx` predate this rule; each names its rule and says why.

CI runs the same script after the scan, so the SonarCloud job fails on any open issue. A red SonarCloud job blocks the merge, even when the quality gate itself passed.
