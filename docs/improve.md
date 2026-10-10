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
