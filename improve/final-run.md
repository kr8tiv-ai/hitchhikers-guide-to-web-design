# Final improve run

Prompt 191. One live `hh improve supervise` from `main`, in its own worktree. The command was:

```text
node --experimental-strip-types packages/cli/src/main.ts improve supervise --max-experiments 8 --wall-minutes 180
```

`--wall-minutes 180` is the runner ceiling. The default is 60, and one evaluation is the full unit suite plus the polish Playwright file. The flag was raised so a healthy baseline could still reach later experiments. It did not matter: the run stopped at experiment 0.

The worktree was `C:\Users\lucid\hh-improve-worktrees\hh-improve-20261011-150429`, branch `improve/supervise-20261011-150429`, cut from `70417dd63855`. It was removed with the printed `git worktree remove --force` command after the log was copied. No agent started. The loop was not retried. A baseline crash is not a success.

## Exact command output

```text
FAILED: baseline has 2 failing tests. No experiment was started.
experiment 0 crash score 0 best 0 pushed no
worktree: C:\Users\lucid\hh-improve-worktrees\hh-improve-20261011-150429
branch: improve/supervise-20261011-150429 (cut from 70417dd63855)
results: C:\Users\lucid\hh-improve-worktrees\hh-improve-20261011-150429\improve\results.tsv
remove with: git worktree remove --force "C:\Users\lucid\hh-improve-worktrees\hh-improve-20261011-150429"
```

The wrapper then printed `SUPERVISE_EXIT 1`. There is no `improve/hook-log.tsv` and no `improve/findings/` from this run. The evaluation does not save the names of the two failing tests.

`pnpm -r test` in the main tree, before the loop, exited 0. The same command in the worktree after the crash exited 1. `packages/cli` reported `fail 5`, not 2. Three were `Permission denied` writing `.git/objects` during `git add` in a temp repo (`packages/cli/test/improve.test.ts` and `packages/cli/test/supervise.test.ts`). One assertion expected a kept commit to move HEAD and it did not (`a lower score resets and a higher score stays`). Those files are protected, so they were not edited. The names of the baseline's two failures were not recovered. The machine was also out of process slots: a throwaway `git commit` hit `C:/Users/lucid/.git-hooks/pre-commit` with `fork: Resource temporarily unavailable` (`0xC0000142`). The improve tests set `core.hooksPath` to an empty directory before they commit, so that global hook is not the quoted baseline note.

## Phase 1, errors

Collection only. No product edit. Ranked by what a new person sees first. Desk: `http://127.0.0.1:59191/` on a new temp project, `C:\Users\lucid\AppData\Local\Temp\hh-191-first-run`.

1. Phone answer field. At 375 the question textarea (`.hh-qcard__input`) is 114px wide. `.hh-qcard__entry` wraps by default, and the comment above it says 375 should wrap. `@media (max-width: 719px)` in `packages/app/src/design/components.css` sets `flex-wrap: nowrap`, so the field shares one row with Click to talk. The placeholder "Yourself, or one named client." does not fit. At 1440 the same row fits. Screenshot: `improve/screens/191-375-first.png`. Inside the improve target. Left open. The loop never started an experiment.

2. Whisper install note clips at 375. Paragraphs inside `.hh-probe-note` measure 545px. `documentElement.scrollWidth` stays 360, so the page does not scroll sideways and the install URL is cut. The pdftotext note fits. At 1440 the whisper note is 640px and fits. Same screenshot, plus `improve/screens/191-1440-first.png`. CSS is inside the target. Left open.

3. Full Playwright run, 6.6 minutes: 68 passed, 1 failed. Exact text:

```text
Error: expect(locator).toBeVisible() failed
Locator: locator('[data-question-id=\'DP-0.2\']')
Expected: visible
Timeout: 5000ms
Error: element(s) not found
```

