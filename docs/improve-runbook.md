# hh improve runbook

This is the script for one unattended run. Read it, then run the command. Inside each experiment, follow the same steps and stop after one commit.

## Preflight

1. `git status` is clean aside from `improve/results.tsv`.
2. You are not on `main` or `master`. Check out a working branch first. The runner creates `improve/YYYY-MM-DD-<tag>` from there and refuses to start on main.
3. `improve/program.md` and `improve/protected.json` exist. Read both.
4. `pnpm exec hh doctor` exits 0.
5. Optional smoke: `node --experimental-strip-types packages/cli/src/main.ts improve --dry-run --max-experiments 1`

## Baseline

The runner records experiment 0 before any grok session. That row is the score to beat. Do not edit during the baseline.

## One hypothesis

Each experiment is one idea.

1. Read `improve/results.tsv` if it exists.
2. Pick one hypothesis that is not a discarded note.
3. Change only the target area in the program. Keep the diff small.
4. Commit on the improve branch. The message is the note: what you tried, in one line.
5. Stop. The runner hashes the evaluation, scores, and keeps or resets.

Do not stack a second idea in the same commit.

## Read the log

Before the next idea, read the last rows of `improve/results.tsv`.

- `keep`: the score went up. Build on that commit.
- `discard`: the score did not go up. Do not repeat that idea.
- `crash`: the session died, the minute budget fired, or there was no commit.
- `violation`: a protected path, a file outside the target, or the evaluation hash changed. The commit was reset.

## Stop

Stop when any of these is true:

- `--max-experiments` is reached (default 5, ceiling 50).
- `improve/STOP` exists. The file is checked before each experiment.
- You were reset off the improve branch. The runner will not reset `main`.

Create the stop file from another terminal. The running grok session finishes, then the loop halts.

## The note column

Write the hypothesis in the commit subject. The runner copies it into `note`. Name the change, not a verdict. Good: `shorten the empty-desk line`. Weak: `misc`. The runner strips tabs and newlines so the row stays one line.

## A violation

If the diff touches a protected path, or any path outside the target, or the evaluation hash no longer matches the baseline, the runner:

1. Does not trust the score.
2. Runs `git reset --hard` to the previous commit on the improve branch only.
3. Appends a row with status `violation`.
4. Continues, until the cap or the stop file.

Do not try the same protected edit again.

## Deny rules that stay on with --always-approve

The runner spawns grok with `--always-approve` and these `--deny` rules in the same command. Approve-everything does not remove them from the argv. The build driver uses the same pairing.

```text
Bash(*git push*)
Bash(*git push --force*)
Bash(*git checkout main*)
Bash(*git checkout master*)
Bash(*vercel deploy*)
Bash(*netlify deploy*)
Bash(*wrangler deploy*)
Bash(*npm publish*)
Bash(*pnpm publish*)
Bash(*pnpm add*)
Bash(*npm install *)
Read(**/.env)
Read(**/.env.*)
Read(**/.ssh/**)
Read(**/*credential*)
Read(**/*secret*)
```

## What the runner enforces

These hold in code after the session returns, even if grok approved every tool call:

- No git command except a whitelist. Push, force, and deploy are not in it.
- `git reset --hard` only to the pinned prior commit, and only while HEAD is the improve branch. Never `main`.
- No checkout of `main` or `master`.
- A diff that matches `improve/protected.json` is a violation and is reset.
- The evaluation hash is taken before the loop and checked before every score.
- A path outside the program targets is a violation.
- The process tree is killed at `--minutes`.

Protected paths include approval gates (brief, prompts, the Elevate gate, Hostinger yes), the evaluation and its tests, `DECISIONS.md`, `context/`, `.hh-driver/`, `hh-build-plan/prompts/`, and secret filenames (`.env`, keys, credentials).

## What only grok can enforce

`--deny` is grok configuration. If a future grok build lets `--always-approve` ignore `--deny`, the runner still discards protected edits and still has no push or deploy of its own. It cannot undo these once they have already happened:

- A push or deploy that already left the machine.
- Secret text already printed into the grok log.
- Packages already fetched into the local store.

Do not rely on the runner to undo those. Keep the deny rules in the argv, and do not point the target at a secret or a gate.

## Supervisor preflight

Use this section when the command is `hh improve supervise`. The sections above still apply to `hh improve`.

1. `git status` is clean aside from `improve/results.tsv`, `improve/STOP`, `improve/hook-log.tsv`, `improve/PUSH-FAILED.txt`, and `improve/findings/`.
2. HEAD is `main`, not detached. The supervisor does not check out a branch. If you pass `--branch`, it must be `main` or `improve/...`, and HEAD must already be that branch.
3. `origin` is the remote you intend. The only push is `git push origin main`.
4. `improve/program.md` has two test agents. `improve/protected.json` is the list the code enforces. Read both.
5. `pnpm exec hh doctor` exits 0.
6. Smoke: `node --experimental-strip-types packages/cli/src/main.ts improve supervise --dry-run --max-experiments 1`

