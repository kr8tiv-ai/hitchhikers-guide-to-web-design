# Build driver

This folder walks `hh-build-plan/prompts` in order. Each `NNN-*.md` prompt runs in a fresh headless Grok session (`grok-4.7`, the prompt's own effort, streaming JSON). The driver then requires a new commit and a clean tree. Both runners share the same state, logs, pause file, block file, and lock, so a run can resume on another machine.

## Which runner

Use `run-build.ps1` on Windows. It is the runner this queue already launches. The script targets the Windows Grok install and stays as it is.

Use `run-build.mjs` on macOS and Linux. It follows the same rules: one prompt per session, the same deny list and `--rules` text, the same stall and usage-limit stops, and a normal `git push origin main` (never force). It finds the checkout from its own path. It finds `grok` on `PATH`, then under the home directory `.grok/bin`. On Windows, if `%USERPROFILE%\.grok\bin\grok.exe` is present, the Node runner uses that file first.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .hh-driver\run-build.ps1
```

```sh
node .hh-driver/run-build.mjs
```

Do not run both at once. They share `.hh-driver/driver.pid`. A live `node`, `powershell`, or `pwsh` process recorded there blocks the other launch. A stale pid is replaced.

## Flags

Omit the flags to resume. `--start-at` (alias `-StartAt`) greater than zero starts at that prompt number and ignores `last_done`. `--stop-after` (alias `-StopAfter`) finishes that prompt, then stops cleanly without the end-of-queue push. `--smoke-test` (alias `-SmokeTest`) sends one tiny Grok call with the full flag set and does not take the lock or walk the queue.

```sh
node .hh-driver/run-build.mjs --start-at 12 --stop-after 40
node .hh-driver/run-build.mjs --smoke-test
```

The PowerShell parameters are `-StartAt`, `-StopAfter`, and `-SmokeTest`.

## Resume, pause, and stop

`STATE.json` keeps `current`, `file`, `kind`, `effort`, `started`, `status`, `attempt`, `last_commit`, `last_done`, `last_push`, `pid`, `updated`, and, while a session is up, `grok_pid`. On launch the runner keeps `last_done`, `last_commit`, and `last_push`. The next prompt is `last_done + 1`.

Create `.hh-driver/PAUSE` to pause between prompts. The running prompt finishes first. Delete the file to continue.

`BLOCKED.md` is written when the driver stops: a stall after one retry, a usage limit, a failed prompt, or a dirty tree. Read it, fix the cause, delete it, then relaunch. The run resumes after `last_done`. A usage limit does not retry. A stall, a spawn failure, or a session that changes nothing retries once in a fresh session. Partial files are left in place for that retry.

Logs: `.hh-driver/logs/NNN.log` (stdout), `.hh-driver/logs/NNN.err.log` (stderr), `.hh-driver/logs/NNN.retry1.log` on the second attempt, and `.hh-driver/driver.log` for the timeline. No log growth for 30 minutes, checked every 20 seconds, kills that Grok process tree.

`GROK_HOME` and `GROK_SANDBOX` are cleared for the driver and the Grok child. The runner does not sign in, does not change the Grok account, and does not deploy.

## Commit and push

The prompt id is the first three characters of the file name. `kind` and `effort` come from the front matter (`build` and `high` when a line is missing). The commit subject is the body of the `## Commit` fence. Max turns are 600 for `once-over`, 400 for `checkpoint`, and 300 otherwise.

A prompt is done only when `HEAD` has moved and `git status --porcelain` is empty. The runner logs the commit count. More than one commit is accepted, because a checkpoint may land a fix commit before the named one. If the session leaves a dirty tree, the driver runs `git add -A` and commits with the prompt message plus the line `Committed by .hh-driver after the Grok session ended with a dirty tree.`

Per prompt, push runs only when the kind is `checkpoint` or `once-over` (`shouldPush`). The command is `git push origin main`. It is never a force push. A failed push is logged and the queue continues. The next checkpoint tries again.

When the last queued prompt finishes and the run was not stopped with `--stop-after`, the runner pushes once more. That is the same end-of-queue push as `run-build.ps1`. `--stop-after` sets status `stopped after N` and skips that final push.