Test: `e2e/suggestion-choices.spec.ts:155` "arrow keys then Enter pick a choice at 1440". The error context still showed DP-0.1, with radio B checked. The 375 twin passed. An immediate rerun of the 1440 test alone passed in 1.3s. The key handler is `packages/app/src/client/desk.ts`, outside the program targets. Summary 190 already says this focus case belongs to prompt 192. Left open.

4. `hh doctor` exit 0. Exact missing-tool lines: `whisper: not installed`, `pdftotext: not installed`, `auth: no non-interactive status flag in grok --help`. The desk shows Install buttons for the two tools. This is the machine. Left alone.

5. Browser console on the first paint, 375 and 1440: 0 errors, 0 warnings. Server log: the URL, then Node's `ExperimentalWarning` for `stripTypeScriptTypes`. No application error.

6. Bad input. Opening `this-file-does-not-exist.hhproject` goes to `/api/project/open`, HTTP 400. Console: `Failed to load resource: the server responded with a status of 400 (Bad Request)`. Title Unreadable. Heading "That file could not be opened." Already handled.

7. Unknown route. `/missing` is HTTP 404. Heading "This page is not on the desk." Already handled. Reduced motion on `/motion`: no new console error.

8. Keyboard. The tour aside is focused on load. The first Tab lands on Back. The Answer control stays disabled until there is text.

9. Gallery on a fresh project shows the offline pack (Lando Norris, CoMinVi), not an empty state. No console error.

10. CI. Latest origin runs for prompt 193 are green: CI `38168166736`, E2E `38168166760`, Audit `38168166763`. An older E2E run, `38156150762` (prompt 190), failed the same DP-0.2 locator at 375. The two E2E runs after that, on origin, passed.

`docs/bug-scan.md` still has a "Not fixed" row BS-005. That file is protected. Root `package.json` now has `lint` and `typecheck`, and both exited 0 here. The doc was not edited.

## Phase 2, fixes

Not started. The runner records the baseline, prints `FAILED: baseline has 2 failing tests`, and starts no agent.

## Phase 3, bug finds

Walked at 375 and 1440 before the loop: first screen, tour, empty resume, sample offer, bad project path, `/missing`, `/gallery`, `/motion` with reduced motion, and one Tab. No experiment was available to fix them.

| Bug | Width | Evidence | Loop |
| --- | --- | --- | --- |
| Answer field is 114px beside Click to talk | 375 | `improve/screens/191-375-first.png` | Left open. Inside the target. No experiment ran. |
| Whisper note clips the install URL | 375 | `improve/screens/191-375-first.png` | Left open. Inside the target. No experiment ran. |
| Arrow then Enter does not always reach DP-0.2 | 1440 | e2e log; passed on retry | Left open. Outside the target. Prompt 192. |
| whisper and pdftotext missing | both | doctor stdout | Left open. The desk already explains them. |
| 400 and 404 in the console | both | bad path, `/missing` | Left open. The pages already say what to do. |

## Experiments

`improve/results.tsv` is a supervisor log. One row.

| n | status | score | best | pushed | hooks_ok | note |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | crash | 0 | 0 | no | yes | baseline has 2 failing tests |

Kept: 0. Discarded: 0. Violations: 0. Crashes: 1 (the baseline). Fixes: 0. Bug-find experiments: 0.

The prompt 186 row (`spawn EINVAL`) was the previous contents of this file. It is recorded in `docs/improve.md`. The supervisor refuses a 173 header, so that row was replaced with the supervisor header before this run, in commit `70417dd6`.

## Left alone

- Product code. No experiment was scored, so nothing was kept.
- `improve/program.md`, `improve/protected.json`, the loop, the evaluation, approval gates, `DECISIONS.md`, `context/`, `.hh-driver/`, `hh-build-plan/prompts/`.
- The arrow-key flake, the missing tools, and the 400 and 404 pages, for the reasons above.
- No force push and no deploy. This session did not push. Local `main` was three commits ahead of `origin/main` after `git pull --rebase` onto the prompt 193 queue commit. A keep would have published those commits with `git push origin HEAD:main`. There was no keep.
