# fingerscore: rules for working in this repository

## Zero SonarCloud violations

`main` has no open SonarCloud issue, and nothing merges into it with one. The project uses SonarCloud's free plan, whose quality gate cannot be set to zero, so this rule is ours to keep.

Before a branch is called ready, and before any merge into `main`:

1. Push, and wait until CI's SonarCloud job has analysed that push.
2. Run `SONAR_BRANCH=<branch> node scripts/check-sonar.mjs`. It lists every open issue on the branch, of any type and severity.
3. Fix each issue in the code, commit and push. Then go back to step 1.
4. Stop only when the script prints `no open issues`.

Fix every issue in the code. The one exception: a fix that would make the code harder to maintain or clearly harder to understand, judged on the code itself, not on how much work the fix takes. Then do not fix it and do not suppress it. Propose a "won't fix" to the owner instead:

- the issue: rule, file and line;
- the fix it would take, concretely;
- why that fix makes the code worse to maintain or read;
- what you propose: "won't fix" in SonarCloud, or a `// NOSONAR <rule>` comment that says why.

The owner decides. Only then mark it in SonarCloud or add the comment. A "false positive" goes the same way. The three `// NOSONAR` comments in `src/ui/ModeSwitch.tsx`, `src/ui/Segmented.tsx` and `src/pages/SheetPage.tsx` predate this rule; each names its rule and says why.

CI runs the same script after the scan, so the SonarCloud job fails on any open issue. A red SonarCloud job blocks the merge, even when the quality gate itself passed.

## Keyboard shortcuts

The app lists every shortcut in one place: `GROUPS` in `src/ui/shortcuts.ts`. The shortcuts panel on the sheet page (opened with `?` or the Keys button), the Play mode keys card and the hint line under the mode switch all read it.

When you add or change a feature with a control, decide whether a shortcut would help. It helps when people use the action often, repeat it many times in a row, or use it while both hands are on the keyboard: moving through notes, typing lyrics, turning pages. It does not help for a one-off action, such as a setting or a menu item used once per sheet. Not every action needs a shortcut. Say in your summary which you added, or why none.

When you add or change a shortcut:

1. Add it to `GROUPS`, in the group where it works, with a label and the synonyms people would search for. Give the Apple keys in `macKeys` when they differ.
2. Add it to `rowFor` in the same file, so the panel lights its row when the key is pressed.
3. Give the control that does the same `aria-keyshortcuts`. Name the key in its tooltip too, unless the key is already written next to it: the Edit notes panel shows a line of keys, so its buttons have no tooltip, and a screen reader says each key once.
4. Update the key table in `README.md`.
5. Check that the key does nothing while focus is in a text field, unless it is meant to work there, and that it does not clash with a key of the same mode.
