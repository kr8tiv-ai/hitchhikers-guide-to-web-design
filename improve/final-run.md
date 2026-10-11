# Final improve run

Prompt 186. One live `hh improve` on branch `improve/2026-10-10-desk`, from `prompt-186`, which was cut from `main` at `f076fc2`. The runner refuses to start on `main`. Cap was `--max-experiments 5` (program minutes 10, turns 40, model `grok-4.7`, effort `xhigh`). The runner stopped during the baseline. Experiments 1 through 5 did not start.

## Phase 1, errors

Collection only. No product edit. Sources, de-duplicated, ranked by what a new person sees first.

1. Phone desk, missing-tool notes. At 375 the first screen shows whisper and pdftotext as missing. Each note's paragraph measures about 545px inside a 336px `.hh-probe-note`. `documentElement.scrollWidth` stays 375, so the install URL is clipped and the page does not scroll sideways. At 1440 the same note is 640px and fits. Screenshots: `improve/screens/186-375-first.png`, `improve/screens/186-1440-first.png`. Desk: `http://127.0.0.1:58794/` on a new temp project. CSS lives in `packages/app/src/design/components.css` (inside the improve target).

2. Empty desk repeats itself. The resume list and the sample offer both say "No saved project yet. A save writes one file you can open later." Source: `packages/app/src/server/project-desk.ts` (the empty list, then `sampleOffer`). Outside the program targets. A loop edit there would be a violation.

3. `hh doctor` on this machine, exit 0. Exact lines:

```text
whisper: not installed
pdftotext: not installed
auth: no non-interactive status flag in grok --help
note whisper:
means: whisper is not on PATH, so local speech recognition is unavailable.
note pdftotext:
means: pdftotext is not on PATH, so text cannot be read out of a PDF upload.
note auth:
means: grok --help has no non-interactive status flag, so doctor cannot tell whether you are signed in.
```

The desk shows the same two missing tools, with Install buttons. Playwright and grok are present. This is the machine, not a desk crash.

4. Browser console on the first paint, 375 and 1440: 0 errors, 0 warnings. Server log for that process: the URL, then Node's `ExperimentalWarning` for `stripTypeScriptTypes`. No application error. `HOME` could not be replaced in this shell (the variable is read-only). The project directory was a new temp folder.

5. Bad input. Opening `this-file-does-not-exist.hhproject` navigates to `/api/project/open`, HTTP 400. The console line is `Failed to load resource: the server responded with a status of 400 (Bad Request)`. The page title is Unreadable. The heading is "That file could not be opened." A link returns to the desk. Already handled.

6. Unknown route. `/missing` is HTTP 404. The console line is the failed load. The heading is "This page is not on the desk." A link returns to the desk. Already handled.

7. CI. No local Actions log, and `gh` was not used. Local equivalent: `pnpm lint` exit 0, `pnpm typecheck` exit 0, `pnpm -r test` with `HH_CASSETTE=replay` exit 0, Playwright 42 passed in 6.3m. The slow file was `e2e/polish.spec.ts` (the phone gate, 4.7m) and it passed. No package defines `eval`.

8. Protected anti-slop count on the target is 27. Twenty-two are the ban list in `packages/app/src/design/voice.md`. Three are `<!DOCTYPE html>` in the comps. One is the comment marker in `favicon.svg`. One is `` `!important` `` in `packages/app/src/design/README.md`. The check looks wrong for a ban list, a doctype, and a comment. It was left as written.

Keyboard: the tour holds focus on load. The first Tab lands on Back. The empty Answer control stays disabled. Reduced motion was emulated on `/missing` with no console error. Gallery on a fresh project is not empty. It shows the offline pack (Lando Norris, CoMinVi).

## Phase 2, fixes

Not started. The runner writes the baseline, then returns when that evaluation throws. It threw before any grok session.

## Phase 3, bug finds

Walked at 375 and 1440 before the loop: first screen, tour, empty resume, sample button, bad project path, `/missing`, `/gallery`, keyboard Tab, reduced motion. Fixes were not sent through the loop, because the runner had already exited.

| Bug | Width | Evidence | Loop |
| --- | --- | --- | --- |
| Probe notes clip the install URL | 375 | `improve/screens/186-375-first.png` | Left open. Inside the target, but the runner never scored an experiment. A wrap-only edit would also tie the score, and a tie is a discard. |
| Same empty sentence twice | 375 and 1440 | `improve/screens/186-375-first.png`, `improve/screens/186-1440-first.png` | Left open. `project-desk.ts` is outside the target. |
| whisper and pdftotext missing | both | doctor stdout, preflight table | Left open. The desk already explains them. Installing the tools is not a copy change. |
| 400 and 404 in the console | both | bad path, `/missing` | Left open. The pages already say what to do. |

## Experiments

`improve/results.tsv` has one row. The header is the 173 set.

| n | status | score | best | note |
| --- | --- | --- | --- | --- |
| 0 | crash | 0 | 0 | spawn EINVAL |

Kept: 0. Discarded: 0. Violations: 0. Crashes: 1 (the baseline).

## Why the baseline crashed

`packages/cli/src/improve/evaluate.ts` calls `spawn("pnpm.cmd", ...)` on Windows. `hiddenChildOptions` in `packages/engine/src/hidden-child.ts` forces `shell: false`. Node throws `spawn EINVAL` for a `.cmd` file when the shell is off. A one-line check in this session threw the same error. Both files are on the protected list or sit under the evaluation the runner hashes. They were not edited. The hash check did not get as far as a score. The runner exited 1 and printed `experiment 0 crash score 0 best 0`.

## Left alone

- Product code. No experiment was scored, so nothing was kept.
- `improve/program.md`, `improve/protected.json`, the loop, the evaluation, approval gates, `DECISIONS.md`, `context/`, `.hh-driver/`, `hh-build-plan/prompts/`.
- The anti-slop hits listed above. The check stays.
- No push, no force push, no deploy. `main` is still `f076fc2`.
