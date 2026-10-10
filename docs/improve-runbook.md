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
