# hh improve

`hh improve` is a bounded loop in the autoresearch style. A human writes `improve/program.md`. A fresh grok session edits one target area. A fixed evaluation scores the tree. The commit stays only when the score is strictly higher than the best so far. Otherwise the improve branch resets to the previous commit. A human reviews that branch and merges it. The loop does not push, force-push, or deploy.

The score is higher when more tests pass and when anti-slop hits in the target copy fall. A failed test, a non-zero `hh doctor`, or a failed `pnpm exec tsc -b` scores below every green result. The evaluation files are hashed before the loop and checked again before every score.

## Flags

```text
hh improve [--program improve/program.md] [--max-experiments N] [--branch name] [--minutes M] [--turns T] [--dry-run]
```

- `--program` defaults to `improve/program.md`.
- `--max-experiments` defaults to 5. The ceiling is 50. Experiment 0 is the baseline and does not count toward the cap.
- `--branch` defaults to `improve/YYYY-MM-DD-<tag>` from the program front matter. The name must start with `improve/`.
- `--minutes` is the wall-clock budget for one grok process. Default 10, ceiling 180. The runner kills that process tree at the limit.
- `--turns` is passed as `--max-turns`, the same flag the build driver uses. Default 40, ceiling 600.
- `--dry-run` prints the plan and does not create a branch, spawn grok, or write `improve/results.tsv`.

A live run refuses to start on `main` or `master`, on a detached HEAD, or on a dirty tree. `improve/results.tsv` and `improve/STOP` do not count as dirt. A missing program or a missing `improve/protected.json` also refuses.

The model and effort come from the program. The shipped file uses `grok-4.7` and `xhigh`.

## Files

| Path | Who writes it |
|---|---|
| `improve/program.md` | Human. Objective, targets, minutes, turns, model, effort. |
| `improve/protected.json` | Human. Globs the runner enforces, plus the evaluation inputs it hashes. |
| `improve/results.tsv` | Runner. Left untracked. One row per experiment. |
| `improve/STOP` | Human. Create this file to stop before the next experiment. |

The shipped target is `packages/app/src/design` and `packages/app/src/server/card.ts`. Change it in the program front matter. Do not point it at a protected path.

## results.tsv

Tab-separated. Header:

```text
n	started	commit	score	best	status	seconds	note
```

`status` is `keep`, `discard`, `crash`, or `violation`. `n` 0 is the baseline (`keep`). `score` is this experiment. `best` is the best kept score after the row. Crash and violation rows use score 0 when the evaluation did not finish. `seconds` is the grok session, not the evaluation. The note is one line: the commit subject, or the reason.

## Review and merge

The commits live only on the improve branch. Read `improve/results.tsv`, then `git log` and `git diff main...HEAD`. Merge by hand when the kept commits are ones you want. The runner never pushes and never checks out `main`.

```text
git checkout main
git merge --no-ff improve/YYYY-MM-DD-desk
```

If the branch is noise, delete it locally. Do not force-push it.

## Unattended run

The runner already sends `--always-approve` to grok, together with the deny rules in [docs/improve-runbook.md](improve-runbook.md). Protected paths and the branch whitelist still hold after the session, because they are code, not a prompt.

## hh improve supervise

`hh improve supervise` is the standing loop. It starts on `main` (or on an `improve/...` branch when `--branch` says so). It does not check out another branch. A dirty tree or a detached HEAD is refused. `improve/results.tsv`, `improve/STOP`, `improve/hook-log.tsv`, `improve/PUSH-FAILED.txt`, and `improve/findings/` do not count as dirt.

```text
hh improve supervise [--program improve/program.md] [--max-experiments N] [--branch main] [--minutes M] [--turns T] [--max-failures N] [--wall-minutes N] [--always-approve] [--dry-run]
```

- `--max-experiments` defaults to 5. The ceiling is 50. The baseline does not count.
- `--max-failures` defaults to 3. The ceiling is 50. That many discards, crashes, or violations in a row stop the loop with a FAILED line.
- `--wall-minutes` defaults to 60. The ceiling is 180. The whole run stops when the clock is used up.
- `--always-approve` is accepted and is already on. There is no off switch. Deny rules still go out with the agent, and the rules below are code.
- `--dry-run` prints the plan, including a live refusal, and does not spawn, push, or write the log.

Each experiment spawns one test agent from `improve/program.md`, then scores the same protected evaluation as `hh improve`. A keep requires a strictly higher score. Anything else resets only to the commit this experiment started from, and only when the tree was clean at the start. The supervisor never passes `--no-verify`, `--force`, `-f`, `--force-with-lease`, or a `+refs` refspec to git.

### Score

Green score is `testsPassed * 1000 - antiSlopHits + uxPassed * 10 - bugCount * 100`, floored at 0. `uxPassed` is the polish Playwright pass count plus the anti-slop test pass count, from the suites that already exist. `bugCount` is the number of open ids in `docs/bug-scan.md` and `improve/findings/`. A failed test, a bad doctor exit, or a failed typecheck ignores UX and scores below every green result. Open bugs still lower that red score.

### Agents

`## Test agents` in the program lists two or more briefs. The shipped briefs are `desk-explorer` (Playwright, repo home) and `cli-explorer` (temporary `HOME` and `USERPROFILE`). Each brief names a findings file under `improve/findings/`. The header is `id`, `status`, `area`, `summary`. Status is `open` or `fixed`. The agent may edit only the target area, and only when the brief asks it to fix. The minute budget and `--max-turns` are the same caps as `hh improve`. At the limit the process tree is killed.

### results.tsv

The supervisor log keeps the columns above and adds two:

```text
n	started	commit	score	best	status	seconds	note	pushed	hooks_ok
```

`pushed` and `hooks_ok` are `yes` or `no`. `status` adds `failed` for a push that did not land. A 173 log is refused, not appended to. One row per experiment, including the baseline. The baseline is `keep`, `pushed` no.

### Push

After a keep, the supervisor runs `git push origin main`, then `git fetch origin main`, then `git merge-base --is-ancestor <commit> origin/main`. Both checks must exit 0. A rejection or a failed ancestor check writes `improve/PUSH-FAILED.txt`, marks the row `failed`, prints a FAILED line, and exits nonzero. It does not retry and it does not force-push. Start the supervisor on `main`. A keep on any other branch cannot become an ancestor of `origin/main` through this push, so the loop stops.

### Hooks

Every command the supervisor runs is recorded when it exits nonzero or names a git hook. Agent session lines of the form `[hh-command] exit=<n> hook=<name> command=<text> note=<text>` are recorded too. The file is `improve/hook-log.tsv`:

```text
n	command	exit	hook	note
```

`hook` is `pre-commit`, `commit-msg`, `pre-push`, or `none`. A failing hook in the agent session discards that experiment and resets it. `hooks_ok` is `no` on that row.

### Always-approve deny rules

These stay on in code, including when `--always-approve` is set: protected paths, the evaluation hash, no force push, no `git reset --hard` except the experiment rollback on a tree that started clean, no deploy, no publish, no secret reads or prints, no edits outside the target area, no new dependency installs, no checkout away from the configured branch, no `--no-verify`. Caps, the stop file, and the push check are code too.

`--deny` is grok configuration. If a session ignores it, the runner still discards a protected diff and still refuses its own force push. It cannot undo a push, a deploy, a secret already printed, or a package already fetched. The runbook names that split.