## Start the supervisor

```text
node --experimental-strip-types packages/cli/src/main.ts improve supervise --always-approve --max-experiments 5
```

`--always-approve` is already on if you omit the flag. The agent still receives the deny rules from the section above, plus these:

```text
Bash(*git reset --hard*)
Bash(*git checkout *)
Bash(*--no-verify*)
Bash(*git push -f*)
Bash(*git push --force-with-lease*)
```

The supervisor process, not the agent, runs the normal push after a keep. The agent is told not to push.

## Between experiments

After each experiment, before you invent the next one:

1. Read the last row of `improve/results.tsv`. Columns are the 173 set plus `pushed` and `hooks_ok`.
2. Read `improve/hook-log.tsv` for nonzero exits and hook names.
3. Read `improve/findings/*.tsv`. Open rows lower the next score.
4. Pick one hypothesis that is not a discarded note. Do not repeat a discarded idea.
5. Leave the protected paths and the evaluation hash alone.

One agent runs per experiment. The briefs alternate. `desk-explorer` walks the desk with Playwright and the fixtures under `packages/app/e2e`. `cli-explorer` runs the CLI with `HOME` and `USERPROFILE` pointed at an empty temporary directory. Findings use the header `id`, `status`, `area`, `summary`.

## Push failure

If the row is `failed`, or `improve/PUSH-FAILED.txt` exists:

1. Stop. Do not start another experiment.
2. Read the notice file. It begins with FAILED and includes the git output.
3. Confirm the kept commit is not an ancestor of `origin/main`.
4. Do not force-push. Do not pass `-f`, `--force`, `--force-with-lease`, or a `+refs` refspec.
5. Fix the remote by hand, outside this loop, then decide whether that commit should stay.

A rejected push and a failed ancestor check are the same stop. The loop exits nonzero.

## Hook failure

If `hooks_ok` is `no`, or `improve/hook-log.tsv` names `pre-commit`, `commit-msg`, or `pre-push` with a nonzero exit:

1. Treat the experiment as discarded. The runner resets it when the failure is in the agent session.
2. Read the note column. Do not retry that commit with `--no-verify`. The runner refuses the flag.
3. Fix the hook or the change, then use a new hypothesis.

A pre-push rejection of `git push origin main` is also a push failure: the notice file is written and the loop stops. Do not retry it with force.

## How UX is scored

UX is not a new metric. It is the pass count of two suites that are already protected:

- Playwright `packages/app/e2e/polish.spec.ts`
- The anti-slop test in `packages/qa`

Each pass adds 10. Each open finding id subtracts 100. Each passing test in the main suite adds 1000. Anti-slop hits in the target copy subtract 1. A red test, a bad doctor, or a failed typecheck ignores the UX term, so polish cannot outrank a failure. Open bugs still make a red score worse.

## When the supervisor stops

Stop, and leave the loop stopped, when any of these is true:

- `--max-experiments` is reached (default 5, ceiling 50).
- `improve/STOP` exists. Checked before the baseline's next experiment, and before each later one.
- The wall clock exceeds `--wall-minutes` (default 60, ceiling 180). The line is `FAILED: wall-clock cap reached.`
- Three experiments in a row are discard, crash, or violation (`--max-failures`, default 3, ceiling 50). The line is `FAILED: consecutive failure cap reached.`
- A push or an ancestor check fails. The line starts with `FAILED:`.

A violation still means a protected path, a file outside the target, an evaluation hash change, or a `--no-verify` attempt. The commit is reset. Do not try that edit again.

## What the supervisor enforces in always-approve mode

These hold in code after the agent returns, even when every tool call was approved:

- Protected paths in `improve/protected.json`, and the evaluation hash, are checked before every score.
- The only push is `git push origin main`. Force flags and `+refs` throw before git is spawned.
- `git reset --hard` runs only for the commit this experiment started from, only on the configured branch, and only when the human tree was clean at the start.
- No deploy, no publish, no package install, no secret read, no checkout away from the configured branch, no `--no-verify`.
- A failing hook or a nonzero command in the session log discards the experiment.
- The minute budget kills the agent process tree. The wall clock, the failure cap, and `improve/STOP` halt the loop.

## What only grok can enforce on a supervisor run

`--deny` is still grok configuration. If a build ignores it, the supervisor cannot undo these once they have left the process:

- A push, deploy, or publish the agent already performed.
- Secret text already printed into the session log.
- Packages already fetched into the local store.

The supervisor can still discard a protected diff, refuse its own force push, and stop when `origin/main` does not contain the commit.
